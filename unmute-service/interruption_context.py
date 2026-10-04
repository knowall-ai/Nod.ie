"""Ephemeral interruption facts, separate from speech and saved transcripts."""
import json
import time


class InterruptionContext:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.target = None
        self.at = 0
        self.had_text = False

    def capture(self, history):
        # The caller captures before appending the upstream interruption marker.
        self.target = None
        if not history or history[-1].get('role') != 'assistant':
            return
        self.target = history[-1]
        self.at = self.clock()
        text = self.target.get('content', '')
        self.had_text = isinstance(text, str) and bool(text.strip())

    def messages(self, messages, history):
        if self.target is None:
            return messages
        age = self.clock() - self.at
        if not 0 <= age <= 120 or not any(m is self.target for m in history):
            self.target = None
            return messages
        # An empty placeholder for the response being generated is not a later
        # reply. Any later assistant text supersedes the interrupted response.
        target_index = next(i for i, m in enumerate(history) if m is self.target)
        for message in history[target_index + 1:]:
            if message.get('role') == 'assistant' and message.get('content', '').strip():
                self.target = None
                return messages
        if not messages or messages[0].get('role') != 'system':
            return messages
        facts = {'last_assistant_response': 'interrupted',
                 'generated_text_before_interruption': self.had_text,
                 'intended_continuation': 'not_recorded',
                 'physical_playback': 'not_verified'}
        result = [dict(m) for m in messages]
        result[0]['content'] += ('\nResponse delivery facts: ' + json.dumps(facts) +
            '\nUse the assistant-role text as the record of that response. Its intended '
            'continuation is unknown; later user speech does not supply it. '
            'Do not invent why that response stopped or what was planned next.')
        return result
