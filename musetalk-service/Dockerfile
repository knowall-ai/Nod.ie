FROM python:3.9-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    ffmpeg \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
RUN pip install --no-cache-dir \
    torch==2.0.1 \
    torchvision==0.15.2 \
    torchaudio==2.0.2 \
    --index-url https://download.pytorch.org/whl/cpu

# Clone MuseTalk repository
RUN git clone https://github.com/TMElyralab/MuseTalk.git /app/MuseTalk

# Install MuseTalk requirements
WORKDIR /app/MuseTalk
RUN pip install --no-cache-dir -r requirements.txt

# Install API dependencies
RUN pip install --no-cache-dir \
    fastapi==0.104.1 \
    uvicorn==0.24.0 \
    websockets==12.0 \
    python-multipart==0.0.6 \
    aiofiles==23.2.1 \
    numpy==1.24.3 \
    opencv-python==4.8.1.78 \
    Pillow==10.1.0

# Copy API wrapper
WORKDIR /app
COPY musetalk_api.py .
COPY utils.py .

# Download models (this will be done on first run if not present)
# RUN python -c "from MuseTalk import download_models; download_models()"

# Expose port
EXPOSE 8765

# Run the API
CMD ["uvicorn", "musetalk_api:app", "--host", "0.0.0.0", "--port", "8765", "--reload"]