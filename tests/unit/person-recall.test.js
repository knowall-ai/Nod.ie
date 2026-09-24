const {test}=require('node:test');const assert=require('node:assert/strict');const {candidates,createResolver}=require('../../unmute-service/person-recall.cjs');
const rows=[{memory:{name:'Joseph Example',nickname:'Joey',aliases:['Joie']}},{memory:{name:'Philip Example',aliases:['Philie','Phily']}}];
test('confirmed names and aliases resolve without guessing identities',()=>{
 assert.deepEqual(candidates('How old is Joey?',rows),[{name:'Joseph Example',match:'exact'}]);
 assert.deepEqual(candidates('Do you know Filly?',rows),[{name:'Philip Example',match:'possible'}]);
 assert.deepEqual(candidates('The camera is on',rows),[]);
});
test('phonetic ambiguity returns candidates rather than merging people',()=>{
 const twins=[...rows,{memory:{name:'Philly Other'}}];assert.equal(candidates('Filly',twins).length,2);
});
test('bounded person index is cached and matching facts are fetched read-only',async()=>{
 const calls=[];const resolve=createResolver(async()=>({callTool:async request=>{calls.push(request);return {content:[{type:'text',text:JSON.stringify(request.arguments.query?[rows[0]]:rows)}]}}}));
 const first=await resolve('Joey');assert.equal(first.people[0].match,'exact');await resolve('Joey');
 assert.equal(calls.filter(c=>!c.arguments.query).length,1);assert.ok(calls.every(c=>c.name==='search_memories'));
});
test('embedding arrays never consume the person-reference context budget',async()=>{
 const heavy={memory:{name:'Joseph Example',aliases:['Joey'],embedding:Array(1000).fill(.125)},connections:[{memory:{name:'A relative',name_embedding:Array(1000).fill(.2)}}]};
 const resolve=createResolver(async()=>({callTool:async()=>({content:[{type:'text',text:JSON.stringify([heavy])}]})}));const x=await resolve('Joey');
 assert.equal(x.people.length,1);assert.doesNotMatch(JSON.stringify(x),/embedding/);assert.ok(JSON.stringify(x).length<1000);
});
test('first names and common words are not confirmed identities',()=>{
 assert.equal(candidates('Joseph',rows)[0].match,'possible');
 assert.equal(candidates('Will you help?', [{memory:{name:'Will Example'}}])[0].match,'possible');
});
