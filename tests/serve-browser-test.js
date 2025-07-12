#!/usr/bin/env node

/**
 * Serve the browser test and capture logs
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8090;

console.log('🌐 Starting test server...\n');

// Create server
const server = http.createServer((req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    
    // Serve the test HTML
    if (req.url === '/' || req.url === '/browser-test.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync(path.join(__dirname, 'browser-test.html')));
    }
    // Serve JS files
    else if (req.url.endsWith('.js')) {
        const filePath = path.join(__dirname, '..', req.url);
        if (fs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
            res.end(fs.readFileSync(filePath));
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
    }
    // Get backend logs
    else if (req.url === '/api/backend-logs') {
        exec('docker logs unmute-backend --tail 50 2>&1', (err, stdout) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(stdout || 'No logs');
        });
    }
    else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`✅ Test server running at http://localhost:${PORT}`);
    console.log(`📋 Open http://localhost:${PORT} in your browser`);
    console.log(`🔍 Also open http://localhost:3000 (Unmute) in another tab for comparison\n`);
    console.log('Press Ctrl+C to stop\n');
});

// Monitor backend logs
console.log('📊 Monitoring backend logs...\n');
setInterval(() => {
    exec('docker logs unmute-backend --tail 5 2>&1 | grep -E "(WebSocket|audio|ERROR)"', (err, stdout) => {
        if (stdout.trim()) {
            console.log(`[BACKEND] ${stdout.trim()}`);
        }
    });
}, 2000);