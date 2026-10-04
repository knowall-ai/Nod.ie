const fs=require('node:fs/promises');
async function legacyCredentials(config){
 const file=config('REVERIE_CONFIG_PATH'),name=config('REVERIE_CONFIG_SERVER');
 if(!file||!name)return null;
 const entry=JSON.parse(await fs.readFile(file,'utf8')).mcpServers?.[name];
 if(!entry?.env)throw Error('Reverie credentials are not configured');
 return Object.fromEntries(['NEO4J_URI','NEO4J_USERNAME','NEO4J_PASSWORD','NEO4J_DATABASE'].filter(k=>typeof entry.env[k]==='string').map(k=>[k,entry.env[k]]));
}
async function connectReverie(credentials){
 const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
 const {StdioClientTransport}=require('@modelcontextprotocol/sdk/client/stdio.js');
 const transport=new StdioClientTransport({command:process.execPath,args:[require.resolve('@knowall-ai/reverie/build/index.js')],env:{...credentials,ELECTRON_RUN_AS_NODE:'1',REVERIE_EMBEDDINGS:'none'},stderr:'pipe'});
 const client=new Client({name:'nodie',version:'1.0.0'});
 transport.stderr?.on('data',()=>{});
 try{await client.connect(transport,{timeout:10000});await client.listTools({}, {timeout:10000});return client;}
 catch{await transport.close().catch(()=>{});throw Error('Reverie is unavailable');}
}
module.exports={legacyCredentials,connectReverie};
