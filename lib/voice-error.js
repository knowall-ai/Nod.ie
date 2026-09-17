const messages = {
    history: 'Saved conversation history is unavailable. Check diagnostics or clear it in Settings.',
    'no-speech': 'No speech detected. Please try again.',
    transcription: 'Transcription failed. Check the speech recognition service and try again.',
    model: 'The language model did not respond. Check Ollama and try again.',
    speech: 'Speech synthesis failed. Check the voice service and try again.',
    cancelled: 'Voice turn cancelled.',
    unknown: 'Voice request failed. Check Nod.ie diagnostics and try again.'
};
class VoiceError extends Error { constructor(code, status = 502) { super(messages[code] || messages.unknown); this.code = code; this.status = status; } }
function publicError(error) { return error instanceof VoiceError ? { error: error.message, code: error.code, status: error.status } : { error: messages.unknown, code: 'unknown', status: 502 }; }
module.exports = { VoiceError, publicError };
