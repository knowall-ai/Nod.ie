// Deliberately narrow ASR spellings. This is an addressing rule, not speaker authentication.
function isAddressedToNodie(text) {
    if (typeof text !== 'string') return false;
    return /^(?:(?:hey|hi|hello|ok(?:ay)?|please)[,\s]+)*(?:nod\.?ie|nodey|nody|noddy|nodi)(?=$|[\s,!:?.])/i.test(text.normalize('NFKC').trim());
}
module.exports = { isAddressedToNodie };
