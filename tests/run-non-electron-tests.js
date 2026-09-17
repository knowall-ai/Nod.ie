#!/usr/bin/env node

/**
 * Run only non-Electron tests (faster, no GUI required)
 */

const { spawn, exec } = require('child_process');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

console.log('🚀 Running Non-Electron Tests\n');

// Tests that don't require Electron
const nonElectronTests = [
    'test-complete.js',
    'test-final.js',
    'test-functionality.js',
    'check-avatar-status.js',
    'check-musetalk-api.js',
    'test-musetalk-integration.js'
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
        const backendPort = process.env.UNMUTE_BACKEND_PORT || 8000;
        await new Promise((resolve, reject) => {
            exec(`curl -s http://localhost:${backendPort}/ | grep -q "message"`, (error) => {
                error ? reject(error) : resolve();
            });
        });
        console.log('✅ Unmute backend is running\n');
    } catch {
        console.log('❌ Unmute backend not running!');
        console.log('Start it with: cd /mnt/raid1/GitHub/black-panther/ai-stack && docker compose up -d\n');
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