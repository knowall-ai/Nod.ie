/** Publish fixed read-only node metrics; never give the voice container Docker access. */
const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');const {nodeSnapshot}=require('./node-snapshot');
class NodeStatusPublisher {
 constructor(file,{snapshot=nodeSnapshot,intervalMs=30000}={}){Object.assign(this,{file,snapshot,intervalMs});}
 async refresh(){if(this.pending)return this.pending;this.pending=(async()=>{const data=await this.snapshot();if(data.lightning)delete data.lightning.channels;const content=JSON.stringify(data);if(Buffer.byteLength(content)>16000)throw Error('Oversized node snapshot');await fs.mkdir(path.dirname(this.file),{recursive:true,mode:0o700});const temp=this.file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(temp,content,{mode:0o600,flag:'wx'});await fs.rename(temp,this.file);}finally{await fs.unlink(temp).catch(()=>{});}})();try{await this.pending;}finally{this.pending=null;}}
 start(){void this.refresh().catch(()=>{});this.timer=setInterval(()=>void this.refresh().catch(()=>{}),this.intervalMs);this.timer.unref();}
 stop(){clearInterval(this.timer);}
}
module.exports={NodeStatusPublisher};
