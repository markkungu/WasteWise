import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import numpy as np
import pytest
from inference.predictor import PlasticPredictor, PLASTIC_CLASSES, CONFIDENCE_THRESHOLD


@pytest.fixture
def predictor():
    # model_path points to a non-existent file → stub mode
    return PlasticPredictor(model_path="./nonexistent_model.pt")


@pytest.fixture
def sample_image():
    rng = np.random.default_rng(0)
    return rng.integers(0, 255, (224, 224, 3), dtype=np.uint8)


def test_stub_mode_when_model_missing(predictor):
    assert predictor._stub_mode is True
    assert predictor.model_loaded is False


def test_predict_returns_required_keys(predictor, sample_image):
    result = predictor.predict(sample_image)
    assert "primary_category" in result
    assert "detected_items_count" in result
    assert "confidence_score" in result
    assert "all_detections" in result


def test_stub_primary_category_is_valid_plastic(predictor, sample_image):
    result = predictor.predict(sample_image)
    assert result["primary_category"] in PLASTIC_CLASSES


def test_stub_detected_items_count_is_positive(predictor, sample_image):
    result = predictor.predict(sample_image)
    assert result["detected_items_count"] >= 1


def test_stub_confidence_below_threshold(predictor, sample_image):
    # Stub intentionally returns low confidence so threshold check rejects it
    result = predictor.predict(sample_image)
    assert result["confidence_score"] < CONFIDENCE_THRESHOLD


def test_stub_is_deterministic(predictor, sample_image):
    r1 = predictor.predict(sample_image)
    r2 = predictor.predict(sample_image)
    assert r1["primary_category"] == r2["primary_category"]
    assert r1["confidence_score"] == r2["confidence_score"]


def test_stub_different_images_may_differ(predictor):
    rng = np.random.default_rng(1)
    img_a = rng.integers(0, 255, (100, 100, 3), dtype=np.uint8)
    img_b = rng.integers(0, 255, (100, 100, 3), dtype=np.uint8)
    r_a = predictor.predict(img_a)
    r_b = predictor.predict(img_b)
    # They might be equal by chance but the structure must be valid either way
    assert r_a["primary_category"] in PLASTIC_CLASSES
    assert r_b["primary_category"] in PLASTIC_CLASSES


def test_stub_confidence_in_0_1_range(predictor, sample_image):
    result = predictor.predict(sample_image)
    assert 0.0 <= result["confidence_score"] <= 1.0


def test_stub_all_detections_match_item_count(predictor, sample_image):
    result = predictor.predict(sample_image)
    assert len(result["all_detections"]) == result["detected_items_count"]
