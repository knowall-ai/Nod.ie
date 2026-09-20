const api = window.nodie;
const el = id => document.getElementById(id);
let currentPlan;
const error = err => { el('settings-error').textContent = err.message || String(err); el('settings-error').scrollIntoView({ block: 'center' }); };
async function load() {
    const config = await api.getConfig();
    el('avatarEnabled').checked = config.AVATAR_ENABLED;
    for (const [id, key] of Object.entries({ assistantName: 'ASSISTANT_NAME', unmuteBackendUrl: 'UNMUTE_BACKEND_URL', voiceModel: 'VOICE_MODEL', globalHotkey: 'GLOBAL_HOTKEY' })) el(id).value = config[key] || '';
    if (!config.AVATAR_ENABLED) el('avatarStatus').textContent = 'Hidden';
    else if (config.VOICE_MODE === 'local') {
        try { const health = await api.voiceHealth(); el('avatarStatus').textContent = health.avatar?.lipSyncConfigured ? 'Neural lip sync configured' : 'Static portrait'; }
        catch { el('avatarStatus').textContent = 'Status unavailable'; }
    } else el('avatarStatus').textContent = config.MUSETALK_WS ? 'Realtime avatar configured' : 'Static portrait';
    render(await api.getSecurityStatus());
    await loadDiagnostics();
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
    try { await api.saveSettings({ AVATAR_ENABLED: el('avatarEnabled').checked, ASSISTANT_NAME: el('assistantName').value, UNMUTE_BACKEND_URL: el('unmuteBackendUrl').value, VOICE_MODEL: el('voiceModel').value, GLOBAL_HOTKEY: el('globalHotkey').value }); window.close(); }
    catch (err) { error(err); }
    finally { el('save').disabled = false; }
};
api.onSecurityStatus(render);
load().catch(error);

async function loadFaces() {
    const status = await api.faceStatus();
    el('face-enabled').checked = status.enabled;
    el('face-status').textContent = status.enabled ? 'Learning selected camera frames. Voice notifications and conversational naming are not connected yet.' : 'Disabled. No faces are collected.';
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
el('face-enabled').onchange = () => api.faceEnabled(el('face-enabled').checked).then(loadFaces).catch(error);
el('face-refresh').onclick = () => loadFaces().catch(error);
el('face-forget').onclick = () => { if (confirm('Delete every face profile and disable recognition?')) api.faceForget().then(loadFaces).catch(error); };
loadFaces().catch(error);
