export class HttpError extends Error { constructor(status, message) { super(message); this.status=status; } }
export const fail = (message, status=400) => { throw new HttpError(status, message); };
export function text(value, label, min, max) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(`${label} cần từ ${min} đến ${max} ký tự.`);
  return value.trim();
}
export function integer(value, label, min=1, max=2147483647) {
  if (!Number.isSafeInteger(value) || value<min || value>max) fail(`${label} không hợp lệ.`);
  return value;
}
export async function readBytes(request, limit) {
  if(Number(request.headers.get('content-length'))>limit)fail('Dữ liệu quá lớn.',413);
  const reader=request.body?.getReader();if(!reader)fail('Thiếu dữ liệu.');
  const chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();fail('Dữ liệu quá lớn.',413);}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail('Yêu cầu phải dùng JSON.',415);
  const bytes=await readBytes(request,32768);
  let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('JSON không hợp lệ.');}
  if(!data||typeof data!=='object'||Array.isArray(data))fail('Dữ liệu không hợp lệ.');return data;
}
export function sameOrigin(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) fail('Nguồn yêu cầu không hợp lệ.',403);
}
export function productInput(data) {
  const image=text(data.ImageUrl ?? '', 'Đường dẫn ảnh',0,240);
  if(image && !/^\/api\/images\/[a-f0-9]{64}$/.test(image) && !/^\/images\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(image)) fail('Ảnh phải là ảnh tải lên hoặc ảnh trong /images.');
  if(image.includes('..') || image.includes('//')) fail('Đường dẫn ảnh không hợp lệ.');
  if(data.IsActive!==0 && data.IsActive!==1)fail('Trạng thái bán không hợp lệ.');
  return {Name:text(data.Name,'Tên món',1,120),Price:integer(data.Price,'Giá',0,10000000),ImageUrl:image,Description:text(data.Description ?? '', 'Mô tả',0,1000),IsActive:data.IsActive};
}
export function orderInput(data) {
  const customer={name:text(data.name,'Họ tên',2,100),phone:text(data.phone,'Số điện thoại',10,15).replace(/[ .-]/g,''),address:text(data.address,'Địa chỉ',5,500),note:text(data.note ?? '', 'Ghi chú',0,1000)};
  if(!/^(?:0\d{9}|\+84\d{9})$/.test(customer.phone))fail('Số điện thoại Việt Nam không hợp lệ.');
  if(!Array.isArray(data.items) || data.items.length<1 || data.items.length>50)fail('Giỏ hàng cần từ 1 đến 50 món.');
  const seen=new Set(); const items=data.items.map(item=>{if(!item || typeof item!=='object')fail('Món không hợp lệ.');const id=integer(item.productId,'Mã sản phẩm');if(seen.has(id))fail('Sản phẩm trùng trong giỏ.');seen.add(id);return {productId:id,quantity:integer(item.quantity,'Số lượng',1,99)};}).sort((a,b)=>a.productId-b.productId);
  if(items.reduce((sum,item)=>sum+item.quantity,0)>200)fail('Mỗi đơn tối đa 200 ly.');
  return {...customer,items};
}
