#!/usr/bin/env node
/**
 * Test MuseTalk integration with Nod.ie
 */

const config = require('../config');

async function testMuseTalkAPI() {
    console.log('🔗 Testing MuseTalk API integration...');
    console.log('API URL:', config.MUSETALK_HTTP);
    
    try {
        // Test health endpoint
        console.log('\n1. Testing health endpoint...');
        const healthResponse = await fetch(`${config.MUSETALK_HTTP}/health`);
        const healthData = await healthResponse.json();
        console.log('✅ Health check:', healthData);
        
        // Test status endpoint
        console.log('\n2. Testing status endpoint...');
        const statusResponse = await fetch(`${config.MUSETALK_HTTP}/status`);
        const statusData = await statusResponse.json();
        console.log('✅ Status check:', statusData);
        
        // Test generate endpoint (placeholder)
        console.log('\n3. Testing generate endpoint...');
        const generateResponse = await fetch(`${config.MUSETALK_HTTP}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: "Hello, this is a test!",
                avatar: "test"
            })
        });
        const generateData = await generateResponse.json();
        console.log('✅ Generate test:', generateData);
        
        console.log('\n🎉 MuseTalk API integration test completed successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ MuseTalk API test failed:', error.message);
        return false;
    }
}

// Run the test
testMuseTalkAPI().then(success => {
    process.exit(success ? 0 : 1);
});