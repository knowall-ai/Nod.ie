"""Geometry regressions for face previews without loading biometric models."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'recognition'))
from face_crops import isolated_crop

class CropTest(unittest.TestCase):
    def test_separated_faces_remain_independent(self):
        self.assertEqual(isolated_crop([10,20,70,80],[[100,20,70,80]],200,150),(10,20,80,100))
    def test_neighbour_or_nested_photo_face_is_not_a_single_face_crop(self):
        for other in [[75,20,70,80],[30,40,10,10]]:
            self.assertIsNone(isolated_crop([10,20,70,80],[other],200,150))
    def test_clipped_edges_are_bounded_and_mostly_missing_faces_rejected(self):
        self.assertEqual(isolated_crop([-5,0,70,80],[],200,150),(0,0,65,80))
        self.assertIsNone(isolated_crop([-60,0,70,80],[],200,150))
    def test_non_finite_invalid_boxes_and_dimensions_are_rejected(self):
        for box in [[0,0,float('nan'),80],[0,0,0,80],[0,0,80],None]:
            self.assertIsNone(isolated_crop(box,[],200,150))
        self.assertIsNone(isolated_crop([0,0,70,80],[[0,0,float('inf'),20]],200,150))
        self.assertIsNone(isolated_crop([0,0,70,80],[],0,150))

if __name__=='__main__':unittest.main()
