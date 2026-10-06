import { fail, readBytes } from './validation.js';
import { bytesHex } from './security.js';
export async function uploadImage(db, request) {
  const bytes = await readBytes(request, 524288);
  let type;
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) type = 'image/jpeg';
  else if (bytes.length > 8 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) type = 'image/png';
  else if (bytes.length > 12 && new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP') type = 'image/webp';
  else fail('Chỉ nhận ảnh JPEG, PNG hoặc WebP hợp lệ.',415);
  if (request.headers.get('Content-Type')?.split(';')[0] !== type) fail('Định dạng ảnh không khớp nội dung.',415);
  const id = bytesHex(await crypto.subtle.digest('SHA-256', bytes));
  await db.execute({sql:'INSERT OR IGNORE INTO ProductImages (Id,ContentType,Data) VALUES (?,?,?)',args:[id,type,bytes]});
  return Response.json({success:true,imageUrl:'/api/images/'+id},{status:201});
}
export async function serveImage(db,id) {
  const row=(await db.execute({sql:'SELECT ContentType,Data FROM ProductImages WHERE Id=?',args:[id]})).rows[0];
  if(!row)fail('Không tìm thấy ảnh.',404);
  return new Response(row.Data,{headers:{'Content-Type':row.ContentType,'Cache-Control':'public, max-age=31536000, immutable'}});
}
export async function checkImage(db, product) {
  if(product.ImageUrl.startsWith('/api/images/')) {
    const rows=(await db.execute({sql:'SELECT Id FROM ProductImages WHERE Id=?',args:[product.ImageUrl.slice('/api/images/'.length)]})).rows;
    if(!rows.length)fail('Ảnh chưa được lưu. Vui lòng chọn ảnh và thử lại.');
  }
}
