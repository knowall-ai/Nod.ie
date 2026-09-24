const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { SceneDelta, CuriosityLedger } = require('../../lib/curiosity');
const Session = require('../../modules/curiosity-session');
const scene = (people=1, objects=[], animals=[]) => ({ people, objects, animals });
const cup = { kind: 'cup', appearance: 'blue', heldByPerson: true, onScreen: false };
test('stable baseline, count changes and held objects; no startup novelty or identity guesses', () => {
 const d = new SceneDelta();
 assert.deepEqual(d.observe(scene(1,[cup]),0),[]);assert.deepEqual(d.observe(scene(1,[cup]),15000),[]);assert.deepEqual(d.observe(scene(1,[cup]),30000),[]);
 assert.deepEqual(d.observe(scene(2,[cup]),45000),[]);
 assert.equal(d.observe(scene(2,[cup]),60000)[0].type,'people');
 d.observe(scene(),75000);d.observe(scene(),90000);d.observe(scene(1,[cup]),105000);
 const events=d.observe(scene(1,[{...cup,appearance:'light blue'}]),120000);assert.equal(events[0].key,'held-object:cup');assert.equal(events[0].name,undefined);
 d.reset();assert.deepEqual(d.observe(scene(1,[cup]),135000),[]);
});
test('screens, flickers and unattended objects do not produce questions',()=>{
 const d=new SceneDelta();d.observe(scene(),0);d.observe(scene(),15000);
 d.observe(scene(1,[{...cup,onScreen:true}]),30000);assert.deepEqual(d.observe(scene(1,[{...cup,onScreen:true}]),45000),[]);
 d.observe(scene(0,[cup]),60000);assert.deepEqual(d.observe(scene(0,[cup]),75000),[]);
});
test('claims are atomic, persisted across restart, bounded, private and cleared',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nodie-curiosity-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let now=Date.parse('2026-09-24T10:00:00Z');
 const file=path.join(dir,'curiosity.json'), options={now:()=>now,timezone:'Europe/London'}, ledger=new CuriosityLedger(file,options), candidate={key:'held-object:cup',type:'held-object'};
 assert.match((await ledger.claim(candidate,'low')).reason,/disabled/);assert.match((await ledger.claim(candidate,'observe')).reason,/would ask/);
 const results=await Promise.all([ledger.claim(candidate,'normal'),ledger.claim(candidate,'normal')]);assert.equal(results.filter(r=>r.token).length,1);
 now+=3600000;assert.match((await new CuriosityLedger(file,options).claim(candidate,'normal')).reason,/already/);
 await ledger.outcome(results.find(r=>r.token).token,'unanswered');
 assert.equal((await fs.stat(file)).mode&0o777,0o600);
 const next=await ledger.claim({key:'animal:dog',type:'animal'},'normal');assert.ok(next.token);await ledger.outcome(next.token,'unanswered');
 now+=1800000;assert.match((await ledger.claim({key:'people:person',type:'people'},'normal')).reason,/paused/);
 await ledger.clear();assert.ok((await ledger.claim(candidate,'normal')).token);
});
test('renderer quiet, muted, playback, reset races and exact image gates',async t=>{
 let now=100000,calls=0;const sent=[];const r={state:{isConnected:true,wsHandler:{send:x=>sent.push(x)}},visionContext:{active:true,scene:{capturedAt:new Date(now).toISOString(),imageJpeg:'image'}},debugStream:{add(){}}};
 const old=global.window;global.window={nodie:{claimCuriosity:async()=>{calls++;return {event:{token:'claim',key:'held-object:cup'}};},curiosityOutcome:async()=>{}}};
 const s=new Session(r,{now:()=>now});t.after(()=>{s.dispose();global.window=old;});
 await s.consider({token:'candidate',capturedAt:r.visionContext.scene.capturedAt},{capturedAt:r.visionContext.scene.capturedAt,image:new Blob(['image']),signal:new AbortController().signal});assert.match(s.reason(),/active/);
 now+=61000;r.visionContext.scene.capturedAt=new Date(now).toISOString();await s.consider({token:'candidate',capturedAt:r.visionContext.scene.capturedAt},{capturedAt:r.visionContext.scene.capturedAt,image:new Blob(['image']),signal:new AbortController().signal});
 r.state.isMuted=true;await s.tick();assert.equal(calls,0);r.state.isMuted=false;
 await s.tick();assert.equal(calls,1);assert.equal(sent.at(-1).session.curiosity_scene.imageJpeg,btoa('image'));assert.equal(s.blockedUntilReply,true);
 s.event({type:'nodie.curiosity_started',token:'claim',key:'held-object:cup'});s.event({type:'response.audio.delta'});s.event({type:'response.audio.done'});s.event({type:'conversation.item.input_audio_transcription.delta',delta:'Yes'});assert.equal(s.blockedUntilReply,false);
 let done;global.window.nodie.claimCuriosity=()=>new Promise(resolve=>done=resolve);now+=61000;await s.consider({token:'next',capturedAt:new Date(now).toISOString()},{capturedAt:new Date(now).toISOString(),image:new Blob(['image']),signal:new AbortController().signal});r.visionContext.scene.capturedAt=new Date(now).toISOString();await s.consider({token:'next',capturedAt:r.visionContext.scene.capturedAt},{capturedAt:r.visionContext.scene.capturedAt,image:new Blob(['image']),signal:new AbortController().signal});
 const pending=s.tick();s.reset();done({event:{token:'stale'}});await pending;assert.equal(sent.at(-1).session.curiosity_allowed,false);
});

test('undelivered claims stay permitted until deadline and cancel without interruption penalty',async t=>{
 let now=100000;const sent=[],outcomes=[];const old=global.window;
 global.window={nodie:{claimCuriosity:async()=>({event:{token:'t'}}),curiosityOutcome:async(token,outcome)=>outcomes.push(outcome)}};
 const r={state:{isConnected:true,wsHandler:{send:x=>sent.push(x)}},visionContext:{active:true},debugStream:{add(){}}};
 const s=new Session(r,{now:()=>now});t.after(()=>{s.dispose();global.window=old;});now+=61000;
 const capturedAt=new Date(now).toISOString();await s.consider({token:'c',capturedAt},{capturedAt,image:new Blob(['image']),signal:new AbortController().signal});
 await s.tick();now+=1000;await s.tick();assert.equal(sent.at(-1).session.curiosity_allowed,true);
 now+=20000;await s.tick();assert.deepEqual(outcomes,['cancelled']);assert.equal(s.blockedUntilReply,false);assert.equal(sent.at(-1).session.curiosity_allowed,false);
});
test('cancelled reservation does not count as a question or exhaust the budget',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nodie-cancelled-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const l=new CuriosityLedger(path.join(dir,'ledger.json')),c={key:'animal:dog',type:'animal'};
 const a=await l.claim(c,'normal');await l.outcome(a.token,'cancelled');assert.ok((await l.claim(c,'normal')).token);assert.equal((await l.read()).ignored,0);
});
