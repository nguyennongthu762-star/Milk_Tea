import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import {fixture} from './support.mjs';
import {safeError} from '../scripts/diagnostics.mjs';
const command=fileURLToPath(new URL('../scripts/create-admin.mjs',import.meta.url));
function run(env){return spawnSync(process.execPath,[command],{env,encoding:'utf8',cwd:os.tmpdir()});}
test('Admin setup reports exact input, secret, schema and existing-account failures',async()=>{
  const f=await fixture();try{
    const env={...process.env,TURSO_DATABASE_URL:f.config.url,TURSO_AUTH_TOKEN:'',AUTH_SECRET:f.env.AUTH_SECRET,ADMIN_USERNAME:'valid-user',ADMIN_PASSWORD:'diagnostic-test-only-password-123'};
    for(const [changes,code] of [[{ADMIN_USERNAME:'a'},'ADMIN_USERNAME_INVALID'],[{ADMIN_PASSWORD:'short'},'ADMIN_PASSWORD_INVALID'],[{AUTH_SECRET:''},'AUTH_CONFIG']]){
      const r=run({...env,...changes});assert.equal(r.status,1);assert.ok(r.stderr.includes(code),r.stderr);assert.equal(r.stderr.includes((changes.ADMIN_PASSWORD||env.ADMIN_PASSWORD)),false);
    }
    const existing=run(env);assert.equal(existing.status,1);assert.match(existing.stderr,/ADMIN_ALREADY_EXISTS/);
    await f.db.execute('ALTER TABLE AdminSessions RENAME TO TestSessions');
    const missing=run(env);assert.equal(missing.status,1);assert.match(missing.stderr,/ADMIN_TABLES_MISSING/);assert.match(missing.stderr,/AdminSessions/);assert.match(missing.stderr,/npm run migrate/);
  }finally{f.close();}
});
test('Underlying errors and causes are retained while secrets and URLs are redacted',()=>{
  const env={TURSO_DATABASE_URL:'libsql://private-database.turso.io',TURSO_AUTH_TOKEN:'test-token-123',AUTH_SECRET:'test-secret-123456789',ADMIN_PASSWORD:'test-password-123'};
  const cause=new Error('SQLITE_ERROR: no such table: Admins');cause.code='SQLITE_ERROR';
  const error=new Error('Connection '+Object.values(env).join(' ')+' '+encodeURIComponent(env.ADMIN_PASSWORD),{cause});error.code='SERVER_ERROR';
  const output=safeError(error,env);assert.match(output,/SERVER_ERROR/);assert.match(output,/no such table: Admins/);for(const value of Object.values(env))assert.equal(output.includes(value),false);assert.equal(output.includes(encodeURIComponent(env.ADMIN_PASSWORD)),false);
});
test('PowerShell wrapper propagates detailed Node error without a generic line-12 exception', {skip:process.platform!=='win32'},()=>{
  const script=fileURLToPath(new URL('../scripts/create-admin.ps1',import.meta.url)).replaceAll("'","''");
  const command=`function Read-Host { param([string]$Prompt,[switch]$AsSecureString) if ($AsSecureString) { ConvertTo-SecureString $env:ADMIN_TEST_PASSWORD -AsPlainText -Force } else { 'a' } }; & '${script}'`;
  const password=crypto.randomUUID();const result=spawnSync('powershell',['-NoProfile','-Command',command],{env:{...process.env,ADMIN_TEST_PASSWORD:password},encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/ADMIN_USERNAME_INVALID/);assert.equal(result.stderr.includes(password),false);assert.equal(result.stderr.includes('RuntimeException'),false);
});
