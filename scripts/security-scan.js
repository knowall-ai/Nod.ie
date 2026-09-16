const { SecurityMonitor } = require('../security/monitor');
const path = require('node:path');
const os = require('node:os');
const monitor = new SecurityMonitor({ stateDir: path.join(os.homedir(), '.config/nodie/security') });
monitor.scan().then(status => console.log(JSON.stringify(status, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
