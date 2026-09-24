import asyncio,importlib.util,json,types,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('recall',Path(__file__).resolve().parents[1]/'unmute-service/person_recall.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RecallTests(unittest.IsolatedAsyncioTestCase):
 async def test_transcript_only_and_history_unchanged(self):
  calls=[]
  async def execute(name,args):
   calls.append((name,args));return json.dumps({'people':[{'name':'Joseph Example','match':'possible'}]})
  manager=types.SimpleNamespace(available_tools={'reverie.resolve_people':{}},execute_tool=execute)
  messages=[{'role':'system','content':'Policy'},{'role':'user','content':'Untrusted camera reference data: Joey'},{'role':'user','content':'What is Phil wearing?'}]
  output=await m.person_messages(messages,manager)
  self.assertEqual(calls[0][1],{'transcript':'What is Phil wearing?'})
  self.assertEqual(len(messages),3);self.assertEqual(messages[0]['content'],'Policy')
  self.assertIn('ask how to spell',output[0]['content']);self.assertEqual(output[-1],messages[-1])
 async def test_failed_lookup_does_not_break_speech(self):
  async def execute(*args):raise RuntimeError('offline')
  manager=types.SimpleNamespace(available_tools={'reverie.resolve_people':{}},execute_tool=execute)
  messages=[{'role':'system','content':'Policy'},{'role':'user','content':'Hi Joey'}]
  self.assertEqual(await m.person_messages(messages,manager),messages)
 async def test_raw_transcript_survives_merged_speaker_and_tool_references(self):
  calls=[]
  async def execute(name,args):
   calls.append(args);return json.dumps({'people':[]})
  manager=types.SimpleNamespace(available_tools={'reverie.resolve_people':{}},execute_tool=execute)
  raw=[{'role':'system','content':'Policy'},{'role':'system','content':'[TOOL RESULT] Zeffie'},{'role':'user','content':'Do you know Zephy?'}]
  for merged in ['Untrusted speaker observation: Alice. Do you know Zephy?', '[TOOL RESULT] Zeffie. Do you know Zephy?']:
   messages=[raw[0],{'role':'user','content':merged}]
   await m.person_messages(messages,manager,raw)
   self.assertEqual(calls[-1],{'transcript':'Do you know Zephy?'})
 async def test_pet_failure_does_not_remove_person_recall(self):
  async def execute(name,args):
   if name=='reverie.recall_animals':raise RuntimeError('pets offline')
   return json.dumps({'people':[{'name':'Edi','match':'exact'}]})
  manager=types.SimpleNamespace(available_tools={'reverie.resolve_people':{},'reverie.recall_animals':{}},execute_tool=execute)
  messages=[{'role':'system','content':'Policy'},{'role':'user','content':'What is Edi holding?'}]
  output=await m.person_messages(messages,manager,include_animals=True)
  self.assertIn('Edi',output[-2]['content'])
 async def test_recognition_link_recall_without_spoken_name(self):
  import time
  calls=[]
  async def execute(name,args):
   calls.append((name,args))
   return json.dumps({'people':[{'personId':'person','name':'Alex','match':'possible-recognition'}] if name.endswith('resolve_linked_people') else []})
  manager=types.SimpleNamespace(available_tools={'reverie.resolve_people':{},'reverie.resolve_linked_people':{}},execute_tool=execute)
  history=[{'role':'system','content':'Policy'},{'role':'user','content':'Hello there'}]
  face=([{'profileId':'11111111-1111-1111-1111-111111111111','name':'Alex','uncertain':True}],time.monotonic())
  output=await m.person_messages(history,manager,faces=face)
  self.assertEqual(calls[-1][0],'reverie.resolve_linked_people');self.assertIn('Alex',output[-2]['content']);self.assertEqual(len(history),2)
  calls.clear();await m.person_messages(history,manager,faces=(face[0],time.monotonic()-16));self.assertEqual(len(calls),1)
 async def test_uncertain_or_unnamed_voice_never_triggers_linked_recall(self):
  import time
  calls=[]
  async def execute(name,args):calls.append(name);return '{"people":[]}'
  manager=types.SimpleNamespace(available_tools={'reverie.resolve_people':{},'reverie.resolve_linked_people':{}},execute_tool=execute)
  state=types.SimpleNamespace(observed_at=time.monotonic(),observations=[{'speakers':[{'id':'id','name':'Alex','uncertain':True}]}])
  await m.person_messages([{'role':'system','content':'Policy'},{'role':'user','content':'Hello'}],manager,recognition_state=state)
  self.assertNotIn('reverie.resolve_linked_people',calls)
if __name__=='__main__':unittest.main()
