import importlib.util,unittest,time,base64,io,wave
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('recognition_context',Path(__file__).resolve().parents[1]/'unmute-service/recognition_context.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RecognitionTests(unittest.TestCase):
 def test_windows_follow_stt_clock_and_never_bridge_padding(self):
  w=m.AudioWindows();self.assertIsNone(w.audio(np.zeros(24000),24000,1));self.assertIsNone(w.audio(np.zeros(12000),24000,1.5));out=w.audio(np.empty(0),24000,1.5,True);self.assertEqual(out['start_time'],0)
  with wave.open(io.BytesIO(base64.b64decode(out['audio']))) as f:self.assertEqual(f.getnframes(),36000)
  w.audio(np.zeros(24000),24000,2.5);self.assertIsNone(w.audio(np.zeros(24000),24000,8));out=w.audio(np.zeros(72000),24000,11);self.assertEqual(out['start_time'],7)
 def observation(self):return {'start_time':0,'end_time':4,'speakers':[{'speaker':0,'id':'a','name':'Example','uncertain':False,'mayAskName':True},{'speaker':1,'id':'b','name':'Second','uncertain':False}],'segments':[{'speaker':0,'start':0,'end':2},{'speaker':1,'start':2,'end':4}]}
 def test_words_not_whole_turns_are_attributed(self):
  w=m.AudioWindows();w.observe(self.observation())
  for text,start,end in [('one',.2,.8),('boundary',1.9,2.1),('two',2.2,2.8),('unfinished',3,None)]:
   w.word(text,start)
   if end:w.end_word(end)
  self.assertEqual([x['profile'] for x in w.attributed()],['a',None,'b',None])
 def test_overlap_and_stale_observations_remain_uncertain(self):
  w=m.AudioWindows();o=self.observation();o['segments'].append({'speaker':1,'start':.3,'end':.7});w.observe(o);w.word('overlap',.2);w.end_word(.8);self.assertIsNone(w.attributed()[0]['profile'])
  messages=[{'role':'system','content':'Policy'},{'role':'user','content':'hello'}];w.observed_at=time.monotonic()-9;self.assertIs(m.recognition_messages(messages,w),messages)
 def test_ask_name_signal_is_consumed_once_without_mutating_history(self):
  w=m.AudioWindows();w.observe(self.observation());messages=[{'role':'system','content':'Policy'},{'role':'user','content':'hello'}];first=m.recognition_messages(messages,w);second=m.recognition_messages(messages,w);self.assertIn('"mayAskName": true',first[-2]['content']);self.assertNotIn('"mayAskName": true',second[-2]['content']);self.assertEqual(len(messages),2)
 def test_clock_restart_discards_previous_identity(self):
  w=m.AudioWindows();w.audio(np.zeros(24000),24000,10);w.observe(self.observation());w.word('old',1);w.audio(np.zeros(24000),24000,1);self.assertEqual(w.observations,[]);self.assertEqual(w.words,[])
if __name__=='__main__':unittest.main()
