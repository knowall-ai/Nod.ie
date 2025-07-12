#!/usr/bin/env node

/**
 * Run only non-Electron tests (faster, no GUI required)
 */

const { spawn, exec } = require('child_process');
const path = require('path');

console.log('🚀 Running Non-Electron Tests\n');

// Tests that don't require Electron
const nonElectronTests = [
    'test-audio-fix.js',
    'test-audio-flow-analysis.js', 
    'test-websocket-cleanup.js',
    'test-unmute-direct.js',
    'test-questions-audible.js',
    'test-unmute-audio-format.js',
    'test-voice-response.js'
];

let passed = 0;
let failed = 0;

async function runTest(testFile) {
    console.log(`\n🧪 Running ${testFile}...`);
    console.log('─'.repeat(40));
    
    return new Promise((resolve) => {
        const child = spawn('node', [path.join(__dirname, testFile)], {
            stdio: 'inherit'
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                passed++;
                console.log(`✅ PASSED\n`);
            } else {
                failed++;
                console.log(`❌ FAILED (exit code: ${code})\n`);
            }
            resolve();
        });
        
        // Timeout after 30 seconds
        setTimeout(() => {
            if (child.exitCode === null) {
                console.log('⏱️ TIMEOUT');
                child.kill();
                failed++;
                resolve();
            }
        }, 30000);
    });
}

async function runAll() {
    // Check prerequisites
    console.log('📋 Checking prerequisites...');
    try {
        await new Promise((resolve, reject) => {
            exec('curl -s http://localhost:8765/v1/health | grep -q "true"', (error) => {
                error ? reject(error) : resolve();
            });
        });
        console.log('✅ Unmute backend is running\n');
    } catch {
        console.log('❌ Unmute backend not running!');
        console.log('Start it with: cd ../unmute && docker compose up -d\n');
        process.exit(1);
    }
    
    // Run tests
    for (const test of nonElectronTests) {
        await runTest(test);
    }
    
    // Summary
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║            TEST SUMMARY                ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`\n  Total Tests: ${nonElectronTests.length}`);
    console.log(`  ✅ Passed: ${passed}`);
    console.log(`  ❌ Failed: ${failed}`);
    
    if (failed === 0) {
        console.log('\n🎉 All non-Electron tests passed!');
        process.exit(0);
    } else {
        console.log('\n❌ Some tests failed');
        process.exit(1);
    }
}

runAll().catch(console.error);