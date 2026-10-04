const {test}=require('node:test');const assert=require('node:assert/strict');
const {RecognitionNames}=require('../../lib/recognition-names');const {LiveSpeakers}=require('../../lib/live-speakers');
function fixture(){let now=Date.now(),saved=[];const observation={state:'ready',receivedAt:now,epoch:'epoch',interval:{start:0,end:4},speakers:[{speaker:0,id:'original',name:null}],segments:[{speaker:0,start:0,end:4}]};const live=new LiveSpeakers({});live.observations=[observation];const voices={forInterval:(s,e)=>live.forInterval(s,e),store:{nameObserved:async(o,id,name)=>{saved.push({o,id,name});return true;}}};const names=new RecognitionNames({voices,faces:{},now:()=>now,classify:async()=>({kind:'voice',name:'Élodie'})});return {names,live,observation,saved,advance:()=>now+=61000};}
const turn={text:'Je m’appelle Élodie',start:1,end:2};
test('explicit confirmation labels the introduction speaker even after a later voice window',async()=>{const f=fixture();const proposal=await f.names.propose(turn);assert.equal(proposal.status,'pending');assert.equal(f.saved.length,0);f.live.observations=[{...f.observation,interval:{start:4,end:8},speakers:[{id:'another',speaker:0}]}];await f.names.confirm(proposal.token,true);assert.equal(f.saved[0].id,'original');assert.equal(f.saved[0].name,'Élodie');});
test('later windows cannot supply a candidate for old introduction words',async()=>{const f=fixture();f.live.observations=[{...f.observation,interval:{start:4,end:8}}];assert.equal((await f.names.propose(turn)).status,'awaiting-observation');assert.equal(f.saved.length,0);});
test('cross-speaker and uncovered intervals do not create proposals',async()=>{const f=fixture();f.observation.speakers.push({speaker:1,id:'other'});assert.equal((await f.names.propose(turn)).status,'awaiting-observation');f.observation.speakers.pop();assert.equal((await f.names.propose({...turn,end:5})).status,'awaiting-observation');});
test('cancel, expiry, wrong tokens and model non-introductions cannot save',async()=>{for(const mode of ['cancel','expire','wrong','none']){const f=fixture();if(mode==='none')f.names.classify=async()=>({kind:'none',name:''});const p=await f.names.propose(turn);if(mode==='expire')f.advance();if(mode==='cancel')f.names.cancel();await f.names.confirm(mode==='wrong'?'wrong':p.token,true);assert.equal(f.saved.length,0);}});
test('cancellation during model inference cannot resurrect a proposal',async()=>{const f=fixture();let finish;f.names.classify=()=>new Promise(r=>finish=r);const p=f.names.propose(turn);f.names.cancel();finish({kind:'voice',name:'Example'});assert.equal((await p).status,'not-saved');});
test('face proposals fail if the visible candidate changed before confirmation',async()=>{const f=fixture();f.names.faces={lastObservation:{receivedAt:Date.now(),faces:[{id:'face-a',name:null,uncertain:false}]},store:{nameObserved:()=>assert.fail('must not label replacement')}};f.names.classify=async()=>({kind:'face',name:'Example'});const p=await f.names.propose(turn);f.names.faces.lastObservation.faces=[{id:'face-b'}];assert.equal((await f.names.confirm(p.token,true)).status,'not-saved');});
test('local voice naming also requires confirmation and invalidated stores remain unsaved',async()=>{const f=fixture();const p=await f.names.proposeLocal(f.observation,turn.text);assert.equal(p.status,'pending');assert.equal(f.saved.length,0);f.names.voices.store.nameObserved=async()=>false;assert.equal((await f.names.confirm(p.token,true)).status,'not-saved');});
test('unanswered expired proposals never block a later introduction',async()=>{const f=fixture();await f.names.proposeLocal(f.observation,turn.text);f.advance();assert.equal((await f.names.proposeLocal(f.observation,turn.text)).status,'pending');});

test('a visible unknown face cannot prevent a late voice introduction retry',async()=>{const f=fixture();f.live.observations=[];f.names.faces.lastObservation={receivedAt:Date.now(),faces:[{id:'face',name:null,uncertain:false}]};assert.equal((await f.names.propose(turn)).status,'awaiting-observation');f.live.observations=[f.observation];assert.equal((await f.names.propose(turn)).status,'pending');});
test('late voice-window retries reuse the bounded classifier result',async()=>{const f=fixture();let calls=0;f.names.classify=async()=>{calls++;return {kind:'voice',name:'Élodie'};};f.live.observations=[];f.names.faces.lastObservation={receivedAt:Date.now(),faces:[{id:'face',name:null,uncertain:false}]};assert.equal((await f.names.propose(turn)).status,'awaiting-observation');assert.equal((await f.names.propose(turn)).status,'awaiting-observation');f.live.observations=[f.observation];assert.equal((await f.names.propose(turn)).status,'pending');assert.equal(calls,1);});
test('one confirmed candidate spanning adjacent windows can label an introduction',()=>{const f=fixture();f.live.observations.push({...f.observation,interval:{start:4,end:8}});assert.ok(f.live.forInterval(3,5));f.live.observations[1]={...f.live.observations[1],speakers:[{speaker:0,id:'different'}]};assert.equal(f.live.forInterval(3,5),null);});

test('spelling correction saves the same captured voice and journals the corrected name',async()=>{
 const f=fixture(),events=[];f.names.record=e=>events.push(e);
 const p=await f.names.propose(turn);
 f.live.observations=[{...f.observation,speakers:[{id:'replacement',speaker:0}]}];
 const result=await f.names.confirm(p.token,true,'  Zephie  ');
 assert.equal(result.name,'Zephie');assert.equal(result.status,'saved');
 assert.deepEqual(f.saved.map(s=>({id:s.id,name:s.name})),[{id:'original',name:'Zephie'}]);
 assert.equal(events[0].subject,'Zephie');
});
test('invalid corrections keep the proposal available and never write a label',async()=>{
 for(const value of ['', '   ', 'a'.repeat(81), 'Name\nOther', '\u202eName', '\u200d', ' \u200c\u200d ', null, {}, 42]){
  const f=fixture(),p=await f.names.propose(turn);
  assert.equal((await f.names.confirm(p.token,true,value)).status,'invalid-name');assert.equal(f.saved.length,0);
  assert.equal((await f.names.confirm(p.token,true,'Élodie')).status,'saved');
 }
});
test('corrected labels still require the live token, explicit acceptance and unexpired observation',async()=>{
 for(const mode of ['wrong-token','cancel','expired']){
  const f=fixture(),p=await f.names.propose(turn);if(mode==='expired')f.advance();
  await f.names.confirm(mode==='wrong-token'?'other':p.token,mode!=='cancel','Zephie');
  assert.equal(f.saved.length,0);
 }
});
test('a correction cannot rename a replacement face',async()=>{
 const f=fixture();let writes=0;
 f.names.faces={lastObservation:{receivedAt:Date.now(),faces:[{id:'face-a',name:null,uncertain:false}]},store:{nameObserved:async()=>{writes++;return true;}}};
 f.names.classify=async()=>({kind:'face',name:'Misheard'});
 const p=await f.names.propose(turn);f.names.faces.lastObservation.faces=[{id:'face-b'}];
 assert.equal((await f.names.confirm(p.token,true,'Correct spelling')).status,'not-saved');assert.equal(writes,0);
});
test('local-mode introductions accept a correction and Unicode joiners remain valid',async()=>{
 const f=fixture(),p=await f.names.proposeLocal(f.observation,turn.text);
 const name='न\u200dदी';assert.equal((await f.names.confirm(p.token,true,name)).status,'saved');assert.equal(f.saved[0].name,name);
});

function multipleFacesFixture(){
 const f=fixture();f.names.faces={lastObservation:{receivedAt:Date.now(),faces:[{id:'face-a',name:null,uncertain:false,thumbnail:'/9j/AAA='},{id:'face-b',name:null,uncertain:false,thumbnail:'/9j/BBB='}]},store:{nameObserved:async(o,id,name)=>{f.saved.push({o,id,name});return true;}}};
 f.names.classify=async()=>({kind:'face',name:'Example'});return f;
}
test('multiple faces require an explicit snapshot choice; selection never defaults to a face',async()=>{
 const f=multipleFacesFixture(),p=await f.names.propose(turn);
 assert.equal(p.status,'pending');assert.equal(p.selectionInSettings,true);assert.equal(f.names.pending.id,null);
 assert.equal(f.names.selection().faces.length,2);
 for(const id of [undefined,'another-face'])assert.equal((await f.names.confirm(p.token,true,'Correct name',id)).status,'select-face');
 assert.equal(f.saved.length,0);
 assert.equal((await f.names.confirm(p.token,true,'Correct name','face-b')).status,'saved');assert.equal(f.saved[0].id,'face-b');assert.equal(f.saved[0].name,'Correct name');
 assert.equal(f.names.selection(),null);
});
test('selected face disappearance, uncertainty or prior naming invalidates the introduction',async()=>{
 for(const change of ['gone','uncertain','named']){
  const f=multipleFacesFixture(),p=await f.names.propose(turn);
  if(change==='gone')f.names.faces.lastObservation.faces=[{id:'replacement'}];
  if(change==='uncertain')f.names.faces.lastObservation.faces[1].uncertain=true;
  if(change==='named')f.names.faces.lastObservation.faces[1].name='Already named';
  assert.equal((await f.names.confirm(p.token,true,'Example','face-b')).status,'not-saved');assert.equal(f.saved.length,0);
 }
});
test('crop-less, named and ambiguous faces are not selection candidates',async()=>{
 const f=multipleFacesFixture();f.names.faces.lastObservation.faces.push({id:'named',name:'Existing',thumbnail:'/9j/CCC='},{id:'ambiguous',uncertain:true,thumbnail:'/9j/CCC='},{id:'overlapping',name:null,uncertain:false,thumbnail:null});
 await f.names.propose(turn);assert.deepEqual(f.names.selection().faces.map(f=>f.id),['face-a','face-b']);
});
test('expired and cancelled face proposals release all introduction thumbnails',async()=>{
 for(const mode of ['cancel','expire']){
  const f=multipleFacesFixture(),p=await f.names.propose(turn);
  if(mode==='cancel')f.names.cancel();else f.advance();
  assert.equal(f.names.selection(),null);
  await f.names.confirm(p.token,true,'Example','face-a');assert.equal(f.saved.length,0);
 }
});
test('seeing several faces never changes a self-introduction into a face label',async()=>{
 const f=multipleFacesFixture();f.names.classify=async()=>({kind:'voice',name:'Speaker'});
 const p=await f.names.propose(turn);assert.equal(p.kind,'voice');assert.equal(f.names.selection(),null);
 await f.names.confirm(p.token,true,'Speaker','face-b');assert.equal(f.saved[0].id,'original');
});
