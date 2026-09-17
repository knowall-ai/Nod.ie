// Quick script to check avatar status
const Store = require('electron-store');
const store = new Store();

console.log('Avatar Settings:');
console.log('- Enabled:', store.get('avatarEnabled', true));
console.log('- Selected avatar:', store.get('selectedAvatar', 'nodie-default.png'));

// Check if MuseTalk is accessible
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function checkMuseTalk() {
    try {
        const response = await fetch('http://localhost:8765/health');
        const config = await response.json();
        console.log('\nMuseTalk Status:');
        console.log('- Gradio version:', config.version);
        console.log('- Available: YES');
    } catch (error) {
        console.log('\nMuseTalk Status:');
        console.log('- Available: NO');
        console.log('- Error:', error.message);
    }
}

checkMuseTalk();