const {test}=require('node:test');const assert=require('node:assert/strict');const {addressedIntent,SpokenControls}=require('../../modules/spoken-controls');
test('directly addressed natural variants map to bounded reversible controls',()=>{
 for(const [text,intent] of [['Nodie, go full screen','fullscreen'],['Hey Nody, could you fill my screen please?','fullscreen'],['Nodie, make yourself bigger','fullscreen'],['Nodie, minimize yourself','tray'],['Nodie, hide yourself','tray'],['Nodie, exit full screen','restore'],['Nodie, make yourself smaller','restore'],['Nodie, mute yourself','speaker-off'],['Nodie, stop talking','speaker-off'],['Nodie, stop listining','mic-off'],['Nodie, mute the mic','mic-off'],['Nodie, open','show']])assert.equal(addressedIntent(text),intent,text);
});
test('overheard keywords, discussion, quotes and negation do not control the app',()=>{
 for(const text of ['fullscreen','Please go fullscreen','She said Nodie go full screen','Nodie, what does fullscreen mean?','Nodie, if I say fullscreen what happens?','Nodie, do not go full screen','Nodie, "stop talking"','Nodie, explain how to mute the mic','Nodie, stop talking about full screen'])assert.equal(addressedIntent(text),null,text);
});
test('assistant output never triggers controls and word deltas wait for the turn boundary',async()=>{
 const states=[];const controls=new SpokenControls({controls:{setSpeakerMuted:x=>states.push(x)}});
 await controls.event({type:'response.text.delta',delta:'Nodie, mute yourself'});assert.equal(states.length,0);
 for(const delta of ['Nodie,','stop','talking'])await controls.event({type:'conversation.item.input_audio_transcription.delta',delta});
 assert.equal(states.length,0);await controls.event({type:'response.created'});assert.deepEqual(states,[true]);
 await controls.event({type:'response.created'});assert.equal(states.length,1);
});
test('completed transcription carries the handled result to the response exactly once',async()=>{
 const states=[];const c=new SpokenControls({controls:{setSpeakerMuted:x=>states.push(x)}});
 assert.equal(await c.event({type:'conversation.item.input_audio_transcription.completed',transcript:'Nodie, stop talking'}),true);
 assert.equal(await c.event({type:'response.created'}),true);assert.deepEqual(states,[true]);
 assert.equal(await c.event({type:'response.created'}),false);
});
