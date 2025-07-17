#!/usr/bin/env node

/**
 * Check if all required services are running
 */

const { exec } = require('child_process');
const config = require('../config');

console.log('🔍 Checking all required services...\n');

const services = [
    {
        name: 'Unmute Backend',
        url: `http://localhost:${config.UNMUTE_BACKEND_PORT}`,
        test: (url) => `curl -s ${url}/health | grep -q "healthy" || curl -s ${url}/ | grep -q "message"`
    },
    {
        name: 'Unmute STT',
        url: 'internal:8080',
        test: (url) => `docker exec unmute-stt curl -s http://localhost:8080/health | grep -q "healthy"`
    },
    {
        name: 'Unmute TTS', 
        url: 'internal:8080',
        test: (url) => `docker exec unmute-tts curl -s http://localhost:8080/health | grep -q "healthy"`
    },
    {
        name: 'MuseTalk',
        url: `http://localhost:${config.MUSETALK_PORT}`,
        test: (url) => `curl -s ${url}/ | grep -q "MuseTalk"`
    },
    {
        name: 'Unmute Frontend',
        url: `http://localhost:${config.UNMUTE_FRONTEND_PORT || '3000'}`,
        test: (url) => `curl -s ${url}/ | grep -q "Unmute"`
    }
];

let allHealthy = true;

async function checkService(service) {
    return new Promise((resolve) => {
        exec(service.test(service.url), (error, stdout, stderr) => {
            const isHealthy = !error;
            const status = isHealthy ? '✅ HEALTHY' : '❌ DOWN';
            console.log(`${service.name}: ${status}`);
            if (!isHealthy) {
                console.log(`   URL: ${service.url}`);
                if (stderr) console.log(`   Error: ${stderr.trim()}`);
                allHealthy = false;
            }
            resolve(isHealthy);
        });
    });
}

async function checkAll() {
    for (const service of services) {
        await checkService(service);
    }
    
    console.log('\n' + '='.repeat(50));
    if (allHealthy) {
        console.log('🎉 All services are healthy!');
        console.log('\nYou can now test:');
        console.log('• Web version: http://localhost:8095/tests/test-web.html');
        console.log('• Electron app: npm start');
        process.exit(0);
    } else {
        console.log('❌ Some services are not running');
        console.log('\nTo start services: cd /mnt/raid1/GitHub/black-panther/ai-stack && docker compose up -d');
        process.exit(1);
    }
}

checkAll().catch(console.error);