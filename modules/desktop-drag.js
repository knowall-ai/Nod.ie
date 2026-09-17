/** Distinguish a native desktop drag from a tap without renderer/window coordinate feedback. */
function bindDesktopDrag(element, bridge) {
    let pointer = null, result = Promise.resolve(false), cancelled = false;
    const finish = (event, cancel = false) => {
        if (pointer === null || (event.pointerId !== undefined && event.pointerId !== pointer)) return;
        pointer = null; cancelled = cancel;
        result = Promise.resolve(bridge.endDrag()).catch(() => true);
    };
    element.addEventListener('pointerdown', event => {
        if (event.button !== 0 || pointer !== null) return;
        event.preventDefault(); pointer = event.pointerId; cancelled = false;
        result = Promise.resolve(false);
        element.setPointerCapture(pointer); bridge.beginDrag();
    });
    element.addEventListener('pointerup', event => finish(event));
    element.addEventListener('pointercancel', event => finish(event, true));
    element.addEventListener('lostpointercapture', event => finish(event, true));
    window.addEventListener('blur', () => finish({}, true));
    return async () => cancelled || await result;
}
if (typeof module !== 'undefined' && module.exports) module.exports = bindDesktopDrag;
else window.bindDesktopDrag = bindDesktopDrag;
