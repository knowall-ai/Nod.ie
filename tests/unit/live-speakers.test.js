const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveSpeakers } = require('../../lib/live-speakers');
test('rejects oversized audio before inference', async () => {
    const live = new LiveSpeakers({ analyse() { throw new Error('should not run'); } });
    await assert.rejects(live.analyse(new Uint8Array(256001)), /Invalid/);
});
test('cancel discards late identity and concurrent requests do not queue', async () => {
    let finish;
    const live = new LiveSpeakers({ analyse: () => new Promise(resolve => { finish = resolve; }) });
    const pending = live.analyse(new Uint8Array(100));
    assert.equal(await live.analyse(new Uint8Array(100)), null);
    await Promise.resolve();live.cancel(); finish({ state: 'ready', speakers: [{ name: 'Example' }] });
    assert.equal(await pending, null);
});
test('only public identity hints leave main process', async () => {
    const live = new LiveSpeakers({ analyse: async () => ({ state: 'ready', epoch: 'private', speakers: [{ id: 'private', name: 'Example', embedding: [1] }], transcriptAttribution: 'single-speaker' }) });
    assert.deepEqual(await live.analyse(new Uint8Array(100)), { speakers: [{ speaker:undefined,id:'private',name: 'Example', uncertain: false,mayAskName:false }], segments:[],attribution: 'single-speaker' });
});

test('whole-operation timeout settles caller without overlapping unfinished storage',async()=>{
 let finish,calls=0;const live=new LiveSpeakers({analyse:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}},{timeoutMs:5});
 assert.equal(await live.analyse(new Uint8Array(100)),null);
 assert.equal(await live.analyse(new Uint8Array(100)),null);assert.equal(calls,1);
 finish({state:'disabled'});await new Promise(r=>setImmediate(r));assert.equal(live.controller,null);
});
