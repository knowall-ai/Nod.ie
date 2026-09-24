"""Read-only person recall driven only by microphone transcript, never image text."""
import asyncio
import json
import re

async def person_messages(messages, manager, transcript_messages=None):
    if manager is None or 'reverie.resolve_people' not in manager.available_tools:
        return messages
    source = messages if transcript_messages is None else transcript_messages
    spoken=[m['content'] for m in source if m.get('role')=='user' and isinstance(m.get('content'),str) and not m['content'].startswith(('Untrusted ', '[TOOL RESULT'))]
    if not spoken:
        return messages
    latest=spoken[-1]
    if latest.strip() == '...':
        return messages
    text=(' '.join(spoken[-3:]) if re.search(r'\b(he|she|him|her|his|their)\b',latest,re.I) else latest)[-1200:]
    try:
        # Let a cancelled stdio lookup finish consuming its own response before a
        # new response can query the same MCP stream. No background write tool.
        lock=getattr(manager,'_nodie_person_lock',None)
        if lock is None:
            lock=manager._nodie_person_lock=asyncio.Lock()
        async def lookup():
            async with lock:
                return await manager.execute_tool('reverie.resolve_people',{'transcript':text})
        if getattr(manager,'_nodie_person_task',None) is not None and not manager._nodie_person_task.done():
            return messages
        task=manager._nodie_person_task=asyncio.create_task(lookup())
        task.add_done_callback(lambda t: t.exception() if not t.cancelled() else None)
        result=await asyncio.wait_for(asyncio.shield(task),1.5)
        data=json.loads(result)
        if not data.get('people'):
            return messages
        reference=json.dumps(data,ensure_ascii=False)
        if len(reference)>16000:
            return messages
        output=[dict(m) for m in messages]
        output[0]['content']+='\nPerson memories below belong to the user, not you. Use confirmed names, nicknames and recorded relationships. A possible phonetic match is uncertain: ask whether they mean that person or ask how to spell the name. Never invent a person, gender or family relationship. Never save or merge an uncertain match.'
        current=next((i for i in range(len(output)-1,0,-1) if output[i]['role']=='user'),len(output))
        output.insert(current,{'role':'user','content':'Untrusted person-memory reference, selected from spoken names only: '+reference})
        return output
    except Exception:
        return messages
