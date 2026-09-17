/**
 * Test suite for avatar functionality
 * Tests avatar display, MuseTalk integration, and performance
 */

const { test } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Helper to start Electron app
async function startElectronApp() {
  const electronPath = require('electron');
  const appPath = path.join(__dirname, '..');
  
  return spawn(electronPath, [appPath], {
    env: { ...process.env, NODE_ENV: 'test' }
  });
}

// Helper to check if MuseTalk is running
async function checkMuseTalkHealth() {
  try {
    const response = await fetch('http://localhost:8767/health');
    const data = await response.json();
    return data.status === 'healthy';
  } catch (error) {
    return false;
  }
}

test.describe('Avatar Feature Tests', () => {
  let electronApp;
  
  test.beforeAll(async () => {
    console.log('Starting Electron app for avatar tests...');
  });
  
  test.afterAll(async () => {
    if (electronApp) {
      electronApp.kill();
    }
  });
  
  test('Avatar container should be present in UI', async ({ page }) => {
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    
    // Check avatar elements exist
    const avatarContainer = await page.$('#avatar-container');
    const avatarImage = await page.$('#avatar-image');
    const avatarVideo = await page.$('#avatar-video');
    
    test.expect(avatarContainer).not.toBeNull();
    test.expect(avatarImage).not.toBeNull();
    test.expect(avatarVideo).not.toBeNull();
  });
  
  test('Window size should be 250x250', async ({ page }) => {
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    
    const circle = await page.$('#circle');
    const box = await circle.boundingBox();
    
    test.expect(box.width).toBe(230); // 250 - 20 (margins)
    test.expect(box.height).toBe(230);
  });
  
  test('Avatar should toggle with settings', async ({ page }) => {
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    
    // Initially should have avatar-active class if enabled
    const circle = await page.$('#circle');
    let classList = await circle.evaluate(el => Array.from(el.classList));
    
    // Simulate avatar disabled
    await page.evaluate(() => {
      const event = new CustomEvent('avatar-setting-changed', { detail: false });
      window.dispatchEvent(event);
    });
    
    classList = await circle.evaluate(el => Array.from(el.classList));
    test.expect(classList).not.toContain('avatar-active');
    
    // Simulate avatar enabled
    await page.evaluate(() => {
      const event = new CustomEvent('avatar-setting-changed', { detail: true });
      window.dispatchEvent(event);
    });
    
    classList = await circle.evaluate(el => Array.from(el.classList));
    test.expect(classList).toContain('avatar-active');
  });
  
  test('MuseTalk client should handle unavailable service gracefully', async () => {
    const MuseTalkClient = require('../modules/musetalk-client');
    const client = new MuseTalkClient();
    
    // Should fallback to static when service is down
    const initialized = await client.initialize();
    
    if (!await checkMuseTalkHealth()) {
      test.expect(initialized).toBe(false);
      test.expect(client.fallbackToStatic).toBe(true);
      test.expect(client.isAvailable()).toBe(false);
    }
  });
  
  test('Audio playback should work with avatar disabled', async () => {
    const AudioPlayback = require('../modules/audio-playback');
    const playback = new AudioPlayback();
    
    // Disable avatar
    playback.setAvatarEnabled(false);
    
    // Initialize should succeed
    await playback.initialize();
    test.expect(playback.isInitialized).toBe(true);
    test.expect(playback.avatarEnabled).toBe(false);
    test.expect(playback.musetalkClient).toBeNull();
    
    // Audio processing should work
    const testOpusData = new Uint8Array([0x4f, 0x67, 0x67, 0x53]); // OGG header
    await playback.processAudioDelta(testOpusData);
    
    // Cleanup
    await playback.cleanup();
  });
  
  test('Frame synchronization should maintain low latency', async () => {
    const MuseTalkClient = require('../modules/musetalk-client');
    const client = new MuseTalkClient();
    
    // Mock frame processing
    let frameCount = 0;
    let totalLatency = 0;
    
    client.setFrameCallback((frame) => {
      frameCount++;
      const latency = Date.now() - frame.timestamp;
      totalLatency += latency;
    });
    
    // Simulate audio frames
    const startTime = Date.now();
    for (let i = 0; i < 10; i++) {
      const audioData = new Uint8Array(100);
      await client.processAudioFrame(audioData, Date.now());
      await new Promise(resolve => setTimeout(resolve, 33)); // ~30fps
    }
    
    // Check performance
    if (frameCount > 0) {
      const avgLatency = totalLatency / frameCount;
      console.log(`Average frame latency: ${avgLatency}ms`);
      test.expect(avgLatency).toBeLessThan(100); // Should be under 100ms
    }
  });
  
  test('Settings dialog should save avatar preferences', async ({ page }) => {
    await page.goto('file://' + path.join(__dirname, '..', 'settings.html'));
    
    // Find avatar toggle
    const avatarToggle = await page.$('#avatarEnabled');
    test.expect(avatarToggle).not.toBeNull();
    
    // Toggle avatar setting
    await avatarToggle.click();
    
    // Save settings
    await page.evaluate(() => {
      window.saveSettings();
    });
    
    // Check if setting was saved
    const Store = require('electron-store');
    const store = new Store();
    const savedValue = store.get('avatarEnabled');
    test.expect(typeof savedValue).toBe('boolean');
  });
  
  test('Avatar image should be circular', async ({ page }) => {
    await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
    
    const circle = await page.$('#circle');
    const borderRadius = await circle.evaluate(el => 
      window.getComputedStyle(el).borderRadius
    );
    
    test.expect(borderRadius).toBe('50%');
    
    // Check overflow hidden for circular mask
    const overflow = await circle.evaluate(el => 
      window.getComputedStyle(el).overflow
    );
    test.expect(overflow).toBe('hidden');
  });
});

// Performance test for audio latency
test.describe('Audio Latency Tests', () => {
  test('Audio playback latency with avatar enabled', async () => {
    const AudioPlayback = require('../modules/audio-playback');
    const playback = new AudioPlayback();
    
    // Enable avatar
    playback.setAvatarEnabled(true);
    await playback.initialize();
    
    // Measure latency
    const iterations = 100;
    const latencies = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      const testData = new Uint8Array(256);
      
      await playback.processAudioDelta(testData);
      
      const endTime = performance.now();
      latencies.push(endTime - startTime);
    }
    
    // Calculate statistics
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);
    const minLatency = Math.min(...latencies);
    
    console.log('Audio Latency Statistics (with avatar):');
    console.log(`  Average: ${avgLatency.toFixed(2)}ms`);
    console.log(`  Min: ${minLatency.toFixed(2)}ms`);
    console.log(`  Max: ${maxLatency.toFixed(2)}ms`);
    
    // Should maintain low latency
    test.expect(avgLatency).toBeLessThan(10); // Target under 10ms average
    test.expect(maxLatency).toBeLessThan(50); // No spikes over 50ms
    
    await playback.cleanup();
  });
  
  test('Compare latency with avatar disabled', async () => {
    const AudioPlayback = require('../modules/audio-playback');
    const playback = new AudioPlayback();
    
    // Disable avatar
    playback.setAvatarEnabled(false);
    await playback.initialize();
    
    // Measure latency
    const iterations = 100;
    const latencies = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      const testData = new Uint8Array(256);
      
      await playback.processAudioDelta(testData);
      
      const endTime = performance.now();
      latencies.push(endTime - startTime);
    }
    
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    
    console.log('Audio Latency Statistics (without avatar):');
    console.log(`  Average: ${avgLatency.toFixed(2)}ms`);
    
    // Should be similar or better than with avatar
    test.expect(avgLatency).toBeLessThan(10);
    
    await playback.cleanup();
  });
});

// Run tests
if (require.main === module) {
  console.log('Running avatar tests...');
  console.log('Make sure Electron app is not running before tests');
}