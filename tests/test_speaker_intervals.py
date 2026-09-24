import importlib.util,unittest
from pathlib import Path
from types import SimpleNamespace as Interval
spec=importlib.util.spec_from_file_location('segment_bounds',Path(__file__).resolve().parents[1]/'recognition/segment_bounds.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class SegmentTests(unittest.TestCase):
 def test_model_padding_cannot_extend_beyond_recording(self):
  intervals=m.clip_intervals([Interval(start=.031,end=4.317,speaker=2),Interval(start=5.026,end=9.953,speaker=2)],4)
  self.assertEqual([(s.start,s.end,s.speaker) for s in intervals],[(.031,4,2)])
 def test_clipping_preserves_real_overlap_and_speaker_ids(self):
  result=m.clip_intervals([Interval(start=-.2,end=1.8,speaker=0),Interval(start=1.5,end=3,speaker=1)],2)
  self.assertEqual([(s.start,s.end,s.speaker) for s in result],[(0,1.8,0),(1.5,2,1)])
 def test_nonfinite_timestamps_are_rejected(self):
  with self.assertRaises(ValueError):m.clip_intervals([Interval(start=0,end=float('nan'),speaker=0)],4)
if __name__=='__main__':unittest.main()
