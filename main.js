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

    let detectedEvents = [];

runButton.addEventListener("click", runSimulation);

async function runSimulation() {
    logMessage("\n--- Starting Simulation ---");
    runButton.disabled = true;
    plotDiv.innerHTML = ""; // Clear previous plot
    outputLog.textContent = "Initializing Pyodide...\nPyodide loaded. Installing packages...\nPackages installed.\nLoading Python source files...\nInitialization complete. Ready to run simulation."; // Clear all previous logs except init
    detectedEvents = []; // Clear previous detected events

    const simType = simTypeSelect.value;
    const frameCount = parseInt(frameCountInput.value);

    await simulateVehicleMovement(frameCount);

    await simulateVehicleMovement(frameCount);

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
}
}

async function simulateVehicleMovement(frameCount) {
    const vehicleSize = 20; // Assuming vehicle is 20x20px, consistent with .map-object CSS
    const mapSize = 500; // Map is 500x500px, consistent with .map-grid CSS (50x50 grid * 10px/grid)
    const step = 10; // Movement step in pixels, matching grid
    let currentX = 0;
    let currentY = 0;
    let direction = 0; // 0: right, 1: down, 2: left, 3: up

    vehicle.style.left = `0px`;
    vehicle.style.top = `0px`;

    for (let i = 0; i < frameCount; i++) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Simulate time passing

        // Simple movement pattern: right, down, left, up
        switch (direction) {
            case 0: // Right
                currentX += step;
                if (currentX >= mapSize - vehicleSize) direction = 1;
                break;
            case 1: // Down
                currentY += step;
                if (currentY >= mapSize - vehicleSize) direction = 2;
                break;
            case 2: // Left
                currentX -= step;
                if (currentX <= 0) direction = 3;
                break;
            case 3: // Up
                currentY -= step;
                if (currentY <= 0) direction = 0;
                break;
        }

        currentX = Math.max(0, Math.min(mapSize - vehicleSize, currentX));
        currentY = Math.max(0, Math.min(mapSize - vehicleSize, currentY));

        vehicle.style.left = `${currentX}px`;
        vehicle.style.top = `${currentY}px`;

        // Check for collisions with other objects
        const mapObjects = Array.from(map.children).filter(obj => obj !== vehicle && obj.classList.contains('map-object'));
        mapObjects.forEach(obj => {
            const objX = parseInt(obj.style.left);
            const objY = parseInt(obj.style.top);
            const objSize = 20; // Assuming all map objects are 20x20px

            // Simple AABB collision detection
            if (currentX < objX + objSize &&
                currentX + vehicleSize > objX &&
                currentY < objY + objSize &&
                currentY + vehicleSize > objY) {
                const objectType = obj.classList.contains('person') ? 'person' : 'car';
                const event = {
                    frame: i,
                    type: `${objectType}_detected`,
                    position: { x: currentX, y: currentY },
                    detected_object_id: obj.id
                };
                detectedEvents.push(event);
                logMessage(`Frame ${i}: ${objectType.charAt(0).toUpperCase() + objectType.slice(1)} detected at (${currentX}, ${currentY}) near ${obj.id}`);
            }
        });
    }
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
            map_objects: mapObjects,
            detected_events: detectedEvents // Add detected events to ODD
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

// Event Listener for Obstacle Avoidance Algorithm buttons
document.addEventListener('DOMContentLoaded', () => {
    const algorithmButtons = document.querySelectorAll('button[data-algorithm]');
    algorithmButtons.forEach(button => {
        button.addEventListener('click', () => {
            const category = button.dataset.category;
            const algorithm = button.dataset.algorithm;
            logMessage(`Obstacle Avoidance Algorithm Selected: Category - ${category}, Algorithm - ${algorithm}`);
        });
    });
});

// Disable run button until initialization is complete
runButton.disabled = true;
runButton.textContent = "Initializing...";
main();
