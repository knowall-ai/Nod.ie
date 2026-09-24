/** Observation recording must never make recognition fail or wait for storage. */
class JournalRecorder {
 constructor(journal,publish=()=>{}){this.journal=journal;this.publish=publish;}
 failed(){this.publish('Journal','Could not save observation');}
 async capture(operation,events){
  const epoch=this.journal.load().then(d=>d.epoch).catch(()=>null);
  const result=await operation();
  void epoch.then(async value=>{if(!value){this.failed();return;}for(const event of events(result))await this.journal.append(event,value);}).catch(()=>this.failed());
  return result;
 }
 record(event){void this.journal.append(event).catch(()=>this.failed());}
}
module.exports={JournalRecorder};
