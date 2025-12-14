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
const changeMapBtn = document.getElementById("change-map-btn");     // New
const randomObstaclesBtn = document.getElementById("random-obstacles-btn"); // New
const vehicle = document.getElementById("vehicle");

// New ODD UI element references
const windSpeedSelect = document.getElementById("wind-speed");
const rainfallRateSelect = document.getElementById("rainfall-rate");
const snowfallRateSelect = document.getElementById("snowfall-rate");
const luminosityInput = document.getElementById("luminosity");
const particulateTypeInput = document.getElementById("particulate-type");
const particulateIntensityInput = document.getElementById("particulate-intensity");

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

// Global map state and constants for map visualization
let mapGridState = []; // 2D array representing the state of each grid cell
const CELL_STATE = {
    UNEXPLORED: 'unexplored',
    CLEAR: 'clear',
    OBSTACLE_DETECTED: 'obstacle_detected',
    WALL_DETECTED: 'wall_detected',
    FRONTIER: 'frontier'
};

function initializeMapGridState() {
    // Clear all existing map-clear and map-frontier divs
    Array.from(map.querySelectorAll('.map-clear, .map-frontier')).forEach(el => el.remove());

    const gridRows = MAP_SIZE / STEP;
    const gridCols = MAP_SIZE / STEP;

    mapGridState = Array(gridRows).fill(0).map(() => Array(gridCols).fill(CELL_STATE.UNEXPLORED));

    // Mark existing obstacles and walls in mapGridState
    const existingObjects = getMapObjects(false); // Get all objects including vehicle
    existingObjects.forEach(obj => {
        const startR = Math.floor(obj.y / STEP);
        const startC = Math.floor(obj.x / STEP);
        const endR = Math.ceil((obj.y + obj.height) / STEP);
        const endC = Math.ceil((obj.x + obj.width) / STEP);

        for (let r = startR; r < endR; r++) {
            for (let c = startC; c < endC; c++) {
                if (r >= 0 && r < gridRows && c >= 0 && c < gridCols) {
                    if (obj.type === 'obstacle') {
                        mapGridState[r][c] = CELL_STATE.OBSTACLE_DETECTED;
                    } else if (obj.type === 'wall') {
                        mapGridState[r][c] = CELL_STATE.WALL_DETECTED;
                    }
                }
            }
        }
    });
}

// Helper to convert pixel coordinates to grid cell coordinates
function getCellCoords(x, y) {
    return {
        r: Math.floor(y / STEP),
        c: Math.floor(x / STEP)
    };
}

// Helper to convert grid cell coordinates to pixel coordinates
function getPixelCoords(r, c) {
    return {
        x: c * STEP,
        y: r * STEP
    };
}

// Helper to mark a cell and render/update its div
function markCell(r, c, type) {
    const gridRows = MAP_SIZE / STEP;
    const gridCols = MAP_SIZE / STEP;

    if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) return; // Out of bounds

    // Only update if state changes
    if (mapGridState[r][c] === type) return;

    mapGridState[r][c] = type;

    const cellId = `cell-${r}-${c}`;
    let cellDiv = document.getElementById(cellId);

    if (cellDiv) {
        // Update existing div
        cellDiv.className = `map-object ${type}`; // Update class to reflect new type
    } else {
        // Create new div
        cellDiv = document.createElement('div');
        cellDiv.id = cellId;
        cellDiv.className = `map-object ${type}`;
        const pixelCoords = getPixelCoords(r, c);
        cellDiv.style.left = `${pixelCoords.x}px`;
        cellDiv.style.top = `${pixelCoords.y}px`;
        map.appendChild(cellDiv);
    }

    // Remove old classes if they exist and are different
    if (type !== CELL_STATE.CLEAR) cellDiv.classList.remove(CELL_STATE.CLEAR);
    if (type !== CELL_STATE.FRONTIER) cellDiv.classList.remove(CELL_STATE.FRONTIER);
    if (type !== CELL_STATE.OBSTACLE_DETECTED) cellDiv.classList.remove(CELL_STATE.OBSTACLE_DETECTED);
    if (type !== CELL_STATE.WALL_DETECTED) cellDiv.classList.remove(CELL_STATE.WALL_DETECTED);
}

// Function to mark a circular area around the vehicle as CLEAR
function markAreaAsClear(centerX, centerY, radius) {
    const gridRows = MAP_SIZE / STEP;
    const gridCols = MAP_SIZE / STEP;

    const radiusCells = Math.ceil(radius / STEP);

    for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            const pixelCoords = getPixelCoords(r, c);
            const cellCenterX = pixelCoords.x + STEP / 2;
            const cellCenterY = pixelCoords.y + STEP / 2;

            const dist = calculateDistance({x: centerX, y: centerY}, {x: cellCenterX, y: cellCenterY});

            if (dist <= radius) {
                if (mapGridState[r][c] === CELL_STATE.UNEXPLORED || mapGridState[r][c] === CELL_STATE.FRONTIER) {
                    markCell(r, c, CELL_STATE.CLEAR);
                }
            }
        }
    }
}

// Function to identify and mark frontier zones
function updateFrontier() {
    const gridRows = MAP_SIZE / STEP;
    const gridCols = MAP_SIZE / STEP;

    for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            if (mapGridState[r][c] === CELL_STATE.CLEAR) {
                // Check neighbors
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue; // Skip self

                        const nr = r + dr;
                        const nc = c + dc;

                        if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols) {
                            if (mapGridState[nr][nc] === CELL_STATE.UNEXPLORED) {
                                // Only mark as frontier if not an obstacle or wall detected
                                // This assumes obstacles/walls are already set in mapGridState
                                if (mapGridState[nr][nc] !== CELL_STATE.OBSTACLE_DETECTED && mapGridState[nr][nc] !== CELL_STATE.WALL_DETECTED) {
                                    markCell(nr, nc, CELL_STATE.FRONTIER);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

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
    const sensorsCode = await (await fetch('src/adcore/sensors.py')).text();
    pyodide.FS.writeFile('/home/pyodide/sensors.py', sensorsCode);
    
    // Load ODD parser
    const oddParserCode = await (await fetch('src/autoval_slam/odd_parser.py')).text();
    pyodide.FS.writeFile('/home/pyodide/odd_parser.py', oddParserCode);

    // Load algorithms
    const algorithmsCode = await (await fetch('src/autoval_slam/algorithms.py')).text();
    pyodide.FS.writeFile('/home/pyodide/algorithms.py', algorithmsCode);

    // Load maze generator
    const mazeGeneratorCode = await (await fetch('src/autoval_slam/maze_generator.py')).text();
    pyodide.FS.writeFile('/home/pyodide/maze_generator.py', mazeGeneratorCode);

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
        await updateOddVisualization(); // Initial call to update based on current UI state
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
    const liveOdd = getLiveOddData(); // Get live ODD data for sensor simulation

    // Call the new movement function that considers the selected algorithm
    await simulateVehicleMovementWithAlgorithm(frameCount, selectedAlgorithm);

    if (simType === "lidar") {
        try {
            logMessage("Running LiDAR simulation in Python...");
            await pyodide.runPythonAsync(`
                import sys
                sys.path.append('/home/pyodide')
                from sensors import simulate_lidar_scan
                import matplotlib.pyplot as plt
                import io
                import base64
                import json

                # Pass live ODD data to LiDAR simulation
                odd_data_for_lidar = json.loads(json.dumps(${JSON.stringify(liveOdd)}))
                scan_data = simulate_lidar_scan(num_points=180, odd_data=odd_data_for_lidar)
                
                # Create plot
                fig, ax = plt.subplots(figsize=(6, 6))
                # Convert scan_data from list of tuples to numpy array for plotting
                import numpy as np
                scan_data_np = np.array(scan_data)
                ax.scatter(scan_data_np[:, 0], scan_data_np[:, 1], s=5)
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
        try {
            logMessage("Running Camera simulation in Python...");
            await pyodide.runPythonAsync(`
                import sys
                sys.path.append('/home/pyodide')
                from sensors import simulate_camera_feed
                import json

                # Pass live ODD data to camera simulation
                odd_data_for_camera = json.loads(json.dumps(${JSON.stringify(liveOdd)}))
                camera_status_message = simulate_camera_feed(odd_data=odd_data_for_camera)
                js_camera_status_message = camera_status_message
            `);
            const cameraStatus = pyodide.globals.get('js_camera_status_message');
            logMessage(`Camera Simulation Status: ${cameraStatus}`);
            logMessage("Camera simulation complete.");

        } catch (error) {
            logMessage(`Error during Camera simulation: ${error}`);
        }
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

// Function to get current ODD data from UI
function getLiveOddData() {
    // Create a deep copy to avoid modifying the original parsedOddData
    const liveOdd = JSON.parse(JSON.stringify(parsedOddData));

    if (!liveOdd.Environment) liveOdd.Environment = {};
    if (!liveOdd.Environment.Weather) liveOdd.Environment.Weather = {};
    if (!liveOdd.Environment.Illumination) liveOdd.Environment.Illumination = {};
    if (!liveOdd.Environment.Particulates) liveOdd.Environment.Particulates = {};

    // Update Weather
    const currentWeather = weatherSelect.value;
    liveOdd.Environment.Weather.condition = currentWeather; // Custom field for overall weather

    // Update Wind
    const windSpeedLevel = windSpeedSelect.value;
    if (liveOdd.Environment.Weather.Wind && liveOdd.Environment.Weather.Wind[windSpeedLevel]) {
        liveOdd.Environment.Weather.Wind.current_level = windSpeedLevel;
        // Optionally, could set a specific speed value if needed for algorithms
    }

    // Update Rainfall
    const rainfallRateLevel = rainfallRateSelect.value;
    if (liveOdd.Environment.Weather.Rainfall && liveOdd.Environment.Weather.Rainfall[rainfallRateLevel]) {
        liveOdd.Environment.Weather.Rainfall.current_level = rainfallRateLevel;
    }

    // Update Snowfall
    const snowfallRateLevel = snowfallRateSelect.value;
    if (liveOdd.Environment.Weather.Snowfall && liveOdd.Environment.Weather.Snowfall[snowfallRateLevel]) {
        liveOdd.Environment.Weather.Snowfall.current_level = snowfallRateLevel;
    }

    // Update Illumination
    const luminosity = luminosityInput.value;
    if (liveOdd.Environment.Illumination.Luminosity) {
        liveOdd.Environment.Illumination.Luminosity.current_value = parseFloat(luminosity);
    }

    // Update Particulates
    const particulateType = particulateTypeInput.value;
    const particulateIntensity = particulateIntensityInput.value;
    if (liveOdd.Environment.Particulates.Type) {
        liveOdd.Environment.Particulates.Type.current_value = particulateType;
    }
    if (liveOdd.Environment.Particulates.Intensity) {
        liveOdd.Environment.Particulates.Intensity.current_value = parseFloat(particulateIntensity);
    }
    // Note: 'Size' is in XML but not in UI yet, so it won't be updated.

    return liveOdd;
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
    const SENSOR_RANGE = 50; // Example sensor range in pixels for marking clear area

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

    initializeMapGridState(); // Initialize map grid state for new simulation

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
        const python_odd_data = pyodide.toPy(getLiveOddData()); // Use live ODD data from UI

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

        // Update map visualization for explored areas and frontier
        markAreaAsClear(vehiclePos.x + vehicleSize / 2, vehiclePos.y + vehicleSize / 2, SENSOR_RANGE);
        updateFrontier();

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
    const liveOdd = getLiveOddData(); // Get the current live ODD data from UI
    
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
                condition: liveOdd.Environment.Weather.condition || "Clear", // Use live weather
                wind: liveOdd.Environment.Weather.Wind.current_level || "No",
                rainfall: liveOdd.Environment.Weather.Rainfall.current_level || "No",
                snowfall: liveOdd.Environment.Weather.Snowfall.current_level || "No",
                air_temperature: liveOdd.Environment.Weather.Air_Temperature ? liveOdd.Environment.Weather.Air_Temperature.default : "none" // From static XML
            },
            illumination: {
                luminosity: liveOdd.Environment.Illumination.Luminosity ? liveOdd.Environment.Illumination.Luminosity.current_value : "none",
                cloudiness: liveOdd.Environment.Illumination.cloudinessSpec ? liveOdd.Environment.Illumination.cloudinessSpec.options : []
            },
            particulates: {
                type: liveOdd.Environment.Particulates.Type ? liveOdd.Environment.Particulates.Type.current_value : "none",
                intensity: liveOdd.Environment.Particulates.Intensity ? liveOdd.Environment.Particulates.Intensity.current_value : "none",
            },
            road_conditions: liveOdd.Environment.Weather.Snowfall.current_level !== "No" ? "potentially slippery" : "dry", // Derived from live snowfall
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

// Function to update ODD Visualization
async function updateOddVisualization() {
    const oddDisplayElement = document.getElementById('odd-display');
    if (oddDisplayElement && pyodide) {
        const liveOdd = getLiveOddData();
        await pyodide.runPythonAsync(`
            from odd_visualizer import visualize_odd_data
            import json
            odd_viz_string = visualize_odd_data(json.loads(json.dumps(${JSON.stringify(liveOdd)})))
        `);
        oddDisplayElement.textContent = pyodide.globals.get('odd_viz_string');
    }
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
    const dynamicObjects = Array.from(map.children).filter(obj => obj !== vehicle && !obj.classList.contains('map-clear') && !obj.classList.contains('map-frontier'));
    dynamicObjects.forEach(obj => obj.remove());

    // Also explicitly remove map-clear and map-frontier divs
    Array.from(map.querySelectorAll('.map-clear, .map-frontier')).forEach(el => el.remove());
}

async function changeMap() { // Made async to await Python call
    clearMapObjects();
    logMessage("Generating maze using Python...");

    const mapSize = MAP_SIZE; // 500px
    const objectSize = STEP; // 10px
    const cellSize = objectSize * 2; // 20px for a cell (path + wall/path)
    const cols = Math.floor(mapSize / cellSize); // Number of cells horizontally
    const rows = Math.floor(mapSize / cellSize); // Number of cells vertically

    // Call Python maze generator
    let pythonMaze = null;
    try {
        await pyodide.runPythonAsync(`
            import sys
            sys.path.append('/home/pyodide')
            from maze_generator import generate_maze
            import json

            maze_matrix = generate_maze(width=${cols}, height=${rows})
            js_maze_matrix = json.dumps(maze_matrix)
        `);
        pythonMaze = JSON.parse(pyodide.globals.get('js_maze_matrix'));
        logMessage(`Python maze generated: ${rows}x${cols} cells.`);
    } catch (error) {
        logMessage(`Error generating Python maze: ${error}`);
        return;
    }

    // Render the maze from Python output
    for (let r = 0; r < pythonMaze.length; r++) {
        for (let c = 0; c < pythonMaze[r].length; c++) {
            const char = pythonMaze[r][c];
            const x = c * objectSize;
            const y = r * objectSize;

            if (char === '#') {
                addDynamicObjectToMap('wall', x, y);
            } else if (char === 'S') {
                // Optionally mark start
                // addDynamicObjectToMap('start', x, y); // Requires 'start' CSS
                // Ensure vehicle starts here
                setVehiclePosition(x, y);
                logMessage(`Maze start (S) at (${x}, ${y})`);
            } else if (char === 'E') {
                // Optionally mark end
                // addDynamicObjectToMap('end', x, y); // Requires 'end' CSS
                // Update GOAL to maze end
                GOAL.x = x;
                GOAL.y = y;
                logMessage(`Maze end (E) at (${x}, ${y})`);
            }
        }
    }
    logMessage("Maze rendered.");
    initializeMapGridState(); // Initialize map grid state after maze is rendered
}
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
changeMapBtn.addEventListener('click', changeMap); // New event listener
randomObstaclesBtn.addEventListener('click', addRandomObstacles); // New event listener

// Add event listeners for ODD UI elements to update visualization
weatherSelect.addEventListener('change', updateOddVisualization);
windSpeedSelect.addEventListener('change', updateOddVisualization);
rainfallRateSelect.addEventListener('change', updateOddVisualization);
snowfallRateSelect.addEventListener('change', updateOddVisualization);
luminosityInput.addEventListener('input', updateOddVisualization);
particulateTypeInput.addEventListener('input', updateOddVisualization);
particulateIntensityInput.addEventListener('input', updateOddVisualization);

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
