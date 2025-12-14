import os
import csv
from typing import List, Tuple, Optional

import cv2
import numpy as np


class Kalman2D:
    """Simple constant-velocity Kalman filter for 2D position."""

    def __init__(self, dt: float = 1.0, process_var: float = 1.0, meas_var: float = 25.0):
        self.dt = dt
        self.F = np.array([[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1]], dtype=float)
        self.H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], dtype=float)
        self.Q = process_var * np.eye(4)
        self.R = meas_var * np.eye(2)
        self.x = np.zeros((4, 1), dtype=float)
        self.P = np.eye(4, dtype=float) * 500.0

    def predict(self):
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q

    def update(self, z: np.ndarray):
        z = z.reshape((2, 1))
        y = z - (self.H @ self.x)
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.x = self.x + (K @ y)
        I = np.eye(self.P.shape[0])
        self.P = (I - K @ self.H) @ self.P

    def state(self) -> Tuple[float, float]:
        return float(self.x[0, 0]), float(self.x[1, 0])


def detect_pedestrian_centroid(img: np.ndarray) -> Optional[Tuple[float, float]]:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # green-ish threshold (works with our synthetic renderer)
    lower = np.array([40, 60, 40])
    upper = np.array([90, 255, 255])
    mask = cv2.inRange(hsv, lower, upper)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    M = cv2.moments(c)
    if M["m00"] == 0:
        return None
    cx = M["m10"] / M["m00"]
    cy = M["m01"] / M["m00"]
    return cx, cy


def track_sequence(frames_dir: str, out_csv: Optional[str] = None) -> List[Tuple[int, Optional[float], Optional[float], float, float]]:
    files = sorted([f for f in os.listdir(frames_dir) if f.endswith('.png')])
    kf = Kalman2D(dt=1.0, process_var=1.0, meas_var=25.0)
    results = []
    for i, fname in enumerate(files):
        path = os.path.join(frames_dir, fname)
        img = cv2.imread(path)
        det = detect_pedestrian_centroid(img)
        kf.predict()
        if det is not None:
            z = np.array([det[0], det[1]], dtype=float)
            kf.update(z)
            est_x, est_y = kf.state()
            results.append((i, float(det[0]), float(det[1]), est_x, est_y))
        else:
            est_x, est_y = kf.state()
            results.append((i, None, None, est_x, est_y))

    if out_csv:
        os.makedirs(os.path.dirname(out_csv) or '.', exist_ok=True)
        with open(out_csv, 'w', newline='') as f:
            w = csv.writer(f)
            w.writerow(['frame', 'det_x', 'det_y', 'est_x', 'est_y'])
            for row in results:
                w.writerow(row)

    return results


if __name__ == '__main__':
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument('--in', dest='indir', default='data/frames', help='Frames directory')
    p.add_argument('--out', dest='out', default='data/tracks.csv', help='Output CSV')
    args = p.parse_args()
    track_sequence(args.indir, args.out)
import os
import csv
from typing import List, Tuple, Optional

import cv2
import numpy as np


class Kalman2D:
    """Simple constant-velocity Kalman filter for 2D position."""

    def __init__(self, dt: float = 1.0, process_var: float = 1.0, meas_var: float = 25.0):
        self.dt = dt
        self.F = np.array([[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1]], dtype=float)
        self.H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], dtype=float)
        self.Q = process_var * np.eye(4)
        self.R = meas_var * np.eye(2)
        self.x = np.zeros((4, 1), dtype=float)
        self.P = np.eye(4, dtype=float) * 500.0

    def predict(self):
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q

    def update(self, z: np.ndarray):
        z = z.reshape((2, 1))
        y = z - (self.H @ self.x)
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.x = self.x + (K @ y)
        I = np.eye(self.P.shape[0])
        self.P = (I - K @ self.H) @ self.P

    def state(self) -> Tuple[float, float]:
        return float(self.x[0, 0]), float(self.x[1, 0])


def detect_pedestrian_centroid(img: np.ndarray) -> Optional[Tuple[float, float]]:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # green-ish threshold (works with our synthetic renderer)
    lower = np.array([40, 60, 40])
    upper = np.array([90, 255, 255])
    mask = cv2.inRange(hsv, lower, upper)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    M = cv2.moments(c)
    if M["m00"] == 0:
        return None
    cx = M["m10"] / M["m00"]
    cy = M["m01"] / M["m00"]
    return cx, cy


def track_sequence(frames_dir: str, out_csv: Optional[str] = None) -> List[Tuple[int, Optional[float], Optional[float], float, float]]:
    files = sorted([f for f in os.listdir(frames_dir) if f.endswith('.png')])
    kf = Kalman2D(dt=1.0, process_var=1.0, meas_var=25.0)
    results = []
    for i, fname in enumerate(files):
        path = os.path.join(frames_dir, fname)
        img = cv2.imread(path)
        det = detect_pedestrian_centroid(img)
        kf.predict()
        if det is not None:
            z = np.array([det[0], det[1]], dtype=float)
            kf.update(z)
            est_x, est_y = kf.state()
            results.append((i, float(det[0]), float(det[1]), est_x, est_y))
        else:
            est_x, est_y = kf.state()
            results.append((i, None, None, est_x, est_y))

    if out_csv:
        os.makedirs(os.path.dirname(out_csv) or '.', exist_ok=True)
        with open(out_csv, 'w', newline='') as f:
            w = csv.writer(f)
            w.writerow(['frame', 'det_x', 'det_y', 'est_x', 'est_y'])
            for row in results:
                w.writerow(row)

    return results


if __name__ == '__main__':
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument('--in', dest='indir', default='data/frames', help='Frames directory')
    p.add_argument('--out', dest='out', default='data/tracks.csv', help='Output CSV')
    args = p.parse_args()
    track_sequence(args.indir, args.out)
