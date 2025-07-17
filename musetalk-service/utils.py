"""
Utility functions for MuseTalk API
"""

import numpy as np
import cv2
from typing import Tuple, Optional
import logging

logger = logging.getLogger(__name__)

def create_circular_mask(size: int) -> np.ndarray:
    """Create a circular mask for avatar display"""
    mask = np.zeros((size, size), dtype=np.uint8)
    center = size // 2
    cv2.circle(mask, (center, center), center, 255, -1)
    return mask

def apply_circular_mask(image: np.ndarray, mask: Optional[np.ndarray] = None) -> np.ndarray:
    """Apply circular mask to image with transparency"""
    if mask is None:
        size = min(image.shape[:2])
        mask = create_circular_mask(size)
    
    # Ensure image has alpha channel
    if image.shape[2] == 3:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
    
    # Apply mask to alpha channel
    image[:, :, 3] = mask
    
    return image

def resize_maintain_aspect(image: np.ndarray, target_size: Tuple[int, int]) -> np.ndarray:
    """Resize image maintaining aspect ratio"""
    h, w = image.shape[:2]
    target_w, target_h = target_size
    
    # Calculate scaling factor
    scale = min(target_w / w, target_h / h)
    new_w = int(w * scale)
    new_h = int(h * scale)
    
    # Resize image
    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
    
    # Create canvas and center image
    canvas = np.zeros((target_h, target_w, image.shape[2]), dtype=image.dtype)
    y_offset = (target_h - new_h) // 2
    x_offset = (target_w - new_w) // 2
    canvas[y_offset:y_offset + new_h, x_offset:x_offset + new_w] = resized
    
    return canvas

def extract_face_region(image: np.ndarray, face_size: int = 256) -> Tuple[np.ndarray, Tuple[int, int]]:
    """Extract face region for MuseTalk processing"""
    # TODO: Implement actual face detection
    # For now, assume face is centered
    h, w = image.shape[:2]
    center_x, center_y = w // 2, h // 2
    
    # Extract region
    half_size = face_size // 2
    y1 = max(0, center_y - half_size)
    y2 = min(h, center_y + half_size)
    x1 = max(0, center_x - half_size)
    x2 = min(w, center_x + half_size)
    
    face_region = image[y1:y2, x1:x2]
    
    # Resize to exact size if needed
    if face_region.shape[:2] != (face_size, face_size):
        face_region = cv2.resize(face_region, (face_size, face_size))
    
    return face_region, (center_x, center_y)

def merge_face_region(original: np.ndarray, face: np.ndarray, center: Tuple[int, int]) -> np.ndarray:
    """Merge processed face region back into original image"""
    result = original.copy()
    face_h, face_w = face.shape[:2]
    center_x, center_y = center
    
    # Calculate merge boundaries
    half_h = face_h // 2
    half_w = face_w // 2
    
    y1 = max(0, center_y - half_h)
    y2 = min(original.shape[0], center_y + half_h)
    x1 = max(0, center_x - half_w)
    x2 = min(original.shape[1], center_x + half_w)
    
    # Adjust face region if needed
    face_y1 = 0 if center_y >= half_h else half_h - center_y
    face_y2 = face_h if center_y + half_h <= original.shape[0] else face_h - (center_y + half_h - original.shape[0])
    face_x1 = 0 if center_x >= half_w else half_w - center_x
    face_x2 = face_w if center_x + half_w <= original.shape[1] else face_w - (center_x + half_w - original.shape[1])
    
    # Merge
    result[y1:y2, x1:x2] = face[face_y1:face_y2, face_x1:face_x2]
    
    return result

class FrameBuffer:
    """Ring buffer for video frames with timestamp synchronization"""
    
    def __init__(self, max_size: int = 30):
        self.max_size = max_size
        self.frames = {}
        self.timestamps = []
    
    def add_frame(self, timestamp: float, frame: np.ndarray):
        """Add frame to buffer"""
        self.frames[timestamp] = frame
        self.timestamps.append(timestamp)
        self.timestamps.sort()
        
        # Remove old frames
        while len(self.timestamps) > self.max_size:
            old_ts = self.timestamps.pop(0)
            del self.frames[old_ts]
    
    def get_frame(self, timestamp: float, tolerance: float = 0.05) -> Optional[np.ndarray]:
        """Get frame closest to timestamp within tolerance"""
        if not self.timestamps:
            return None
        
        # Find closest timestamp
        closest_ts = min(self.timestamps, key=lambda t: abs(t - timestamp))
        
        if abs(closest_ts - timestamp) <= tolerance:
            return self.frames[closest_ts]
        
        return None
    
    def clear(self):
        """Clear buffer"""
        self.frames.clear()
        self.timestamps.clear()
    
    def __len__(self):
        return len(self.frames)