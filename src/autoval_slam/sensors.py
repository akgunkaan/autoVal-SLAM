# -*- coding: utf-8 -*-
"""
Minimal LiDAR scanner simulator.
"""
import numpy as np
import pathlib
import json

def simulate_lidar_scan(
    num_points: int = 360, 
    noise_level: float = 0.01,
    box_size: float = 10.0
) -> np.ndarray:
    """
    Generates a synthetic 2D LiDAR scan in a square box.

    Args:
        num_points: Number of points in the scan.
        noise_level: Standard deviation of Gaussian noise to add to measurements.
        box_size: The side length of the square environment.

    Returns:
        A (num_points, 2) numpy array of (x, y) coordinates.
    """
    # Generate angles for a full 360-degree scan
    angles = np.linspace(0, 2 * np.pi, num_points, endpoint=False)
    
    # Simple simulation: calculate distance to the walls of a square box
    distances = np.zeros_like(angles)
    half_box = box_size / 2.0

    for i, angle in enumerate(angles):
        cos_a, sin_a = np.cos(angle), np.sin(angle)
        
        # Check intersections with vertical and horizontal walls
        dist_v = half_box / abs(cos_a) if abs(cos_a) > 1e-6 else np.inf
        dist_h = half_box / abs(sin_a) if abs(sin_a) > 1e-6 else np.inf
        
        distances[i] = min(dist_v, dist_h)

    # Add some noise
    distances += np.random.normal(0, noise_level, size=distances.shape)

    # Convert polar coordinates (distances, angles) to Cartesian (x, y)
    x = distances * np.cos(angles)
    y = distances * np.sin(angles)
    
    return np.vstack((x, y)).T

def save_scan_to_file(scan_data: np.ndarray, frame_id: int, out_dir: pathlib.Path):
    """Saves LiDAR scan data to a JSON file."""
    if not out_dir.exists():
        out_dir.mkdir(parents=True)
    
    file_path = out_dir / f"lidar_frame_{frame_id:05d}.json"
    
    output = {
        "frame_id": frame_id,
        "point_count": len(scan_data),
        "points": scan_data.tolist()
    }

    with open(file_path, "w") as f:
        json.dump(output, f, indent=2)

if __name__ == '__main__':
    # Example usage: generate and visualize a scan
    output_directory = pathlib.Path("data/lidar_frames")
    
    print(f"Generating a sample LiDAR scan...")
    scan = simulate_lidar_scan(num_points=180)
    save_scan_to_file(scan, 0, output_directory)
    print(f"Saved sample scan to {output_directory}")

    # For visualization
    try:
        import matplotlib.pyplot as plt
        plt.figure(figsize=(6, 6))
        plt.scatter(scan[:, 0], scan[:, 1], s=5)
        plt.title("Synthetic LiDAR Scan")
        plt.xlabel("X (m)")
        plt.ylabel("Y (m)")
        plt.grid(True)
        plt.axis('equal')
        plt.show()
    except ImportError:
        print("\nMatplotlib not found. Please install it (`pip install matplotlib`) to visualize the scan.")
