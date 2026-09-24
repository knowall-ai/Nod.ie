/** Reversible local controls require direct address in the microphone transcript. */
function addressedIntent(text) {
    if(typeof text!=='string' || text.length>1000 || /["“”]/.test(text))return null;
    const address=text.trim().match(/^(?:hey[ ,]+|hi[ ,]+|okay[ ,]+)?(?:nod\.?ie|nody|noddy|no dee)\b[ ,:!-]*(.+)$/i);
    if(!address)return null;
    let request=address[1].toLowerCase().replace(/[.!?,]+$/g,'').trim();
    if(/\b(if|when|unless|whether|said|says|say|means|meaning|phrase|command|explain|discuss|imagine)\b/.test(request))return null;
    request=request.replace(/^(?:(?:can|could|would|will) you(?: please)?|please)\s+/,'').replace(/\s+please$/,'');
    if(/^(?:don'?t|do not|never)\s+/.test(request) && !/^(?:don'?t|do not) listen(?: to me)?(?: anymore)?$/.test(request))return null;
    if(/^(?:stop listening|stop listining|(?:don'?t|do not) listen(?: to me)?(?: anymore)?|mute (?:the |your )?mic(?:rophone)?|(?:turn|switch) (?:the |your )?mic(?:rophone)? off|(?:turn|switch) off (?:the |your )?mic(?:rophone)?)$/.test(request))return 'mic-off';
    if(/^(?:mute (?:yourself|the speaker|your speaker)|stop (?:talking|speaking)|be quiet|(?:turn|switch) (?:the |your )?speaker off|(?:turn|switch) off (?:the |your )?speaker)$/.test(request))return 'speaker-off';
    if(/^(?:unmute (?:yourself|the speaker|your speaker)|(?:turn|switch) (?:the |your )?speaker on|(?:turn|switch) on (?:the |your )?speaker)$/.test(request))return 'speaker-on';
    if(/^(?:(?:exit|leave|close|come out of) full ?screen(?: mode)?|(?:go|switch|return) (?:back )?to (?:the )?(?:small|compact|floating|windowed)(?: mode| view| avatar)?|make yourself smaller|shrink yourself)$/.test(request))return 'restore';
    if(/^(?:(?:go|enter|switch to|open in) full ?screen(?: mode)?|(?:maximi[sz]e|expand)(?: yourself)?|fill (?:the |my )?screen|make yourself (?:bigger|full ?screen))$/.test(request))return 'fullscreen';
    if(/^(?:minimi[sz]e(?: yourself)?|hide(?: yourself)?|(?:go|move) (?:to|into) (?:the )?(?:system )?tray)$/.test(request))return 'tray';
    if(/^(?:open(?: yourself)?|show yourself|come back|reappear|bring yourself back)$/.test(request))return 'show';
    return null;
}
class SpokenControls {
    constructor(renderer){this.renderer=renderer;this.text='';this.pendingControl=false;}
    async event(data){
        if(data.type==='conversation.item.input_audio_transcription.delta')this.text=(this.text+' '+(data.delta||'')).trim().slice(-1000);
        if(data.type==='conversation.item.input_audio_transcription.completed'){const text=data.transcript||this.text;this.text='';this.pendingControl=await this.accept(text);return this.pendingControl;}
        if(data.type==='response.created'){const text=this.text;this.text='';const handled=this.pendingControl;this.pendingControl=false;return handled || this.accept(text);}
    }
    async accept(text){
        const intent=addressedIntent(text);if(!intent)return false;
        const r=this.renderer;
        if(intent==='speaker-off'||intent==='speaker-on')r.controls.setSpeakerMuted(intent==='speaker-off');
        else if(intent==='mic-off'){
            if(r.localVoice){r.localVoice.listeningEnabled=false;r.localVoice.releaseMicrophone();}
            else {r.state.isMuted=true;r.stopMicrophone();}
            r.controls.update();
        }else if(window.nodie?.windowAction)await window.nodie.windowAction(intent);
        else return false;
        return true;
    }
}
if(typeof window!=='undefined')window.SpokenControls=SpokenControls;
if(typeof module!=='undefined')module.exports={addressedIntent,SpokenControls};
