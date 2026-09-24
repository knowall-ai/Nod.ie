import importlib.util,json,tempfile,unittest
from pathlib import Path
from datetime import datetime,timezone
spec=importlib.util.spec_from_file_location('journal',Path(__file__).resolve().parents[1]/'unmute-service/journal_context.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class JournalTests(unittest.TestCase):
 def test_local_day_query_and_untrusted_reference(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'journal.json';p.write_text(json.dumps({'version':1,'timezone':'Europe/London','retentionDays':30,'events':[{'at':'2026-09-23T23:30:00Z','source':'vision','kind':'appeared','subject':'grey cat','uncertain':True}]}))
   messages=[{'role':'system','content':'Policy'},{'role':'user','content':'What happened today?'}];now=datetime(2026,9,24,12,tzinfo=timezone.utc)
   output=m.journal_messages(messages,messages,p,now);self.assertIn('grey cat',output[-2]['content']);self.assertEqual(len(messages),2);self.assertIn('not proven room',output[0]['content'])
   messages[-1]['content']='What happened yesterday?';self.assertNotIn('grey cat',m.journal_messages(messages,messages,p,now)[-2]['content'])
 def test_journal_timezone_crosses_container_boundary(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'journal.json';p.write_text(json.dumps({'version':1,'timezone':'America/Los_Angeles','events':[]}))
   messages=[{'role':'system','content':'Policy'},{'role':'user','content':'What happened today?'}]
   result=m.journal_messages(messages,messages,p,datetime(2026,9,24,1,tzinfo=timezone.utc))
   self.assertIn('2026-09-23',result[-2]['content']);self.assertIn('America/Los_Angeles',result[-2]['content'])
 def test_unavailable_is_not_no_events_and_nonquery_has_no_io(self):
  messages=[{'role':'system','content':'Policy'},{'role':'user','content':'Hello'}];self.assertIs(m.journal_messages(messages,messages,'/missing'),messages)
  messages[-1]['content']='What happened today?';self.assertIn('unavailable',m.journal_messages(messages,messages,'/missing')[-2]['content'])
if __name__=='__main__':unittest.main()
