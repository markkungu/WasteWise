FROM python:3.11-slim
WORKDIR /app

# OpenCV system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxext6 libxrender-dev libgomp1 wget libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps (CPU-only torch to avoid the 900 MB CUDA wheel)
COPY requirements-docker.txt ./
RUN pip install --no-cache-dir \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    -r requirements-docker.txt

COPY . .
RUN mkdir -p models dataset

EXPOSE 8001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
