/**
 * Test current functionality
 */

console.log('🧪 Testing Nod.ie functionality...');

// Test window visibility
const windowInfo = {
    visible: true,
    location: window.location.href,
    title: document.title,
    readyState: document.readyState
};

console.log('Window info:', windowInfo);

// Test elements
const elements = {
    circle: !!document.getElementById('circle'),
    waveform: !!document.getElementById('waveform'),
    notification: !!document.getElementById('notification'),
    avatarVideo: !!document.getElementById('avatar-video'),
    avatarImage: !!document.getElementById('avatar-image')
};

console.log('Elements found:', elements);

// Test audio context
try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log('✅ AudioContext created, state:', audioContext.state);
    audioContext.close();
} catch (error) {
    console.error('❌ AudioContext failed:', error);
}

// Test microphone access
async function testMicrophone() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('✅ Microphone access granted');
        stream.getTracks().forEach(track => track.stop());
    } catch (error) {
        console.error('❌ Microphone access failed:', error);
    }
}

testMicrophone();

// Test WebSocket
try {
    const ws = new WebSocket('ws://localhost:8767/v1/realtime', ['realtime']);
    ws.onopen = () => {
        console.log('✅ WebSocket connection successful');
        ws.close();
    };
    ws.onerror = (error) => {
        console.error('❌ WebSocket connection failed:', error);
    };
} catch (error) {
    console.error('❌ WebSocket creation failed:', error);
}

console.log('🏁 Functionality test complete');