/** Emoji are visual decoration, not words for the speech engine to pronounce. */
const segments = new Intl.Segmenter('en', { granularity: 'grapheme' });
const emoji = /[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u20e3]/u;
function spokenText(text) {
    return [...segments.segment(text)].map(({ segment }) => emoji.test(segment) ? ' ' : segment).join('').replace(/[ \t]+/g, ' ').replace(/ +([,.!?;:])/g, '$1').trim();
}
module.exports = { spokenText };
