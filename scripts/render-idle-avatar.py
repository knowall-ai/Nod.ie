#!/usr/bin/env python3
"""Offline renderer for the bundled portrait; run in the documented CPU-only container.

LivePortrait source: 9b294b3d0536135442ea73cb01e6cb3ca7029dd3.
Official weights: KlingTeam/LivePortrait, revision 82a4fa6735ca58432b6ce39301b4b9ee066dea47.
No camera, user images, face recognition, or persistent model service is involved.
"""
import sys,time,math,json
from pathlib import Path
sys.path.insert(0,'/liveportrait')
import cv2,numpy as np,torch
from src.config.inference_config import InferenceConfig
from src.live_portrait_wrapper import LivePortraitWrapper
from src.utils.camera import get_rotation_matrix
torch.set_num_threads(2)
use_gpu='--gpu' in sys.argv
if use_gpu: torch.cuda.set_per_process_memory_fraction(.12)
w=LivePortraitWrapper(InferenceConfig(flag_force_cpu=not use_gpu,flag_use_half_precision=use_gpu))
source=cv2.imread('/avatars/nodie-default.png');x,y,size=128,0,768
if source is None or source.shape[:2] != (1024,1024): raise RuntimeError('Expected the bundled 1024-pixel portrait')
crop=source[y:y+size,x:x+size,::-1].copy()
with torch.inference_mode():
 inp=w.prepare_source(cv2.resize(crop,(256,256),interpolation=cv2.INTER_AREA));info=w.get_kp_info(inp);features=w.extract_feature_3d(inp);kp=w.transform_keypoint(info)
 baseline=w.parse_output(w.warp_decode(features,kp,kp)['out'])[0].astype(np.float32)
 closed=w.retarget_eye(kp,torch.tensor([[.3,.3,0.]],device=w.device))
 opened=w.retarget_eye(kp,torch.tensor([[.3,.3,.3]],device=w.device))
 eye_mask=np.zeros((size,size),np.float32)
 for cx in [.365,.605]: cv2.ellipse(eye_mask,(int(size*cx),int(size*.44)),(int(size*.105),int(size*.055)),0,0,360,1,-1)
 eye_mask=cv2.GaussianBlur(eye_mask,(31,31),0)[...,None]
 baseline_large=cv2.resize(baseline,(size,size),interpolation=cv2.INTER_CUBIC)[:,:,::-1]
 eye_colour=cv2.GaussianBlur(source[y:y+size,x:x+size].astype(np.float32)-baseline_large,(0,0),8)
 mask=np.zeros((size,size),np.float32);cv2.ellipse(mask,(size//2,int(size*.48)),(int(size*.48),int(size*.48)),0,0,360,1,-1);mask=cv2.GaussianBlur(mask,(81,81),0)[...,None]
 output=Path('/output');output.mkdir(exist_ok=True)
 for stale_frame in output.glob('frame-*.png'):
  if stale_frame.is_file(): stale_frame.unlink()
 preview='--preview' in sys.argv or '--motion-preview' in sys.argv
 blink_only='--blink' in sys.argv
 gesture=next((name for name in ['tilt','left','right'] if '--'+name in sys.argv),None)
 duration=3 if gesture else 6
 frame_count=75 if gesture else 150
 # Render every output frame. Crossfading sparse poses ghosts eyes and hair.
 times=([0.,1.8,4.2] if '--motion-preview' in sys.argv else [0.,3.,6.]) if preview else np.linspace(0,duration,frame_count).tolist()
 # Remove the near-stationary apex samples so the small tilt does not dwell.
 if gesture=='tilt' and not preview: times=[t for i,t in enumerate(times) if not 36<=i<=40]
 count=len(times)
 started=time.monotonic()
 for i in range(count):
  t=times[i]
  blink=max(0,1-abs(t-2.25)/.18)+max(0,1-abs(t-4.7)/.18)
  if '--preview' in sys.argv: blink=i/(count-1)
  if blink_only and blink == 0:
   # A stationary open-eye frame is the original portrait, not a neural rerender.
   if not cv2.imwrite(str(output/f'frame-{i:04d}.png'),source): raise RuntimeError('Could not write neutral frame')
   continue
  amplitude=0 if blink_only else math.sin(math.pi*t/6)**2
  # Small but visible pose changes; the wider feathered mask includes the hair.
  rotation=get_rotation_matrix(info['pitch']+amplitude*1.2*math.sin(t*.7),info['yaw']+amplitude*4.0*math.sin(t),info['roll']+amplitude*1.8*math.sin(t*.8))
  if gesture:
   blink=0
   envelope=math.sin(math.pi*t/3)**2
   yaw=(-3.5 if gesture=='left' else 3.5 if gesture=='right' else 0)*envelope
   roll=(2.2 if gesture=='tilt' else 0)*envelope
   rotation=get_rotation_matrix(info['pitch'],info['yaw']+yaw,info['roll']+roll)
  target=info['scale'][...,None]*(info['kp']@rotation+info['exp']);target[:,:,:2]+=info['t'][:,None,:2]
  target+= (closed-opened)*min(1,blink)
  target=w.stitching(kp,target)
  rendered=w.parse_output(w.warp_decode(features,kp,target)['out'])[0].astype(np.float32)
  delta=cv2.resize(rendered-baseline,(size,size),interpolation=cv2.INTER_CUBIC)[:,:,::-1]
  frame=source.copy();frame[y:y+size,x:x+size]=np.clip(source[y:y+size,x:x+size].astype(np.float32)+delta*mask,0,255).astype(np.uint8)
  if blink>0:
   # Replace eye detail during closure: adding a residual retains the original iris.
   eyes=cv2.resize(rendered,(size,size),interpolation=cv2.INTER_CUBIC)[:,:,::-1]+eye_colour
   weight=eye_mask*min(1,blink*4)
   region=frame[y:y+size,x:x+size]
   frame[y:y+size,x:x+size]=np.clip(region*(1-weight)+eyes*weight,0,255).astype(np.uint8)
  if not preview and (i==0 or i==count-1): frame=source.copy()
  if not cv2.imwrite(str(output/f'frame-{i:04d}.png'),frame): raise RuntimeError('Could not write frame')
  if i%5==0: print('Rendered keyframe',i+1,'of',count,flush=True)
 print(json.dumps({'frames':count,'seconds':round(time.monotonic()-started,2),'gpu':use_gpu,'peak_mib':round(torch.cuda.max_memory_allocated()/1048576) if use_gpu else 0}),flush=True)
