"""Synthetic curiosity policy and image/history isolation tests, no live services."""
import importlib.util
import sys
import unittest
from pathlib import Path
from datetime import datetime, timezone, timedelta
root = Path(__file__).resolve().parents[1] / 'unmute-service'
def load(name):
    spec=importlib.util.spec_from_file_location('unmute.'+name,root/(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);sys.modules['unmute.'+name]=module;return module
load('scene_context');c=load('curiosity_context')
class Tests(unittest.TestCase):
    def fixture(self):
        at=datetime.now(timezone.utc).isoformat()
        event=dict(token='a'*36,key='held-object:cup',type='held-object',kind='cup',appearance='blue',capturedAt=at,recentlyRaised=[])
        return event,dict(status='snapshot',capturedAt=at,imageJpeg='/9hh/9k=')
    def test_single_use_and_quiet(self):
        state=c.CuriosityState();event,scene=self.fixture();state.update(True,event,scene)
        gates=dict(waiting=True,quiet=True,paused=True,words_quiet=True)
        for key in gates:
            self.assertIsNone(state.take(**(gates|{key:False})))
        self.assertEqual(state.take(**gates)['event'],event);self.assertIsNone(state.take(**gates))
        state.update(True,event,scene);self.assertIsNone(state.pending)
    def test_cancel_expiry_mismatched_image(self):
        state=c.CuriosityState();event,scene=self.fixture();state.update(True,event,scene);state.update(False,None,scene);self.assertIsNone(state.pending)
        event['token']='b'*36;state.update(True,event,scene|{'capturedAt':'different'});self.assertIsNone(state.pending)
        event['capturedAt']=(datetime.now(timezone.utc)-timedelta(seconds=21)).isoformat();self.assertFalse(c.fresh(event,scene|{'capturedAt':event['capturedAt']}))
    def test_ephemeral_context(self):
        event,scene=self.fixture();history=[dict(role='system',content='Policy'),dict(role='assistant',content='Previous reply')]
        result=c.curiosity_messages(history,dict(event=event,scene=scene))
        self.assertEqual(len(history),2);self.assertEqual(history[0]['content'],'Policy')
        self.assertIn('not a reply',result[0]['content']);self.assertIn('not spoken',result[-1]['content'])
        images=[m for m in result if isinstance(m['content'],list)];self.assertEqual(len(images),1)
if __name__=='__main__':unittest.main()
