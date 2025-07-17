#!/usr/bin/env node
/**
 * Comprehensive test suite for Nod.ie with MuseTalk integration
 */

const { spawn, exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const tests = [];
let passed = 0;
let failed = 0;

async function runTest(name, testFn) {
    process.stdout.write(`Testing ${name}... `);
    try {
        await testFn();
        console.log('✅ PASSED');
        passed++;
        return true;
    } catch (error) {
        console.log('❌ FAILED');
        console.error(`  Error: ${error.message}`);
        failed++;
        return false;
    }
}

async function testSuite() {
    console.log('🧪 Nod.ie Comprehensive Test Suite\n');
    console.log('====================================\n');

    // Test 1: Check if Nod.ie is running
    await runTest('Nod.ie Process', async () => {
        const { stdout } = await execPromise('ps aux | grep -i electron | grep -v grep | wc -l');
        const count = parseInt(stdout.trim());
        if (count < 5) throw new Error(`Expected at least 5 Electron processes, found ${count}`);
    });

    // Test 2: Check window dimensions
    await runTest('Window Size', async () => {
        const { stdout } = await execPromise('xwininfo -name "Nod.ie" 2>/dev/null | grep -E "Width|Height"');
        if (!stdout.includes('Width: 250') || !stdout.includes('Height: 250')) {
            throw new Error('Window is not 250x250 (expected size)');
        }
    });

    // Test 3: Check Unmute backend
    await runTest('Unmute Backend', async () => {
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        const backendPort = process.env.UNMUTE_BACKEND_PORT || 8000;
        const response = await fetch(`http://localhost:${backendPort}/`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.message) throw new Error('Invalid response from Unmute');
    });

    // Test 4: Check MuseTalk container
    await runTest('MuseTalk Container', async () => {
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        const musetalkPort = process.env.MUSETALK_PORT || 8766;
        const response = await fetch(`http://localhost:${musetalkPort}/health`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.status) throw new Error('Invalid response from MuseTalk');
    });

    // Test 5: Check avatar files
    await runTest('Avatar Video Files', async () => {
        const avatarDir = '/mnt/raid1/GitHub/Nod.ie/assets/avatars';
        const videos = ['nodie-video-01.mp4', 'nodie-video-02.mp4', 'nodie-video-03.mp4'];
        for (const video of videos) {
            await fs.access(`${avatarDir}/${video}`);
        }
    });

    // Test 6: Check configuration
    await runTest('Configuration Files', async () => {
        await fs.access('/mnt/raid1/GitHub/Nod.ie/.env');
        await fs.access('/mnt/raid1/GitHub/Nod.ie/CLAUDE.md');
        const env = await fs.readFile('/mnt/raid1/GitHub/Nod.ie/.env', 'utf8');
        const expectedUrl = process.env.UNMUTE_BACKEND_URL || 'ws://localhost:8000';
        if (!env.includes(`UNMUTE_BACKEND_URL=${expectedUrl}`)) {
            throw new Error('Incorrect Unmute backend URL in .env');
        }
    });

    // Test 7: Test MuseTalk client initialization
    await runTest('MuseTalk Client Module', async () => {
        const MuseTalkClient = require('/mnt/raid1/GitHub/Nod.ie/modules/musetalk-client');
        const client = new MuseTalkClient();
        const initialized = await client.initialize();
        if (!initialized) throw new Error('MuseTalk client failed to initialize');
        client.cleanup();
    });

    // Test 8: Test audio playback module
    await runTest('Audio Playback Module', async () => {
        const AudioPlayback = require('/mnt/raid1/GitHub/Nod.ie/modules/audio-playback');
        const playback = new AudioPlayback();
        // Just check it can be created without crashing
        if (!playback) throw new Error('Failed to create AudioPlayback instance');
    });

    // Test 9: Test avatar manager
    await runTest('Avatar Manager Module', async () => {
        const AvatarManager = require('/mnt/raid1/GitHub/Nod.ie/modules/avatar-manager');
        const manager = new AvatarManager();
        if (!manager.isEnabled()) throw new Error('Avatar should be enabled by default');
    });

    // Test 10: Check for console errors in Nod.ie output
    await runTest('No Critical Errors in Console', async () => {
        const logs = await fs.readFile('/tmp/nodie-output.log', 'utf8').catch(() => '');
        if (logs.includes('FATAL') || logs.includes('Segmentation fault') || logs.includes('crash')) {
            throw new Error('Critical errors found in console output');
        }
    });

    // Test 11: Simulate audio processing (without actual audio)
    await runTest('Audio Processing Pipeline', async () => {
        const MuseTalkClient = require('/mnt/raid1/GitHub/Nod.ie/modules/musetalk-client');
        const client = new MuseTalkClient();
        await client.initialize();
        
        // Test processing a dummy audio frame
        const dummyAudio = Buffer.from([1, 2, 3, 4, 5]);
        await client.processAudioFrame(dummyAudio, Date.now());
        
        // Should not crash
        client.cleanup();
    });

    // Test 12: Check Docker containers
    await runTest('Required Docker Containers', async () => {
        const { stdout } = await execPromise('docker ps --format "{{.Names}}"');
        const containers = stdout.trim().split('\n');
        
        // Check for MuseTalk container
        if (!containers.some(c => c.includes('musetalk'))) {
            throw new Error('MuseTalk container not running');
        }
        
        // Check for at least one Unmute container
        if (!containers.some(c => c.includes('unmute'))) {
            throw new Error('No Unmute containers running');
        }
    });

    console.log('\n====================================');
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

    if (failed === 0) {
        console.log('✅ All tests passed! Nod.ie is working correctly.');
    } else {
        console.log('❌ Some tests failed. Please check the errors above.');
    }

    // Keep Nod.ie running for manual testing
    console.log('\n💡 Nod.ie is still running. You can:');
    console.log('   1. Click the avatar circle to unmute (turns green)');
    console.log('   2. Speak to test voice interaction');
    console.log('   3. Watch for lip-sync animation');
    console.log('   4. Press Ctrl+C to stop all processes\n');
}

// Run the test suite
testSuite().catch(console.error);

// Keep process alive
process.stdin.resume();