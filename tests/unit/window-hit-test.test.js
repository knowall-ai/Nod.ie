const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { hitsOverlay, validateRegions, trackPointer } = require('../../lib/window-hit-test');
const geometry = { width: 300, height: 300, regions: [{ x: 25, y: 25, width: 250, height: 250 }, { x: 17, y: 183, width: 40, height: 40 }, { x: 42, y: 218, width: 40, height: 40 }, { x: 77, y: 243, width: 40, height: 40 }, { x: 119, y: 254, width: 40, height: 40 }] };
test('transparent corners pass through while avatar and all control circles receive input', () => {
    const bounds = { x: 10, y: 20, width: 300, height: 300 };
    const hit = (x, y) => hitsOverlay({ x: x + 10, y: y + 20 }, bounds, geometry);
    for (const [x, y] of [[0, 0], [299, 0], [0, 299], [299, 299], [26, 26], [17, 183]]) assert.equal(hit(x, y), false);
    for (const r of geometry.regions) assert.equal(hit(r.x + r.width / 2, r.y + r.height / 2), true);
    assert.equal(hit(150, 25), true);
});
test('native DIP and CSS viewport are mapped independently, including negative monitor coordinates', () => {
    const bounds = { x: -600, y: -50, width: 600, height: 600 };
    assert.equal(hitsOverlay({ x: -300, y: 250 }, bounds, geometry), true);
    assert.equal(hitsOverlay({ x: -595, y: -45 }, bounds, geometry), false);
});
test('polling restores pointer input on Linux and never releases an active drag', () => {
    const win = new EventEmitter(); win.webContents = new EventEmitter(); let cursor = { x: 0, y: 0 }, dragging = false, tick, clears = 0; const changes = [];
    win.isDestroyed = () => false; win.isVisible = () => true; win.getContentBounds = () => ({ x: 0, y: 0, width: 300, height: 300 }); win.setIgnoreMouseEvents = value => changes.push(value);
    const tracker = trackPointer(win, { getCursorScreenPoint: () => cursor }, () => dragging, { schedule: fn => { tick = fn; return 1; }, clear: () => clears++ });
    tracker.setRegions(geometry); assert.deepEqual(changes, [true]);
    cursor = { x: 150, y: 150 }; tick(); assert.deepEqual(changes, [true, false]);
    dragging = true; cursor = { x: 0, y: 0 }; tick(); assert.equal(changes.length, 2);
    dragging = false; tick(); assert.equal(changes.at(-1), true);
    win.webContents.emit('render-process-gone'); assert.equal(changes.at(-1), false);
    win.emit('closed'); assert.equal(clears, 1);
});
test('invalid renderer geometry cannot make the window permanently unreachable', () => {
    assert.equal(hitsOverlay({x:150,y:150}, {x:0,y:0,width:300,height:300}, validateRegions({ ...geometry, regions: [] })), false);
    for (const patch of [{x:-1}, {x:1.5}, {extra:true}]) assert.throws(() => validateRegions({...geometry, regions:[{...geometry.regions[0],...patch}]}));
    assert.throws(() => validateRegions({...geometry,extra:true}));
    assert.throws(() => validateRegions({ ...geometry, width: Infinity }));
    assert.throws(() => validateRegions({ ...geometry, regions: [{ x: 0, y: 0, width: -1, height: 2 }] }));
});

test('native helper shutdown waits for close and kills a stuck child within the deadline', async () => {
    const {closeHelper}=require('../../lib/window-hit-test');
    const child=new EventEmitter(); let ended=false,killed=false;
    child.stdin={end(){ended=true}};child.kill=signal=>{assert.equal(signal,'SIGKILL');killed=true;child.emit('close')};
    await closeHelper(child,10);assert.equal(ended,true);assert.equal(killed,true);
    const normal=new EventEmitter();normal.stdin={end(){setImmediate(()=>normal.emit('close'))}};normal.kill=()=>assert.fail('should close without killing');await closeHelper(normal,100);
});

test('helper exit does not finish cleanup before its pipes close',async()=>{
 const {closeHelper}=require('../../lib/window-hit-test');const child=new EventEmitter();child.exitCode=1;child.stdin={end(){}};child.kill=()=>{};
 let done=false;const closing=closeHelper(child,100).then(()=>{done=true});await new Promise(r=>setImmediate(r));assert.equal(done,false);child.emit('close');await closing;
});
test('native input helper restarts after failure and republishes current geometry',async()=>{
 const {nativeInputRegion}=require('../../lib/window-hit-test');const children=[];const win=new EventEmitter();win.webContents=new EventEmitter();win.isDestroyed=()=>false;win.getNativeWindowHandle=()=>Buffer.alloc(4);
 const spawn=()=>{const child=new EventEmitter();child.writes=[];child.stdin=Object.assign(new EventEmitter(),{writable:true,write:x=>child.writes.push(x),end:()=>setImmediate(()=>child.emit('close'))});child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>child.emit('close');children.push(child);return child};
 const tracker=nativeInputRegion(win,null,{spawn});tracker.setRegions(geometry);win.emit('ready-to-show');children[0].emit('close',1);
 await new Promise(r=>setTimeout(r,280));assert.equal(children.length,2);assert.equal(JSON.parse(children[1].writes[0]).width,300);await tracker.stop();
});
