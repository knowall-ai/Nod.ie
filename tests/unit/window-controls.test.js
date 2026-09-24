const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const {windowControls}=require('../../lib/window-controls');
test('fullscreen restores compact bounds, Escape and tray preserve the running window',()=>{
 const w=new EventEmitter();w.webContents=new EventEmitter();const modes=[];w.webContents.send=(_c,x)=>modes.push(x);const bounds={x:50,y:70,width:300,height:300};
 Object.assign(w,{getBounds:()=>bounds,setBounds:x=>w.bounds=x,setResizable:x=>w.resizable=x,setFullScreen:x=>w.nativeFull=x,isFullScreen:()=>Boolean(w.nativeFull),hide:()=>w.hidden=true,show:()=>w.hidden=false,focus:()=>w.focused=true});
 let interactive=false;const c=windowControls(w,{setFullScreen:x=>interactive=x});
 c.action('fullscreen');assert.equal(w.nativeFull,true);assert.equal(interactive,true);
 c.action('tray');assert.equal(w.hidden,true);c.action('show');assert.equal(w.hidden,false);assert.equal(w.focused,true);
 let prevented=false;w.webContents.emit('before-input-event',{preventDefault:()=>prevented=true},{type:'keyDown',key:'Escape'});
 assert.equal(prevented,true);assert.equal(w.nativeFull,false);w.emit('leave-full-screen');assert.deepEqual(w.bounds,bounds);assert.equal(w.resizable,false);assert.equal(interactive,false);
 assert.throws(()=>c.action('run-command'));assert.equal(modes.at(-1).fullscreen,false);
});
test('Escape shortcut exists only while fullscreen is visible',()=>{
 const w=new EventEmitter();w.webContents=new EventEmitter();w.webContents.send=()=>{};
 Object.assign(w,{visible:true,isVisible:()=>w.visible,getBounds:()=>({width:300,height:300}),setBounds:()=>{},setResizable:()=>{},setFullScreen:x=>w.full=x,isFullScreen:()=>w.full,hide:()=>{w.visible=false;w.emit('hide');},show:()=>{w.visible=true;w.emit('show');},focus:()=>{}});
 const keys=new Map();const c=windowControls(w,{setFullScreen:()=>{}},{register:(k,v)=>keys.set(k,v),unregister:k=>keys.delete(k)});
 c.action('fullscreen');assert.ok(keys.has('Escape'));c.action('tray');assert.equal(keys.has('Escape'),false);c.action('show');assert.ok(keys.has('Escape'));
 keys.get('Escape')();w.emit('leave-full-screen');assert.equal(keys.has('Escape'),false);
});
