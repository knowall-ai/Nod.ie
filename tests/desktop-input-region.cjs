const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
if (process.platform !== 'linux' || !process.env.DISPLAY) { console.log('This optional integration check requires Linux/X11.'); app.exit(0); }
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nodie-input-test-'));
app.on('will-quit', () => fs.rmSync(temporary, { recursive: true, force: true }));
setTimeout(() => app.exit(1), 20000).unref();
const { spawn, execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
app.setPath('userData', temporary);
app.whenReady().then(async () => {
 const win = new BrowserWindow({ show: false, width:300,height:300,frame:false,transparent:true,type:'dock',skipTaskbar:true, webPreferences:{sandbox:true} });
 const painted = new Promise(resolve => win.once('ready-to-show', resolve));
 await win.loadURL('data:text/html,');
 await painted;
 win.showInactive();
 await new Promise(resolve => setTimeout(resolve,150));
 const id = String(win.getNativeWindowHandle().readUInt32LE());
 const read = () => JSON.parse(execFileSync('python3',[path.join(__dirname, 'helpers/x11-input-region-read.py'),id]));
 const contains = (rs,x,y) => rs.some(([l,t,w,h]) => x>=l && x<l+w && y>=t && y<t+h);
 const initial=read(); const width=initial[id][0][0][2],height=initial[id][0][0][3];
 const child=spawn('python3',[path.join(__dirname, '../scripts/x11-input-region.py'),id]);
 child.stderr.on('data',d=>process.stderr.write(d));
 const send = data => new Promise((resolve,reject)=>{child.stdout.once('data',resolve); child.once('error',reject);child.stdin.write(JSON.stringify(data)+'\n');});
 const regions=[{x:25,y:25,width:250,height:250},...[ [17,183],[42,218],[77,243],[119,254] ].map(([x,y])=>({x,y,width:40,height:40}))];
 await send({width:300,height:300,regions});
 const shaped=read();
 const assertShaped = current => {
  assert.deepEqual(Object.keys(current),Object.keys(initial));
  for (const [windowId, shapes] of Object.entries(current)) {
   assert.deepEqual(shapes[0],initial[windowId][0]);
   for(const [x,y] of [[0,0],[299,0],[0,299],[299,299],[26,26]]) assert.equal(contains(shapes[2],x*width/300,y*height/300),false);
   for(const r of regions) assert.equal(contains(shapes[2],(r.x+r.width/2)*width/300,(r.y+r.height/2)*height/300),true);
  }
 };
 assertShaped(shaped);
 win.setPosition(800, 300);
 // Moving the native window can reset the client/frame input masks. The helper
 // must restore them without relying on another renderer geometry message.
 await new Promise(resolve => setTimeout(resolve, 150));
 assertShaped(read());
 // Repeated external resets must never become the helper's desired mask.
 for (let attempt = 0; attempt < 8; attempt++) {
  execFileSync('python3', [path.join(__dirname, 'helpers/x11-input-region-read.py'), id, '--reset-input']);
  await new Promise(resolve => setTimeout(resolve, 150));
  assertShaped(read());
 }
 await send({width:300,height:300,regions:[]});
 for(const shapes of Object.values(read())) assert.equal(shapes[2].length,0);
 await send(null); assert.deepEqual(read(),initial);
 await send({width:300,height:300,regions});
 child.stdin.end(); await new Promise(r=>child.once('exit',r)); assert.deepEqual(read(),initial);
 console.log('NATIVE_SHAPE_PASS '+JSON.stringify({width,height,windows:Object.keys(shaped).length,rectangles:shaped[id][2].length,corners:'pass through',avatarAndButtons:'capture',visualShape:'unchanged',reset:'restored'}));
 win.destroy();app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
