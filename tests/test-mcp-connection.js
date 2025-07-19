const WebSocket = require('ws');

async function testMCPConnection() {
    console.log('Testing connection to MCP backend...');
    console.log('Connecting to: ws://localhost:8766');
    
    const ws = new WebSocket('ws://localhost:8766');
    
    ws.on('open', () => {
        console.log('✅ Connected to MCP backend successfully');
        
        // Send a session update to test
        const message = {
            type: 'session.update',
            session: {
                modalities: ['audio'],
                instructions: 'You are Nod.ie, a helpful voice assistant with MCP capabilities.'
            }
        };
        
        console.log('Sending session.update message...');
        ws.send(JSON.stringify(message));
    });
    
    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        console.log('Received message:', msg.type);
        
        if (msg.type === 'session.updated') {
            console.log('✅ Session updated successfully');
            ws.close();
        }
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
    });
    
    ws.on('close', () => {
        console.log('Connection closed');
    });
}

testMCPConnection().catch(console.error);