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
if __name__=='__main__':unittest.main()
