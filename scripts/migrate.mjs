import fs from 'node:fs';
import {loadEnv,connect} from './env.mjs';
import {safeError} from './diagnostics.mjs';
import {pathToFileURL} from 'node:url';
export async function migrate(db) {
  const columns=(await db.execute('PRAGMA table_info(Products)')).rows;
  for(const name of ['Id','Name','Price','ImageUrl','Description','IsActive'])if(!columns.some(c=>c.name===name))throw new Error('Products schema mismatch');
  console.log('Products: Id, Name, Price, ImageUrl, Description, IsActive verified.');
  await db.execute('CREATE TABLE IF NOT EXISTS SchemaMigrations (Name TEXT PRIMARY KEY, AppliedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort()){
    const tx=await db.transaction('write');try{
      if((await tx.execute({sql:'SELECT Name FROM SchemaMigrations WHERE Name=?',args:[name]})).rows.length){await tx.rollback();continue;}
      const sql=fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
      for(const statement of sql.split(';').map(x=>x.trim()).filter(Boolean))await tx.execute(statement);
      await tx.execute({sql:'INSERT INTO SchemaMigrations(Name) VALUES (?)',args:[name]});await tx.commit();console.log('Applied '+name);
    }catch(error){await tx.rollback();throw error;}finally{tx.close();}
  }
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  let db,env={...process.env};
  try{env=loadEnv();db=connect(env);await migrate(db);}
  catch(error){console.error('Migration thất bại: '+safeError(error,env));process.exitCode=1;}
  finally{db?.close();}
}
