"""Exercise the generated protocol and receive-path curiosity gate with synthetic state."""
import ast, asyncio, importlib.util, sys, types
from pathlib import Path
from datetime import datetime, timezone
root=Path(__file__).resolve().parents[1]/'unmute-service'
sys.path.insert(0,str(root))
from curiosity_context import CuriosityState
spec=importlib.util.spec_from_file_location('nodie_test_protocol',root/'generated/openai_realtime_api_events.py')
ora=importlib.util.module_from_spec(spec);sys.modules[spec.name]=ora;spec.loader.exec_module(ora)
event=dict(token='a'*36,key='held-object:cup',type='held-object',kind='cup',appearance='blue',capturedAt=datetime.now(timezone.utc).isoformat(),recentlyRaised=[])
parsed=ora.SessionConfig(allow_recording=False,curiosity_allowed=True,curiosity_event=event)
assert parsed.curiosity_event.kind=='cup'
assert isinstance(ora.NodieCuriosityStarted(token='a'*36,key='held-object:cup'),ora.BaseEvent)
assert ora.NodieCuriosityStarted(token='a'*36,key='held-object:cup').model_dump()['type']=='nodie.curiosity_started'
from pydantic import ValidationError
for change in [dict(type='command'),dict(appearance='x'*101),dict(recentlyRaised=['x']*6),dict(extra='unsafe')]:
 try:ora.CuriosityEvent(**(event|change))
 except ValidationError:pass
 else:raise AssertionError('invalid event accepted')
tree=ast.parse((root/'generated/unmute_handler.py').read_text())
gate=next(n for n in ast.walk(tree) if isinstance(n,ast.If) and "hasattr(self, '_curiosity') and len" in ast.unparse(n.test))
method=ast.parse('async def receive_gate(self, stt, sr):\n    pass').body[0];method.body=[gate];ast.fix_missing_locations(method)
ns={'ora':ora};exec(compile(ast.Module(body=[method],type_ignores=[]),'actual-receive-gate','exec'),ns)
async def check():
 state=CuriosityState();scene=dict(status='snapshot',capturedAt=event['capturedAt'],imageJpeg='/9hh/9k=');state.update(True,event,scene)
 history=[dict(role='system',content='Policy'),dict(role='assistant',content='Previous reply'),dict(role='user',content='')]
 count=0
 async def generate(*,curiosity=None):
  nonlocal count
  assert curiosity["event"]==event
  count+=1
 h=types.SimpleNamespace(_curiosity=state,chatbot=types.SimpleNamespace(chat_history=history,conversation_state=lambda:'waiting_for_user'),audio_received_sec=lambda:100,waiting_for_user_start_time=50,stt_last_message_time=50,output_queue=asyncio.Queue(),_generate_response=generate)
 stt=types.SimpleNamespace(pause_prediction=types.SimpleNamespace(value=0.2),sent_samples=2400000)
 await ns['receive_gate'](h,stt,24000);assert count==0
 stt.pause_prediction.value=.9
 await ns['receive_gate'](h,stt,24000);assert count==1 and h.output_queue.qsize()==1
 await ns['receive_gate'](h,stt,24000);assert count==1
 assert len(history)==3 and history[-1]['content']==''
asyncio.run(check())
print('Actual generated curiosity schema, native output event, quiet gate and single-use delivery: PASS')
