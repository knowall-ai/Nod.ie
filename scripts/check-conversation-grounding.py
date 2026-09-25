"""Manual model evaluation: synthetic exchanges only; inspect replies, not a CI pass/fail test.
Run from the repository root. Requires the local Ollama model. No memory or audio is used.
"""
import argparse,json,urllib.request
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--prompt', default='SYSTEM-PROMPT.md')
parser.add_argument('--model', default='nodie-qwen3.5:9b')
parser.add_argument('--url', default='http://localhost:11434')
args=parser.parse_args()
prompt=Path(args.prompt).read_text()
cases=[('ownership',[('user','I might take the bus.'),('assistant','Would you like help checking the route?'),('user','I am going to make tea. And then I'),('user','What were you going to ask?')]),('unknown-continuation',[('user','I found my keys.'),('assistant','Ah, understood —'),('user','I will finish my sandwich. And then'),('user','What were you about to say?')]),('visual-grounding',[('user','The camera shows a clear stemmed glass on a table. What can you tell about when I used it?')]),('repeat-question',[('user','Hello.'),('assistant','How is your afternoon going?'),('user','You already asked me that.'),('assistant','Sorry, I did.'),('user','I am just making tea.')])]
results=[]
for name,history in cases:
 data={'model':args.model,'stream':False,'think':False,'messages':[{'role':'system','content':prompt}]+[{'role':r,'content':c} for r,c in history],'options':{'temperature':0,'num_predict':180}}
 req=urllib.request.Request(args.url.rstrip('/')+'/api/chat',data=json.dumps(data).encode(),headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=120) as response: out=json.load(response)
 results.append({'case':name,'reply':out['message']['content']})
 print(json.dumps(results[-1]),flush=True)
