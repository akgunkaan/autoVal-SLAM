const simTypeSelect = document.getElementById("sim-type");
const frameCountInput = document.getElementById("frame-count");
const runButton = document.getElementById("run-button");
const outputLog = document.getElementById("output-log");
const plotDiv = document.getElementById("plot");

function logMessage(message) {
    console.log(message);
    outputLog.textContent += `\n${message}`;
}

async function main() {
    logMessage("Initializing Pyodide...");
    let pyodide = await loadPyodide();
    logMessage("Pyodide loaded. Installing packages...");
    await pyodide.loadPackage(["numpy", "matplotlib"]);
    logMessage("Packages installed.");

    // Fetch and load Python source files
    logMessage("Loading Python source files...");
    const sensorsCode = await (await fetch('src/autoval_slam/sensors.py')).text();
    pyodide.FS.writeFile('/home/pyodide/sensors.py', sensorsCode);
    
    // For now, camera sim is not fully supported in browser, we'll focus on LiDAR
    // const simCode = await (await fetch('src/autoval_slam/sim.py')).text();
    // pyodide.FS.writeFile('/home/pyodide/sim.py', simCode);
    
    logMessage("Initialization complete. Ready to run simulation.");
    runButton.disabled = false;
    runButton.textContent = "Run Simulation";

    runButton.addEventListener("click", async () => {
        logMessage("\n--- Starting Simulation ---");
        runButton.disabled = true;
        plotDiv.innerHTML = ""; // Clear previous plot

        const simType = simTypeSelect.value;
        const frameCount = parseInt(frameCountInput.value);

        if (simType === "lidar") {
            try {
                logMessage("Running LiDAR simulation in Python...");
                pyodide.runPython(`
                    import sys
                    sys.path.append('/home/pyodide')
                    from sensors import simulate_lidar_scan
                    import matplotlib.pyplot as plt
                    import numpy as np

                    # Generate data
                    scan_data = simulate_lidar_scan(num_points=180)
                    
                    # Create plot
                    fig, ax = plt.subplots(figsize=(5, 5))
                    ax.scatter(scan_data[:, 0], scan_data[:, 1], s=5)
                    ax.set_title("Synthetic LiDAR Scan")
                    ax.set_xlabel("X (m)")
                    ax.set_ylabel("Y (m)")
                    ax.grid(True)
                    ax.axis('equal')
                    
                    # Render the plot to a PNG image in memory
                    fig.canvas.draw()
                    img_data = np.frombuffer(fig.canvas.tostring_rgb(), dtype=np.uint8)
                    img_data = img_data.reshape(fig.canvas.get_width_height()[::-1] + (3,))
                    
                    # Store as a global to access from JS
                    js_img_data = pyodide.to_js(img_data)
                `);

                // Retrieve the plot from Python and display it
                let jsImgData = pyodide.globals.get('js_img_data');
                logMessage("Simulation complete. Rendering plot...");

                // Create a canvas and draw the image data
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = jsImgData.shape[1];
                canvas.height = jsImgData.shape[0];
                
                const imageData = ctx.createImageData(canvas.width, canvas.height);
                const data = jsImgData.toJs();
                for (let i = 0; i < data.length; i++) {
                    for (let j = 0; j < data[i].length; j++) {
                        const index = (i * canvas.width + j) * 4;
                        imageData.data[index] = data[i][j][0];     // R
                        imageData.data[index + 1] = data[i][j][1]; // G
                        imageData.data[index + 2] = data[i][j][2]; // B
                        imageData.data[index + 3] = 255;           // A
                    }
                }
                ctx.putImageData(imageData, 0, 0);

                plotDiv.appendChild(canvas);
                logMessage("Plot rendered.");

            } catch (error) {
                logMessage(`Error during LiDAR simulation: ${error}`);
            }
        } else if (simType === "camera") {
            logMessage("Camera simulation is not yet implemented for the web interface.");
        }
        
        logMessage("--- Simulation Finished ---");
        runButton.disabled = false;
    });
}

// Disable run button until initialization is complete
runButton.disabled = true;
runButton.textContent = "Initializing...";
main();
