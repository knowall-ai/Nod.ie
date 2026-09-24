/** One long-lived CPU worker. Cancellation/timeout kills it; next frame restarts. */
const {spawn}=require('node:child_process');
const path=require('node:path');
class FaceWorker {
 constructor({spawnImpl=spawn,timeoutMs=3000}={}){this.spawn=spawnImpl;this.timeoutMs=timeoutMs;}
 close(){const child=this.child;this.child=null;this.pending?.reject(Error('Face analysis cancelled'));this.pending=null;child?.kill('SIGKILL');}
 start(){
  const root=path.resolve(__dirname,'..');
  const child=this.child=this.spawn(path.join(root,'.venv-face/bin/python'),[path.join(root,'recognition/face_frame.py'),'--stream'],{stdio:['pipe','pipe','ignore'],env:{...process.env,OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1'}});
  let output='';
  child.stdout.on('data',chunk=>{
   if(this.child!==child)return;output+=chunk.toString();if(output.length>64000){this.close();return;}
   const end=output.indexOf('\n');if(end<0)return;
   const line=output.slice(0,end);output=output.slice(end+1);
   const pending=this.pending;this.pending=null;
   try{const result=JSON.parse(line);if(result.error)throw Error('Face analysis unavailable');pending?.resolve(result);}catch{pending?.reject(Error('Invalid face response'));}
  });
  const failed=()=>{if(this.child===child)this.close();};child.on('error',failed);child.on('close',failed);child.stdin.on('error',failed);
 }
 analyse(image,signal){
  if(signal?.aborted)return Promise.reject(Error('Face analysis cancelled'));
  if(this.pending)return Promise.reject(Error('Face analysis busy'));
  if(!this.child)this.start();
  return new Promise((resolve,reject)=>{
   const abort=()=>this.close(),timer=setTimeout(abort,this.timeoutMs);
   const done=callback=>value=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);callback(value);};
   this.pending={resolve:done(resolve),reject:done(reject)};
   signal?.addEventListener('abort',abort,{once:true});
   this.child.stdin.write(Buffer.from(image).toString('base64')+'\n');
  });
 }
}
module.exports={FaceWorker};
