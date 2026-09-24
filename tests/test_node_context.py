import importlib.util,json,tempfile,unittest
from pathlib import Path
from datetime import datetime,timezone,timedelta
spec=importlib.util.spec_from_file_location('node',Path(__file__).resolve().parents[1]/'unmute-service/node_context.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class NodeTests(unittest.TestCase):
 def test_current_snapshot_and_stale_rejection(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'node.json';now=datetime.now(timezone.utc);p.write_text(json.dumps({'checkedAt':now.isoformat(),'lightning':{'state':'checked','openChannels':3}}));messages=[{'role':'system','content':'Policy'},{'role':'user','content':'How many Lightning channels?'}]
   result=m.node_messages(messages,messages,p,now);self.assertIn('"openChannels": 3',result[-2]['content']);self.assertIn('cannot send payments',result[0]['content']);self.assertEqual(len(messages),2)
   self.assertIn('unavailable',m.node_messages(messages,messages,p,now+timedelta(seconds=61))[-2]['content'])
 def test_unrelated_question_does_not_read_node_status(self):
  messages=[{'role':'system','content':'Policy'},{'role':'user','content':'Hello'}];self.assertIs(m.node_messages(messages,messages,'/missing'),messages)
if __name__=='__main__':unittest.main()
