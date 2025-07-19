#!/usr/bin/env node

/**
 * Generate env-config.js for web testing from .env file
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');

const outputPath = path.join(__dirname, 'tests', 'env-config.js');

const content = `// This file is generated from .env - DO NOT EDIT
// Generated at: ${new Date().toISOString()}
window.ENV_CONFIG = ${JSON.stringify(config, null, 2)};
`;

fs.writeFileSync(outputPath, content);
console.log('Generated tests/env-config.js from .env configuration');