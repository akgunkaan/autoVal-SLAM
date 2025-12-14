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

let selectedAlgorithm = null; // Global variable to store selected algorithm
let currentActiveAlgoButton = null; // To keep track of the currently active button
let detectedEvents = []; // Global variable to store detected events

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

    let currentX = 0;
    let currentY = 0;
    let direction = 0; // For default square path
    let isFollowingWall = false; // For Bug Algorithms
    let wallFollowDirection = { x: 0, y: 0 }; // For Bug Algorithms
    let lastCollisionObject = null; // For Bug Algorithms

    for (let i = 0; i < frameCount; i++) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Simulate time passing

        let moveX = 0;
        let moveY = 0;
        let nextX = currentX;
        let nextY = currentY;

        const objects = getMapObjects(); // Get current map objects for collision checking
        const vehiclePos = getVehiclePosition();
        
        // Default movement or based on selected algorithm
        switch (algorithm) {
            case 'APF': // Artificial Potential Field
            case 'VFF': // Virtual Force Field
                let attractiveForce = getDirectionVector(vehiclePos.x, vehiclePos.y, goal.x, goal.y);
                attractiveForce.x *= 0.8; // Reduce attractive force strength
                attractiveForce.y *= 0.8;

                let repulsiveForce = { x: 0, y: 0 };
                objects.forEach(obj => {
                    const objCenter = { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 };
                    const vehicleCenter = { x: vehiclePos.x + vehiclePos.width / 2, y: vehiclePos.y + vehiclePos.height / 2 };
                    const dist = calculateDistance(vehicleCenter, objCenter);
                    const safeDistance = 50; // Distance to start repelling

                    if (dist < safeDistance && dist > 0) {
                        let forceDir = getDirectionVector(objCenter.x, objCenter.y, vehicleCenter.x, vehicleCenter.y);
                        const repulsionStrength = 1 - (dist / safeDistance); // Stronger repulsion when closer
                        repulsiveForce.x += forceDir.x * repulsionStrength * 2; // Stronger repulsion force
                        repulsiveForce.y += forceDir.y * repulsionStrength * 2;
                    }
                });

                let resultantForce = normalizeVector({
                    x: attractiveForce.x + repulsiveForce.x,
                    y: attractiveForce.y + repulsiveForce.y
                });
                moveX = resultantForce.x * step;
                moveY = resultantForce.y * step;

                nextX = vehiclePos.x + moveX;
                nextY = vehiclePos.y + moveY;
                break;

            case 'BugAlgorithms': // Bug Algorithms
            case 'TangentBug': // TangentBug
                let directPathVector = getDirectionVector(vehiclePos.x, vehiclePos.y, goal.x, goal.y);
                nextX = vehiclePos.x + directPathVector.x * step;
                nextY = vehiclePos.y + directPathVector.y * step;

                let collisionDetected = checkCollision(nextX, nextY);

                if (collisionDetected && !isFollowingWall) {
                    isFollowingWall = true;
                    lastCollisionObject = collisionDetected;
                    // Start wall following (e.g., turn right)
                    wallFollowDirection = { x: directPathVector.y, y: -directPathVector.x }; // Perpendicular vector for turning right
                    logMessage(`Collision detected. Starting wall following around ${collisionDetected.type}.`);
                }

                if (isFollowingWall) {
                    // Try to move along the wall
                    nextX = vehiclePos.x + wallFollowDirection.x * step;
                    nextY = vehiclePos.y + wallFollowDirection.y * step;

                    // If still colliding with the same object, keep following
                    if (checkCollision(nextX, nextY) === lastCollisionObject) {
                        // Keep current wallFollowDirection
                    } else {
                        // Try to turn back towards the goal
                        let tempNextX = vehiclePos.x + directPathVector.x * step;
                        let tempNextY = vehiclePos.y + directPathVector.y * step;
                        if (!checkCollision(tempNextX, tempNextY)) {
                            isFollowingWall = false;
                            lastCollisionObject = null;
                            logMessage("Obstacle cleared. Resuming towards goal.");
                            nextX = tempNextX;
                            nextY = tempNextY;
                        } else {
                            // Still blocked, continue wall following
                            nextX = vehiclePos.x + wallFollowDirection.x * step;
                            nextY = vehiclePos.y + wallFollowDirection.y * step;
                        }
                    }
                }
                break;

            case 'DWA': // Dynamic Window Approach
                // Simplified DWA: Prioritize goal, avoid immediate collision
                let targetVector = getDirectionVector(vehiclePos.x, vehiclePos.y, goal.x, goal.y);
                let bestMove = { x: targetVector.x * step, y: targetVector.y * step };
                let bestScore = -Infinity;

                // Sample a few directions around the target vector
                const sampleDirections = [-0.5, 0, 0.5]; // Left, Straight, Right turns
                sampleDirections.forEach(angleOffset => {
                    const angle = Math.atan2(targetVector.y, targetVector.x) + angleOffset;
                    const testMove = { x: Math.cos(angle) * step, y: Math.sin(angle) * step };
                    const testX = vehiclePos.x + testMove.x;
                    const testY = vehiclePos.y + testMove.y;

                    if (!checkCollision(testX, testY)) {
                        // Calculate a simple score: closer to goal, further from objects
                        const distToGoal = calculateDistance({x:testX, y:testY}, goal);
                        let score = -distToGoal; // Minimize distance to goal

                        objects.forEach(obj => {
                            const objCenter = { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 };
                            const testCenter = { x: testX + vehiclePos.width / 2, y: testY + vehiclePos.height / 2 };
                            const dist = calculateDistance(testCenter, objCenter);
                            if (dist < 30) { // Penalize proximity to objects
                                score -= (30 - dist);
                            }
                        });

                        if (score > bestScore) {
                            bestScore = score;
                            bestMove = testMove;
                        }
                    }
                });
                nextX = vehiclePos.x + bestMove.x;
                nextY = vehiclePos.y + bestMove.y;
                break;
            
            case 'PRM': // Probabilistic Roadmap
            case 'RRT': // Rapidly-Exploring Random Tree
                // Conceptual: Try to find a path, if blocked, find a random escape
                let directPathPRM = getDirectionVector(vehiclePos.x, vehiclePos.y, goal.x, goal.y);
                let testPRMX = vehiclePos.x + directPathPRM.x * step;
                let testPRMY = vehiclePos.y + directPathPRM.y * step;

                if (!checkCollision(testPRMX, testPRMY)) {
                    nextX = testPRMX;
                    nextY = testPRMY;
                } else {
                    // Path blocked, try a random direction to escape
                    let randomAngle = Math.random() * 2 * Math.PI;
                    nextX = vehiclePos.x + Math.cos(randomAngle) * step;
                    nextY = vehiclePos.y + Math.sin(randomAngle) * step;
                    logMessage(`${algorithm}: Path blocked. Taking a random step to escape.`);
                }
                break;

            case 'DRL': // Deep Reinforcement Learning
            case 'PPO': // Proximal Policy Optimization
                // Conceptual: More "intelligent" avoidance, try to find an open path
                let forwardVectorDRL = getDirectionVector(vehiclePos.x, vehiclePos.y, goal.x, goal.y);
                let testDRLX = vehiclePos.x + forwardVectorDRL.x * step;
                let testDRLY = vehiclePos.y + forwardVectorDRL.y * step;

                if (!checkCollision(testDRLX, testDRLY)) {
                    nextX = testDRLX;
                    nextY = testDRLY;
                } else {
                    // Path blocked, try to find the "widest" open space
                    let bestEscapeAngle = 0;
                    let widestGap = -Infinity;
                    for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 8) { // Sample 16 directions
                        let testEscapeX = vehiclePos.x + Math.cos(angle) * step * 3; // Look further
                        let testEscapeY = vehiclePos.y + Math.sin(angle) * step * 3;
                        if (!checkCollision(testEscapeX, testEscapeY)) {
                            // Simple heuristic for gap: distance to nearest obstacle in that direction
                            let distToNearestObstacle = mapSize * 2; // Effectively infinity
                            objects.forEach(obj => {
                                const objCenter = { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 };
                                const vehicleCenter = { x: vehiclePos.x + vehiclePos.width / 2, y: vehiclePos.y + vehiclePos.height / 2 };
                                const dist = calculateDistance(vehicleCenter, objCenter);
                                const angleToObject = Math.atan2(objCenter.y - vehicleCenter.y, objCenter.x - vehicleCenter.x);
                                // Check if object is in this general direction
                                if (Math.abs(angle - angleToObject) < Math.PI / 4) {
                                    distToNearestObstacle = Math.min(distToNearestObstacle, dist);
                                }
                            });
                            if (distToNearestObstacle > widestGap) {
                                widestGap = distToNearestObstacle;
                                bestEscapeAngle = angle;
                            }
                        }
                    }
                    nextX = vehiclePos.x + Math.cos(bestEscapeAngle) * step;
                    nextY = vehiclePos.y + Math.sin(bestEscapeAngle) * step;
                    logMessage(`${algorithm}: Path blocked. Seeking widest gap.`);
                }
                break;

            default: // Default simple movement (square path)
                // This logic is now handled by _simulateVehicleMovementDefault, but included here for clarity if it were different
                await _simulateVehicleMovementDefault(frameCount - i, detectedEvents); // Pass remaining frames
                return; // Exit if default is handled by _simulateVehicleMovementDefault
        }

        currentX = nextX;
        currentY = nextY;
        vehiclePos.x = currentX; // Update vehiclePos for next iteration
        vehiclePos.y = currentY;

        setVehiclePosition(currentX, currentY);

        // Collision detection for logging (after potential movement calculation)
        const collision = checkCollision(currentX, currentY);
        if (collision) {
            let objectType = 'Object';
            if (collision.type === 'obstacle') objectType = 'Obstacle';
            else if (collision.type === 'vehicle') objectType = 'Vehicle';
            else if (collision.type === 'wall') objectType = 'Wall';

            const event = {
                frame: i,
                type: `${objectType.toLowerCase()}_detected`,
                position: { x: currentX, y: currentY },
                detected_object_id: collision.id
            };
            detectedEvents.push(event);
            logMessage(`Frame ${i}: ${objectType} detected at (${currentX}, ${currentY}) near ${collision.id}`);
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

// Event Listeners for Obstacle Avoidance Algorithm buttons
document.addEventListener('DOMContentLoaded', () => {
    const algorithmButtons = document.querySelectorAll('button[data-algorithm]');
    algorithmButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (currentActiveAlgoButton) {
                currentActiveAlgoButton.classList.remove('active');
            }
            button.classList.add('active');
            currentActiveAlgoButton = button;

            const category = button.dataset.category;
            const algorithm = button.dataset.algorithm;
            selectedAlgorithm = algorithm; // Update global variable
            logMessage(`Obstacle Avoidance Algorithm Selected: Category - ${category}, Algorithm - ${algorithm}`);
        });
    });
});

// Disable run button until initialization is complete
runButton.disabled = true;
runButton.textContent = "Initializing...";
main();
