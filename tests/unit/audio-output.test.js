const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function processor(){let Processor;const context={AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}}}},sampleRate:48000,currentFrame:0,registerProcessor:(_name,type)=>{Processor=type},console};vm.runInNewContext(fs.readFileSync('audio-output-processor.js','utf8'),context);return new Processor()}
test('silent turn padding does not grow the adaptive audio delay, but a speech underrun does',()=>{
 for(const sample of [0,.5]){const p=processor();p.frames=[new Float32Array(64).fill(sample)];p.started=true;p.remainingPartialBufferSamples=0;const before=p.partialBufferSamples;p.process([],[[new Float32Array(128)]]);assert.equal(p.partialBufferSamples,before+(sample?240:0));}
});
