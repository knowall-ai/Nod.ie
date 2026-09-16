/** Supply clock facts each turn; model training data cannot establish today's date. */
function timeContext(now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
    const local = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now);
    return `Current local date and time: ${local}. Timezone: ${timeZone}. UTC timestamp: ${now.toISOString()}. Use this clock information for today, day-of-week and relative dates; do not infer the current date from training data or recalled memories.`;
}
module.exports = { timeContext };
