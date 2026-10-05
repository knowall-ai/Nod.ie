/** Identity edits invalidate every retained connection, including the legacy backend registry. */
const fs=require('node:fs/promises'),path=require('node:path');
const {PersonRegistry}=require('./person-registry');
async function unlinkRegistries(directory,legacyFile,kind,id=null){
 let files=[];
 try{files=(await fs.readdir(directory)).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).map(name=>path.join(directory,name));}
 catch(error){if(error.code!=='ENOENT')throw error;}
 for(const file of [legacyFile,...files]){
  try{await fs.access(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  await new PersonRegistry(file).unlink(kind,id);
 }
}
module.exports={unlinkRegistries};
