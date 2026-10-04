/** Align words and diarization from the same recording. Never infer identities from faces. */
const normalize=text=>text.trim().replace(/\s+/gu,' ').toLocaleLowerCase('en');
const unavailable=reason=>({state:'unavailable',reason,words:[]});
function attributeLocalWords(transcription,observation){
 if(!Array.isArray(transcription?.words)||!transcription.words.length)return unavailable('missing-timestamps');
 if(transcription.words.length>100||typeof transcription.text!=='string'||transcription.text.length>2000)return unavailable('invalid-timestamps');
 const duration=transcription.duration;
 if(!Number.isFinite(duration)||duration<=0||duration>30.05)return unavailable('invalid-timestamps');
 const words=[];let previousEnd=0;
 for(const word of transcription.words){
  if(!word||typeof word.word!=='string'||!word.word.trim()||word.word.length>200||!Number.isFinite(word.start)||!Number.isFinite(word.end)||word.start<0||word.end<=word.start||word.end-word.start>3||word.end>duration+.05||word.start<previousEnd-.001||(word.probability!==undefined&&(!Number.isFinite(word.probability)||word.probability<0||word.probability>1)))return unavailable('invalid-timestamps');
  previousEnd=word.end;words.push({text:word.word.trim(),start:word.start,end:word.end,probability:word.probability});
 }
 if(normalize(words.map(w=>w.text).join(' '))!==normalize(transcription.text))return unavailable('inconsistent-transcript');
 const ready=observation?.state==='ready'&&Number.isFinite(observation.duration)&&Math.abs(observation.duration-duration)<=.1&&Array.isArray(observation.speakers)&&observation.speakers.length<=8&&Array.isArray(observation.segments)&&observation.segments.length<=64;
 const segments=ready?observation.segments:[];
 const valid=ready&&segments.every(s=>s&&Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end>s.start&&s.end<=observation.duration+.05&&observation.speakers.some(p=>p.speaker===s.speaker));
 const attributed=words.map(word=>{
  let profile=null,name=null,reason=valid?'uncovered':'no-observation';
  const spans=valid?segments.filter(s=>Math.max(s.start,word.start-.05)<Math.min(s.end,word.end+.05)).map(s=>({...s,identity:observation.speakers.find(p=>p.speaker===s.speaker)})):[];
  const eligible=p=>p&&!p.uncertain&&typeof p.id==='string'&&p.id.length>0&&p.id.length<=40&&(p.name===null||p.name===undefined||(typeof p.name==='string'&&p.name.length<=80));
  const ids=new Set(spans.filter(s=>eligible(s.identity)).map(s=>s.identity.id));
  if(word.probability!==undefined&&word.probability<.5)reason='uncertain-transcription';
  else if(spans.some(s=>!eligible(s.identity)))reason='uncertain';
  else if(ids.size>1){
   reason=spans.some((a,i)=>spans.slice(i+1).some(b=>a.identity.id!==b.identity.id&&Math.max(a.start,b.start,word.start)<Math.min(a.end,b.end,word.end)))?'overlap':'speaker-change';
  }else if(ids.size===1){
   let covered=word.start-.05;
   for(const span of spans.sort((a,b)=>a.start-b.start||a.end-b.end)){if(span.start>covered+.001)break;covered=Math.max(covered,span.end);}
   if(covered>=word.end+.05){profile=spans[0].identity.id;name=spans[0].identity.name||null;reason='matched';}
  }
  return {text:word.text,start:word.start,end:word.end,name,profile,attribution:profile?'possible-match':'unattributed',reason};
 });
 return {state:'timed',words:attributed};
}
module.exports={attributeLocalWords};
