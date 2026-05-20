import cv2
import numpy as np


class SpoofDetector:
    """
    Anti-spoofing detector that checks images for signs of screen photography
    (moiré patterns) and excessive blur that indicate a fraudulent submission.
    """

    def __init__(self, blur_threshold: float = 100.0, moire_threshold: float = 0.15):
        self.blur_threshold = blur_threshold
        self.moire_threshold = moire_threshold

    def check_blur(self, image: np.ndarray) -> tuple[bool, float]:
        """
        Detect excessive blur using Laplacian variance.

        Returns (is_blurry, score) where is_blurry=True means the image is
        too blurry to be a genuine, valid submission.
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        is_blurry = laplacian_var < self.blur_threshold
        return is_blurry, laplacian_var

    def check_moire(self, image: np.ndarray) -> tuple[bool, float]:
        """
        FFT-based moiré detection for screen or printout photographs.

        Moiré patterns produce strong periodic frequency components in the
        FFT magnitude spectrum. We suppress the DC component, then measure
        the energy concentration in the high-frequency ring relative to the
        total spectrum energy. A high ratio indicates a periodic pattern
        consistent with photographing a screen or printed image.

        Returns (has_moire, score).
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        gray_f = np.float32(gray)

        # Apply FFT and shift DC to center
        dft = np.fft.fft2(gray_f)
        dft_shift = np.fft.fftshift(dft)
        magnitude = np.abs(dft_shift)

        rows, cols = gray.shape
        crow, ccol = rows // 2, cols // 2

        # Suppress DC component (central region) to focus on periodic content
        dc_radius = max(5, min(rows, cols) // 20)
        dc_mask = np.ones((rows, cols), dtype=np.float32)
        cv2.circle(dc_mask, (ccol, crow), dc_radius, 0, -1)
        magnitude_no_dc = magnitude * dc_mask

        total_energy = float(np.sum(magnitude_no_dc)) + 1e-10

        # Moiré concentrates energy in mid-to-high frequency ring
        inner_r = max(dc_radius + 1, min(rows, cols) // 8)
        outer_r = min(rows, cols) // 3
        ring_mask = np.zeros((rows, cols), dtype=np.float32)
        cv2.circle(ring_mask, (ccol, crow), outer_r, 1, -1)
        cv2.circle(ring_mask, (ccol, crow), inner_r, 0, -1)

        ring_energy = float(np.sum(magnitude_no_dc * ring_mask))
        moire_score = ring_energy / total_energy

        has_moire = moire_score > self.moire_threshold
        return has_moire, round(moire_score, 4)

    def check(self, image: np.ndarray) -> dict:
        """
        Run all anti-spoofing checks.

        Returns:
            {
                "passed": bool,          # True = genuine image
                "flags":  list[str],     # e.g. ["BLURRY_IMAGE", "MOIRE_DETECTED"]
                "blur_score":  float,    # Laplacian variance (higher = sharper)
                "moire_score": float,    # Frequency concentration ratio (lower = cleaner)
            }
        """
        flags: list[str] = []

        is_blurry, blur_score = self.check_blur(image)
        if is_blurry:
            flags.append("BLURRY_IMAGE")

        has_moire, moire_score = self.check_moire(image)
        if has_moire:
            flags.append("MOIRE_DETECTED")

        passed = len(flags) == 0
        return {
            "passed": passed,
            "flags": flags,
            "blur_score": round(blur_score, 4),
            "moire_score": moire_score,
        }
