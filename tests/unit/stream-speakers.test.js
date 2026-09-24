const test = require('node:test');
const assert = require('node:assert/strict');
const StreamSpeakers = require('../../modules/stream-speakers');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
class Recorder {
    static instances = [];
    constructor(stream) { this.stream = stream; this.state = 'inactive'; this.mimeType = 'audio/webm'; Recorder.instances.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['a'.repeat(100)]) }); this.onstop(); }
}
test('stopping a microphone discards pending recognition without stopping shared tracks', async () => {
    let complete, called = false, stopped = false;
    const updates = [];
    const api = { liveSpeakerStatus: async () => ({ enabled: true }), cancelSpeakers: async () => {}, analyseSpeakers: () => { called = true; return new Promise(resolve => { complete = resolve; }); } };
    const stream = new StreamSpeakers(api, value => updates.push(value), { Recorder, duration: 5 });
    stream.start({ getTracks: () => [{ stop() { stopped = true; } }] });
    for (let i = 0; i < 100 && !called; i++) await delay(5);
    assert.equal(called, true); stream.stop(); complete({ speakers: [{ name: 'Late' }] }); await delay(10);
    assert.equal(updates.some(value => value?.speakers), false); assert.equal(stopped, false);
});
test('disabled recognition never starts a recorder', async () => {
    const before = Recorder.instances.length;
    const stream = new StreamSpeakers({ liveSpeakerStatus: async () => ({ enabled: false }), cancelSpeakers: async () => {} }, () => {}, { Recorder });
    stream.start({}); await delay(10); stream.stop(); assert.equal(Recorder.instances.length, before);
});
test('recording duration is bounded and unchanged null observations are suppressed',()=>{
 for(const duration of [0,-1,4001,NaN,Infinity,'4000',1.5])assert.throws(()=>new StreamSpeakers({},()=>{},{duration}),/Invalid/);
 const updates=[];const stream=new StreamSpeakers({},value=>updates.push(value));
 stream.emit(null);stream.emit(null);stream.emit({speakers:[]});stream.emit({speakers:[]});stream.emit(null);
 assert.deepEqual(updates,[null,{speakers:[]},null]);
});

test('unchanged live speakers refresh before backend expiry while null remains deduplicated',()=>{
 let now=0;const updates=[];const stream=new StreamSpeakers({},value=>updates.push(value),{now:()=>now});
 const observation={speakers:[{name:'Ben',uncertain:false}]};stream.emit(observation);
 now=4000;stream.emit(observation);assert.equal(updates.length,1);
 now=6000;stream.emit(observation);assert.equal(updates.length,2);
 stream.emit(null);now=30000;stream.emit(null);assert.equal(updates.length,3);
});
