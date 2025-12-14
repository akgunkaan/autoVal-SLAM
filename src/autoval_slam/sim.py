import os
import cv2
import numpy as np


class SyntheticCam:
    """Basit sentetik kamera: hareketli bir araç ve bir yaya çizer."""

    def __init__(self, width=640, height=480):
        self.w = width
        self.h = height

    def render_frame(self, t: int) -> np.ndarray:
        img = np.zeros((self.h, self.w, 3), dtype=np.uint8) + 30

        # yol
        cv2.rectangle(img, (0, int(self.h * 0.6)), (self.w, self.h), (50, 50, 50), -1)

        # hareketli araç (kırmızı kutu)
        cx = int((t * 8) % (self.w + 200) - 100)
        cv2.rectangle(img, (cx, int(self.h * 0.6) - 60), (cx + 80, int(self.h * 0.6) - 10), (0, 0, 200), -1)

        # yaya (yeşil daire)
        py = int(self.h * 0.6 - 80 - 20 * np.sin(t / 6.0))
        px = int(self.w * 0.25 + 40 * np.sin(t / 4.0))
        cv2.circle(img, (px, py), 10, (0, 200, 0), -1)

        # basit aydınlatma/leyer
        alpha = 0.6 + 0.4 * np.sin(t / 10.0)
        img = cv2.convertScaleAbs(img, alpha=alpha)

        return img

    def generate_sequence(self, count: int, out_dir: str):
        os.makedirs(out_dir, exist_ok=True)
        for i in range(count):
            img = self.render_frame(i)
            path = os.path.join(out_dir, f"frame_{i:04d}.png")
            cv2.imwrite(path, img)


if __name__ == "__main__":
    cam = SyntheticCam()
    cam.generate_sequence(10, "data/frames_test")
