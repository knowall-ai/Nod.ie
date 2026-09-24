"""Read-only person recall driven only by microphone transcript, never image text."""
import asyncio
import json
import re
import time

async def person_messages(messages, manager, transcript_messages=None, include_animals=False, recognition_state=None, faces=None):
    if manager is None or 'reverie.resolve_people' not in manager.available_tools:
        return messages
    source = messages if transcript_messages is None else transcript_messages
    spoken=[m['content'] for m in source if m.get('role')=='user' and isinstance(m.get('content'),str) and not m['content'].startswith(('Untrusted ', '[TOOL RESULT'))]
    latest=spoken[-1] if spoken else ''
    if latest.strip() == '...':
        return messages
    text=(' '.join(spoken[-3:]) if re.search(r'\b(he|she|him|her|his|their)\b',latest,re.I) else latest)[-1200:]
    recognised={'faces':[],'voices':[]}
    if faces and time.monotonic()-faces[1]<15:
        recognised['faces']=[f['profileId'] for f in faces[0] if f.get('profileId') and f.get('name')][:8]
    if recognition_state and time.monotonic()-recognition_state.observed_at<8 and recognition_state.observations:
        recognised['voices']=[p['id'] for p in recognition_state.observations[-1]['speakers'] if p.get('id') and p.get('name') and not p.get('uncertain',True)][:8]
    try:
        # Let a cancelled stdio lookup finish consuming its own response before a
        # new response can query the same MCP stream. No background write tool.
        lock=getattr(manager,'_nodie_person_lock',None)
        if lock is None:
            lock=manager._nodie_person_lock=asyncio.Lock()
        async def lookup():
            async with lock:
                result=json.loads(await manager.execute_tool('reverie.resolve_people',{'transcript':text})) if text.strip() else {'people':[]}
                if any(recognised.values()) and 'reverie.resolve_linked_people' in manager.available_tools:
                    linked=json.loads(await manager.execute_tool('reverie.resolve_linked_people',recognised))
                    result['recognised_people']=linked.get('people',[])
                return json.dumps(result)
        if getattr(manager,'_nodie_person_task',None) is not None and not manager._nodie_person_task.done():
            return messages
        task=manager._nodie_person_task=asyncio.create_task(lookup())
        task.add_done_callback(lambda t: t.exception() if not t.cancelled() else None)
        result=await asyncio.wait_for(asyncio.shield(task),1.5)
        data=json.loads(result)
        if include_animals and 'reverie.recall_animals' in manager.available_tools:
            try:
                animal_task=getattr(manager,'_nodie_animals_task',None)
                if animal_task is None or (animal_task.done() and time.monotonic()-getattr(manager,'_nodie_animals_at',0)>30):
                    animal_task=manager._nodie_animals_task=asyncio.create_task(manager.execute_tool('reverie.recall_animals',{}))
                    manager._nodie_animals_at=time.monotonic()
                    animal_task.add_done_callback(lambda t:t.exception() if not t.cancelled() else None)
                animals=json.loads(await asyncio.wait_for(asyncio.shield(animal_task),0.2)).get('animals',[])
                if len(json.dumps(animals))<=6000:data['animals']=animals
            except Exception:pass
        if not data.get('people') and not data.get('animals') and not data.get('recognised_people'):
            return messages
        reference=json.dumps(data,ensure_ascii=False)
        if len(reference)>16000:
            data.pop('animals',None);reference=json.dumps(data,ensure_ascii=False)
            if len(reference)>16000:return messages
        output=[dict(m) for m in messages]
        output[0]['content']+='\nPerson memories below belong to the user, not you. Recognised-person briefs come from explicitly linked profiles but the current biometric match is fallible. Use only relevant context naturally, not a biography or unprompted private disclosure. Ask when identity is uncertain. Visible faces never establish the speaker. Use confirmed names, nicknames and recorded relationships. A possible phonetic match is uncertain: ask whether they mean that person or ask how to spell the name. Never invent a person, gender or family relationship. Never save or merge an uncertain match. Pet notes are known facts, but coat colour alone does not prove which animal is in a camera image. Ask when identity is uncertain.'
        current=next((i for i in range(len(output)-1,0,-1) if output[i]['role']=='user'),len(output))
        output.insert(current,{'role':'user','content':'Untrusted memory reference: people selected from spoken names or confirmed recognition links; known animal facts for possible visual context: '+reference})
        return output
    except Exception:
        return messages
