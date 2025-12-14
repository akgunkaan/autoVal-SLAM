const simTypeSelect = document.getElementById("sim-type");
const frameCountInput = document.getElementById("frame-count");
const runButton = document.getElementById("run-button");
const outputLog = document.getElementById("output-log");
const plotDiv = document.getElementById("plot");

// New DOM elements for map and ODD controls
const map = document.getElementById("map");
const weatherSelect = document.getElementById("weather");
const speedDisplay = document.getElementById("speed-display");
const exportOddBtn = document.getElementById("export-odd-btn");
const addPersonBtn = document.getElementById("add-person-btn");
const addCarBtn = document.getElementById("add-car-btn");
const vehicle = document.getElementById("vehicle");

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
                    import io
                    import base64

                    # Generate data
                    scan_data = simulate_lidar_scan(num_points=180)
                    
                    # Create plot
                    fig, ax = plt.subplots(figsize=(6, 6))
                    ax.scatter(scan_data[:, 0], scan_data[:, 1], s=5)
                    ax.set_title("Synthetic LiDAR Scan")
                    ax.set_xlabel("X (m)")
                    ax.set_ylabel("Y (m)")
                    ax.grid(True)
                    ax.axis('equal')
                    plt.tight_layout()
                    
                    # Save the plot to a memory buffer as a PNG image
                    buf = io.BytesIO()
                    fig.savefig(buf, format='png')
                    buf.seek(0)
                    # Encode the PNG image to a base64 string
                    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
                    
                    # Store as a global to access from JS. No need for pyodide.to_js
                    js_img_base64 = img_base64
                `);

                // Retrieve the plot from Python and display it
                let jsImgBase64 = pyodide.globals.get('js_img_base64');
                logMessage("Simulation complete. Rendering plot...");

                const img = document.createElement('img');
                img.src = `data:image/png;base64,${jsImgBase64}`;
                img.classList.add("img-fluid");
                plotDiv.appendChild(img);
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

// --- Map and ODD Logic ---

function updateVehicleSpeed() {
    const weather = weatherSelect.value;
    let speed = "Normal";
    switch (weather) {
        case "Rain":
            speed = "Reduced";
            break;
        case "Snow":
        case "Fog":
            speed = "Slow";
            break;
    }
    speedDisplay.textContent = speed;
}

function exportODD() {
    const weather = weatherSelect.value;
    
    // Get all map objects
    const mapObjects = Array.from(map.children).map(obj => {
        return {
            id: obj.id,
            type: obj.classList.contains('vehicle') ? 'vehicle' : (obj.classList.contains('person') ? 'person' : 'car'),
            position: {
                x: parseInt(obj.style.left),
                y: parseInt(obj.style.top)
            }
        };
    });

    const odd_data = {
        version: "1.0",
        description: "Operational Design Domain for autoVal-SLAM",
        domain: {
            weather: {
                condition: weather,
                precipitation_rate: weather === "Rain" ? "light to moderate" : "none",
                visibility: weather === "Fog" ? "reduced" : "clear",
            },
            road_conditions: weather === "Snow" ? "potentially slippery" : "dry",
            map_objects: mapObjects
        },
        vehicle_constraints: {
            max_speed: speedDisplay.textContent.toLowerCase(),
        }
    };

    const yamlString = jsyaml.dump(odd_data);
    const blob = new Blob([yamlString], { type: "text/yaml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "odd_config.yaml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function makeDraggable(element) {
    element.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', e.target.id);
        setTimeout(() => {
            element.classList.add('dragging');
        }, 0);
    });

    element.addEventListener('dragend', () => {
        element.classList.remove('dragging');
    });
}

map.addEventListener('dragover', (e) => e.preventDefault());

map.addEventListener('drop', (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const draggable = document.getElementById(id);
    if (draggable && map.contains(draggable)) {
        const mapRect = map.getBoundingClientRect();
        // Snap to grid (10x10)
        let x = Math.round((e.clientX - mapRect.left - 5) / 10) * 10;
        let y = Math.round((e.clientY - mapRect.top - 5) / 10) * 10;
        draggable.style.left = `${Math.max(0, Math.min(490, x))}px`;
        draggable.style.top = `${Math.max(0, Math.min(490, y))}px`;
    }
});

function addObjectToMap(type) {
    const newObject = document.createElement('div');
    const newId = `${type}-${Date.now()}`;
    newObject.id = newId;
    newObject.className = `map-object ${type}`;
    newObject.draggable = true;
    newObject.style.left = '10px';
    newObject.style.top = '10px';
    map.appendChild(newObject);
    makeDraggable(newObject);
}

// Event Listeners for map controls
makeDraggable(vehicle);
weatherSelect.addEventListener('change', updateVehicleSpeed);
exportOddBtn.addEventListener('click', exportODD);
addPersonBtn.addEventListener('click', () => addObjectToMap('person'));
addCarBtn.addEventListener('click', () => addObjectToMap('car'));

// Disable run button until initialization is complete
runButton.disabled = true;
runButton.textContent = "Initializing...";
main();
