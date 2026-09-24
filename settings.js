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
    try { await api.saveSettings({ AVATAR_ENABLED: el('avatarEnabled').checked, AVATAR_IDLE_ENABLED: el('avatarIdleEnabled').checked, ASSISTANT_NAME: el('assistantName').value, UNMUTE_BACKEND_URL: el('unmuteBackendUrl').value, VOICE_MODEL: el('voiceModel').value, GLOBAL_HOTKEY: el('globalHotkey').value }); window.close(); }
    catch (err) { error(err); }
    finally { el('save').disabled = false; }
};
api.onSecurityStatus(render);
load().catch(error);

async function loadSpeakers() {
    const status = await api.speakerStatus();
    el('speaker-enabled').checked = status.enabled;
    el('speaker-status').textContent = status.enabled ? 'Enabled for local and Unmute voice modes (Unmute requires the recognition backend overlay).' : 'Disabled. No new voice profiles are collected.';
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
el('speaker-enabled').onchange = () => api.speakerEnabled(el('speaker-enabled').checked).then(loadSpeakers).catch(error);
el('speaker-forget').onclick = () => { if (window.confirm('Remove all voice profiles and disable recognition? Reverie memories will remain.')) api.speakerForget().then(loadSpeakers).catch(error); };
