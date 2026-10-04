/** Pending, snapshot-bound face choices. No images or user edits enter storage here. */
class FaceIntroductionSettings {
    constructor(api, doc=document, onLinkProfile=()=>{}) {
        this.api=api;this.doc=doc;this.generation=0;
        this.linkButton=doc.getElementById('face-introduction-link');
        this.linkButton.onclick=()=>{if(this.savedProfile)onLinkProfile(this.savedProfile);};
        this.section=doc.getElementById('face-introduction');this.form=doc.getElementById('face-introduction-form');
        this.choices=doc.getElementById('face-introduction-faces');this.name=doc.getElementById('face-introduction-name');
        this.status=doc.getElementById('face-introduction-status');this.confirmButton=doc.getElementById('face-introduction-confirm');this.cancelButton=doc.getElementById('face-introduction-cancel');
        this.confirmButton.onclick=()=>void this.confirm(true);this.cancelButton.onclick=()=>void this.confirm(false);
        this.choices.onchange=()=>{this.status.textContent='';};this.name.oninput=()=>{this.status.textContent='';};
    }
    clear() {clearTimeout(this.expiry);this.pending=null;this.choices.replaceChildren();this.name.value='';this.savedProfile=null;this.linkButton.hidden=true;}
    releaseConfirmation(confirmation=this.confirmation) {
        if(!confirmation)return;
        clearTimeout(confirmation.timer);confirmation.cancel?.();
        if(this.confirmation===confirmation){this.confirmation=null;this.saving=false;this.confirmButton.disabled=false;this.cancelButton.disabled=false;this.name.disabled=false;this.choices.inert=false;}
    }
    stop() {++this.generation;this.refreshQueued=false;this.releaseConfirmation();this.clear();this.unsubscribe?.();}
    start() {this.unsubscribe=this.api.onIntroductionChanged?.(()=>void this.refresh());void this.refresh();}
    async refresh(preserveFeedback=false) {
        if(this.saving){this.refreshQueued=true;return;}
        const generation=++this.generation;
        try {
            const proposal=await this.api.faceIntroduction();
            if(generation!==this.generation)return;
            if(this.saving){this.refreshQueued=true;return;}
            if(!proposal||Date.now()>=proposal.expiresAt){if(!preserveFeedback||this.pending){this.clear();this.section.hidden=true;}return;}
            if(this.pending?.token===proposal.token)return;
            this.clear();this.pending=proposal;this.name.value=proposal.name;this.status.textContent='';
            this.section.hidden=false;this.form.hidden=false;
            proposal.faces.forEach((face,index)=>{
                const label=this.doc.createElement('label');label.className='face-introduction-choice';
                const image=this.doc.createElement('img');image.src='data:image/jpeg;base64,'+face.thumbnail;image.alt=`Face ${index+1} from the introduction`;image.width=96;image.height=96;
                const radio=this.doc.createElement('input');radio.type='radio';radio.name='introduced-face';radio.value=face.id;radio.checked=!proposal.selectionRequired&&proposal.faces.length===1;
                const text=this.doc.createElement('span');text.textContent=`Face ${index+1}`;label.append(image,radio,text);this.choices.append(label);
            });
            this.section.scrollIntoView({block:'start'});
            this.expiry=setTimeout(()=>{if(this.pending===proposal){this.clear();this.form.hidden=true;this.status.textContent=this.confirmation?.pending===proposal?'Name confirmation is still in progress…':'This introduction expired. Please introduce the person again.';}},Math.max(0,proposal.expiresAt-Date.now()));
        }catch {if(generation===this.generation){this.clear();this.form.hidden=true;this.section.hidden=false;this.status.textContent='The introduction is unavailable. Please try again.';}}
    }
    async confirm(accepted) {
        const p=this.pending;if(!p||this.saving)return;
        const selected=this.choices.querySelector('input:checked')?.value;
        if(accepted&&!selected){this.status.textContent='Select the person you are introducing.';return;}
        if(accepted&&!this.name.reportValidity())return;
        ++this.generation;const confirmation={pending:p};this.confirmation=confirmation;
        this.saving=true;this.confirmButton.disabled=true;this.cancelButton.disabled=true;this.name.disabled=true;this.choices.inert=true;
        this.status.textContent=accepted?'Saving the name…':'Cancelling the introduction…';
        const deadline=new Promise((_,reject)=>{confirmation.cancel=()=>reject(Error('Confirmation superseded'));confirmation.timer=setTimeout(()=>reject(Error('Confirmation timed out')),10000);});
        try {
            const result=await Promise.race([this.api.confirmRecognitionName(p.token,accepted,this.name.value.trim(),selected),deadline]);
            if(this.confirmation!==confirmation)return;
            if(['invalid-name','select-face'].includes(result.status)){this.status.textContent=this.pending===p?(result.status==='invalid-name'?'Enter a valid name.':'Select a face from this introduction.'):'This introduction expired. Please introduce the person again.';return;}
            this.clear();this.form.hidden=true;
            if(result.status==='saved'&&result.profileId){this.savedProfile={kind:'face',profileId:result.profileId};this.linkButton.hidden=false;}
            this.status.textContent=result.status==='saved'?'Name saved for the selected face.':result.status==='cancelled'?'Introduction cancelled.':'The face or introduction changed. Please introduce the person again.';
        }catch {if(this.confirmation===confirmation){this.clear();this.form.hidden=true;this.status.textContent='The name could not be confirmed. Check the saved profiles before trying again.';}}
        finally {if(this.confirmation===confirmation){this.releaseConfirmation(confirmation);if(this.refreshQueued){this.refreshQueued=false;void this.refresh(true);}}}
    }
}
if(typeof module!=='undefined')module.exports={FaceIntroductionSettings};
if(typeof window!=='undefined')window.addEventListener('DOMContentLoaded',()=>{
    if(window.nodie?.faceIntroduction){const panel=new FaceIntroductionSettings(window.nodie,document,profile=>window.dispatchEvent(new CustomEvent('recognition-profile-link-requested',{detail:profile})));panel.start();window.addEventListener('pagehide',()=>panel.stop(),{once:true});}
});
