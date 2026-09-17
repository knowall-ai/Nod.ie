/** Render the existing portrait through a circular mask for the native tray. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
    const root = path.join(__dirname, '..');
    const source = 'data:image/png;base64,' + (await fs.readFile(path.join(root, 'icon.png'))).toString('base64');
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        for (const scale of [1, 2, 3]) {
            const png = await page.evaluate(async ({ source, scale }) => {
                const image = new Image(); image.src = source; await image.decode();
                const size = 32 * scale, canvas = document.createElement('canvas');
                canvas.width = canvas.height = size;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingQuality = 'high';
                ctx.beginPath(); ctx.arc(size / 2, size / 2, 14.5 * scale, 0, 2 * Math.PI);
                ctx.save(); ctx.clip(); ctx.drawImage(image, 0, 0, size, size); ctx.restore();
                ctx.strokeStyle = '#F5A623'; ctx.lineWidth = 2 * scale; ctx.stroke();
                return canvas.toDataURL('image/png').split(',')[1];
            }, { source, scale });
            await fs.writeFile(path.join(root, 'assets/icons', `tray${scale === 1 ? '' : '@' + scale + 'x'}.png`), Buffer.from(png, 'base64'));
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
