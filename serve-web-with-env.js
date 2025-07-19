/**
 * Web server that injects .env configuration into test pages
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const PORT = config.WEB_TEST_PORT || process.env.WEB_TEST_PORT || 8095;

const server = http.createServer((req, res) => {
    const filePath = path.join(__dirname, req.url === '/' ? 'tests/test-web.html' : req.url);
    
    if (filePath.endsWith('.html')) {
        // Inject configuration for HTML files
        fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            
            // Inject ENV_CONFIG before other scripts
            const envScript = `
<script>
window.ENV_CONFIG = ${JSON.stringify(config)};
</script>
`;
            const modifiedContent = content.replace('<script>', envScript + '<script>');
            
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(modifiedContent);
        });
    } else {
        // Serve other files normally
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.mp4': 'video/mp4'
        };
        
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            res.end(content);
        });
    }
});

server.listen(PORT, () => {
    console.log(`Web server with .env configuration running at http://localhost:${PORT}/`);
    console.log(`Test page: http://localhost:${PORT}/tests/test-web.html`);
});