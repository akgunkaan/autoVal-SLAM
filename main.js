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
const addObstacleBtn = document.getElementById("add-obstacle-btn"); // Renamed
const addVehicleBtn = document.getElementById("add-vehicle-btn");   // Renamed
const changeMapBtn = document.getElementById("change-map-btn");     // New
const randomObstaclesBtn = document.getElementById("random-obstacles-btn"); // New
const vehicle = document.getElementById("vehicle");

const oddXmlString = `
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<entity xmlns:vc="http://www.w3.org/2007/XMLSchema-versioning" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="ses.xsd" name="ODD">
<aspect name="oddDec">
<entity name="Environment">
<aspect name="envDec">
<entity name="Weather">
<var name="Air_Temperature" default="none" lower="-20" upper="30" ></var>
<aspect name="weatherDec">
<entity name="Wind">
<specialization name="windSpec">
<entity name="No">
<var name="speed" default="0.0" lower="0.0" upper="0.0" ></var>
</entity>
<entity name="Low">
<var name="speed" default="none" lower="0.0" upper="5.3" ></var>
</entity>
<entity name="Medium">
<var name="speed" default="none" lower="5.5" upper="17.1" ></var>
</entity>
<entity name="High">
<var name="speed" default="none" lower="17.2" upper="40.0" ></var>
</entity>
</specialization>
</entity>
<entity name="Rainfall">
<specialization name="rainfallSpec">
<entity name="No" ref="No"/>
<entity name="Light">
<var name="precipitation_rate(mmh)" default="none" lower="0.0" upper="2.4" ></var>
</entity>
<entity name="Moderate">
<var name="precipitation_rate" default="none" lower="2.5" upper="7.5" ></var>
</entity>
<entity name="Heavy">
<var name="precipitation_rate(mmh)" default="none" lower="7.5" upper="50" ></var>
</entity>
<entity name="Violent">
<var name="precipitation_rate(mmh)" default="none" lower="51" upper="100" ></var>
</entity>
<entity name="Cloudburst">
<var name="precipitation_rate(mmh)" default="none" lower="100" upper="150" ></var>
</entity>
</specialization>
</entity>
<entity name="Snowfall">
<specialization name="snowfallSpec">
<entity name="Heavy" ref="Heavy"/>
<entity name="Moderate" ref="Moderate"/>
<entity name="Light" ref="Light"/>
<entity name="No" ref="No"/>
</specialization>
</entity>
</aspect>
</entity>
<entity name="Particulates">
<var name="Type" default="none"></var>
<var name="Intensity" default="none" lower="0" upper="100" ></var>
<var name="Size" default="none" lower="0" upper="10" ></var>
</entity>
<entity name="Illumination">
<var name="Luminosity" default="none" lower="0" upper="12000" ></var>
<var name="sun_position(degrees)" default="none" lower="0" upper="180" ></var>
<specialization name="cloudinessSpec">
<entity name="Clear">
</entity>
<entity name="Partly_Cloudy">
</entity>
<entity name="Overcast">
</entity>
</specialization>
</entity>
<entity name="Connectivity">
<var name="communication_technology" default="none"></var>
<var name="positioning_system" default="none"></var>
</entity>
</aspect>
</entity>
<entity name="Static_Entities">
<aspect name="staticEntDec">
<entity name="Flight_Area">
</entity>
<entity name="Landing_Pad">
<var name="Position" default="none"></var>
<var name="area(m2)" default="none" lower="1" upper="20" ></var>
</entity>
<entity name="Geofencing">
</entity>
<entity name="Trees">
</entity>
<entity name="Buildings">
</entity>
<entity name="Airspace">
</entity>
</aspect>
</entity>
<entity name="Dynamic_Entities">
<aspect name="dynamicDec">
<entity name="Intruder_Drone">
</entity>
<entity name="Subject_Drone">
<aspect name="subjectDec">
<entity name="Drone_State">
<var name="altitude(m)" default="25" lower="23" upper="48" ></var>
<var name="speed(ms)" default="none" lower="0" upper="10" ></var>
<var name="angle" default="none" lower="-10.0" upper="10.0" ></var>
</entity>
<entity name="Payloads">
<multiAspect name="PayloadMAsp">
<entity name="Payload">
</entity>
</multiAspect>
</entity>
</aspect>
</entity>
</aspect>
</entity>
</aspect>
</entity>
`;

let selectedAlgorithm = null; // Global variable to store selected algorithm
let currentActiveAlgoButton = null; // To keep track of the currently active button
let detectedEvents = []; // Global variable to store detected events
let pyodide = null; // Global Pyodide instance
let pythonAlgorithmInstance = null; // Global Python algorithm instance
let parsedOddData = null; // Global parsed ODD data

function logMessage(message) {
    console.log(message);
    outputLog.textContent += `\n${message}`;
}

async function main() {
    logMessage("Initializing Pyodide...");
    window.pyodide = await loadPyodide(); // Store pyodide globally
    pyodide = window.pyodide; // For local use
    logMessage("Pyodide loaded. Installing packages...");
    await pyodide.loadPackage(["numpy", "matplotlib"]);
    logMessage("Packages installed.");

    // Fetch and load Python source files
    logMessage("Loading Python source files...");
    const sensorsCode = await (await fetch('src/autoval_slam/sensors.py')).text();
    pyodide.FS.writeFile('/home/pyodide/sensors.py', sensorsCode);
    
    // Load ODD parser
    const oddParserCode = await (await fetch('src/autoval_slam/odd_parser.py')).text();
    pyodide.FS.writeFile('/home/pyodide/odd_parser.py', oddParserCode);

    // Load algorithms
    const algorithmsCode = await (await fetch('src/autoval_slam/algorithms.py')).text();
    pyodide.FS.writeFile('/home/pyodide/algorithms.py', algorithmsCode);

    // Parse ODD XML
    logMessage("Parsing ODD XML...");
    await pyodide.runPythonAsync(`
        import sys
        sys.path.append('/home/pyodide')
        from odd_parser import parse_odd_xml
        import json
        
        odd_xml_string = """${oddXmlString}"""
        parsed_data = parse_odd_xml(odd_xml_string)
        js_parsed_odd_data = json.dumps(parsed_data)
    `);
    parsedOddData = JSON.parse(pyodide.globals.get('js_parsed_odd_data'));
    logMessage("ODD XML Parsed.");

    // Load ODD visualizer
    const oddVisualizerCode = await (await fetch('src/autoval_slam/odd_visualizer.py')).text();
    pyodide.FS.writeFile('/home/pyodide/odd_visualizer.py', oddVisualizerCode);
    logMessage("ODD Visualizer loaded.");

    // Visualize ODD data
    const oddDisplayElement = document.getElementById('odd-display');
    if (oddDisplayElement) {
        logMessage("Generating ODD visualization...");
        await pyodide.runPythonAsync(`
            from odd_visualizer import visualize_odd_data
            odd_viz_string = visualize_odd_data(json.loads(js_parsed_odd_data))
        `);
        oddDisplayElement.textContent = pyodide.globals.get('odd_viz_string');
        logMessage("ODD visualization displayed.");
    }

    // Initialize default algorithm instance in Python
    await pyodide.runPythonAsync(`
        import sys
        sys.path.append('/home/pyodide')
        from algorithms import DefaultAlgorithm
        default_algo_instance = DefaultAlgorithm(
            vehicle_size=20,
            step_size=10,
            map_size=500,
            goal_pos={'x': 490, 'y': 490} # Match JS goal
        )
    `);
    pythonAlgorithmInstance = pyodide.globals.get('default_algo_instance');
    logMessage("Default Algorithm Initialized.");

    // For now, camera sim is not fully supported in browser, we'll focus on LiDAR
    // const simCode = await (await fetch('src/autoval_slam/sim.py')).text();
    // pyodide.FS.writeFile('/home/pyodide/sim.py', simCode);
    
    logMessage("Initialization complete. Ready to run simulation.");
    runButton.disabled = false;
    runButton.textContent = "Run Simulation";


runButton.addEventListener("click", runSimulation);

async function runSimulation() {
    detectedEvents = []; // Reset global detectedEvents on each run
    logMessage("\n--- Starting Simulation ---");
    runButton.disabled = true;
    plotDiv.innerHTML = ""; // Clear previous plot
    outputLog.textContent = "Initializing Pyodide...\nPyodide loaded. Installing packages...\nPackages installed.\nLoading Python source files...\nInitialization complete. Ready to run simulation."; // Clear all previous logs except init

    const simType = simTypeSelect.value;
    const frameCount = parseInt(frameCountInput.value);

    // Call the new movement function that considers the selected algorithm
    await simulateVehicleMovementWithAlgorithm(frameCount, selectedAlgorithm);

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

function getMapObjects(excludeVehicle = true) {
    const objects = Array.from(map.children).filter(obj => {
        return obj.classList.contains('map-object') && (excludeVehicle ? obj !== vehicle : true);
    }).map(obj => {
        return {
            x: parseInt(obj.style.left),
            y: parseInt(obj.style.top),
            width: obj.offsetWidth, // Get actual rendered width
            height: obj.offsetHeight, // Get actual rendered height
            type: obj.classList.contains('obstacle') ? 'obstacle' :
                  obj.classList.contains('vehicle') ? 'vehicle' :
                  obj.classList.contains('wall') ? 'wall' : 'unknown'
        };
    });
    return objects;
}

function getVehiclePosition() {
    return {
        x: parseInt(vehicle.style.left),
        y: parseInt(vehicle.style.top),
        width: vehicle.offsetWidth,
        height: vehicle.offsetHeight
    };
}

function setVehiclePosition(x, y) {
    const mapSize = 500;
    const vehicleSize = vehicle.offsetWidth; // Use actual vehicle size

    let newX = Math.max(0, Math.min(mapSize - vehicleSize, x));
    let newY = Math.max(0, Math.min(mapSize - vehicleSize, y));

    vehicle.style.left = `${newX}px`;
    vehicle.style.top = `${newY}px`;
    return { x: newX, y: newY };
}

function calculateDistance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

function normalizeVector(vec) {
    const magnitude = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
    if (magnitude === 0) return { x: 0, y: 0 };
    return { x: vec.x / magnitude, y: vec.y / magnitude };
}

function getDirectionVector(currentX, currentY, targetX, targetY) {
    return normalizeVector({ x: targetX - currentX, y: targetY - currentY });
}

function checkCollision(x, y, objectType = null) {
    const vehicleRect = { x: x, y: y, width: vehicle.offsetWidth, height: vehicle.offsetHeight };
    const objects = getMapObjects();

    for (const obj of objects) {
        if (objectType && obj.type !== objectType) continue; // Check only for specific type if provided

        const objRect = { x: obj.x, y: obj.y, width: obj.width, height: obj.height };

        if (vehicleRect.x < objRect.x + objRect.width &&
            vehicleRect.x + vehicleRect.width > objRect.x &&
            vehicleRect.y < objRect.y + objRect.height &&
            vehicleRect.y + vehicleRect.height > objRect.y) {
            return obj; // Return the colliding object
        }
    }
    return null; // No collision
}

async function simulateVehicleMovementWithAlgorithm(frameCount, algorithm) {
    // Reset vehicle position to 0,0 at the start of each simulation
    setVehiclePosition(0, 0); // Use the helper function to reset and constrain

    const mapSize = 500;
    const vehicleSize = vehicle.offsetWidth;
    const step = 10;
    const goal = { x: mapSize - vehicleSize, y: mapSize - vehicleSize }; // Bottom-right corner

    // Re-instantiate the selected Python algorithm for each run
    // This logic is now handled in the algorithm button click listener
    if (!window.pythonAlgorithmInstance) {
        logMessage("No Python algorithm selected or initialized. Defaulting to DefaultAlgorithm.");
        // Ensure DefaultAlgorithm is instantiated if none is selected
        await pyodide.runPythonAsync(`
            from algorithms import DefaultAlgorithm
            current_algo_instance = DefaultAlgorithm(
                vehicle_size=${VEHICLE_SIZE},
                step_size=${STEP},
                map_size=${MAP_SIZE},
                goal_pos={'x': ${GOAL.x}, 'y': ${GOAL.y}}
            )
        `);
        window.pythonAlgorithmInstance = pyodide.globals.get('current_algo_instance');
    }

    let currentX = 0;
    let currentY = 0;
    
    for (let i = 0; i < frameCount; i++) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Simulate time passing

        const objects = getMapObjects(); // Get current map objects for collision checking
        const vehiclePos = getVehiclePosition();

        // Convert JS objects to Python-compatible format
        const python_current_pos = pyodide.toPy({x: vehiclePos.x, y: vehiclePos.y});
        const python_obstacles = pyodide.toPy(objects.filter(obj => obj.type === 'obstacle'));
        const python_walls = pyodide.toPy(objects.filter(obj => obj.type === 'wall'));
        const python_odd_data = pyodide.toPy(parsedOddData); // Use global parsedOddData

        // Call the Python algorithm's compute_next_move
        let dx_dy_py = await window.pythonAlgorithmInstance.compute_next_move(
            python_current_pos,
            python_obstacles,
            python_walls,
            python_odd_data
        );
        let dx = dx_dy_py.get('0'); // Access tuple elements
        let dy = dx_dy_py.get('1');
        dx_dy_py.destroy(); // Clean up Pyodide object

        let nextX = vehiclePos.x + dx;
        let nextY = vehiclePos.y + dy;
        
        // Ensure vehicle stays within bounds after Python's move calculation
        nextX = Math.max(0, Math.min(mapSize - vehicleSize, nextX));
        nextY = Math.max(0, Math.min(mapSize - vehicleSize, nextY));

        setVehiclePosition(nextX, nextY);

        // Collision detection for logging (after potential movement calculation)
        const collision = checkCollision(nextX, nextY);
        if (collision) {
            let objectType = 'Object';
            if (collision.type === 'obstacle') objectType = 'Obstacle';
            else if (collision.type === 'vehicle') objectType = 'Vehicle';
            else if (collision.type === 'wall') objectType = 'Wall';

            const event = {
                frame: i,
                type: `${objectType.toLowerCase()}_detected`,
                position: { x: nextX, y: nextY },
                detected_object_id: collision.id
            };
            detectedEvents.push(event);
            logMessage(`Frame ${i}: ${objectType} detected at (${nextX}, ${nextY}) near ${collision.id}`);
        }
        
        // Stop if reached goal
        if (calculateDistance(vehiclePos, goal) < step) {
            logMessage(`Goal reached at (${goal.x}, ${goal.y})! Simulation finished.`);
            break; // Exit loop if goal is reached
        }
    }
}

async function _simulateVehicleMovementDefault(frameCount) {
    const vehicleSize = 20; // Assuming vehicle is 20x20px, consistent with .map-object CSS
    const mapSize = 500; // Map is 500x500px, consistent with .map-grid CSS (50x50 grid * 10px/grid)
    const step = 10; // Movement step in pixels, matching grid
    let currentX = 0;
    let currentY = 0;
    let direction = 0; // 0: right, 1: down, 2: left, 3: up

    // The vehicle position is reset in simulateVehicleMovementWithAlgorithm
    // vehicle.style.left = `0px`;
    // vehicle.style.top = `0px`;

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
                currentY += step;
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
                let objectType = 'Object';
                if (obj.classList.contains('obstacle')) objectType = 'Obstacle';
                else if (obj.classList.contains('vehicle')) objectType = 'Vehicle';
                else if (obj.classList.contains('wall')) objectType = 'Wall';

                const event = {
                    frame: i,
                    type: `${objectType.toLowerCase()}_detected`,
                    position: { x: currentX, y: currentY },
                    detected_object_id: obj.id
                };
                detectedEvents.push(event);
                logMessage(`Frame ${i}: ${objectType} detected at (${currentX}, ${currentY}) near ${obj.id}`);
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
    const mapObjects = Array.from(map.children).filter(obj => obj.classList.contains('map-object')).map(obj => {
        let type;
        if (obj.classList.contains('vehicle')) type = 'vehicle';
        else if (obj.classList.contains('obstacle')) type = 'obstacle';
        else if (obj.classList.contains('wall')) type = 'wall';
        else type = 'unknown'; // Fallback

        return {
            id: obj.id,
            type: type,
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

function addDynamicObjectToMap(type, x = 10, y = 10) {
    const newObject = document.createElement('div');
    const newId = `${type}-${Date.now()}`;
    newObject.id = newId;
    newObject.className = `map-object ${type}`;
    newObject.draggable = true;
    newObject.style.left = `${x}px`;
    newObject.style.top = `${y}px`;
    map.appendChild(newObject);
    makeDraggable(newObject);
}

function clearMapObjects() {
    const dynamicObjects = Array.from(map.children).filter(obj => obj !== vehicle);
    dynamicObjects.forEach(obj => obj.remove());
}

function changeMap() {
    clearMapObjects();
    const mapSize = 500;
    const objectSize = 10;
    const maxWalls = Math.floor(Math.random() * 10) + 5; // 5 to 14 walls

    for (let i = 0; i < maxWalls; i++) {
        const x = Math.floor(Math.random() * (mapSize / objectSize)) * objectSize;
        const y = Math.floor(Math.random() * (mapSize / objectSize)) * objectSize;
        addDynamicObjectToMap('wall', x, y);
    }
    logMessage(`Map changed with ${maxWalls} random walls.`);
}

function addRandomObstacles() {
    clearMapObjects();
    const mapSize = 500;
    const objectSize = 10;
    const maxObstacles = Math.floor(Math.random() * 10) + 5; // 5 to 14 obstacles

    for (let i = 0; i < maxObstacles; i++) {
        const x = Math.floor(Math.random() * (mapSize / objectSize)) * objectSize;
        const y = Math.floor(Math.random() * (mapSize / objectSize)) * objectSize;
        const type = Math.random() < 0.5 ? 'obstacle' : 'vehicle';
        addDynamicObjectToMap(type, x, y);
    }
    logMessage(`Added ${maxObstacles} random obstacles.`);
}

// Event Listeners for map controls
makeDraggable(vehicle);
weatherSelect.addEventListener('change', updateVehicleSpeed);
exportOddBtn.addEventListener('click', exportODD);
addObstacleBtn.addEventListener('click', () => addDynamicObjectToMap('obstacle'));
addVehicleBtn.addEventListener('click', () => addDynamicObjectToMap('vehicle'));
changeMapBtn.addEventListener('click', changeMap); // New event listener
randomObstaclesBtn.addEventListener('click', addRandomObstacles); // New event listener

// Global goal for algorithm instantiation
const MAP_SIZE = 500;
const VEHICLE_SIZE = 20;
const STEP = 10;
const GOAL = { x: MAP_SIZE - VEHICLE_SIZE, y: MAP_SIZE - VEHICLE_SIZE }; // Bottom-right corner

// Event Listeners for Obstacle Avoidance Algorithm buttons
document.addEventListener('DOMContentLoaded', () => {
    const algorithmButtons = document.querySelectorAll('button[data-algorithm]');
    algorithmButtons.forEach(button => {
        button.addEventListener('click', async () => { // Make async to await pyodide calls
            if (currentActiveAlgoButton) {
                currentActiveAlgoButton.classList.remove('active');
            }
            button.classList.add('active');
            currentActiveAlgoButton = button;

            const category = button.dataset.category;
            let algorithm = button.dataset.algorithm;
            selectedAlgorithm = algorithm; // Update global variable

            logMessage(`Obstacle Avoidance Algorithm Selected: Category - ${category}, Algorithm - ${algorithm}`);

            // Instantiate the selected algorithm in Python
            if (pyodide) {
                let algoClassName = algorithm || 'DefaultAlgorithm';
                if (algoClassName === 'BugAlgorithms' || algoClassName === 'TangentBug') {
                    algoClassName = 'BugAlgorithm'; // Map to Python class name
                } else if (algoClassName === 'APF' || algoClassName === 'VFF') {
                    algoClassName = 'APF'; // Map to Python class name
                } else if (algoClassName === 'PRM' || algoClassName === 'RRT') {
                    algoClassName = 'RRT'; // Map to Python class name
                } else if (algoClassName === 'DRL' || algoClassName === 'PPO') {
                    algoClassName = 'DRL'; // Map to Python class name
                } else if (algoClassName === 'DWA') {
                    algoClassName = 'DWA';
                } else {
                    algoClassName = 'DefaultAlgorithm'; // Fallback
                }
                
                try {
                    await pyodide.runPythonAsync(`
                        from algorithms import ${algoClassName}
                        current_algo_instance = ${algoClassName}(
                            vehicle_size=${VEHICLE_SIZE},
                            step_size=${STEP},
                            map_size=${MAP_SIZE},
                            goal_pos={'x': ${GOAL.x}, 'y': ${GOAL.y}}
                        )
                    `);
                    window.pythonAlgorithmInstance = pyodide.globals.get('current_algo_instance');
                    logMessage(`Python algorithm ${algoClassName} instantiated.`);
                } catch (error) {
                    logMessage(`Error instantiating Python algorithm ${algoClassName}: ${error}`);
                }
            } else {
                logMessage("Pyodide not loaded, cannot instantiate Python algorithm.");
            }
        });
    });
});

// Disable run button until initialization is complete
runButton.disabled = true;
runButton.textContent = "Initializing...";
main();
