# AutoVal SLAM: A Web-Based Simulation and Perception Prototyping Kit

**AutoVal SLAM: A web-based simulator for autonomous driving, featuring sensor simulation, perception algorithms via Pyodide, and GitHub Pages deployment.** The project runs entirely in your web browser, using **Pyodide** to execute Python simulation code (like NumPy and Matplotlib) via WebAssembly.

This repository is a starting point for experimenting with concepts such as:
-   **In-Browser Sensor Simulation**: Generating and visualizing synthetic sensor data (like LiDAR) directly on a web page.
-   **Web-Based GUI**: Controlling simulation parameters through a user-friendly HTML/CSS interface.
-   **Zero-Installation Deployment**: Sharing the project via a link using automatic GitHub Pages deployment.

## Conceptual Analogy: The Autonomous Driving Orchestra

The system can be compared to a high-precision orchestra working in harmony:

![The Autonomous Driving Orchestra](docs/diagrams/orchestra.svg)

-   **Sensors (Musicians)**: The Python simulation code generates data (musical notes) from virtual sensors.
-   **Web Browser (Conductor & Stage)**: The browser orchestrates the simulation, runs the Python code via Pyodide, and visualizes the output on the screen.
-   **JavaScript (Sound Engineer)**: Acts as the glue, connecting the user interface controls to the Python simulation logic running in the background.

## Project Structure

This project is structured as a static web application that leverages Pyodide.

-   `index.html`: The main entry point and user interface for the web application.
-   `style.css`: Provides styling for the web interface.
-   `main.js`: Contains the core JavaScript logic for loading Pyodide, running Python scripts, and handling user interaction.
-   `src/adcore/sensors.py`: Python module for the 2D LiDAR scanner simulation (runs in the browser).
-   `src/adcore/sim.py`: Python module for the older camera simulation (currently not implemented in the web UI).
-   `.github/workflows/deploy.yml`: **(New)** GitHub Actions workflow that automatically deploys the project to GitHub Pages.
-   `docs/diagrams/`: Contains SVG diagrams explaining the project architecture.
-   `placeholder.cpp` & `kalman_adv.py`: Skeletons for future C++ and advanced tracking logic.

## Quick Start & Deployment

This project is designed to be run directly from a web server and is configured for automatic deployment to GitHub Pages.

### Running Locally

To run this project on your local machine, you do not need to install Python dependencies. You only need to serve the files with a simple local web server.

1.  **Clone the repository.**

2.  **Navigate to the `autoval_slam` directory.**

3.  **Start a local web server.** If you have Python installed, the easiest way is:
    ```bash
    # For Python 3
    python -m http.server
    ```
    If you have Node.js installed, you can use:
    ```bash
    npx serve
    ```

4.  **Open your browser** and navigate to `http://localhost:8000` (or the address provided by your server). The web interface should load and initialize Pyodide.

### GitHub Pages Deployment

This repository includes a GitHub Actions workflow that automatically deploys the `main` branch to GitHub Pages.

1.  **Push your code** to the `main` branch of your GitHub repository.
2.  **Enable GitHub Pages** in your repository settings. Go to `Settings -> Pages` and select `GitHub Actions` as the source.
3.  The workflow will run automatically, and your web simulator will be available at `https://<Your-Username>.github.io/<repository-name>/`.

## Future Plans and Out-of-Scope Technologies

Beyond this prototype, certain advanced technologies are targeted for a production-level autonomous driving system but are currently out of scope:

-   **Ceres Solver (SLAM Backend Optimization)**: Notes on this can be found in `placeholder.cpp`.
-   **TensorRT/ONNX (Model Optimization for Real-Time Inference)**: Notes on this are detailed in `src/adcore/hpc/optimization_notes.md`.

## License

This project is licensed under the MIT License. See the `LICENSE.txt` file for details.
