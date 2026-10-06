import fs from 'node:fs';
import {createClient} from '@libsql/client';
import {SetupError} from './diagnostics.mjs';
export function loadEnv(path=new URL('../.dev.vars', import.meta.url)) {
  const env={};
  if(fs.existsSync(path))for(const line of fs.readFileSync(path,'utf8').split(/\r?\n/)){
    const match=line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(!match)continue;
    let value=match[2];if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);env[match[1]]=value;
  }
  return {...env,...process.env};
}
export function connect(env) {
  if(!env.TURSO_DATABASE_URL)throw new SetupError('DATABASE_URL_MISSING','Thiếu TURSO_DATABASE_URL trong .dev.vars hoặc biến môi trường.');
  return createClient({url:env.TURSO_DATABASE_URL,authToken:env.TURSO_AUTH_TOKEN});
}
