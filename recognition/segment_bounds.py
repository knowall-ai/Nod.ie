"""Discard diarizer padding outside the supplied audio; never stretch timestamps."""
import math
from types import SimpleNamespace

def clip_intervals(intervals, duration):
    result=[]
    for interval in intervals:
        start,end=float(interval.start),float(interval.end)
        if not math.isfinite(start) or not math.isfinite(end):
            raise ValueError('Invalid diarizer interval')
        start,end=max(0,start),min(duration,end)
        if end>start:
            result.append(SimpleNamespace(start=start,end=end,speaker=int(interval.speaker)))
    return result
