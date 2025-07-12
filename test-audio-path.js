// Quick test to verify audio playback path
const audioPlayback = window.audioPlayback;

console.log('Audio Context State:', audioPlayback?.audioContext?.state);
console.log('Output Worklet:', audioPlayback?.outputWorklet);
console.log('Decoder:', audioPlayback?.decoder);

// Try to resume audio context if suspended
if (audioPlayback?.audioContext?.state === 'suspended') {
    console.log('Resuming audio context...');
    audioPlayback.audioContext.resume().then(() => {
        console.log('Audio context resumed!');
    });
}

// Check if worklet is receiving messages
if (audioPlayback?.outputWorklet) {
    console.log('✅ AudioWorklet exists');
    
    // Test if we can hear a simple tone through the same path
    const osc = audioPlayback.audioContext.createOscillator();
    osc.frequency.value = 440;
    osc.connect(audioPlayback.audioContext.destination);
    osc.start();
    setTimeout(() => {
        osc.stop();
        console.log('Test tone complete - did you hear it?');
    }, 500);
}