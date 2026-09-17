#!/usr/bin/env python3
"""
Download MuseTalk models from Hugging Face
"""

import os
import requests
import gdown
from pathlib import Path

def download_file(url, dest_path):
    """Download a file from URL to destination path"""
    print(f"Downloading {dest_path}...")
    
    # Create directory if it doesn't exist
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    if 'drive.google.com' in url:
        # Use gdown for Google Drive
        gdown.download(url, dest_path, quiet=False)
    else:
        # Use requests for direct downloads
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        with open(dest_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
    
    print(f"Downloaded {dest_path}")

def main():
    """Download all required models"""
    
    # Create model directories
    os.makedirs("models/musetalkV15", exist_ok=True)
    os.makedirs("models/sd-vae", exist_ok=True)
    os.makedirs("models/dwpose", exist_ok=True)
    os.makedirs("models/face-parse-bisent", exist_ok=True)
    os.makedirs("models/sd-vae-ft-mse", exist_ok=True)
    
    # Model URLs from MuseTalk's download scripts
    models = [
        # MuseTalk main models
        ("https://drive.google.com/uc?id=1x9L1CKOl5RYyzszOYQQw8qT0G_yKQE1Z", "models/musetalkV15/musetalk.json"),
        ("https://drive.google.com/uc?id=15M8iNmqAiJK_JQCxvPJOzjomBJmY0Y8I", "models/musetalkV15/net_g.pth"),
        ("https://drive.google.com/uc?id=1VqnIGkKnEZXQ1x-RvUImKkGIeYGx_IlH", "models/musetalkV15/unet.pth"),
        
        # VAE models
        ("https://huggingface.co/stabilityai/sd-vae-ft-mse/resolve/main/config.json", "models/sd-vae-ft-mse/config.json"),
        ("https://huggingface.co/stabilityai/sd-vae-ft-mse/resolve/main/diffusion_pytorch_model.bin", "models/sd-vae-ft-mse/diffusion_pytorch_model.bin"),
        ("https://huggingface.co/stabilityai/sd-vae-ft-mse/resolve/main/diffusion_pytorch_model.safetensors", "models/sd-vae-ft-mse/diffusion_pytorch_model.safetensors"),
        
        # DWPose model
        ("https://drive.google.com/uc?id=1a-eOEJn0CUBxf7m1lFaED2l2LiR8kgFz", "models/dwpose/dw-ll_ucoco_384.onnx"),
        
        # Face parsing model
        ("https://drive.google.com/uc?id=14OqBFQJlUajqGK3mz2j4DxORgJpQMvek", "models/face-parse-bisent/79999_iter.pth"),
        ("https://drive.google.com/uc?id=1hQEhm_YfrGXFMlkTZ7MUqwB6K17VnwoX", "models/face-parse-bisent/resnet18-5c106cde.pth"),
    ]
    
    # Download each model
    for url, dest in models:
        dest_path = Path(dest)
        if not dest_path.exists():
            try:
                download_file(url, str(dest_path))
            except Exception as e:
                print(f"Warning: Failed to download {dest}: {e}")
                print("Model will be downloaded on first use if needed")
        else:
            print(f"Model already exists: {dest}")
    
    print("Model download complete!")

if __name__ == "__main__":
    main()