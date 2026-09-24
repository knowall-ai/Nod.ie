/** Desktop-only presentation controls; no connection or device changes. */
(()=>{
 if(!window.nodie?.windowAction)return;
 const full=document.getElementById('control-fullscreen'),tray=document.getElementById('control-tray');let expanded=false;
 const update=state=>{expanded=state.fullscreen;document.body.classList.toggle('fullscreen',expanded);full.title=expanded?'Restore floating avatar':'Full screen';full.setAttribute('aria-label',full.title);full.querySelector('path').setAttribute('d',expanded?'M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5':'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5');resize();};
 const resize=()=>document.body.style.setProperty('--avatar-scale',String(Math.min(2.6,Math.max(1,Math.min(innerWidth,innerHeight-150)/340))));
 const action=value=>window.nodie.windowAction(value).then(update).catch(()=>window.NodieRenderer?.showNotification('Window mode could not be changed.','error'));
 full.hidden=tray.hidden=false;full.addEventListener('click',()=>action(expanded?'restore':'fullscreen'));tray.addEventListener('click',()=>action('tray'));
 window.nodie.onWindowMode(update);window.addEventListener('resize',resize);resize();
})();
