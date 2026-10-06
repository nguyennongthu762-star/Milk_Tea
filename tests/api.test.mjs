import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,testUser,testPassword} from './support.mjs';
const payload={name:'Khách kiểm thử',phone:'0901234567',address:'123 Đường Trà Sữa',note:'Ít đá',items:[{productId:1,quantity:2,price:1}]};
const post=(value,key=crypto.randomUUID())=>({method:'POST',body:JSON.stringify(value),headers:{'Idempotency-Key':key}});
async function session(f){const response=await f.fetchApi('/api/admin/login',post({username:testUser,password:testPassword}));assert.equal(response.status,200);const cookie=response.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);return cookie.split(';')[0];}
test('Order pricing, snapshots, idempotency, validation and rollback',async()=>{const f=await fixture();try{
  const key=crypto.randomUUID();const response=await f.fetchApi('/api/orders',post(payload,key));assert.equal(response.status,201);const order=await response.json();assert.equal(order.total,70000);
  const second=await f.fetchApi('/api/orders',post(payload,key));assert.equal(second.status,200);assert.equal((await second.json()).code,order.code);
  assert.equal((await f.db.execute('SELECT COUNT(*) AS n FROM Orders')).rows[0].n,1);
  const mismatch=await f.fetchApi('/api/orders',post({...payload,note:'Khác'},key));assert.equal(mismatch.status,409);
  const invalid=await f.fetchApi('/api/orders',post({...payload,items:[{productId:1,quantity:0}]}));assert.equal(invalid.status,400);
  assert.equal((await f.fetchApi('/api/orders',post({...payload,items:[{productId:2,quantity:1}]}))).status,409);
  assert.equal((await f.fetchApi('/api/orders',post({...payload,items:[{productId:1,quantity:1},{productId:1,quantity:1}]}))).status,400);
  await f.db.execute("UPDATE Products SET Name='Tên mới',Price=100000 WHERE Id=1");const snapshot=(await f.db.execute('SELECT * FROM OrderItems')).rows[0];assert.equal(snapshot.ProductName,'Trà sữa trân châu');assert.equal(snapshot.UnitPrice,35000);
  const replay=await f.fetchApi('/api/orders',post(payload,key));assert.equal((await replay.json()).total,70000);
  await f.db.execute("CREATE TRIGGER test_failure BEFORE INSERT ON OrderItems BEGIN SELECT RAISE(ABORT,'test'); END");assert.equal((await f.fetchApi('/api/orders',post(payload))).status,503);
  assert.equal((await f.db.execute('SELECT COUNT(*) AS n FROM Orders')).rows[0].n,1);assert.equal((await f.db.execute('SELECT COUNT(*) AS n FROM OrderItems')).rows[0].n,1);
}finally{f.close();}});
test('Concurrent duplicate submission creates one order',async()=>{const f=await fixture();try{const key=crypto.randomUUID();const responses=await Promise.all([f.fetchApi('/api/orders',post(payload,key)),f.fetchApi('/api/orders',post(payload,key))]);assert.ok(responses.every(r=>r.status===200||r.status===201));assert.equal((await responses[0].json()).code,(await responses[1].json()).code);assert.equal((await f.db.execute('SELECT COUNT(*) AS n FROM Orders')).rows[0].n,1);}finally{f.close();}});
test('Admin authentication, origin checks, product editing, order transitions and logout',async()=>{const f=await fixture();try{
  for(const route of ['/api/admin/session','/api/admin/products','/api/admin/orders','/api/admin/orders/1'])assert.equal((await f.fetchApi(route)).status,401);
  for(const [route,method] of [['/api/admin/products','POST'],['/api/admin/products/1','PATCH'],['/api/admin/orders/1','PATCH'],['/api/admin/logout','POST']])assert.equal((await f.fetchApi(route,{method,body:'{}'})).status,401);
  assert.equal((await f.fetchApi('/api/admin/login',post({username:testUser,password:'wrong'}))).status,401);
  assert.equal((await f.fetchApi('/api/admin/login',{...post({username:testUser,password:testPassword}),headers:{Origin:'https://evil.example','Content-Type':'application/json'}})).status,403);
  const cookie=await session(f);const authed=(method,body)=>({method,headers:{Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await f.fetchApi('/api/admin/session',authed('GET'))).status,200);
  assert.equal((await f.fetchApi('/api/admin/products',authed('POST',{Name:'Món mới',Price:40000,ImageUrl:'/images/tstt.jpg',Description:'Ngon',IsActive:1}))).status,201);
  assert.equal((await f.fetchApi('/api/admin/products/1',authed('PATCH',{Name:'Món sửa',Price:40000,ImageUrl:'/images/tstt.jpg',Description:'',IsActive:1}))).status,200);
  assert.equal((await f.fetchApi('/api/admin/products',authed('POST',{Name:'x',Price:1,ImageUrl:'javascript:alert(1)',IsActive:1}))).status,400);
  const placed=await f.fetchApi('/api/orders',post(payload));assert.equal(placed.status,201);
  const order=(await f.db.execute('SELECT Id FROM Orders')).rows[0];const detail=await f.fetchApi('/api/admin/orders/'+order.Id,authed('GET'));assert.equal((await detail.json()).items.length,1);
  assert.equal((await f.fetchApi('/api/admin/orders/'+order.Id,authed('PATCH',{status:'completed',previousStatus:'pending'}))).status,409);
  for(const [from,to] of [['pending','confirmed'],['confirmed','shipping'],['shipping','completed']])assert.equal((await f.fetchApi('/api/admin/orders/'+order.Id,authed('PATCH',{status:to,previousStatus:from}))).status,200);
  assert.equal((await f.fetchApi('/api/admin/orders/'+order.Id,authed('PATCH',{status:'cancelled',previousStatus:'completed'}))).status,409);
  const secure=await f.worker.fetch(new Request('https://shop.example/api/admin/login',{method:'POST',headers:{Origin:'https://shop.example','Content-Type':'application/json'},body:JSON.stringify({username:testUser,password:testPassword})}),f.env);assert.match(secure.headers.get('Set-Cookie'),/__Host-milktea_session=.*Secure/);
  assert.equal((await f.fetchApi('/api/admin/logout',authed('POST',{}))).status,200);assert.equal((await f.fetchApi('/api/admin/session',authed('GET'))).status,401);
}finally{f.close();}});
test('Expired sessions and login throttling',async()=>{const f=await fixture();try{const cookie=await session(f);await f.db.execute('UPDATE AdminSessions SET ExpiresAt=0');assert.equal((await f.fetchApi('/api/admin/session',{headers:{Cookie:cookie}})).status,401);let last;for(let i=0;i<11;i++)last=await f.fetchApi('/api/admin/login',post({username:testUser,password:'wrong'}));assert.equal(last.status,429);}finally{f.close();}});

test('Initial admin command stores a hash, works for login and refuses a second account',async()=>{
  const {spawnSync}=await import('node:child_process');const f=await fixture();try{
    await f.db.execute('DELETE FROM Admins');
    const env={...process.env,TURSO_DATABASE_URL:f.config.url,TURSO_AUTH_TOKEN:'',AUTH_SECRET:f.env.AUTH_SECRET,ADMIN_USERNAME:'initial-admin',ADMIN_PASSWORD:' strong-secret-bootstrap-123 '};
    const result=spawnSync(process.execPath,['scripts/create-admin.mjs'],{env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    const row=(await f.db.execute('SELECT * FROM Admins')).rows[0];assert.equal(row.Username,'initial-admin');assert.notEqual(row.PasswordHash,env.ADMIN_PASSWORD);assert.match(row.PasswordHash,/^[a-f0-9]{64}$/);assert.equal(result.stdout.includes(env.ADMIN_PASSWORD),false);
    assert.equal((await f.fetchApi('/api/admin/login',post({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD}))).status,200);
    const second=spawnSync(process.execPath,['scripts/create-admin.mjs'],{env:{...env,ADMIN_USERNAME:'other-admin'},encoding:'utf8'});assert.notEqual(second.status,0);assert.equal((await f.db.execute('SELECT COUNT(*) AS n FROM Admins')).rows[0].n,1);
  }finally{f.close();}
});
