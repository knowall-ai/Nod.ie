const test=require('node:test'),assert=require('node:assert/strict');
const {boundedNames,TranscriptionNameHints}=require('../../lib/transcription-name-hints');
const response=rows=>({content:[{type:'text',text:JSON.stringify(rows)}]});
test('hints contain explicit stored names/nicknames/aliases, never notes, vectors or guessed aliases',async()=>{
 const calls=[],source=new TranscriptionNameHints({profiles:async()=>['Maren'],memory:()=>({callTool:async(...args)=>{calls.push(args);return response([{memory:{_id:7,name:'Cerys',nickname:'Cez',aliases:['Cezzy'],notes:'private secret',embedding:[.1]}},{memory:{name:'Unsaved candidate'}}]);}})});
 assert.deepEqual(await source.get(),['Maren','Cerys','Cez','Cezzy']);assert.equal(calls[0][0].name,'search_memories');assert.deepEqual(calls[0][0].arguments,{label:'Person',limit:32,depth:0,search_mode:'keyword'});assert.equal(calls[0][2].timeout,500);
});
test('terms deduplicate, preserve spelling and respect count/length budgets without delimiter injections',()=>{
 assert.deepEqual(boundedNames(['Cerys','cerys','Cezzy','Jürgen','Nine\nwords','bad, injected','\u202Ebad','-','',null]),['Cerys','Cezzy','Jürgen']);
 const terms=boundedNames(Array.from({length:40},(_,i)=>'Example '+i));assert.equal(terms.length,16);assert.ok(terms.join(', ').length<=300);
 assert.equal(boundedNames(['x'.repeat(81),'one two three four five six seven']).length,0);
});
test('slow memory returns fresh profile names inside the budget and warms later without concurrent duplicate lookups',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let finish,calls=0;const source=new TranscriptionNameHints({profiles:async()=>['Maren'],memory:()=>({callTool:()=>{calls++;return new Promise(r=>finish=r);}})});
 const first=source.get();await Promise.resolve();await Promise.resolve();await Promise.resolve();t.mock.timers.tick(101);assert.deepEqual(await first,['Maren']);
 const second=source.get();await Promise.resolve();await Promise.resolve();t.mock.timers.tick(101);assert.deepEqual(await second,['Maren']);assert.equal(calls,1);
 finish(response([{memory:{_id:7,name:'Cerys'}}]));await source.refreshing;assert.deepEqual(await source.get(),['Maren','Cerys']);
});
test('deleted profiles are read fresh and expired/failed memory cache is not reused',async()=>{
 let now=0,profiles=['Maren'],rows=[{memory:{_id:7,name:'Cerys'}}],fail=false,calls=0;
 const source=new TranscriptionNameHints({now:()=>now,profiles:async()=>profiles,memory:()=>({callTool:async()=>{calls++;if(fail)throw Error('offline');return response(rows);}})});
 assert.deepEqual(await source.get(),['Maren','Cerys']);profiles=[];assert.deepEqual(await source.get(),['Cerys']);assert.equal(calls,1);
 now=31000;fail=true;assert.deepEqual(await source.get(),[]);assert.equal(calls,2);
});
test('hung profile lookup is bounded and cancellation never provides hints to an aborted turn',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const source=new TranscriptionNameHints({profiles:()=>new Promise(()=>{})}),abort=new AbortController();const pending=source.get(abort.signal);abort.abort();t.mock.timers.tick(101);await assert.rejects(pending,{name:'AbortError'});
});
test('unavailable memory still uses confirmed profiles without connecting another client',async()=>{
 const source=new TranscriptionNameHints({profiles:async()=>['Maren'],memory:()=>null});assert.deepEqual(await source.get(),['Maren']);
});
