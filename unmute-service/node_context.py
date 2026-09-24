"""Fixed read-only node snapshot; no model-supplied commands or privileged access."""
import json,re
from pathlib import Path
from datetime import datetime,timezone

def node_messages(messages,history,path=None,now=None):
    spoken=[m['content'] for m in history if m.get('role')=='user' and isinstance(m.get('content'),str) and not m['content'].startswith(('Untrusted ','[TOOL RESULT'))]
    if not spoken:return messages
    topic=r'\b(bitcoin|lightning|lnd|channels?|liquidity|sats?|satoshis)\b'
    requested=re.search(topic,spoken[-1],re.I) or (len(spoken)>1 and re.search(topic,spoken[-2],re.I) and re.search(r'\b(how many|how much|active|inactive|pending|balance|version|capacity|inbound|outbound|available|running)\b',spoken[-1],re.I))
    if not requested:return messages
    try:
        p=Path(path or '/app/nodie-events/node-status.json')
        if p.stat().st_size>16000:raise ValueError('Oversized snapshot')
        data=json.loads(p.read_text())
        age=((now or datetime.now(timezone.utc))-datetime.fromisoformat(data['checkedAt'].replace('Z','+00:00'))).total_seconds()
        if not 0<=age<=60:raise ValueError('Stale snapshot')
    except Exception:data={'status':'unavailable','reason':'No fresh local node snapshot is available.'}
    result=[dict(m) for m in messages]
    result[0]['content']+='\nRead-only local Bitcoin/Lightning status is supplied below when available, even while camera tools are paused. Answer node questions from checked facts, never say you lack all access when a checked snapshot is present. You cannot send payments or change channels. Balances are not guaranteed routable liquidity. Report unavailable or stale data honestly; never invent amounts.'
    current=next((i for i in range(len(result)-1,0,-1) if result[i]['role']=='user'),len(result))
    result.insert(current,{'role':'user','content':'Untrusted read-only node status, as of checkedAt: '+json.dumps(data)})
    return result
