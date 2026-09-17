const test = require('node:test');
const assert = require('node:assert/strict');
const { timeContext } = require('../../lib/time-context');
test('current date follows the configured timezone across midnight and DST', () => {
    const date = new Date('2026-09-16T23:30:00.000Z');
    assert.match(timeContext(date, 'Europe/London'), /Thursday, 17 September 2026 at 00:30:00/);
    assert.match(timeContext(date, 'UTC'), /Wednesday, 16 September 2026 at 23:30:00/);
    assert.match(timeContext(date, 'Europe/London'), /Timezone: Europe\/London/);
    assert.match(timeContext(new Date('2026-01-16T23:30:00Z'), 'Europe/London'), /Friday, 16 January 2026 at 23:30:00/);
});
