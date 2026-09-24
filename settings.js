const api = window.nodie;
const el = id => document.getElementById(id);
let currentPlan;
const error = err => { el('settings-error').textContent = err.message || String(err); el('settings-error').scrollIntoView({ block: 'center' }); };
async function load() {
    const config = await api.getConfig();
    el('curiosityLevel').value = config.CURIOSITY_LEVEL;
    el('avatarEnabled').checked = config.AVATAR_ENABLED;
    el('avatarIdleEnabled').checked = config.AVATAR_IDLE_ENABLED;
    for (const [id, key] of Object.entries({ assistantName: 'ASSISTANT_NAME', unmuteBackendUrl: 'UNMUTE_BACKEND_URL', voiceModel: 'VOICE_MODEL', globalHotkey: 'GLOBAL_HOTKEY' })) el(id).value = config[key] || '';
    if (!config.AVATAR_ENABLED) el('avatarStatus').textContent = 'Hidden';
    else if (config.VOICE_MODE === 'local') {
        try { const health = await api.voiceHealth(); el('avatarStatus').textContent = health.avatar?.lipSyncConfigured ? 'Neural lip sync configured' : 'Static portrait'; }
        catch { el('avatarStatus').textContent = 'Status unavailable'; }
    } else el('avatarStatus').textContent = config.MUSETALK_WS ? 'Realtime avatar configured' : 'Static portrait';
    render(await api.getSecurityStatus());
    await loadDiagnostics();
    await loadSpeakers();
}
function render(status) {
    el('scan-status').textContent = `Status: ${status.state}. Last scan: ${status.checkedAt || 'not yet checked'}. ${status.error || ''}`;
    el('scan').disabled = status.state === 'scanning';
    el('updates').replaceChildren();
    for (const item of status.containers || []) {
        const row = document.createElement('div');
        const title = document.createElement('h3'); title.textContent = `${item.name}: ${item.status}`;
        const info = document.createElement('p'); info.textContent = `${item.image} — ${item.reason}`;
        row.append(title, info);
        if (['update-recommended', 'security-review'].includes(item.status)) {
            const button = document.createElement('button'); button.textContent = 'Review update';
            button.onclick = async () => { try { currentPlan = await api.reviewUpdate(item.id); el('update-plan').textContent = currentPlan.summary; el('apply').hidden = false; el('apply').textContent = currentPlan.executable ? 'Confirm and apply…' : 'Open official update instructions'; } catch (err) { error(err); } };
            const dismiss = document.createElement('button'); dismiss.textContent = 'Dismiss notification'; dismiss.onclick = () => api.dismissUpdate(item.recommendationId).catch(error);
            row.append(button, dismiss);
        }
        el('updates').append(row);
    }
}
async function loadDiagnostics() {
    const status = await api.getDiagnostics();
    el('diagnostics-status').textContent = JSON.stringify(status, null, 2);
}
el('diagnostics-refresh').onclick = () => loadDiagnostics().catch(error);
el('scan').onclick = () => api.scanSecurity().then(render).catch(error);
el('apply').onclick = async () => {
    if (!currentPlan) return;
    el('apply').disabled = true;
    try { const result = await api.applyUpdate(currentPlan.id); el('update-plan').textContent = result.message || result.status; }
    catch (err) { error(err); }
    finally { el('apply').hidden = true; el('apply').disabled = false; currentPlan = null; }
};
el('clear-history').onclick = () => api.clearHistory().then(() => { el('history-status').textContent = 'Saved conversation history cleared.'; }).catch(error);
el('cancel').onclick = () => window.close();
el('save').onclick = async () => {
    el('settings-error').textContent = '';
    el('save').disabled = true;
    try { await api.saveSettings({ CURIOSITY_LEVEL: el('curiosityLevel').value, AVATAR_ENABLED: el('avatarEnabled').checked, AVATAR_IDLE_ENABLED: el('avatarIdleEnabled').checked, ASSISTANT_NAME: el('assistantName').value, UNMUTE_BACKEND_URL: el('unmuteBackendUrl').value, VOICE_MODEL: el('voiceModel').value, GLOBAL_HOTKEY: el('globalHotkey').value }); window.close(); }
    catch (err) { error(err); }
    finally { el('save').disabled = false; }
};
api.onSecurityStatus(render);
load().catch(error);

async function loadSpeakers() {
    const status = await api.speakerStatus();
    el('speaker-enabled').checked = status.enabled;
    el('speaker-status').textContent = status.enabled ? 'Enabled. Unmute learns recurring voice profiles from bounded audio windows. Introduce yourself and confirm the proposed name; uncertain/overlapping words stay unattributed.' : 'Disabled. No new voice profiles are collected.';
    el('speaker-profiles').replaceChildren();
    if (!status.profiles.length) el('speaker-profiles').textContent = 'No voice profiles learned yet.';
    const label = profile => `${profile.name || 'Unfamiliar speaker'} (${profile.id.slice(0, 8)})`;
    for (const profile of status.profiles) {
        const row = document.createElement('div');
        const name = document.createElement('input'); name.value = profile.name || ''; name.placeholder = 'Unfamiliar speaker'; name.maxLength = 80; name.setAttribute('aria-label', 'Speaker name');
        const rename = document.createElement('button'); rename.textContent = 'Save name'; rename.onclick = () => api.speakerEdit(profile.id, name.value).then(loadSpeakers).catch(error);
        const details = document.createElement('p'); details.textContent = `${label(profile)} · ${profile.voiceSamples || 1} voice sample(s) · Last heard ${new Date(profile.lastSeen).toLocaleString()}`;
        const forget = document.createElement('button'); forget.textContent = 'Remove voice profile'; forget.onclick = async () => {
            if (!window.confirm(`Remove the voice profile for ${label(profile)}? Reverie memories will remain.`)) return;
            forget.disabled = true;
            try { await api.speakerEdit(profile.id, null); await loadSpeakers(); } catch (err) { error(err); } finally { forget.disabled = false; }
        };
        row.append(details, name, rename, forget);
        if (status.profiles.length > 1) {
            const target = document.createElement('select'); target.setAttribute('aria-label', `Merge ${label(profile)} into`);
            const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose person to keep'; target.append(placeholder);
            for (const other of status.profiles.filter(p => p.id !== profile.id)) {
                const option = document.createElement('option'); option.value = other.id; option.textContent = label(other); target.append(option);
            }
            const merge = document.createElement('button'); merge.textContent = 'Merge duplicate'; merge.disabled = true;
            target.onchange = () => { merge.disabled = !target.value; };
            merge.onclick = async () => {
                const other = status.profiles.find(p => p.id === target.value);
                if (!other || !window.confirm(`Merge ${label(profile)} into ${label(other)}? Keep the destination name and both sets of voice samples. This cannot be undone.`)) return;
                merge.disabled = true;
                try { await api.speakerMerge(profile.id, other.id); await loadSpeakers(); } catch (err) { error(err); } finally { merge.disabled = !target.value; }
            };
            row.append(target, merge);
        }
        el('speaker-profiles').append(row);
    }
}
el('speaker-enabled').onchange = async () => {
    const input=el('speaker-enabled'), previous=!input.checked;input.disabled=true;
    try {await api.speakerEnabled(input.checked);await loadSpeakers();}
    catch(err) {input.checked=previous;error(err);try {await loadSpeakers();}catch {el('speaker-status').textContent='Recognition status could not be confirmed.';}}
    finally {input.disabled=false;}
};
el('speaker-forget').onclick = () => { if (window.confirm('Remove all voice profiles and disable recognition? Reverie memories will remain.')) api.speakerForget().then(loadSpeakers).catch(error); };

async function loadFaces() {
    const status = await api.faceStatus();
    el('face-enabled').checked = status.enabled;
    el('face-status').textContent = status.enabled ? 'Matching selected camera frames; unknown candidates stay in memory until a label is confirmed. Recent matches reach Unmute as uncertain observations. Introduce one visible person, then confirm the label on screen.' : 'Disabled. No faces are collected.';
    el('face-profiles').replaceChildren();
    if (!status.profiles.length) el('face-profiles').textContent = 'No face profiles learned yet.';
    for (const profile of status.profiles) {
        const row = document.createElement('div');
        const label = document.createElement('p'); label.textContent = `${profile.name || 'Unfamiliar face'} (${profile.id.slice(0, 8)}) — last seen ${new Date(profile.lastSeen).toLocaleString()}`;
        const input = document.createElement('input'); input.type = 'text'; input.value = profile.name || ''; input.maxLength = 80; input.setAttribute('aria-label', 'Face profile name');
        const save = document.createElement('button'); save.textContent = 'Save name'; save.onclick = () => api.faceEdit(profile.id, input.value).then(loadFaces).catch(error);
        const remove = document.createElement('button'); remove.textContent = 'Forget'; remove.onclick = () => { if (confirm('Forget this face profile?')) api.faceEdit(profile.id, null).then(loadFaces).catch(error); };
        const targets = document.createElement('select'); targets.setAttribute('aria-label', 'Merge face into');
        const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Merge into…'; targets.append(placeholder);
        for (const other of status.profiles.filter(p => p.id !== profile.id)) { const option = document.createElement('option'); option.value = other.id; option.textContent = `${other.name || 'Unfamiliar face'} (${other.id.slice(0, 8)})`; targets.append(option); }
        const merge = document.createElement('button'); merge.textContent = 'Merge'; merge.disabled = true; targets.onchange = () => { merge.disabled = !targets.value; };
        merge.onclick = () => { if (confirm('Merge these face profiles, retaining the target name?')) api.faceMerge(profile.id, targets.value).then(loadFaces).catch(error); };
        row.append(label, input, save, remove, targets, merge); el('face-profiles').append(row);
    }
}
el('face-enabled').onchange = async () => {
    const input=el('face-enabled'), previous=!input.checked;input.disabled=true;
    try {await api.faceEnabled(input.checked);await loadFaces();}
    catch(err) {input.checked=previous;error(err);try {await loadFaces();}catch {el('face-status').textContent='Recognition status could not be confirmed.';}}
    finally {input.disabled=false;}
};
el('face-refresh').onclick = () => loadFaces().catch(error);
el('face-forget').onclick = () => { if (confirm('Delete every face profile and disable recognition?')) api.faceForget().then(loadFaces).catch(error); };
loadFaces().catch(error);

async function loadJournal(){
 const data=await api.listJournal();el('journal-retention').value=String(data.retentionDays);el('journal-enabled').checked=data.enabled;
 el('journal-status').textContent=`${data.events.length} retained events. Showing the latest 100.`;
 const labels={appeared:'appeared in view','out-of-view':'no longer in view',observed:'observed',recognised:'possible recognition','name-confirmed':'name confirmed'};
 el('journal-events').replaceChildren(...data.events.slice(-100).reverse().map(event=>{const li=document.createElement('li');li.textContent=`${new Date(event.at).toLocaleString()} · ${event.source} · ${event.subject}: ${labels[event.kind]}${event.uncertain?' (uncertain)':''}`;return li;}));
}
el('journal-refresh').onclick=()=>loadJournal().catch(error);
el('journal-clear').onclick=()=>{if(confirm('Permanently clear all saved events?'))api.clearJournal().then(loadJournal).catch(error);};
el('journal-enabled').onchange=()=>api.journalEnabled(el('journal-enabled').checked).then(loadJournal).catch(error);
el('journal-retention').onchange=()=>api.journalRetention(Number(el('journal-retention').value)).then(loadJournal).catch(error);
loadJournal().catch(error);
