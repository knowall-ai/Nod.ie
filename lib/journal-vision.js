/** Low-rate structured observation; never substitutes for the conversation image. */
class JournalVision {
 constructor({vision,journal,publish=()=>{},now=()=>Date.now(),onScene=()=>{}}){Object.assign(this,{vision,journal,publish,now,onScene});this.presence=new(require('./event-journal').PresenceEvents)(journal,{now});this.last=-Infinity;this.generation=0;this.quietUntil=0;}
 cancel(reset=false){this.quietUntil=this.now()+5000;++this.generation;this.vision.cancel();if(reset)this.presence.reset();}
 async analyse(image,capturedAt){if(this.now()<this.quietUntil||this.busy||this.now()-this.last<15000)return;this.busy=true;this.last=this.now();const generation=this.generation;try{const state=await this.journal.load();if(!state.enabled)return;const epoch=state.epoch;if(generation!==this.generation)return;this.publish('Vision','Analysing selected frame');const result=await this.vision.observe(image);if(generation!==this.generation)return;this.publish('Vision',result.status==='ready'?result.subjects.join('; ')||'No person or animal detected':result.status);if(result.status!=='ready')return;await this.presence.observe(result.subjects,epoch);if(generation===this.generation && result.scene)return this.onScene(result.scene,capturedAt);}finally{this.busy=false;}}
}
module.exports={JournalVision};
