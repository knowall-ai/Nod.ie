const test=require('node:test'),assert=require('node:assert/strict');
const {speakerPhrases,RecognitionSession}=require('../../modules/recognition-session');
const word=(text,start,end,profile,name)=>({text,start,end,profile,name,attribution:profile?'possible-match':'unattributed'});
test('phrase grouping preserves speaker boundaries and labels all recognition as possible',()=>{
 const phrases=speakerPhrases([word('Hello',1,1.2,'a','Robin'),word('there',1.3,1.5,'a','Robin'),word('yes',1.6,1.8,'b','Another'),word('overlap',1.9,2.2,null,'Robin')]);
 assert.deepEqual(phrases.map(p=>[p.label,p.text]),[['Possible match: Robin','Hello there'],['Possible match: Another','yes'],['Unattributed','overlap']]);
});
test('unfinished or invalid words do not become speaker phrases and missing attribution cannot assert a name',()=>{
 const words=[word('unfinished',1,undefined,'a','Robin'),word('zero',1,1,'a','Robin'),{...word('unknown',2,2.2,'a','Robin'),attribution:'unattributed'},word('unlabelled',3,3.2,'b',null)];
 assert.deepEqual(speakerPhrases(words).map(p=>p.label),['Unattributed','Unknown voice (possible match)']);
});
test('Debug deduplicates identical events but exposes a later uncertain attribution change',()=>{
 const rows=[],s=Object.create(RecognitionSession.prototype);Object.assign(s,{words:[],turns:[],logged:new Set(),schedule:()=>{},renderer:{debugStream:{add:(source,text)=>rows.push([source,text])}}});
 const words=[word('Hello',1,1.2,'a','Robin'),word('there',1.3,1.5,'a','Robin')];s.event({type:'nodie.attributed_words',words});s.event({type:'nodie.attributed_words',words});
 assert.deepEqual(rows,[['Speaker phrases','Possible match: Robin: Hello there']]);
 s.event({type:'nodie.attributed_words',words:words.map(w=>({...w,profile:null,name:null,attribution:'unattributed'}))});assert.equal(rows[1][1],'Unattributed: Hello there');
});
