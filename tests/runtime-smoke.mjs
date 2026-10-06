import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const root=process.env.SMOKE_URL || 'http://127.0.0.1:8790';
for(const path of ['/api/health','/api/products','/api/admin/session','/','/admin.html']){
  const response=await fetch(root+path);assert.equal(response.status,path.includes('session')?401:200);assert.ok(response.headers.get('Content-Security-Policy'));
}
const products=(await (await fetch(root+'/api/products')).json()).products;assert.ok(products.length>0);
const browser=await chromium.launch();try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const width of [390,1280]){await page.setViewportSize({width,height:900});await page.goto(root);await page.getByRole('button',{name:'Thêm vào giỏ'}).first().waitFor();assert.match(await page.locator('h2').first().textContent(),/Menu trà sữa/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const image=page.locator('.product img').first();if(await image.count()){await image.scrollIntoViewIfNeeded();assert.ok(await image.evaluate(img=>img.complete&&img.naturalWidth>0));}fs.mkdirSync('.test-data',{recursive:true});await page.screenshot({path:`.test-data/runtime-${width}.png`,fullPage:true});}
  await page.getByRole('button',{name:'Thêm vào giỏ'}).first().click();await page.reload();await page.waitForFunction(()=>document.getElementById('cart-count').textContent==='1');assert.deepEqual(errors,[]);
  console.log('PASS actual Wrangler/Turso smoke: API, unauthorized admin, image, UTF-8, cart reload, mobile/desktop. No test orders created.');
}finally{await browser.close();}
