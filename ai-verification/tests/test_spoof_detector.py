import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import numpy as np
import pytest
from inference.spoof_detector import SpoofDetector


@pytest.fixture
def detector():
    return SpoofDetector()


def _sharp_image(h=200, w=200):
    img = np.zeros((h, w, 3), dtype=np.uint8)
    # Checkerboard → high Laplacian variance
    for i in range(0, h, 10):
        for j in range(0, w, 10):
            if (i // 10 + j // 10) % 2 == 0:
                img[i:i+10, j:j+10] = 255
    return img


def _blurry_image(h=200, w=200):
    # Uniform solid colour → near-zero Laplacian variance
    return np.full((h, w, 3), 128, dtype=np.uint8)


def test_check_returns_required_keys(detector):
    result = detector.check(_sharp_image())
    assert "passed" in result
    assert "flags" in result
    assert "blur_score" in result
    assert "moire_score" in result


def test_sharp_image_passes_blur_check(detector):
    is_blurry, score = detector.check_blur(_sharp_image())
    assert is_blurry is False
    assert score >= detector.blur_threshold


def test_blurry_image_fails_blur_check(detector):
    is_blurry, score = detector.check_blur(_blurry_image())
    assert is_blurry is True
    assert score < detector.blur_threshold


def test_blur_flag_added_when_blurry(detector):
    result = detector.check(_blurry_image())
    assert "BLURRY_IMAGE" in result["flags"]


def test_passed_false_when_blurry(detector):
    result = detector.check(_blurry_image())
    assert result["passed"] is False


def test_moire_check_returns_bool_and_float(detector):
    has_moire, score = detector.check_moire(_sharp_image())
    assert isinstance(has_moire, bool)
    assert isinstance(score, float)
    assert 0.0 <= score <= 1.0


def test_check_passed_true_for_sharp_clean_image(detector):
    # Use a detector with a very low moire threshold to avoid false positives
    d = SpoofDetector(blur_threshold=10.0, moire_threshold=0.99)
    result = d.check(_sharp_image())
    assert result["passed"] is True
    assert result["flags"] == []


def test_blur_score_is_non_negative(detector):
    _, score = detector.check_blur(_sharp_image())
    assert score >= 0


def test_grayscale_input_handled(detector):
    gray = np.zeros((100, 100), dtype=np.uint8)
    # Should not raise even without colour channels
    is_blurry, _ = detector.check_blur(gray)
    assert isinstance(is_blurry, bool)
