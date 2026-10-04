/** Pending, snapshot-bound face choices. No images or user edits enter storage here. */
class FaceIntroductionSettings {
    constructor(api, doc=document) {
        this.api=api;this.doc=doc;this.generation=0;
        this.section=doc.getElementById('face-introduction');this.form=doc.getElementById('face-introduction-form');
        this.choices=doc.getElementById('face-introduction-faces');this.name=doc.getElementById('face-introduction-name');
        this.status=doc.getElementById('face-introduction-status');this.confirmButton=doc.getElementById('face-introduction-confirm');this.cancelButton=doc.getElementById('face-introduction-cancel');
        this.confirmButton.onclick=()=>void this.confirm(true);this.cancelButton.onclick=()=>void this.confirm(false);
        this.choices.onchange=()=>{this.status.textContent='';};this.name.oninput=()=>{this.status.textContent='';};
    }
    clear() {clearTimeout(this.expiry);this.pending=null;this.choices.replaceChildren();this.name.value='';}
    stop() {++this.generation;this.clear();this.unsubscribe?.();}
    start() {this.unsubscribe=this.api.onFaceIntroductionChanged?.(()=>void this.refresh());void this.refresh();}
    async refresh() {
        if(this.saving)return;
        const generation=++this.generation;
        try {
            const proposal=await this.api.faceIntroduction();
            if(generation!==this.generation||this.saving)return;
            if(!proposal||Date.now()>=proposal.expiresAt){this.clear();this.section.hidden=true;return;}
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
            this.expiry=setTimeout(()=>{if(this.pending===proposal){this.clear();this.form.hidden=true;this.status.textContent='This introduction expired. Please introduce the person again.';}},Math.max(0,proposal.expiresAt-Date.now()));
        }catch {if(generation===this.generation){this.clear();this.form.hidden=true;this.section.hidden=false;this.status.textContent='The introduction is unavailable. Please try again.';}}
    }
    async confirm(accepted) {
        const p=this.pending;if(!p||this.saving)return;
        const selected=this.choices.querySelector('input:checked')?.value;
        if(accepted&&!selected){this.status.textContent='Select the person you are introducing.';return;}
        if(accepted&&!this.name.reportValidity())return;
        this.saving=true;this.confirmButton.disabled=true;this.cancelButton.disabled=true;
        try {
            const result=await this.api.confirmRecognitionName(p.token,accepted,this.name.value.trim(),selected);
            if(this.pending!==p)return;
            if(['invalid-name','select-face'].includes(result.status)){this.status.textContent=result.status==='invalid-name'?'Enter a valid name.':'Select a face from this introduction.';return;}
            this.clear();this.form.hidden=true;
            this.status.textContent=result.status==='saved'?'Name saved for the selected face.':result.status==='cancelled'?'Introduction cancelled.':'The face or introduction changed. Please introduce the person again.';
        }catch {if(this.pending===p){this.clear();this.form.hidden=true;this.status.textContent='The name could not be confirmed. Check the saved profiles before trying again.';}}
        finally {this.saving=false;this.confirmButton.disabled=false;this.cancelButton.disabled=false;}
    }
}
if(typeof module!=='undefined')module.exports={FaceIntroductionSettings};
if(typeof window!=='undefined')window.addEventListener('DOMContentLoaded',()=>{
    if(window.nodie?.faceIntroduction){const panel=new FaceIntroductionSettings(window.nodie);panel.start();window.addEventListener('pagehide',()=>panel.stop(),{once:true});}
});
