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
use_gpu=False
w=LivePortraitWrapper(InferenceConfig(flag_force_cpu=not use_gpu,flag_use_half_precision=use_gpu))
source=cv2.resize(cv2.imread('/avatars/nodie-default.png'),(512,512));x,y,size=64,0,384
crop=source[y:y+size,x:x+size,::-1].copy()
with torch.inference_mode():
 inp=w.prepare_source(crop);info=w.get_kp_info(inp);features=w.extract_feature_3d(inp);kp=w.transform_keypoint(info)
 baseline=w.parse_output(w.warp_decode(features,kp,kp)['out'])[0].astype(np.float32)
 closed=w.retarget_eye(kp,torch.tensor([[.3,.3,0.]],device=w.device))
 opened=w.retarget_eye(kp,torch.tensor([[.3,.3,.3]],device=w.device))
 mask=np.zeros((size,size),np.float32);cv2.ellipse(mask,(size//2,int(size*.48)),(int(size*.39),int(size*.45)),0,0,360,1,-1);mask=cv2.GaussianBlur(mask,(41,41),0)[...,None]
 output=Path('/output');output.mkdir(exist_ok=True)
 preview='--preview' in sys.argv
 times=[0.,3.,6.] if preview else sorted(set([round(i*.3,2) for i in range(21)]+[round(c+d,2) for c in [2.25,4.7] for d in [-.18,-.09,0,.09,.18]]))
 count=len(times)
 keys=[]
 started=time.monotonic()
 for i in range(count):
  t=times[i]
  blink=max(0,1-abs(t-2.25)/.18)+max(0,1-abs(t-4.7)/.18)
  if '--preview' in sys.argv: blink=i/(count-1)
  amplitude=math.sin(math.pi*t/6)**2
  rotation=get_rotation_matrix(info['pitch'],info['yaw']+amplitude*.35*math.sin(t),info['roll']+amplitude*.2*math.sin(t*.8))
  target=info['scale'][...,None]*(info['kp']@rotation+info['exp']);target[:,:,:2]+=info['t'][:,None,:2]
  target+= (closed-opened)*min(1,blink)
  target=w.stitching(kp,target)
  rendered=w.parse_output(w.warp_decode(features,kp,target)['out'])[0].astype(np.float32)
  delta=cv2.resize(rendered-baseline,(size,size))[:,:,::-1]
  frame=source.copy();frame[y:y+size,x:x+size]=np.clip(source[y:y+size,x:x+size].astype(np.float32)+delta*mask,0,255).astype(np.uint8)
  if not '--preview' in sys.argv and (i==0 or i==count-1): frame=source.copy()
  keys.append(frame)
  if preview and not cv2.imwrite(str(output/f'frame-{i:04d}.png'),frame): raise RuntimeError('Could not write preview frame')
  if i%5==0: print('Rendered keyframe',i+1,'of',count,flush=True)
 print(json.dumps({'frames':count,'seconds':round(time.monotonic()-started,2),'gpu':use_gpu,'peak_mib':round(torch.cuda.max_memory_allocated()/1048576) if use_gpu else 0}),flush=True)

 if not preview:
  for i in range(150):
   t=i*6/149
   right=min(np.searchsorted(times,t,side='right'),count-1);left=max(0,right-1)
   ratio=(t-times[left])/(times[right]-times[left]) if right!=left else 0
   frame=cv2.addWeighted(keys[left],1-ratio,keys[right],ratio,0)
   if not cv2.imwrite(str(output/f'frame-{i:04d}.png'),frame): raise RuntimeError('Could not write frame')
