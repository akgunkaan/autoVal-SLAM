const simTypeSelect = document.getElementById("sim-type");
const frameCountInput = document.getElementById("frame-count");
const runButton = document.getElementById("run-button");
const outputLog = document.getElementById("output-log");

// New DOM elements for map and ODD controls
const mapContainer = document.getElementById("map-container"); // New container for 3D canvas
const weatherSelect = document.getElementById("weather");
const speedDisplay = document.getElementById("speed-display");
const exportOddBtn = document.getElementById("export-odd-btn");
const addObstacleBtn = document.getElementById("add-obstacle-btn"); // Renamed
const changeMapBtn = document.getElementById("change-map-btn");     // New
const randomObstaclesBtn = document.getElementById("random-obstacles-btn"); // New

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

// Global Three.js variables
let scene, camera, renderer, controls;
let vehicleMesh; // To hold our 3D vehicle
const objectsInScene = []; // To keep track of all 3D objects

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
    // In 3D, we'll remove old meshes instead of querying for divs.
    // This function will primarily initialize the logical mapGridState array.

    const gridRows = MAP_SIZE / STEP;
    const gridCols = MAP_SIZE / STEP;

    mapGridState = Array(gridRows).fill(0).map(() => Array(gridCols).fill(CELL_STATE.UNEXPLORED));

    // Mark existing obstacles and walls in mapGridState
    const existingObjects = getMapObjects(); // Get all objects (now 3D-based)
    existingObjects.forEach(obj => {
        // Convert object's 3D position (centered) back to grid coordinates (0-MAP_SIZE)
        const x_coord = obj.x; // obj.x is already converted to 0-MAP_SIZE
        const y_coord = obj.y; // obj.y is already converted to 0-MAP_SIZE

        const startR = Math.floor(y_coord / STEP);
        const startC = Math.floor(x_coord / STEP);
        // Assuming objects are 1x1 grid cell for now, adjust if objects can span multiple cells
        const endR = startR + 1; 
        const endC = startC + 1;

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



// Helper to mark a cell and render/update its 3D representation
function markCell(r, c, type) {
    const gridRows = MAP_SIZE / STEP;
    const gridCols = MAP_SIZE / STEP;

    if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) return; // Out of bounds

    // Only update if state changes
    if (mapGridState[r][c] === type) return;

    mapGridState[r][c] = type;

    // Remove existing mesh for this cell if it exists
    const existingMesh = scene.getObjectByName(`cell-${r}-${c}`);
    if (existingMesh) {
        scene.remove(existingMesh);
        existingMesh.geometry.dispose();
        existingMesh.material.dispose();
    }

    let material;
    let geometry = new THREE.BoxGeometry(STEP, 1, STEP); // Flat box for the cell

    // Convert grid coordinates to Three.js world coordinates
    // Center the grid around (0,0) in Three.js scene
    const x = c * STEP + STEP / 2 - MAP_SIZE / 2;
    const z = r * STEP + STEP / 2 - MAP_SIZE / 2; // Z in Three.js is Y in 2D grid

    switch (type) {
        case CELL_STATE.CLEAR:
            material = new THREE.MeshPhongMaterial({ color: 0x888888 }); // Grey for clear
            break;
        case CELL_STATE.OBSTACLE_DETECTED:
            material = new THREE.MeshPhongMaterial({ color: 0x00ff00 }); // Green for obstacle
            geometry = new THREE.BoxGeometry(STEP, STEP, STEP); // Make obstacles taller
            break;
        case CELL_STATE.WALL_DETECTED:
            material = new THREE.MeshPhongMaterial({ color: 0x0000ff }); // Blue for wall
            geometry = new THREE.BoxGeometry(STEP, STEP, STEP); // Make walls taller
            break;
        case CELL_STATE.FRONTIER:
            material = new THREE.MeshPhongMaterial({ color: 0x333333 }); // Dark grey for frontier
            break;
        default: // UNEXPLORED
            return; // Don't render unexplored cells explicitly yet, or choose a default
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, type === CELL_STATE.CLEAR || type === CELL_STATE.FRONTIER ? 0.5 : STEP / 2, z); // Position slightly above ground for clear/frontier, half height for obstacles/walls
    mesh.name = `cell-${r}-${c}`; // Give it a name for easy retrieval
    scene.add(mesh);
    objectsInScene.push(mesh); // Add to our tracking array
}

// Function to mark a circular area around the vehicle as CLEAR
function markAreaAsClear(centerX, centerZ, radius) { // Changed centerY to centerZ
    const gridRows = MAP_SIZE / STEP;
    const gridCols = MAP_SIZE / STEP;

    // We no longer need radiusCells since we're directly calculating distances with pixel coords
    // const radiusCells = Math.ceil(radius / STEP);

    for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            // Convert grid cell (r, c) to pixel coordinates (x, y) for distance calculation
            const pixelX = c * STEP + STEP / 2;
            const pixelY = r * STEP + STEP / 2; // pixelY is what was previously centerY

            const dist = calculateDistance({x: centerX, y: centerZ}, {x: pixelX, y: pixelY}); // Use centerZ

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

function init3DScene() {
    const mapContainer = document.getElementById("map-container");
    const width = mapContainer.clientWidth;
    const height = 500; // Fixed height for now, can be dynamic later

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcccccc); // Light grey background

    // Camera
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 100, 100); // Initial camera position

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mapContainer.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // An animation loop is required when damping is enabled
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = false;
    controls.maxPolarAngle = Math.PI / 2; // Limit vertical rotation

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    // Ground Plane (representing the map)
    const groundGeometry = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE);
    const groundMaterial = new THREE.MeshPhongMaterial({ color: 0x888888, side: THREE.DoubleSide });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate to lay flat
    scene.add(ground);

    // Vehicle (simple cube for now)
    const vehicleGeometry = new THREE.BoxGeometry(VEHICLE_SIZE, VEHICLE_SIZE, VEHICLE_SIZE);
    const vehicleMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    vehicleMesh = new THREE.Mesh(vehicleGeometry, vehicleMaterial);
    vehicleMesh.position.set(0, VEHICLE_SIZE / 2, 0); // Start at (0, 0, 0) on the ground
    scene.add(vehicleMesh);
    objectsInScene.push(vehicleMesh); // Add vehicle to tracked objects

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update(); // Only required if controls.enableDamping is set to true
        renderer.render(scene, camera);
    }
    animate();

    // Handle window resize
    window.addEventListener('resize', () => {
        const newWidth = mapContainer.clientWidth;
        camera.aspect = newWidth / height;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, height);
    });
}

async function main() {
    logMessage("Initializing Pyodide...");
    try {
        window.pyodide = await loadPyodide(); // Store pyodide globally
        pyodide = window.pyodide; // For local use
        logMessage("Pyodide loaded. Installing packages...");
    } catch (error) {
        logMessage(`Error loading Pyodide: ${error}`);
        console.error("Pyodide loading error:", error);
        runButton.disabled = true;
        runButton.textContent = "Initialization Failed";
        return;
    }

    try {
        await pyodide.loadPackage(["numpy", "matplotlib"]);
        logMessage("Packages installed.");
    } catch (error) {
        logMessage(`Error installing packages: ${error}`);
        console.error("Package installation error:", error);
        runButton.disabled = true;
        runButton.textContent = "Initialization Failed";
        return;
    }

    // Fetch and load Python source files
    logMessage("Loading Python source files...");
    const pythonFiles = [
        { path: 'src/adcore/sensors.py', name: 'sensors.py' },
        { path: 'src/autoval_slam/odd_parser.py', name: 'odd_parser.py' },
        { path: 'src/autoval_slam/algorithms.py', name: 'algorithms.py' },
        { path: 'src/autoval_slam/maze_generator.py', name: 'maze_generator.py' },
        { path: 'src/autoval_slam/odd_visualizer.py', name: 'odd_visualizer.py' }
    ];

    for (const file of pythonFiles) {
        try {
            const code = await (await fetch(file.path)).text();
            pyodide.FS.writeFile(`/home/pyodide/${file.name}`, code);
            logMessage(`Loaded ${file.name}`);
        } catch (error) {
            logMessage(`Error loading ${file.name}: ${error}`);
            console.error(`Error loading ${file.name}:`, error);
            runButton.disabled = true;
            runButton.textContent = "Initialization Failed";
            return;
        }
    }
    
    // Parse ODD XML
    logMessage("Parsing ODD XML...");
    try {
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
    } catch (error) {
        logMessage(`Error parsing ODD XML: ${error}`);
        console.error("ODD XML parsing error:", error);
        runButton.disabled = true;
        runButton.textContent = "Initialization Failed";
        return;
    }

    // Visualize ODD data
    const oddDisplayElement = document.getElementById('odd-display');
    if (oddDisplayElement) {
        logMessage("Generating ODD visualization...");
        try {
            await pyodide.runPythonAsync(`
                from odd_visualizer import visualize_odd_data
                import json
                odd_viz_string = visualize_odd_data(json.loads(js_parsed_odd_data))
            `);
            oddDisplayElement.textContent = pyodide.globals.get('odd_viz_string');
            logMessage("ODD visualization displayed.");
            await updateOddVisualization(); // Initial call to update based on current UI state
        } catch (error) {
            logMessage(`Error visualizing ODD data: ${error}`);
            console.error("ODD visualization error:", error);
            runButton.disabled = true;
            runButton.textContent = "Initialization Failed";
            return;
        }
    }

    // Initialize default algorithm instance in Python
    try {
        await pyodide.runPythonAsync(`
            import sys
            sys.path.append('/home/pyodide')
            from algorithms import DefaultAlgorithm
            default_algo_instance = DefaultAlgorithm(
                vehicle_size=${VEHICLE_SIZE},
                step_size=${STEP},
                map_size=${MAP_SIZE},
                goal_pos={'x': ${GOAL.x}, 'y': ${GOAL.y}} # Match JS goal
            )
        `);
        pythonAlgorithmInstance = pyodide.globals.get('default_algo_instance');
        logMessage("Default Algorithm Initialized.");
    } catch (error) {
        logMessage(`Error initializing Default Algorithm: ${error}`);
        console.error("Default algorithm initialization error:", error);
        runButton.disabled = true;
        runButton.textContent = "Initialization Failed";
        return;
    }
    
    logMessage("Initialization complete. Ready to run simulation.");
    runButton.disabled = false;
    runButton.textContent = "Run Simulation";

    init3DScene(); // Initialize the 3D scene
}


runButton.addEventListener("click", runSimulation);

async function runSimulation() {
    detectedEvents = []; // Reset global detectedEvents on each run
    logMessage("\n--- Starting Simulation ---");
    runButton.disabled = true;
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
            logMessage("LiDAR Simulation complete. Image data generated (base64).");
            // If you want to display this in the UI, you would need an <img> tag somewhere
            // or integrate it into the 3D scene (e.g., as a texture), which is more complex.
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

function getMapObjects() {
    // For 3D scene, we need to iterate through objects in the Three.js scene
    const objects = [];
    scene.traverse(function(object) {
        if (object.userData.isObstacle || object.userData.isWall) {
            objects.push({
                id: object.uuid, // Using Three.js UUID for identification
                type: object.userData.isObstacle ? 'obstacle' : 'wall',
                x: object.position.x + MAP_SIZE / 2, // Convert back to 0-MAP_SIZE range
                y: object.position.z + MAP_SIZE / 2, // Use Z for Y-axis in 2D plane
                width: object.geometry.parameters.width || STEP, // Assuming a box geometry
                height: object.geometry.parameters.depth || STEP  // Assuming a box geometry
            });
        }
    });
    return objects;
}

function setVehiclePosition(x, z) {
    // Offset vehicle position by half MAP_SIZE to center it around the origin
    const centeredX = x - MAP_SIZE / 2;
    const centeredZ = z - MAP_SIZE / 2;

    if (vehicleMesh) {
        vehicleMesh.position.set(centeredX, VEHICLE_SIZE / 2, centeredZ);
    }
    // Return centered coordinates for consistent internal use
    return { x: centeredX, z: centeredZ };
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

function checkCollision(x_0_MAP_SIZE, z_0_MAP_SIZE, objectType = null) {
    // Convert current vehicle position from 0-MAP_SIZE to Three.js centered coordinates
    const vehicleCenterX = x_0_MAP_SIZE - MAP_SIZE / 2;
    const vehicleCenterZ = z_0_MAP_SIZE - MAP_SIZE / 2;

    // Create a bounding box for the vehicle (re-calculate as position might change)
    const vehicleBox = new THREE.Box3().setFromObject(vehicleMesh);

    const objects = [];
    scene.traverse(function(object) {
        if (object.userData.isObstacle || object.userData.isWall) {
            objects.push(object);
        }
    });

    for (const obj of objects) {
        if (objectType && obj.userData.type !== objectType) continue; // Check only for specific type if provided

        const objectBox = new THREE.Box3().setFromObject(obj);

        if (vehicleBox.intersectsBox(objectBox)) {
            // Found a collision
            return {
                id: obj.uuid,
                type: obj.userData.type // Use userData to store type
            };
        }
    }
    return null; // No collision
}

async function simulateVehicleMovementWithAlgorithm(frameCount, algorithm) {
    // Reset vehicle position to (0, 0, 0) in Three.js scene (which is center of map for us)
    setVehiclePosition(0, 0); 

    const mapSize = MAP_SIZE;
    const vehicleSize = VEHICLE_SIZE;
    const step = STEP;
    const goal = { x: MAP_SIZE - VEHICLE_SIZE, z: MAP_SIZE - VEHICLE_SIZE }; // Goal in 0-MAP_SIZE range
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

    for (let i = 0; i < frameCount; i++) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Simulate time passing

        const objects = getMapObjects(); // Get current map objects for collision checking
        
        // Get vehicle's current position (converting from centered Three.js to 0-MAP_SIZE)
        const vehicleCurrentX_3D = vehicleMesh.position.x + MAP_SIZE / 2;
        const vehicleCurrentZ_3D = vehicleMesh.position.z + MAP_SIZE / 2;
        const vehiclePos = {x: vehicleCurrentX_3D, y: vehicleCurrentZ_3D}; // Python expects x,y

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

        let nextX_0_MAP_SIZE = vehiclePos.x + dx;
        let nextZ_0_MAP_SIZE = vehiclePos.y + dy; // dy from Python maps to dz in our 3D scene
        
        // Ensure vehicle stays within bounds after Python's move calculation (0-MAP_SIZE range)
        nextX_0_MAP_SIZE = Math.max(0, Math.min(mapSize - vehicleSize, nextX_0_MAP_SIZE));
        nextZ_0_MAP_SIZE = Math.max(0, Math.min(mapSize - vehicleSize, nextZ_0_MAP_SIZE));

        setVehiclePosition(nextX_0_MAP_SIZE, nextZ_0_MAP_SIZE);

        // Update map visualization for explored areas and frontier
        markAreaAsClear(vehicleCurrentX_3D + vehicleSize / 2, vehicleCurrentZ_3D + vehicleSize / 2, SENSOR_RANGE);
        updateFrontier();

        // Collision detection for logging (after potential movement calculation)
        const collision = checkCollision(nextX_0_MAP_SIZE, nextZ_0_MAP_SIZE); // This function will be updated next
        if (collision) {
            let objectType = 'Object';
            if (collision.type === 'obstacle') objectType = 'Obstacle';
            else if (collision.type === 'wall') objectType = 'Wall'; // Vehicle is handled separately

            const event = {
                frame: i,
                type: `${objectType.toLowerCase()}_detected`,
                position: { x: nextX_0_MAP_SIZE, z: nextZ_0_MAP_SIZE },
                detected_object_id: collision.id
            };
            detectedEvents.push(event);
            logMessage(`Frame ${i}: ${objectType} detected at (${nextX_0_MAP_SIZE}, ${nextZ_0_MAP_SIZE}) near ${collision.id}`);
        }
        
        // Stop if reached goal
        if (calculateDistance(vehiclePos, goal) < step) { // Use vehiclePos as it's in 0-MAP_SIZE
            logMessage(`Goal reached at (${goal.x}, ${goal.z})! Simulation finished.`);
            break; // Exit loop if goal is reached
        }
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
    
    // Get all map objects from the 3D scene
    const mapObjects = getMapObjects();

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

function addDynamicObjectToMap(type, x_0_MAP_SIZE = 0, z_0_MAP_SIZE = 0) {
    const objectSize = STEP;
    let geometry, material;

    // Convert 0-MAP_SIZE coordinates to Three.js centered coordinates
    const centerX = x_0_MAP_SIZE - MAP_SIZE / 2;
    const centerZ = z_0_MAP_SIZE - MAP_SIZE / 2;

    if (type === 'obstacle') {
        geometry = new THREE.BoxGeometry(objectSize, objectSize, objectSize);
        material = new THREE.MeshPhongMaterial({ color: 0x00ff00 }); // Green
    } else if (type === 'wall') {
        geometry = new THREE.BoxGeometry(objectSize, objectSize, objectSize);
        material = new THREE.MeshPhongMaterial({ color: 0x0000ff }); // Blue
    } else {
        // Default or unknown type
        geometry = new THREE.BoxGeometry(objectSize, objectSize, objectSize);
        material = new THREE.MeshPhongMaterial({ color: 0xffff00 }); // Yellow
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(centerX, objectSize / 2, centerZ); // Position above ground
    mesh.userData = { type: type, isObstacle: type === 'obstacle', isWall: type === 'wall' }; // Store custom data
    mesh.name = `dynamic-object-${type}-${objectsInScene.length}`; // Unique name

    scene.add(mesh);
    objectsInScene.push(mesh); // Track the object
    return mesh;
}

function clearMapObjects() {
    // Remove all dynamic objects (obstacles, walls, and previously marked clear/frontier cells)
    // from the Three.js scene, except for the vehicle mesh itself.
    // Iterate backwards to safely remove elements during iteration
    for (let i = scene.children.length - 1; i >= 0; i--) {
        const object = scene.children[i];
        if (object.userData.isObstacle || object.userData.isWall || object.name.startsWith('cell-')) {
            scene.remove(object);
            if (object.geometry) object.geometry.dispose();
            if (object.material) object.material.dispose();
        }
    }
    // After clearing, re-initialize mapGridState to reflect an empty map for future additions
    initializeMapGridState(); // This will also ensure no lingering map states
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
                GOAL.z = y; // Update GOAL.z for 3D
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
