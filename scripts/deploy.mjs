import {spawn} from 'node:child_process';
import {loadEnv,connect} from './env.mjs';
import {safeError,SetupError} from './diagnostics.mjs';
import {migrate} from './migrate.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const wrangler=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
const required=['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','AUTH_SECRET'];
let env={...process.env},db;
function run(args,input){return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[wrangler,...args],{cwd:root,stdio:[input===undefined?'inherit':'pipe','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  // Sanitize CLI output before printing. Secret values never go into argv or files.
  let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
  child.on('error',reject);child.on('close',code=>{if(output.trim())console.log(safeError(new Error(output),env));if(code===0){const urls=output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/gi)||[];resolve(urls.at(-1));}else reject(new SetupError('WRANGLER_FAILED',`Wrangler thất bại (exit ${code}). Kiểm tra thông báo bên trên.`));});
  if(input!==undefined){child.stdin.on('error',()=>{});child.stdin.end(input);}
});}
try{
  env=loadEnv();
  const missing=required.filter(name=>typeof env[name]!=='string'||!env[name].trim());
  if(missing.length)throw new SetupError('CONFIG_MISSING','Thiếu cấu hình local: '+missing.join(', '));
  if(env.AUTH_SECRET.length<32)throw new SetupError('AUTH_CONFIG','AUTH_SECRET cần ít nhất 32 ký tự.');
  db=connect(env);await migrate(db);db.close();db=undefined;
  if(process.argv.includes('--dry-run')){await run(['deploy','--dry-run']);}
  else {
    console.log('Đồng bộ ba secrets cần thiết lên Worker, giữ AUTH_SECRET để admin hiện tại tiếp tục đăng nhập.');
    await run(['secret','bulk'],JSON.stringify(Object.fromEntries(required.map(name=>[name,env[name]]))));
    const website=await run(['deploy']);
    if(website){console.log('Website: '+website);for(const [path,expected] of [['/api/health',200],['/api/products',200],['/api/admin/session',401]]){const response=await fetch(website+path);if(response.status!==expected)throw new SetupError('DEPLOY_VERIFY_FAILED',`Kiểm tra ${path}: HTTP ${response.status}, cần ${expected}.`);console.log(`Kiểm tra ${path}: HTTP ${response.status} OK`);}}
    else console.log('Deploy hoàn tất. Kiểm tra URL được cấu hình trong Cloudflare dashboard.');
  }
}catch(error){console.error('Deploy thất bại: '+safeError(error,env));process.exitCode=1;}finally{db?.close();}
