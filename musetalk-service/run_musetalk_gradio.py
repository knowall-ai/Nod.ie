#!/usr/bin/env python3
"""
Run MuseTalk's Gradio interface locally
This provides a web UI we can integrate with
"""

import subprocess
import sys
import os

# Change to MuseTalk directory
musetalk_dir = os.path.join(os.path.dirname(__file__), '..', 'musetalk-repo')
os.chdir(musetalk_dir)

# Run MuseTalk's app.py
subprocess.run([sys.executable, 'app.py', '--server_port', '7860'])