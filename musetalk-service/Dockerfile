FROM pytorch/pytorch:2.0.1-cuda11.7-cudnn8-runtime

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clone MuseTalk repository
RUN git clone https://github.com/TMElyralab/MuseTalk.git /app/musetalk-src

# Install Python dependencies
RUN pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn==0.24.0 \
    websockets==12.0 \
    python-multipart==0.0.6 \
    aiofiles==23.2.1 \
    numpy==1.23.5 \
    opencv-python==4.9.0.80 \
    Pillow==10.1.0 \
    diffusers==0.30.2 \
    accelerate==0.28.0 \
    tensorflow==2.12.0 \
    tensorboard==2.12.0 \
    soundfile==0.12.1 \
    transformers==4.39.2 \
    huggingface_hub==0.30.2 \
    librosa==0.11.0 \
    einops==0.8.1 \
    gradio==5.24.0 \
    omegaconf \
    ffmpeg-python \
    moviepy \
    gdown \
    requests \
    imageio[ffmpeg]

# Install MMPose and related packages
RUN pip install --no-cache-dir -U openmim && \
    mim install mmengine && \
    mim install "mmcv>=2.0.1" && \
    mim install "mmdet>=3.1.0" && \
    mim install "mmpose>=1.1.0"

# Copy MuseTalk source into our working directory
RUN cp -r /app/musetalk-src/musetalk /app/musetalk

# Create models directory
RUN mkdir -p /app/models

# Copy our API files
COPY musetalk_api.py .
COPY utils.py .
COPY download_models.py .

# Download models on build
RUN python download_models.py

# Expose port
EXPOSE 8765

# Run the API
CMD ["uvicorn", "musetalk_api:app", "--host", "0.0.0.0", "--port", "8765", "--reload"]