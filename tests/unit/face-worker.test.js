const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {FaceWorker}=require('../../lib/face-worker');
function fake(){const child=new EventEmitter();child.stdout=new EventEmitter();child.stdin=new EventEmitter();child.stdin.write=()=>{};child.kill=()=>{child.killed=true;};return child;}
test('worker is reused and late killed output cannot satisfy a new request',async()=>{
 const children=[];const worker=new FaceWorker({spawnImpl:()=>{const c=fake();children.push(c);return c;}});
 try{const a=worker.analyse(new Uint8Array(100));children[0].stdout.emit('data',Buffer.from('{"faces":[]}\n'));await a;
 const b=worker.analyse(new Uint8Array(100));assert.equal(children.length,1);worker.close();await assert.rejects(b);assert.equal(children[0].killed,true);
 const c=worker.analyse(new Uint8Array(100));children[0].stdout.emit('data',Buffer.from('{"faces":["stale"]}\n'));children[1].stdout.emit('data',Buffer.from('{"faces":[]}\n'));assert.deepEqual(await c,{faces:[]});}finally{worker.close();}
});
test('hung workers and cancelled analysis are killed within the deadline',async()=>{
 const children=[];const worker=new FaceWorker({timeoutMs:5,spawnImpl:()=>{const c=fake();children.push(c);return c;}});
 await assert.rejects(worker.analyse(new Uint8Array(100)));assert.equal(children[0].killed,true);
 const controller=new AbortController(),p=worker.analyse(new Uint8Array(100),controller.signal);controller.abort();await assert.rejects(p);assert.equal(children[1].killed,true);
});
