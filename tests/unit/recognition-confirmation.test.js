const test=require('node:test'),assert=require('node:assert/strict');
const {RecognitionSession}=require('../../modules/recognition-session');
function fixture(t){
 const savedWindow=global.window;t.after(()=>{global.window=savedWindow;session.clearPrompt();});
 const replies=[],notices=[],session=Object.create(RecognitionSession.prototype);
 Object.assign(session,{generation:0,pending:{token:'first',kind:'voice',name:'Robin'},prompt:{hidden:false},label:{},nameInput:{value:'Robin',reportValidity:()=>true},renderer:{showNotification:text=>notices.push(text)},send:()=>{},schedule:()=>{}});
 global.window={nodie:{confirmRecognitionName:()=>new Promise(resolve=>replies.push(resolve))}};
 return {session,replies,notices};
}
test('a stalled confirmation releases its guard after the deadline and never claims a save',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {session,notices}=fixture(t);
 const stalled=session.confirm(true);assert.ok(session.confirming);t.mock.timers.tick(10001);await stalled;
 assert.equal(session.confirming,null);assert.equal(session.pending,null);assert.match(notices[0],/Check saved profiles/);
 session.showPrompt({token:'second',kind:'voice',name:'Robin'});const next=session.confirm(true);
 t.mock.timers.tick(10001);await next;assert.equal(session.confirming,null);
});
test('late completion of a replaced proposal cannot release the new confirmation',async t=>{
 const {session,replies}=fixture(t);const old=session.confirm(true);
 session.clearPrompt();session.showPrompt({token:'second',kind:'voice',name:'Other'});const current=session.confirm(true),guard=session.confirming;
 replies[0]({status:'saved',name:'Robin'});await old;
 assert.equal(session.confirming,guard);assert.equal(session.pending.token,'second');
 replies[1]({status:'saved',name:'Other'});await current;assert.equal(session.confirming,null);assert.equal(session.pending,null);
});
