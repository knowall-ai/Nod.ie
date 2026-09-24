#!/usr/bin/env python3
"""Patch only supported generated handler anchors; fail on upstream changes."""
import ast
from pathlib import Path
root = Path(__file__).resolve().parent / 'generated'
events = (root / 'openai_realtime_api_events.py').read_text()
model = '''class CuriosityEvent(BaseModel):
    model_config = {"extra": "forbid"}
    token: str = Field(min_length=36, max_length=36)
    key: str = Field(min_length=1, max_length=100)
    type: Literal["people", "animal", "held-object"]
    kind: str = Field(min_length=1, max_length=40)
    appearance: str = Field(max_length=100)
    count: int | None = Field(default=None, ge=0, le=8)
    capturedAt: str = Field(max_length=40)
    recentlyRaised: list[str] = Field(default_factory=list, max_length=5)

class NodieCuriosityStarted(BaseEvent[Literal["nodie.curiosity_started"]]):
    token: str
    key: str

'''
assert events.count('class SessionConfig(BaseModel):') == 1
events = events.replace('class SessionConfig(BaseModel):', model + 'class SessionConfig(BaseModel):\n    curiosity_event: CuriosityEvent | None = None\n    curiosity_scene: SceneData | None = None\n    curiosity_allowed: bool | None = None')
assert events.count('ServerEvent = Union[') == 1
events = events.replace('ServerEvent = Union[', 'ServerEvent = Union[\n    NodieCuriosityStarted,')
ast.parse(events)
(root / 'openai_realtime_api_events.py').write_text(events)
tree = ast.parse((root / 'unmute_handler.py').read_text())
cls = next(c for c in tree.body if isinstance(c, ast.ClassDef) and c.name == 'UnmuteHandler')
def method(name):
    return next(n for n in cls.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
method('__init__').body[:0] = ast.parse('from unmute.curiosity_context import CuriosityState\nself._curiosity = CuriosityState()').body
method('update_session').body += ast.parse('''
if hasattr(self, '_curiosity'):
    if session.curiosity_scene and session.curiosity_scene.status == 'snapshot': self._scene_tools_blocked = True
    if session.scene_data and session.scene_data.status == 'camera-off': self._curiosity.update(False,None,None)
    self._curiosity.update(session.curiosity_allowed, session.curiosity_event.model_dump(exclude_none=True) if session.curiosity_event else None, session.curiosity_scene.model_dump(exclude_none=True) if session.curiosity_scene else None)
''').body
receive = method('receive')
anchors = [n for n in ast.walk(receive) if isinstance(n, ast.If) and ast.unparse(n.test) == 'self.stt_end_of_flush_time is None']
assert len(anchors) == 1
anchors[0].body[1:1] = ast.parse('''
if hasattr(self, '_curiosity') and len(self.chatbot.chat_history) > 2:
    packet = self._curiosity.take(waiting=self.chatbot.conversation_state() == 'waiting_for_user', quiet=self.audio_received_sec()-self.waiting_for_user_start_time >= 20, paused=stt.pause_prediction.value > 0.6, words_quiet=stt.sent_samples/sr-self.stt_last_message_time >= 20)
    if packet:
        event=packet['event']
        await self.output_queue.put(ora.NodieCuriosityStarted(token=event['token'], key=event['key']))
        await self._generate_response(curiosity=packet)
        return
''').body
response = method('_generate_response_task')
for m in [method('_generate_response'),response]:
    m.args.kwonlyargs.append(ast.arg(arg='curiosity'))
    m.args.kw_defaults.append(ast.Constant(value=None))
partials=[n for n in ast.walk(method('_generate_response')) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='partial' and n.args and ast.unparse(n.args[0])=='self._generate_response_task']
assert len(partials)==1
partials[0].keywords.append(ast.keyword(arg='curiosity',value=ast.Name(id='curiosity',ctx=ast.Load())))
# Append after the standard camera insertion, retaining the exact originating image.
anchors = [i for i, n in enumerate(response.body) if isinstance(n, ast.If) and ast.unparse(n.test) == 'self._scene_data is not None']
assert len(anchors) == 1
response.body[anchors[0]+1:anchors[0]+1] = ast.parse('''
if curiosity:
    from unmute.curiosity_context import curiosity_messages
    messages = curiosity_messages(messages, curiosity)
''').body
# Avoid two camera images when the current scene changed while an event was queued.
response.body[anchors[0]].test = ast.parse('self._scene_data is not None and not curiosity', mode='eval').body
ast.fix_missing_locations(tree)
(root / 'unmute_handler.py').write_text(ast.unparse(tree) + '\n')
print('Prepared bounded curiosity turns.')
