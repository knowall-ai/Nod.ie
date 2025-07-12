#!/usr/bin/env node

/**
 * Nod.ie Master Test Runner - Runs all test scripts
 * 
 * Run with: node tests/run-all-tests.js
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('╔════════════════════════════════════════╗');
console.log('║     NOD.IE MASTER TEST RUNNER          ║');
console.log('╚════════════════════════════════════════╝\n');

const testResults = [];
let totalTests = 0;
let passedTests = 0;

// Get all test files (excluding this one and HTML files)
function getTestFiles() {
    const testsDir = __dirname;
    const files = fs.readdirSync(testsDir);
    
    return files.filter(file => {
        return file.startsWith('test-') && 
               file.endsWith('.js') && 
               file !== 'test-results.json' &&
               !file.includes('.html');
    }).sort();
}

// Run a single test file
async function runTest(testFile) {
    totalTests++;
    const testName = testFile.replace('test-', '').replace('.js', '');
    
    console.log(`\n🧪 Running ${testName} test...`);
    console.log('─'.repeat(40));
    
    return new Promise((resolve) => {
        const testPath = path.join(__dirname, testFile);
        const startTime = Date.now();
        
        const child = spawn('node', [testPath], {
            stdio: 'pipe',
            env: { ...process.env, NO_COLOR: '1' }
        });
        
        let output = '';
        let errorOutput = '';
        
        child.stdout.on('data', (data) => {
            const text = data.toString();
            output += text;
            // Show key outputs
            if (text.includes('✅') || text.includes('❌') || text.includes('SUCCESS') || text.includes('FAIL')) {
                process.stdout.write(`  ${text.trim()}\n`);
            }
        });
        
        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        child.on('close', (code) => {
            const duration = Date.now() - startTime;
            const passed = code === 0;
            
            if (passed) {
                passedTests++;
                console.log(`  ✅ PASSED (${(duration/1000).toFixed(1)}s)`);
            } else {
                console.log(`  ❌ FAILED (${(duration/1000).toFixed(1)}s)`);
                if (errorOutput.trim()) {
                    console.log(`  Error: ${errorOutput.split('\n')[0]}`);
                }
            }
            
            testResults.push({
                test: testName,
                passed,
                duration,
                exitCode: code
            });
            
            resolve();
        });
        
        // Timeout after 60 seconds
        setTimeout(() => {
            if (child.exitCode === null) {
                console.log('  ⏱️ TIMEOUT (60s)');
                child.kill();
                // Force kill electron processes if test timed out
                exec('killall -9 electron 2>/dev/null || true', () => {});
            }
        }, 60000);
    });
}

// Check prerequisites
async function checkPrerequisites() {
    console.log('📋 Checking prerequisites...');
    
    // Clean up any existing electron processes first
    console.log('  🧹 Cleaning up existing processes...');
    await new Promise((resolve) => {
        exec('killall -9 electron 2>/dev/null || true', () => {
            setTimeout(resolve, 1000); // Wait a bit for processes to die
        });
    });
    
    const checks = [
        { name: 'Unmute Backend', cmd: 'curl -s http://localhost:8765/v1/health 2>/dev/null | grep -q "true"' },
        { name: 'Node.js', cmd: 'node --version' }
    ];
    
    let allGood = true;
    
    for (const check of checks) {
        try {
            await new Promise((resolve, reject) => {
                exec(check.cmd, (error) => error ? reject(error) : resolve());
            });
            console.log(`  ✅ ${check.name}`);
        } catch {
            console.log(`  ❌ ${check.name}`);
            allGood = false;
        }
    }
    
    if (!allGood) {
        console.log('\n⚠️  Some prerequisites are missing!');
        console.log('Make sure Unmute backend is running: docker-compose up -d');
        process.exit(1);
    }
}

// Main test runner
async function runAllTests() {
    const startTime = Date.now();
    
    // Check prerequisites
    await checkPrerequisites();
    
    // Get test files
    const testFiles = getTestFiles();
    console.log(`\n📦 Found ${testFiles.length} test files`);
    
    // Run tests sequentially to avoid conflicts
    for (const testFile of testFiles) {
        await runTest(testFile);
    }
    
    // Summary
    const totalDuration = Date.now() - startTime;
    
    console.log('\n');
    console.log('╔════════════════════════════════════════╗');
    console.log('║            TEST SUMMARY                ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`\n  Total Tests: ${totalTests}`);
    console.log(`  ✅ Passed: ${passedTests}`);
    console.log(`  ❌ Failed: ${totalTests - passedTests}`);
    console.log(`  ⏱️  Duration: ${(totalDuration/1000).toFixed(1)}s`);
    
    // Save results
    const resultsPath = path.join(__dirname, 'test-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        totalTests,
        passedTests,
        failedTests: totalTests - passedTests,
        duration: totalDuration,
        results: testResults
    }, null, 2));
    
    console.log(`\n📊 Results saved to: ${resultsPath}`);
    
    // Exit code based on results
    if (passedTests === totalTests) {
        console.log('\n🎉 All tests passed!');
        process.exit(0);
    } else {
        console.log('\n❌ Some tests failed');
        console.log('\nFailed tests:');
        testResults.filter(r => !r.passed).forEach(r => {
            console.log(`  - ${r.test}`);
        });
        process.exit(1);
    }
}

// Cleanup on exit
process.on('exit', () => {
    console.log('\n🧹 Cleaning up test processes...');
    // Kill any stray processes
    exec('pkill -f "electron.*nodie" 2>/dev/null || true', () => {});
    exec('killall -9 electron 2>/dev/null || true', () => {});
});

// Handle interrupts
process.on('SIGINT', () => {
    console.log('\n\n⚠️  Test run interrupted');
    process.exit(130);
});

// Run the tests
runAllTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});