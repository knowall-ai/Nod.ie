#!/usr/bin/env node

/**
 * Test voice conversation functionality
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🎤 Testing voice conversation...');
console.log('This will:');
console.log('1. Open the web test page');
console.log('2. Look for voice input/output logs');
console.log('3. Check if responses are being generated');
console.log('');

// Start the test
const testProcess = spawn('node', [path.join(__dirname, 'tests/test-playwright-avatar.js')], {
    stdio: 'inherit'
});

testProcess.on('close', (code) => {
    console.log('\n' + '='.repeat(50));
    console.log('Voice conversation test completed with code:', code);
    console.log('');
    console.log('🔍 If you see "You said:" logs but no audio playback:');
    console.log('   - The issue is likely with audio decoder in web version');
    console.log('   - Check browser console for decoder worker errors');
    console.log('   - Test with Electron version: npm start');
    console.log('');
    console.log('💡 To debug further:');
    console.log('   1. Open: http://localhost:8095/tests/test-web.html');
    console.log('   2. Open DevTools console');
    console.log('   3. Speak and watch for logs');
    console.log('   4. Look for "🔊 Received audio response" logs');
});