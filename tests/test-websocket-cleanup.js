#!/usr/bin/env node

/**
 * Test WebSocket cleanup and connection management
 */

const WebSocket = require('ws');

console.log('🔌 Testing WebSocket Cleanup\n');

let connections = [];
let errors = 0;
let successes = 0;

// Test 1: Create and properly close a connection
async function testProperClose() {
    console.log('Test 1: Proper connection close');
    
    const ws = new WebSocket('ws://localhost:8765/v1/realtime', ['realtime']);
    
    return new Promise((resolve) => {
        ws.on('open', () => {
            console.log('  ✅ Connected');
            successes++;
            
            // Send session config
            ws.send(JSON.stringify({
                type: 'session.update',
                session: {
                    voice: 'nova',
                    instructions: {
                        type: 'constant',
                        text: 'Test connection'
                    }
                }
            }));
            
            // Close after 1 second
            setTimeout(() => {
                ws.close();
                console.log('  ✅ Closed properly');
                resolve();
            }, 1000);
        });
        
        ws.on('error', (err) => {
            console.log('  ❌ Error:', err.message);
            errors++;
            resolve();
        });
    });
}

// Test 2: Simulate improper close (no close() call)
async function testImproperClose() {
    console.log('\nTest 2: Improper connection close (no close() call)');
    
    const ws = new WebSocket('ws://localhost:8765/v1/realtime', ['realtime']);
    
    return new Promise((resolve) => {
        ws.on('open', () => {
            console.log('  ✅ Connected');
            // Just resolve without closing - simulating a crash
            resolve();
        });
        
        ws.on('error', (err) => {
            console.log('  ❌ Error:', err.message);
            errors++;
            resolve();
        });
    });
}

// Test 3: Multiple rapid connections
async function testRapidConnections() {
    console.log('\nTest 3: Multiple rapid connections');
    
    for (let i = 0; i < 3; i++) {
        const ws = new WebSocket('ws://localhost:8765/v1/realtime', ['realtime']);
        connections.push(ws);
        
        await new Promise((resolve) => {
            ws.on('open', () => {
                console.log(`  ✅ Connection ${i + 1} opened`);
                resolve();
            });
            
            ws.on('error', (err) => {
                console.log(`  ❌ Connection ${i + 1} error:`, err.message);
                errors++;
                resolve();
            });
            
            setTimeout(resolve, 100); // Timeout if no response
        });
    }
    
    // Now close them all
    console.log('  🔄 Closing all connections...');
    connections.forEach((ws, i) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.close();
            console.log(`  ✅ Connection ${i + 1} closed`);
        }
    });
    connections = [];
}

// Run all tests
async function runTests() {
    await testProperClose();
    await testImproperClose();
    await testRapidConnections();
    
    console.log('\n📊 Summary:');
    console.log(`  Successes: ${successes}`);
    console.log(`  Errors: ${errors}`);
    
    if (errors > 0) {
        console.log('\n❌ Some tests had errors');
        process.exit(1);
    } else {
        console.log('\n✅ All tests passed');
        process.exit(0);
    }
}

// Cleanup on exit
process.on('exit', () => {
    connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
    });
});

runTests();