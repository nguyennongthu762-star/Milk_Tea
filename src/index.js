import {uploadImage,serveImage,checkImage} from './images.js';
import { createClient } from '@libsql/client/web';
import {body, fail, HttpError, integer, text, sameOrigin, productInput, orderInput} from './validation.js';
import {digest, keyedHash, randomToken, passwordHash, equal, requireSecret, readCookie, sessionCookie} from './security.js';
const statuses=['pending','confirmed','shipping','completed','cancelled'];
const transitions={pending:['confirmed','cancelled'],confirmed:['shipping','cancelled'],shipping:['completed','cancelled'],completed:[],cancelled:[]};
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
async function rateLimit(db,request,env,scope,limit,seconds) {
  requireSecret(env);
  const now=Math.floor(Date.now()/1000); const bucket=Math.floor(now/seconds);
  const key=await keyedHash(`${scope}:${request.headers.get('CF-Connecting-IP') || 'local'}:${bucket}`,env.AUTH_SECRET);
  const result=await db.execute({sql:'INSERT INTO RateLimits (Key, Count, ExpiresAt) VALUES (?,1,?) ON CONFLICT(Key) DO UPDATE SET Count=Count+1 RETURNING Count',args:[key,(bucket+1)*seconds]});
  if(Number(result.rows[0].Count)>limit)fail('Quá nhiều yêu cầu. Vui lòng thử lại sau.',429);
  if(Math.random()<0.02)await db.execute({sql:'DELETE FROM RateLimits WHERE ExpiresAt < ?',args:[now]});
}
async function adminSession(db,request,env) {
  requireSecret(env); const token=readCookie(request);if(!/^[a-f0-9]{64}$/.test(token))fail('Vui lòng đăng nhập quản trị.',401);
  const hash=await keyedHash(token,env.AUTH_SECRET);
  const {rows}=await db.execute({sql:'SELECT a.Id, a.Username, s.TokenHash FROM AdminSessions s JOIN Admins a ON a.Id=s.AdminId WHERE s.TokenHash=? AND s.ExpiresAt>?',args:[hash,Math.floor(Date.now()/1000)]});
  if(!rows.length)fail('Phiên đăng nhập đã hết hạn.',401);return rows[0];
}
async function placeOrder(db,request,env) {
  const input=orderInput(await body(request));const key=request.headers.get('Idempotency-Key') || '';
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(key))fail('Thiếu khóa đặt hàng hợp lệ.');
  const fingerprint=await digest(JSON.stringify(input));
  await rateLimit(db,request,env,'orders',30,3600);
  const tx=await db.transaction('write');
  try {
    const existing=await tx.execute({sql:'SELECT Code, Total, RequestHash FROM Orders WHERE IdempotencyKey=?',args:[key]});
    if(existing.rows.length){const row=existing.rows[0];if(row.RequestHash!==fingerprint)fail('Khóa đặt hàng đã được dùng với dữ liệu khác.',409);await tx.rollback();return json({success:true,code:row.Code,total:Number(row.Total),replayed:true});}
    const lines=[];let total=0;
    for(const item of input.items){
      const result=await tx.execute({sql:'SELECT Id, Name, Price FROM Products WHERE Id=? AND IsActive=1',args:[item.productId]});
      if(!result.rows.length)fail('Một món đã ngừng bán hoặc không tồn tại. Vui lòng cập nhật giỏ hàng.',409);
      const product=result.rows[0];const price=Number(product.Price);integer(price,'Giá trong CSDL',0,10000000);total+=price*item.quantity;lines.push({...item,name:product.Name,price});
    }
    integer(total,'Tổng tiền',0,2000000000);
    const code='MT-'+crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
    const result=await tx.execute({sql:'INSERT INTO Orders (Code, CustomerName, Phone, Address, Note, Total, Status, PaymentMethod, IdempotencyKey, RequestHash) VALUES (?,?,?,?,?,?,?,\'COD\',?,?)',args:[code,input.name,input.phone,input.address,input.note,total,'pending',key,fingerprint]});
    const orderId=Number(result.lastInsertRowid);
    for(const item of lines)await tx.execute({sql:'INSERT INTO OrderItems (OrderId, ProductId, ProductName, UnitPrice, Quantity) VALUES (?,?,?,?,?)',args:[orderId,item.productId,item.name,item.price,item.quantity]});
    await tx.commit();return json({success:true,code,total},201);
  }catch(error){await tx.rollback();throw error;}finally{tx.close();}
}
async function api(request,env,db,url) {
  const path=url.pathname;const method=request.method;
  if(!['GET','POST','PATCH'].includes(method))fail('Phương thức không được hỗ trợ.',405);
  if(method!=='GET')sameOrigin(request);
  const imageMatch=path.match(/^\/api\/images\/([a-f0-9]{64})$/);
  if(imageMatch && method==='GET')return serveImage(db,imageMatch[1]);
  if(path==='/api/products' && method==='GET')return json({success:true,products:(await db.execute('SELECT Id,Name,Price,ImageUrl,Description FROM Products WHERE IsActive=1 ORDER BY Id')).rows});
  if(path==='/api/orders' && method==='POST')return placeOrder(db,request,env);
  if(path==='/api/admin/login' && method==='POST') {
    requireSecret(env);const data=await body(request);const username=text(data.username,'Tên đăng nhập',3,80).toLowerCase();text(data.password,'Mật khẩu',1,200);const password=data.password;
    await rateLimit(db,request,env,'login-ip',15,900);
    const accountKey=await keyedHash(username,env.AUTH_SECRET);
    await rateLimit(db,new Request(request.url,{headers:{'CF-Connecting-IP':accountKey}}),env,'login-account',10,900);
    const row=(await db.execute({sql:'SELECT Id,Username,PasswordHash,Salt FROM Admins WHERE Username=?',args:[username]})).rows[0];
    const computed=await passwordHash(password,row?.Salt || 'unknown-user-fixed-salt',env.AUTH_SECRET);
    if(!row || !equal(computed,row.PasswordHash))fail('Tên đăng nhập hoặc mật khẩu không đúng.',401);
    const token=randomToken();const hash=await keyedHash(token,env.AUTH_SECRET);const now=Math.floor(Date.now()/1000);
    await db.batch([{sql:'DELETE FROM AdminSessions WHERE ExpiresAt<=?',args:[now]},{sql:'INSERT INTO AdminSessions (TokenHash,AdminId,ExpiresAt) VALUES (?,?,?)',args:[hash,row.Id,now+28800]}],'write');
    return json({success:true,username:row.Username},200,{'Set-Cookie':sessionCookie(request,token)});
  }
  if(path.startsWith('/api/admin/')) {
    const admin=await adminSession(db,request,env);
    if(path==='/api/admin/images' && method==='POST'){await rateLimit(db,request,env,'images',60,3600);return uploadImage(db,request);}
    if(path==='/api/admin/session' && method==='GET')return json({success:true,username:admin.Username});
    if(path==='/api/admin/logout' && method==='POST'){await db.execute({sql:'DELETE FROM AdminSessions WHERE TokenHash=?',args:[admin.TokenHash]});return json({success:true},200,{'Set-Cookie':sessionCookie(request,'',0)});}
    if(path==='/api/admin/products' && method==='GET')return json({success:true,products:(await db.execute('SELECT Id,Name,Price,ImageUrl,Description,IsActive FROM Products ORDER BY Id DESC')).rows});
    if(path==='/api/admin/products' && method==='POST'){
      const p=productInput(await body(request));await checkImage(db,p);const result=await db.execute({sql:'INSERT INTO Products (Name,Price,ImageUrl,Description,IsActive) VALUES (?,?,?,?,?)',args:[p.Name,p.Price,p.ImageUrl,p.Description,p.IsActive]});return json({success:true,id:Number(result.lastInsertRowid)},201);
    }
    const productMatch=path.match(/^\/api\/admin\/products\/(\d+)$/);
    if(productMatch && method==='PATCH'){
      const id=integer(Number(productMatch[1]),'Mã sản phẩm');const p=productInput(await body(request));await checkImage(db,p);const result=await db.execute({sql:'UPDATE Products SET Name=?,Price=?,ImageUrl=?,Description=?,IsActive=? WHERE Id=?',args:[p.Name,p.Price,p.ImageUrl,p.Description,p.IsActive,id]});if(!result.rowsAffected)fail('Không tìm thấy sản phẩm.',404);return json({success:true});
    }
    if(path==='/api/admin/orders' && method==='GET'){
      const page=integer(Number(url.searchParams.get('page') || 1),'Trang',1,100000);const filter=url.searchParams.get('status') || '';if(filter && !statuses.includes(filter))fail('Trạng thái không hợp lệ.');
      const where=filter?' WHERE Status=?':'';const args=filter?[filter]:[];
      const rows=(await db.execute({sql:`SELECT Id,Code,CustomerName,Phone,Total,Status,CreatedAt FROM Orders${where} ORDER BY Id DESC LIMIT 30 OFFSET ?`,args:[...args,(page-1)*30]})).rows;
      const count=(await db.execute({sql:`SELECT COUNT(*) AS Count FROM Orders${where}`,args})).rows[0].Count;
      return json({success:true,orders:rows,page,total:Number(count)});
    }
    const orderMatch=path.match(/^\/api\/admin\/orders\/(\d+)$/);
    if(orderMatch){const id=integer(Number(orderMatch[1]),'Mã đơn');
      if(method==='GET'){const order=(await db.execute({sql:'SELECT Id,Code,CustomerName,Phone,Address,Note,Total,Status,PaymentMethod,CreatedAt,UpdatedAt FROM Orders WHERE Id=?',args:[id]})).rows[0];if(!order)fail('Không tìm thấy đơn.',404);const items=(await db.execute({sql:'SELECT ProductId,ProductName,UnitPrice,Quantity FROM OrderItems WHERE OrderId=? ORDER BY Id',args:[id]})).rows;return json({success:true,order,items});}
      if(method==='PATCH'){
        const data=await body(request);if(!statuses.includes(data.status) || !statuses.includes(data.previousStatus))fail('Trạng thái không hợp lệ.');
        if(!transitions[data.previousStatus].includes(data.status))fail('Không thể chuyển sang trạng thái này.',409);
        const result=await db.execute({sql:"UPDATE Orders SET Status=?,UpdatedAt=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE Id=? AND Status=?",args:[data.status,id,data.previousStatus]});if(!result.rowsAffected)fail('Đơn đã thay đổi. Hãy tải lại chi tiết.',409);return json({success:true});
      }
    }
  }
  fail('Không tìm thấy API.',404);
}
function secure(response,isApi) {
  const headers=new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');headers.set('X-Frame-Options','DENY');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if(isApi && !headers.get('Cache-Control')?.includes('immutable'))headers.set('Cache-Control','no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export function createWorker(clientFactory=createClient) { return {async fetch(request,env) {
  const url=new URL(request.url);const isApi=url.pathname.startsWith('/api/');let db;
  try {
    let response;
    if(url.pathname==='/api/health' && request.method==='GET')response=json({success:true,message:'Backend đang hoạt động!'});
    else if(isApi){db=clientFactory({url:env.TURSO_DATABASE_URL,authToken:env.TURSO_AUTH_TOKEN});response=await api(request,env,db,url);}
    else response=await env.ASSETS.fetch(request);
    return secure(response,isApi);
  }catch(error){
    // Never log database error messages, URLs, tokens or customer details.
    const status=error instanceof HttpError?error.status:503;
    if(!(error instanceof HttpError))console.error('API failure category:', error.code==='AUTH_CONFIG'?'AUTH_CONFIG':error.name==='TypeError'?'TYPE_ERROR':'SERVICE_ERROR');
    return secure(json({success:false,message:error instanceof HttpError?error.message:'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại.'},status),true);
  }finally{db?.close();}
}}; }
export default createWorker();
