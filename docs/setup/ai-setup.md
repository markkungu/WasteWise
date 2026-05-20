# AI Verification Service — Setup

**Role owner:** Antony Omondi
**Module location:** `ai-verification/`
**Port:** 8001

---

## What This Module Does

The AI verification service is a FastAPI application that receives plastic waste images from the backend, runs two sequential checks, and returns a structured verification result. The backend calls this service internally — the mobile app never talks to it directly.

### Processing pipeline

When `POST /predict` is called:

1. **SpoofDetector** (`inference/spoof_detector.py`) runs two fraud checks:
   - **Blur detection:** computes the Laplacian variance of the image. Images below the sharpness threshold are flagged as low quality.
   - **Screen/printout artifact detection:** runs an FFT analysis to detect moiré patterns, which indicate a photo of a screen or printed image rather than a real plastic item.

2. **PlasticPredictor** (`inference/predictor.py`) loads the YOLOv8 model and classifies the plastic type. Supported categories: PET, HDPE, LDPE, PP, PS.

3. The service returns a `VerificationResponse` (defined in `inference/schema.py`) with:
   - `verification_result`: APPROVED | REJECTED_SPOOF | REJECTED_INVALID_MATERIAL | REJECTED_LOW_QUALITY
   - `primary_category`: detected plastic type (null if rejected)
   - `detected_items_count`: number of plastic items YOLOv8 found
   - `confidence_score`: float between 0.0 and 1.0
   - `authenticity_verified`: boolean
   - `fraud_flags`: list of strings (e.g. `["NONE"]`, `["blur_detected"]`, `["moire_pattern"]`)
   - `model_version`: string identifying the model file used

### Stub mode

When no trained model file is found in `models/`, the service starts in stub mode. Stub predictions always return a confidence score below 0.80, which causes the result to be REJECTED_INVALID_MATERIAL. This is intentional — it prevents fake token approvals during development while still allowing the full pipeline (backend → AI service → blockchain) to be tested end-to-end. The stub logs a warning at startup so you know it is active.

---

## Prerequisites

- Python 3.11 or newer
- pip 23 or newer
- (Optional) CUDA-compatible GPU for faster YOLOv8 inference — the service runs fine on CPU

---

## Setup Steps

### 1. Navigate to the module

```bash
cd ai-verification
```

### 2. Create and activate a virtual environment

```bash
python -m venv venv
source venv/bin/activate
```

Windows:
```bash
venv\Scripts\activate
```

You should see `(venv)` at the start of your terminal prompt.

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

This installs FastAPI, uvicorn, ultralytics (YOLOv8), OpenCV, PyTorch, and Pydantic v2. The download is approximately 1–2 GB on first install because PyTorch is included.

If `torch` fails to install, install it separately first:
```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

### 4. Create your `.env` file

```bash
cp .env.example .env
```

Fill in any required values. At minimum, the service needs to know where to look for the model file.

### 5. Model weights

Place your trained YOLOv8 `.pt` weights file in the `models/` folder:

```
ai-verification/
└── models/
    └── plastic-yolo-v1.2.pt   ← your trained model goes here
```

If you do not yet have a trained model, skip this step and run in stub mode (see below).

---

## Running the Service

### Development — stub mode (no model needed)

```bash
python app.py
```

The service starts on http://localhost:8001. It will print a warning that it is running in stub mode. All predictions will be REJECTED_INVALID_MATERIAL, but the service is fully functional for integration testing.

### Production — with trained model

```bash
MODEL_PATH=./models/plastic-yolo-v1.2.pt python app.py
```

Or set `MODEL_PATH` in your `.env` file and run `python app.py` normally.

---

## Testing the Endpoint

Once the service is running, verify it with a curl request:

```bash
curl -X POST http://localhost:8001/predict \
  -H "Content-Type: application/json" \
  -d '{
    "submission_id": "test-001",
    "image_url": "https://example.com/plastic.jpg",
    "center_id": 1,
    "latitude": -1.286,
    "longitude": 36.817,
    "timestamp": "2026-05-20T10:00:00Z"
  }'
```

Expected response shape (stub mode):
```json
{
  "submission_id": "test-001",
  "verification_result": "REJECTED_INVALID_MATERIAL",
  "primary_category": null,
  "detected_items_count": 0,
  "confidence_score": 0.12,
  "authenticity_verified": false,
  "fraud_flags": ["stub_mode"],
  "model_version": "stub"
}
```

---

## Training the Model (when dataset is ready)

The production model is fine-tuned from a pretrained YOLOv8 nano checkpoint on a labelled plastic waste dataset (Roboflow / TrashNet). To train:

```bash
# Make sure your virtual environment is active
# Prepare your dataset in YOLO format with a plastic.yaml config file
```

```python
from ultralytics import YOLO

# Load pretrained YOLOv8 nano weights
model = YOLO('yolov8n.pt')

# Fine-tune on the plastic waste dataset
model.train(
    data='dataset/plastic.yaml',
    epochs=50,
    imgsz=640,
    batch=16,
    name='plastic-yolo-v1.2'
)

# Export the best weights
# Saved automatically to runs/detect/plastic-yolo-v1.2/weights/best.pt
```

Copy `best.pt` to `models/plastic-yolo-v1.2.pt` and restart the service with `MODEL_PATH` set.

### Dataset sources

- Roboflow Universe: search "plastic waste detection" — several labelled datasets are available under open licences
- TrashNet: https://github.com/garythung/trashnet — 6 categories, 2527 images

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `app.py` | FastAPI application, `/predict` endpoint, service startup |
| `inference/predictor.py` | YOLOv8 model loading and inference |
| `inference/spoof_detector.py` | Blur detection (Laplacian) and moiré detection (FFT) |
| `inference/schema.py` | Pydantic v2 models: `VerificationRequest`, `VerificationResponse` |
| `models/` | Directory where `.pt` model weight files are placed |
| `requirements.txt` | Python package dependencies |

---

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `ModuleNotFoundError: torch` | PyTorch not installed | `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu` |
| `ModuleNotFoundError: ultralytics` | Ultralytics not installed | `pip install ultralytics` |
| `Address already in use` on port 8001 | Another process is using the port | `PORT=8003 python app.py` |
| `OSError: [Errno 99] Cannot assign requested address` | Binding issue on some Linux setups | `HOST=0.0.0.0 python app.py` |
| Service returns all rejections even with a model | Model path incorrect | Check `MODEL_PATH` points to an actual `.pt` file; check logs at startup for model loading errors |
| Very slow inference | Running on CPU with large model | Use `yolov8n.pt` (nano) for development; GPU needed for production speed |

---

## Shared Data Contract

The request and response shapes below are locked — do not rename fields without coordinating with the backend team.

**Backend → AI service (request):**
```json
{
  "submission_id": "uuid-string",
  "image_url": "https://...",
  "center_id": 3,
  "latitude": -1.286,
  "longitude": 36.817,
  "timestamp": "2026-05-20T10:00:00Z"
}
```

**AI service → backend (response):**
```json
{
  "submission_id": "uuid-string",
  "verification_result": "APPROVED",
  "primary_category": "PET",
  "detected_items_count": 12,
  "confidence_score": 0.942,
  "authenticity_verified": true,
  "fraud_flags": ["NONE"],
  "model_version": "plastic-yolo-v1.2"
}
```

For full API documentation see [docs/api-schema.md](../api-schema.md).
