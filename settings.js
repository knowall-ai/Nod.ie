const api = window.nodie;
const el = id => document.getElementById(id);
let currentPlan;
const error = err => { el('settings-error').textContent = err.message || String(err); el('settings-error').scrollIntoView({ block: 'center' }); };
async function load() {
    const config = await api.getConfig();
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
    try { await api.saveSettings({ AVATAR_ENABLED: el('avatarEnabled').checked, AVATAR_IDLE_ENABLED: el('avatarIdleEnabled').checked, ASSISTANT_NAME: el('assistantName').value, UNMUTE_BACKEND_URL: el('unmuteBackendUrl').value, VOICE_MODEL: el('voiceModel').value, GLOBAL_HOTKEY: el('globalHotkey').value }); window.close(); }
    catch (err) { error(err); }
    finally { el('save').disabled = false; }
};
api.onSecurityStatus(render);
load().catch(error);
