"""Extend the already generated speaker adapter with exact audio-clock windows."""
import ast
from pathlib import Path
p=Path(__file__).parent/'generated'
def patch(s,a,b):
 if s.count(a)!=1:raise RuntimeError('Unsupported recognition adapter: '+a[:80])
 return s.replace(a,b)
s=(p/'openai_realtime_api_events.py').read_text()
s=patch(s,'class SpeakerObservationItem(BaseModel):','''class SpeakerObservationItem(BaseModel):
    speaker: int = Field(default=0, ge=0, le=8)
    id: str | None = Field(default=None, max_length=40)
    mayAskName: bool = False''')
s=patch(s,'class SpeakerObservation(BaseModel):','''class SpeakerSegment(BaseModel):
    start: float = Field(ge=0,le=5)
    end: float = Field(ge=0,le=5)
    speaker: int = Field(ge=0,le=8)

class FaceItem(BaseModel):
    name: str | None = Field(default=None,max_length=80)
    uncertain: bool = True
    mayAskName: bool = False

class NamingFeedback(BaseModel):
    status: Literal["pending","saved","cancelled","not-saved"]
    kind: Literal["face","voice"]
    name: str = Field(max_length=80)

class SpeakerObservation(BaseModel):''')
s=patch(s,'class SpeakerObservation(BaseModel):','''class SpeakerObservation(BaseModel):
    start_time: float = Field(default=0,ge=0)
    end_time: float = Field(default=0,ge=0)
    segments: list[SpeakerSegment] = Field(default_factory=list,max_length=64)''')
s=patch(s,'class SessionConfig(BaseModel):','''class NodieSpeakerAudio(BaseEvent[Literal["nodie.speaker_audio"]]):
    audio: str
    start_time: float
    end_time: float

class NodieWordEnd(BaseEvent[Literal["nodie.word_end"]]):
    end_time: float

class NodieAttributedWords(BaseEvent[Literal["nodie.attributed_words"]]):
    words: list[dict]

class SessionConfig(BaseModel):
    speaker_tracking_enabled: bool = False
    face_observation: list[FaceItem] | None = Field(default=None,max_length=8)
    recognition_feedback: NamingFeedback | None = None''')
# Runtime output queue serialises any BaseEvent; add to schema event union as well.
s=patch(s,'    ConversationItemInputAudioTranscriptionDelta,','    NodieSpeakerAudio,\n    NodieWordEnd,\n    NodieAttributedWords,\n    ConversationItemInputAudioTranscriptionDelta,')
h=(p/'unmute_handler.py').read_text()
h='from unmute.recognition_context import AudioWindows, recognition_messages\nfrom unmute.stt.speech_to_text import STTEndWordMessage\n'+h
h=patch(h,'    async def update_session(self, session: ora.SessionConfig):\n','''    async def update_session(self, session: ora.SessionConfig):
        if not hasattr(self,"_nodie_windows"):self._nodie_windows=AudioWindows()
        if "speaker_tracking_enabled" in session.model_fields_set:
            self._nodie_tracking=session.speaker_tracking_enabled
            if not self._nodie_tracking:self._nodie_windows=AudioWindows()
        if "face_observation" in session.model_fields_set:self._nodie_faces=([x.model_dump() for x in session.face_observation] if session.face_observation else [],__import__('time').monotonic())
        if "recognition_feedback" in session.model_fields_set:self._nodie_feedback=(session.recognition_feedback.model_dump() if session.recognition_feedback else {},__import__('time').monotonic())
        if session.speaker_observation:
            self._nodie_windows.observe(session.speaker_observation.model_dump())
            if self.output_queue.qsize()<128:await self.output_queue.put(ora.NodieAttributedWords(words=self._nodie_windows.attributed()))
''')
h=patch(h,'        await stt.send_audio(array)','''        await stt.send_audio(array)
        if getattr(self,"_nodie_tracking",False):
            chunk=self._nodie_windows.audio(float_audio,sr,stt.sent_samples/sr)
            if chunk and self.chatbot.conversation_state()!='bot_speaking' and any(chunk["start_time"]<=w["start"]<chunk["end_time"] for w in self._nodie_windows.words) and self.output_queue.qsize()<128:await self.output_queue.put(ora.NodieSpeakerAudio(**chunk))''')
h=patch(h,'                for _ in range(num_frames):','''                if getattr(self,"_nodie_tracking",False):
                    chunk=self._nodie_windows.audio(np.empty(0,dtype=np.float32),sr,stt.sent_samples/sr,force=True)
                    if chunk and self.chatbot.conversation_state()!='bot_speaking' and any(chunk["start_time"]<=w["start"]<chunk["end_time"] for w in self._nodie_windows.words) and self.output_queue.qsize()<128:await self.output_queue.put(ora.NodieSpeakerAudio(**chunk))
                for _ in range(num_frames):''')
h=patch(h,'            async for data in stt:\n','''            async for data in stt:
                if isinstance(data,STTEndWordMessage):
                    if hasattr(self,"_nodie_windows"):
                        self._nodie_windows.end_word(data.stop_time)
                        if self._nodie_windows.observations and self.output_queue.qsize()<128:await self.output_queue.put(ora.NodieAttributedWords(words=self._nodie_windows.attributed()))
                    await self.output_queue.put(ora.NodieWordEnd(end_time=data.stop_time))
                    continue
                if hasattr(data,"text") and hasattr(self,"_nodie_windows"):self._nodie_windows.word(data.text,data.start_time)
''')
h=patch(h,'        messages = self.chatbot.preprocessed_messages()','''        messages = self.chatbot.preprocessed_messages()
        messages = recognition_messages(messages,getattr(self,"_nodie_windows",None),getattr(self,"_nodie_faces",None),getattr(self,"_nodie_feedback",None))''')
# Pass EndWord through without delaying ordinary transcription or interruption.
root=Path(__import__('sys').argv[1]);stt=(root/'unmute/stt/speech_to_text.py').read_text()
stt=patch(stt,'                    case STTEndWordMessage():\n                        continue','                    case STTEndWordMessage():\n                        yield message')
class PrivateLogs(ast.NodeTransformer):
 def visit_Call(self,node):
  self.generic_visit(node)
  if isinstance(node.func,ast.Attribute) and isinstance(node.func.value,ast.Name) and node.func.value.id=='logger':
   node.args=[ast.Constant('STT transport event; private details omitted')];node.keywords=[]
  return node
stt=ast.unparse(ast.fix_missing_locations(PrivateLogs().visit(ast.parse(stt))))+'\n'
chatbot=(p/'chatbot.py').read_text()
chatbot=patch(chatbot,"observation, received = getattr(self, 'nodie_speakers', (None, 0))","observation, received = (None, 0)  # exact-clock context is injected by the handler")
for name,value in [('chatbot.py',chatbot),('openai_realtime_api_events.py',s),('unmute_handler.py',h),('speech_to_text.py',stt)]:ast.parse(value);(p/name).write_text(value)
print('Prepared exact audio-clock recognition windows and word-end events.')
