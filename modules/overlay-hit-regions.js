/** Share only the circular avatar and visible circular controls with the desktop. */
(function () {
    if (typeof window.nodie?.setHitRegions !== 'function') return;
    let queued = false;
    const publish = () => {
        queued = false;
        const regions = [...document.querySelectorAll('#circle, .orbit-control')].filter(el => !el.hidden && getComputedStyle(el).display !== 'none').map(el => {
            const rect = el.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }).filter(r => r.width > 0 && r.height > 0);
        if (regions.length) window.nodie.setHitRegions({ width: window.innerWidth, height: window.innerHeight, regions });
    };
    const changed = () => { if (!queued) { queued = true; requestAnimationFrame(publish); } };
    const resized = new ResizeObserver(changed);
    document.querySelectorAll('#app, #circle, .orbit-control').forEach(el => resized.observe(el));
    const visibility = new MutationObserver(changed);
    document.querySelectorAll('.orbit-control').forEach(el => visibility.observe(el, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] }));
    window.addEventListener('resize', changed);
    changed();
})();
