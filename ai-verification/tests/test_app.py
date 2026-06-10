import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
import numpy as np
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

os.environ.setdefault("MODEL_PATH", "./nonexistent_model.pt")
os.environ.setdefault("CONFIDENCE_THRESHOLD", "0.30")

from app import app, _predictor, _spoof_detector
from inference.predictor import PlasticPredictor
from inference.spoof_detector import SpoofDetector


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


# ---- /health -----------------------------------------------------------------

def test_health_returns_ok(client):
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["service"] == "wastewise-ai-verification"


def test_health_model_loaded_field_present(client):
    res = client.get("/health")
    assert "model_loaded" in res.json()


# ---- /model/info -------------------------------------------------------------

def test_model_info_has_expected_keys(client):
    res = client.get("/model/info")
    assert res.status_code == 200
    data = res.json()
    assert "version" in data
    assert "classes" in data
    assert "threshold" in data
    assert "stub_mode" in data


def test_model_info_classes_are_plastic_types(client):
    res = client.get("/model/info")
    assert "PET" in res.json()["classes"]


# ---- /predict ----------------------------------------------------------------

def _make_request(submission_id="sub-001"):
    return {
        "submission_id": submission_id,
        "image_url": "http://example.com/image.jpg",
        "latitude": -1.286389,
        "longitude": 36.817223,
        "timestamp": "2026-06-09T12:00:00Z",
    }


def test_predict_image_download_failure_returns_rejected(client):
    with patch("app._download_image", side_effect=ValueError("network error")):
        res = client.post("/predict", json=_make_request())
    assert res.status_code == 200
    body = res.json()
    assert body["verification_result"] == "REJECTED_LOW_QUALITY"
    assert "IMAGE_DOWNLOAD_FAILED" in body["fraud_flags"]


def test_predict_spoof_detected_returns_rejected_spoof(client):
    fake_image = np.zeros((100, 100, 3), dtype=np.uint8)
    spoof_result = {"passed": False, "flags": ["BLURRY_IMAGE"], "blur_score": 5.0, "moire_score": 0.0}
    with patch("app._download_image", return_value=fake_image), \
         patch("app._spoof_detector") as mock_sd:
        mock_sd.check.return_value = spoof_result
        res = client.post("/predict", json=_make_request())
    assert res.status_code == 200
    body = res.json()
    assert body["verification_result"] == "REJECTED_SPOOF"


def test_predict_low_confidence_returns_rejected_invalid_material(client):
    fake_image = np.zeros((100, 100, 3), dtype=np.uint8)
    clean_spoof = {"passed": True, "flags": [], "blur_score": 200.0, "moire_score": 0.05}
    low_conf_pred = {"primary_category": "PET", "detected_items_count": 1, "confidence_score": 0.10, "all_detections": []}
    with patch("app._download_image", return_value=fake_image), \
         patch("app._spoof_detector") as mock_sd, \
         patch("app._predictor") as mock_pred:
        mock_sd.check.return_value = clean_spoof
        mock_pred.predict.return_value = low_conf_pred
        res = client.post("/predict", json=_make_request())
    assert res.status_code == 200
    body = res.json()
    assert body["verification_result"] == "REJECTED_INVALID_MATERIAL"
    assert "LOW_CONFIDENCE" in body["fraud_flags"]


def test_predict_high_confidence_returns_approved(client):
    fake_image = np.zeros((100, 100, 3), dtype=np.uint8)
    clean_spoof = {"passed": True, "flags": [], "blur_score": 300.0, "moire_score": 0.05}
    high_conf_pred = {"primary_category": "PET", "detected_items_count": 3, "confidence_score": 0.92, "all_detections": []}
    with patch("app._download_image", return_value=fake_image), \
         patch("app._spoof_detector") as mock_sd, \
         patch("app._predictor") as mock_pred:
        mock_sd.check.return_value = clean_spoof
        mock_pred.predict.return_value = high_conf_pred
        res = client.post("/predict", json=_make_request())
    assert res.status_code == 200
    body = res.json()
    assert body["verification_result"] == "APPROVED"
    assert body["primary_category"] == "PET"
    assert body["confidence_score"] == 0.92
    assert body["authenticity_verified"] is True


def test_predict_response_contains_submission_id(client):
    fake_image = np.zeros((100, 100, 3), dtype=np.uint8)
    with patch("app._download_image", side_effect=ValueError("err")):
        res = client.post("/predict", json=_make_request("my-sub-id"))
    assert res.json()["submission_id"] == "my-sub-id"
