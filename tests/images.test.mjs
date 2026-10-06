import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture,testUser,testPassword} from './support.mjs';
test('Product images require admin and origin, persist bytes, deduplicate and enforce validation',async()=>{
  const f=await fixture();try{
    const bytes=fs.readFileSync('public/images/tstt.jpg');const upload=(headers={})=>({method:'POST',headers:{'Content-Type':'image/jpeg',...headers},body:bytes});
    assert.equal((await f.fetchApi('/api/admin/images',upload())).status,401);
    const login=await f.fetchApi('/api/admin/login',{method:'POST',body:JSON.stringify({username:testUser,password:testPassword})});const cookie=login.headers.get('Set-Cookie').split(';')[0];
    assert.equal((await f.fetchApi('/api/admin/images',upload({Cookie:cookie,Origin:'https://evil.example'}))).status,403);
    const first=await f.fetchApi('/api/admin/images',upload({Cookie:cookie}));assert.equal(first.status,201);const {imageUrl}=await first.json();assert.match(imageUrl,/^\/api\/images\/[a-f0-9]{64}$/);
    const second=await f.fetchApi('/api/admin/images',upload({Cookie:cookie}));assert.equal((await second.json()).imageUrl,imageUrl);assert.equal((await f.db.execute('SELECT COUNT(*) AS n FROM ProductImages')).rows[0].n,1);
    const publicImage=await f.fetchApi(imageUrl);assert.equal(publicImage.status,200);assert.equal(publicImage.headers.get('Content-Type'),'image/jpeg');assert.match(publicImage.headers.get('Cache-Control'),/immutable/);assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()),bytes);
    assert.equal((await f.fetchApi('/api/images/'+'0'.repeat(64))).status,404);
    assert.equal((await f.fetchApi('/api/admin/images',{method:'POST',headers:{Cookie:cookie,'Content-Type':'image/svg+xml'},body:'<svg></svg>'})).status,415);
    assert.equal((await f.fetchApi('/api/admin/images',{method:'POST',headers:{Cookie:cookie,'Content-Type':'image/png'},body:bytes})).status,415);
    assert.equal((await f.fetchApi('/api/admin/images',{method:'POST',headers:{Cookie:cookie,'Content-Type':'image/jpeg'},body:new Uint8Array(524289)})).status,413);
    const product={Name:'Ảnh đã chọn',Price:35000,Description:'',IsActive:1,ImageUrl:imageUrl};const response=await f.fetchApi('/api/admin/products',{method:'POST',headers:{Cookie:cookie},body:JSON.stringify(product)});assert.equal(response.status,201);const {id}=await response.json();assert.equal((await f.db.execute({sql:'SELECT ImageUrl FROM Products WHERE Id=?',args:[id]})).rows[0].ImageUrl,imageUrl);
    assert.equal((await f.fetchApi('/api/admin/products',{method:'POST',headers:{Cookie:cookie},body:JSON.stringify({...product,ImageUrl:'/api/images/'+'0'.repeat(64)})})).status,400);
  }finally{f.close();}
});
