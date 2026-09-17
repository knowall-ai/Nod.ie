/** Generate private runtime MCP configuration from Nod.ie's existing Reverie credentials. */
const fs = require('node:fs');
const path = require('node:path');
const configPath = process.argv[2];
if (!configPath || !path.isAbsolute(configPath)) throw new Error('Pass the absolute path to Nod.ie config.js');
const { getConfig } = require(configPath);
const source = JSON.parse(fs.readFileSync(getConfig('REVERIE_CONFIG_PATH'), 'utf8')).mcpServers?.[getConfig('REVERIE_CONFIG_SERVER')];
if (!source?.env) throw new Error('Existing Reverie connection is not configured');
const env = Object.fromEntries(['NEO4J_URI', 'NEO4J_USERNAME', 'NEO4J_PASSWORD', 'NEO4J_DATABASE'].filter(k => typeof source.env[k] === 'string').map(k => [k, source.env[k]]));
const uri = new URL(env.NEO4J_URI);
if (['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname)) {
    if (!process.argv[3]) throw new Error('Pass the Docker-network hostname for the existing Neo4j instance');
    uri.hostname = process.argv[3]; env.NEO4J_URI = uri.toString();
}
const output = path.join(__dirname, 'generated/mcp.json');
fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
fs.writeFileSync(output, JSON.stringify({ mcpServers: { reverie: { command: 'node', args: ['/app/nodie/reverie-readonly.cjs'], env } } }), { mode: 0o600 });
fs.chmodSync(output, 0o600);
console.log('Private read-only Reverie configuration prepared.');
