const test=require('node:test'),assert=require('node:assert/strict');
const {attributeLocalWords}=require('../../lib/local-speaker-attribution');
const transcription=()=>({text:'Hello there friend',duration:4,words:[{word:' Hello',start:.2,end:.6,probability:.98},{word:' there',start:1.9,end:2.1,probability:.9},{word:' friend',start:2.3,end:2.7,probability:.9}]});
const observation=()=>({state:'ready',duration:4,speakers:[{speaker:0,id:'a',name:'Robin'},{speaker:1,id:'b',name:'Taylor'}],segments:[{speaker:0,start:0,end:2},{speaker:1,start:2,end:4}]});
test('matches individual words and leaves a word crossing speaker changes unattributed',()=>{
 const result=attributeLocalWords(transcription(),observation());assert.equal(result.state,'timed');
 assert.deepEqual(result.words.map(w=>[w.profile,w.reason]),[['a','matched'],[null,'speaker-change'],['b','matched']]);
});
test('overlap, gaps and ambiguous voices never inherit a neighbouring name',()=>{
 for(const [reason,change] of [['overlap',o=>o.segments.push({speaker:1,start:.3,end:.5})],['uncovered',o=>o.segments[0].start=.25],['uncertain',o=>o.speakers[0].uncertain=true]]){
  const o=observation();change(o);const w=attributeLocalWords(transcription(),o).words[0];assert.equal(w.reason,reason);assert.equal(w.name,null);assert.equal(w.profile,null);
 }
});
test('adjacent same-voice intervals combine without treating duplicate segments as overlap',()=>{
 const o=observation();o.segments=[{speaker:0,start:0,end:.4},{speaker:0,start:.4,end:2},{speaker:0,start:0,end:2}];
 assert.equal(attributeLocalWords(transcription(),o).words[0].profile,'a');
});
test('low-confidence text remains uncertain even when its voice could match',()=>{
 const t=transcription();t.words[0].probability=.2;const word=attributeLocalWords(t,observation()).words[0];assert.equal(word.reason,'uncertain-transcription');assert.equal(word.profile,null);
});
test('missing, malformed and mismatched timings cannot produce identities',()=>{
 assert.equal(attributeLocalWords({text:'Hello'},observation()).reason,'missing-timestamps');
 for(const change of [t=>t.words[0].start=NaN,t=>t.words[0].end=Infinity,t=>t.words[0].end=0,t=>t.duration=31,t=>t.words[1].start=.3,t=>t.words[0].probability=2,t=>t.words=Array(101).fill(t.words[0])]){
  const t=transcription();change(t);assert.equal(attributeLocalWords(t,observation()).reason,'invalid-timestamps');
 }
 const t=transcription();t.words[0].word='Someone else';assert.equal(attributeLocalWords(t,observation()).reason,'inconsistent-transcript');
});
test('missing or different-duration diarization keeps valid word times without matching',()=>{
 for(const o of [null,{state:'unavailable'}, {...observation(),duration:3},{...observation(),segments:[{speaker:99,start:0,end:4}]}]){
  const result=attributeLocalWords(transcription(),o);assert.equal(result.state,'timed');assert.ok(result.words.every(w=>w.reason==='no-observation'&&w.profile===null));
 }
});
test('clip edge words without the timing margin remain unattributed',()=>{
 const t={text:'edge',duration:4,words:[{word:'edge',start:0,end:.4}]};assert.equal(attributeLocalWords(t,observation()).words[0].reason,'uncovered');
});
