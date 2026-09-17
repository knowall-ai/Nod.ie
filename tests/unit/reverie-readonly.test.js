const test = require('node:test');
const assert = require('node:assert/strict');
const {valid,bounded,tool} = require('../../unmute-service/reverie-readonly.cjs');
test('read-only bridge rejects extra arguments, blank searches and oversized queries',()=>{
    assert.equal(tool.name,'search_memories');
    assert.equal(valid({query:'person name'}),true);
    for (const args of [{query:''},{query:' '},{query:'x'.repeat(161)},{query:'name',cypher:'DELETE n'},[],null]) assert.equal(Boolean(valid(args)),false);
});
test('memory results retain relationships and report truncation rather than implying absence',()=>{
    const row={memory:{name:'Example parent'},connections:[{type:'PARENT_OF',memory:{name:'Example child'}}]};
    assert.deepEqual(bounded([row]).memories,[row]);
    const large=bounded([{memory:{notes:'x'.repeat(17000)}}]);
    assert.equal(large.truncated,true);assert.equal(large.memories.length,0);
    assert.equal(bounded([]).truncated,false);
});
