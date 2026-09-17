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
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {Server}=require('@modelcontextprotocol/sdk/server/index.js');
const {InMemoryTransport}=require('@modelcontextprotocol/sdk/inMemory.js');
const {CallToolRequestSchema}=require('@modelcontextprotocol/sdk/types.js');
const {createMemoryServer}=require('../../unmute-service/reverie-readonly.cjs');
async function linked(server){const client=new Client({name:'test',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);return {client,async close(){await client.close();await server.close()}};}
test('actual MCP handler trims queries, fixes search limits and converts upstream failures',async()=>{
 let failed=false,seen;
 const pair=await linked(createMemoryServer(async()=>({async callTool(call,_schema,options){seen={call,options};return failed?{isError:true,content:[]}:{content:[{type:'text',text:'[]'}]};}})));
 try{
  const result=await pair.client.callTool({name:'search_memories',arguments:{query:'  Example  '}});
  assert.equal(JSON.parse(result.content[0].text).status,'ok');
  assert.deepEqual(seen.call,{name:'search_memories',arguments:{query:'Example',limit:5,depth:1,search_mode:'keyword'}});assert.equal(seen.options.timeout,4000);
  failed=true;const failure=await pair.client.callTool({name:'search_memories',arguments:{query:'Example'}});assert.equal(failure.isError,true);assert.equal(JSON.parse(failure.content[0].text).status,'unavailable');
  const invalid=await pair.client.callTool({name:'search_memories',arguments:{query:'Example',limit:99}});assert.equal(invalid.isError,true);
 }finally{await pair.close();}
});
test('actual upstream MCP timeout becomes unavailable rather than an empty result',async()=>{
 const upstreamServer=new Server({name:'slow-test',version:'1'},{capabilities:{tools:{}}});upstreamServer.setRequestHandler(CallToolRequestSchema,()=>new Promise(()=>{}));
 const upstream=await linked(upstreamServer);const bridge=await linked(createMemoryServer(async()=>upstream.client,{searchTimeout:25}));
 try{const result=await bridge.client.callTool({name:'search_memories',arguments:{query:'Example'}});assert.equal(result.isError,true);assert.equal(JSON.parse(result.content[0].text).status,'unavailable');}
 finally{await bridge.close();await upstream.close();}
});
