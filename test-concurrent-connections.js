#!/usr/bin/env node

const WebSocket = require('ws');
const config = require('./config');

// Test concurrent WebSocket connections to unmute backend
async function testConcurrentConnections() {
    const connections = [];
    const numConnections = 4; // Test with 4 concurrent connections
    
    console.log(`Testing ${numConnections} concurrent connections to unmute backend...`);
    
    // Create multiple connections
    for (let i = 0; i < numConnections; i++) {
        try {
            const ws = new WebSocket(config.UNMUTE_BACKEND_URL);
            
            ws.on('open', () => {
                console.log(`Connection ${i + 1} opened successfully`);
                
                // Send session.update to establish connection
                ws.send(JSON.stringify({
                    type: 'session.update',
                    session: {
                        model: 'llama3.2:3b',
                        voice: 'unmute-prod-website/ex04_narration_longform_00001.wav',
                        instructions: {
                            type: 'constant',
                            text: `Test connection ${i + 1}`
                        },
                        allow_recording: false
                    }
                }));
            });
            
            ws.on('message', (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'error' && msg.error?.message?.includes('Too many people')) {
                    console.error(`Connection ${i + 1} FAILED: Too many people connected`);
                } else if (msg.type === 'session.updated') {
                    console.log(`Connection ${i + 1} session updated successfully`);
                }
            });
            
            ws.on('error', (err) => {
                console.error(`Connection ${i + 1} error:`, err.message);
            });
            
            connections.push(ws);
            
            // Small delay between connections
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (err) {
            console.error(`Failed to create connection ${i + 1}:`, err.message);
        }
    }
    
    // Keep connections open for 5 seconds
    console.log('\nKeeping connections open for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Close all connections
    console.log('\nClosing all connections...');
    connections.forEach((ws, index) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.close();
            console.log(`Connection ${index + 1} closed`);
        }
    });
    
    console.log('\nTest complete!');
}

testConcurrentConnections().catch(console.error);