import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createClient} from '@libsql/client';
import {createWorker} from '../src/index.js';
import {migrate} from '../scripts/migrate.mjs';
import {passwordHash} from '../src/security.js';
export const testUser='test-manager';
export const testPassword='Testing-only-strong-password-123';
export async function fixture(){
  fs.mkdirSync('.test-data',{recursive:true});const dir=fs.mkdtempSync(path.resolve('.test-data','run-')); const config={url:'file:'+path.join(dir,'test.db').replaceAll('\\','/')};const db=createClient(config);
  await db.execute('CREATE TABLE Products (Id INTEGER PRIMARY KEY AUTOINCREMENT,Name TEXT NOT NULL,Price INTEGER NOT NULL,ImageUrl TEXT,Description TEXT,IsActive INTEGER NOT NULL DEFAULT 1)');
  await db.batch([{sql:'INSERT INTO Products(Name,Price,ImageUrl,Description) VALUES (?,?,?,?)',args:['Trà sữa trân châu',35000,'/images/tstt.jpg','Trà thơm, sữa béo']},{sql:'INSERT INTO Products(Name,Price,ImageUrl,Description,IsActive) VALUES (?,?,?,?,?)',args:['Món ngừng bán',50000,'','','0']}],'write');
  await migrate(db);await migrate(db);
  const env={AUTH_SECRET:'test-only-secret-for-isolated-db-1234567890'};const salt='test-only-salt';const hash=await passwordHash(testPassword,salt,env.AUTH_SECRET);
  await db.execute({sql:'INSERT INTO Admins(Username,PasswordHash,Salt) VALUES (?,?,?)',args:[testUser,hash,salt]});
  const worker=createWorker(()=>createClient(config));
  async function fetchApi(route,options={}){const method=options.method || 'GET';const headers={...(method!=='GET'?{'Origin':'http://localhost','Content-Type':'application/json'}:{}),...options.headers};return worker.fetch(new Request('http://localhost'+route,{...options,headers}),env);}
  const close=()=>{db.close();};
  return {db,worker,env,config,fetchApi,close};
}
export async function startServer(f){
  const root=path.resolve('public');const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg'};
  f.env.ASSETS={async fetch(request){const url=new URL(request.url);const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+path.sep))return new Response('',{status:404});try{return new Response(fs.readFileSync(file),{headers:{'Content-Type':types[path.extname(file)] || 'application/octet-stream'}});}catch{return new Response('',{status:404});}}};
  let origin;const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});const response=await f.worker.fetch(request,f.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  return {origin,close:()=>new Promise(resolve=>server.close(resolve))};
}
