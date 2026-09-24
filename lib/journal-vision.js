/** Low-rate structured observation; never substitutes for the conversation image. */
class JournalVision {
 constructor({vision,journal,publish=()=>{},now=()=>Date.now()}){Object.assign(this,{vision,journal,publish,now});this.presence=new(require('./event-journal').PresenceEvents)(journal,{now});this.last=-Infinity;this.generation=0;}
 cancel(reset=false){++this.generation;this.vision.cancel();if(reset)this.presence.reset();}
 async analyse(image){if(this.busy||this.now()-this.last<15000)return;this.busy=true;this.last=this.now();const generation=this.generation;try{const epoch=(await this.journal.load()).epoch;if(generation!==this.generation)return;this.publish('Vision','Analysing selected frame');const result=await this.vision.observe(image);if(generation!==this.generation)return;this.publish('Vision',result.status==='ready'?result.subjects.join('; ')||'No person or cat detected':result.status);if(result.status!=='ready')return;await this.presence.observe(result.subjects,epoch);}finally{this.busy=false;}}
}
module.exports={JournalVision};
