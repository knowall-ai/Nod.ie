"""Execute the generated person-lookup guard for normal and proactive turns."""
import ast,asyncio,importlib.util,types,json,time
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'unmute-service'
spec=importlib.util.spec_from_file_location('person_recall',root/'person_recall.py');recall=importlib.util.module_from_spec(spec);spec.loader.exec_module(recall)
tree=ast.parse((root/'generated/unmute_handler.py').read_text())
response=next(n for n in ast.walk(tree) if isinstance(n,ast.AsyncFunctionDef) and n.name=='_generate_response_task')
guard=next(n for n in response.body if isinstance(n,ast.If) and ast.unparse(n.test)=='not curiosity' and 'person_messages' in ast.unparse(n))
method=ast.parse('async def lookup(self,messages,curiosity=None):\n    pass').body[0];method.body=[guard,ast.Return(ast.Name(id='messages',ctx=ast.Load()))];ast.fix_missing_locations(method)
ns={'person_messages':recall.person_messages};exec(compile(ast.Module(body=[method],type_ignores=[]),'generated-person-guard','exec'),ns)
async def check():
 calls=[]
 async def execute(name,args):calls.append(name);return json.dumps({'people':[{'name':'Synthetic Person','notes':'Private synthetic note'}]})
 manager=types.SimpleNamespace(available_tools={'reverie.resolve_people':{},'reverie.resolve_linked_people':{}},execute_tool=execute)
 history=[{'role':'system','content':'Policy'},{'role':'user','content':'Hello'}]
 h=types.SimpleNamespace(mcp_manager=manager,chatbot=types.SimpleNamespace(chat_history=history),_scene_data=None,_nodie_faces=([{'profileId':'11111111-1111-1111-1111-111111111111','name':'Synthetic Person'}],time.monotonic()))
 assert await ns['lookup'](h,history,{'event':{}})==history
 assert calls==[], 'Proactive scene must not fetch person memory'
 result=await ns['lookup'](h,history)
 assert 'reverie.resolve_linked_people' in calls and 'Private synthetic note' in str(result)
asyncio.run(check())
print('Generated normal-turn recall and proactive person-memory exclusion: PASS')
