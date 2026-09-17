/** Share only the circular avatar and visible circular controls with the desktop. */
(function () {
    if (typeof window.nodie?.setHitRegions !== 'function') return;
    let queued = false;
    const publish = () => {
        queued = false;
        const regions = [...document.querySelectorAll('#circle, .orbit-control')].filter(el => !el.hidden && getComputedStyle(el).display !== 'none').map(el => {
            const rect = el.getBoundingClientRect();
            const pixel = v => Math.max(0, Math.min(4096, Math.round(v)));
            return { x: pixel(rect.x), y: pixel(rect.y), width: pixel(rect.width), height: pixel(rect.height) };
        }).filter(r => r.width > 0 && r.height > 0);
        window.nodie.setHitRegions({ width: Math.max(1, Math.min(4096, Math.round(window.innerWidth))), height: Math.max(1, Math.min(4096, Math.round(window.innerHeight))), regions: regions.slice(0, 8) });
        if ([...document.querySelectorAll('#circle, .orbit-control')].some(el => el.getAnimations().some(animation => animation.playState === 'running'))) changed();
    };
    const changed = () => { if (!queued) { queued = true; requestAnimationFrame(publish); } };
    const resized = new ResizeObserver(changed);
    document.querySelectorAll('#app, #circle, .orbit-control').forEach(el => resized.observe(el));
    const visibility = new MutationObserver(changed);
    document.querySelectorAll('#circle, .orbit-control').forEach(el => visibility.observe(el, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] }));
    window.addEventListener('resize', changed);
    document.addEventListener('transitionrun', changed, true);
    document.addEventListener('transitionend', changed, true);
    changed();
})();
