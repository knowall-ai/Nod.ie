/** Explicit bounded media samples reuse already-enabled device streams. */
class CalibrationCapture {
 constructor(renderer,api,{Recorder=globalThis.MediaRecorder,doc=document,durationMs=4000}={}){Object.assign(this,{renderer,api,Recorder,doc,durationMs});}
 start(){this.unsubscribe=this.api.onCalibrationCapture(r=>void this.capture(r));this.unsubscribeCancel=this.api.onCalibrationCancelled(()=>this.cancel());}
 cancel(){this.pending?.controller.abort();this.pending?.release?.();this.pending=null;this.active=false;}
 stop(){this.cancel();this.unsubscribe?.();this.unsubscribeCancel?.();}
 async face(signal){
  const source=this.renderer.controls?.cameraSource,video=source?.video,generation=source?.generation;
  if(!source?.active||!video||video.readyState<2)throw Error('camera-off');
  const canvas=this.doc.createElement('canvas'),scale=Math.min(1,768/video.videoWidth,576/video.videoHeight);
  try{
   if(!Number.isFinite(scale)||scale<=0)throw Error('capture-unavailable');
   canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
   const blob=await new Promise((resolve,reject)=>{const abort=()=>reject(Error('device-changed'));signal.addEventListener('abort',abort,{once:true});canvas.toBlob(blob=>{signal.removeEventListener('abort',abort);resolve(blob);},'image/jpeg',.85);});
   signal.throwIfAborted();if(!source.active||source.video!==video||source.generation!==generation)throw Error('device-changed');
   if(!blob||blob.size>512000)throw Error('capture-unavailable');return new Uint8Array(await blob.arrayBuffer());
  }finally{canvas.width=canvas.height=0;}
 }
 async voice(guard){
  const r=this.renderer,capture=r.state.audioCapture,local=r.localVoice,stream=capture?.stream||local?.stream;
  if(r.state.isMuted||!stream?.getAudioTracks().some(t=>t.readyState==='live'))throw Error('microphone-off');
  if(r.isAssistantSpeaking||r.streamingLips?.sources.size)throw Error('assistant-speaking');
  const normal=local?.recorder,localGeneration=local?.generation,paused=capture?.isPaused;
  if(capture)capture.pause();
  else if(normal?.state==='recording'){normal.pause();clearInterval(local.endpointTimer);local.endpointTimer=null;}
  let released=false;
  guard.release=()=>{if(released)return;released=true;if(capture&&!paused&&r.state.audioCapture===capture&&capture.isCapturing&&!r.state.isMuted)capture.resume();if(!capture&&local?.generation===localGeneration&&local.recorder===normal&&normal?.state==='paused'&&local.state==='recording'&&!r.state.isMuted){normal.resume();local.startEndpointDetection(localGeneration);}};
  try{
   const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus'].find(type=>this.Recorder.isTypeSupported(type));if(!mime)throw Error('capture-unavailable');
   return await new Promise((resolve,reject)=>{
    const recorder=new this.Recorder(stream,{mimeType:mime,audioBitsPerSecond:32000}),chunks=[];let bytes=0,timer,watch,settled=false;
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);clearInterval(watch);guard.controller.signal.removeEventListener('abort',abort);recorder.ondataavailable=null;recorder.onstop=null;recorder.onerror=null;if(recorder.state!=='inactive'){try{recorder.stop();}catch{error=Error('capture-unavailable');}}if(error)reject(error);else resolve(new Blob(chunks,{type:mime}));};
    const abort=()=>finish(Error('device-changed'));guard.controller.signal.addEventListener('abort',abort,{once:true});
    recorder.ondataavailable=e=>{bytes+=e.data.size;if(bytes>256000)finish(Error('capture-unavailable'));else if(e.data.size)chunks.push(e.data);};
    recorder.onerror=()=>finish(Error('capture-unavailable'));recorder.onstop=()=>finish();
    try{recorder.start(250);}catch{finish(Error('capture-unavailable'));return;}timer=setTimeout(()=>recorder.stop(),this.durationMs);
    watch=setInterval(()=>{if(r.state.isMuted||!stream.getAudioTracks().some(t=>t.readyState==='live')||(capture?r.state.audioCapture!==capture:local?.stream!==stream))finish(Error('device-changed'));else if(r.isAssistantSpeaking||r.streamingLips?.sources.size)finish(Error('assistant-speaking'));},100);
   }).then(async blob=>{guard.controller.signal.throwIfAborted();if(r.isAssistantSpeaking||r.streamingLips?.sources.size)throw Error('assistant-speaking');return new Uint8Array(await blob.arrayBuffer());});
  }finally{guard.release();}
 }
 async capture(request){
  this.cancel();if(!request?.token||!['face','voice'].includes(request.kind))return;
  const guard=this.pending={controller:new AbortController()};this.active=true;
  let timer;
  try{
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{guard.controller.abort();reject(Error('capture-unavailable'));},10000);});
   const body=await Promise.race([request.kind==='face'?this.face(guard.controller.signal):this.voice(guard),timeout]);
   guard.controller.signal.throwIfAborted();if(this.pending!==guard)return;
   await Promise.race([this.api.submitCalibration(request.token,body),timeout]);
  }catch(e){if(this.pending===guard)void this.api.calibrationFailure(request.token,e.message).catch(()=>{});}
  finally{clearTimeout(timer);guard.release?.();if(this.pending===guard){this.pending=null;this.active=false;}}
 }
}
if(typeof module!=='undefined')module.exports={CalibrationCapture};
if(typeof window!=='undefined')window.addEventListener('DOMContentLoaded',()=>{if(window.NodieRenderer&&window.nodie?.onCalibrationCapture){const c=window.NodieRenderer.calibration=new CalibrationCapture(window.NodieRenderer,window.nodie);c.start();window.addEventListener('pagehide',()=>c.stop(),{once:true});}});
