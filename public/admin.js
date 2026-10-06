import {createImagePicker} from './image-picker.js';
import {api,element,button,money,imagePath} from './ui.js';
const $=id=>document.getElementById(id);const labels={pending:'Chờ xác nhận',confirmed:'Đã xác nhận',shipping:'Đang giao',completed:'Hoàn thành',cancelled:'Đã hủy'};
const transitions={pending:['confirmed','cancelled'],confirmed:['shipping','cancelled'],shipping:['completed','cancelled'],completed:[],cancelled:[]};
let products=[],page=1,authenticated=false;const imagePicker=createImagePicker($('product-form'));let savingProduct=false;
function message(value){$('admin-message').textContent=value;}
function showDashboard(value){authenticated=value;$('dashboard').hidden=!value;$('logout').hidden=!value;$('login-panel').hidden=value;if(!value){$('admin-products').replaceChildren();$('admin-orders').replaceChildren();$('order-detail').replaceChildren();$('product-form').reset();imagePicker.reset();$('product-form').hidden=true;}}
async function run(action){try{await action();}catch(error){if(error.status===401)showDashboard(false);message(error.message);}}
function editProduct(product){if(savingProduct)return;const form=$('product-form');form.reset();imagePicker.reset(product?.ImageUrl || '');for(const key of ['Id','Name','Price','ImageUrl','Description'])form.elements[key].value=product?.[key]??'';form.elements.IsActive.checked=product?!!product.IsActive:true;$('product-title').textContent=product?'Sửa sản phẩm':'Thêm sản phẩm';form.hidden=false;form.elements.Name.focus();}
async function loadProducts(){message('Đang tải sản phẩm…');products=(await api('/api/admin/products')).products;$('admin-products').replaceChildren();for(const p of products){const card=element('article',undefined,'product');const source=imagePath(p.ImageUrl);if(source){const image=element('img');image.src=source;image.alt=p.Name;card.append(image);}card.append(element('h3',p.Name),element('p',p.Description || ''),element('p',money(Number(p.Price))),element('p',p.IsActive?'Đang bán':'Đã tắt bán','badge'),button('Sửa',()=>editProduct(p)),button(p.IsActive?'Tắt bán':'Bật bán',event=>run(async()=>{const clicked=event.currentTarget;clicked.disabled=true;try{await api('/api/admin/products/'+p.Id,{method:'PATCH',body:JSON.stringify({...p,Price:Number(p.Price),IsActive:p.IsActive?0:1})});await loadProducts();}finally{clicked.disabled=false;}}),'secondary'));$('admin-products').append(card);}message(products.length?'':'Chưa có sản phẩm.');}
async function loadOrders(){message('Đang tải đơn hàng…');const data=await api(`/api/admin/orders?page=${page}&status=${encodeURIComponent($('order-filter').value)}`);$('admin-orders').replaceChildren();$('order-detail').hidden=true;
  for(const order of data.orders){const row=element('article',undefined,'order-row');row.append(element('strong',order.Code),element('p',`${order.CustomerName} · ${order.Phone}`),element('p',`${money(Number(order.Total))} · ${labels[order.Status]}`),element('p',new Date(order.CreatedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}),'muted'),button('Xem chi tiết',()=>run(()=>detail(order.Id))));$('admin-orders').append(row);}
  $('page-label').textContent=`Trang ${page} · ${data.total} đơn`;$('prev-page').disabled=page<=1;$('next-page').disabled=page*30>=data.total;message(data.orders.length?'':'Chưa có đơn hàng.');
}
async function detail(id){const {order,items}=await api('/api/admin/orders/'+id);const panel=$('order-detail');panel.replaceChildren();panel.hidden=false;panel.append(element('h3',order.Code),element('p',`${order.CustomerName} · ${order.Phone}`),element('p',order.Address),element('p','Ghi chú: '+(order.Note || 'Không có')),element('p','Thanh toán: COD'));
  for(const item of items)panel.append(element('p',`${item.ProductName} × ${item.Quantity} · ${money(Number(item.UnitPrice)*Number(item.Quantity))}`));
  panel.append(element('strong','Tổng: '+money(Number(order.Total))),element('p','Trạng thái: '+labels[order.Status]));
  for(const status of transitions[order.Status])panel.append(button(labels[status],event=>run(async()=>{const clicked=event.currentTarget;clicked.disabled=true;try{await api('/api/admin/orders/'+id,{method:'PATCH',body:JSON.stringify({status,previousStatus:order.Status})});await loadOrders();await detail(id);message('Đã cập nhật trạng thái đơn.');}finally{clicked.disabled=false;}}),status==='cancelled'?'secondary':''));
}
$('login').addEventListener('submit',event=>{event.preventDefault();const form=event.target;const submit=form.querySelector('button');if(submit.disabled)return;const data=Object.fromEntries(new FormData(form));submit.disabled=true;run(async()=>{try{await api('/api/admin/login',{method:'POST',body:JSON.stringify(data)});form.reset();showDashboard(true);await loadProducts();}finally{submit.disabled=false;}});});
$('logout').addEventListener('click',()=>run(async()=>{await api('/api/admin/logout',{method:'POST',body:'{}'});showDashboard(false);message('Đã đăng xuất.');}));
$('new-product').addEventListener('click',()=>editProduct());$('cancel-product').addEventListener('click',()=>{$('product-form').hidden=true;});
$('product-form').addEventListener('submit',event=>{
  event.preventDefault();const form=event.target;if(savingProduct)return;
  if(imagePicker.pending){message('Ảnh đang được xử lý. Vui lòng đợi một chút.');return;}
  const raw=Object.fromEntries(new FormData(form));const data={Name:raw.Name,Price:Number(raw.Price),ImageUrl:raw.ImageUrl,Description:raw.Description,IsActive:form.elements.IsActive.checked?1:0};
  savingProduct=true;imagePicker.setLocked(true);for(const control of form.elements)control.disabled=true;$('new-product').disabled=true;
  run(async()=>{try{
    if(imagePicker.blob){message('Đang lưu ảnh…');const uploaded=await api('/api/admin/images',{method:'POST',body:imagePicker.blob,headers:{'Content-Type':imagePicker.blob.type}});data.ImageUrl=uploaded.imageUrl;}
    await api('/api/admin/products'+(raw.Id?'/'+raw.Id:''),{method:raw.Id?'PATCH':'POST',body:JSON.stringify(data)});form.hidden=true;imagePicker.reset();await loadProducts();message('Đã lưu sản phẩm.');
  }finally{savingProduct=false;for(const control of form.elements)control.disabled=false;imagePicker.setLocked(false);$('new-product').disabled=false;}});
});
$('show-products').addEventListener('click',()=>{$('products-panel').hidden=false;$('orders-panel').hidden=true;run(loadProducts);});
$('show-orders').addEventListener('click',()=>{$('products-panel').hidden=true;$('orders-panel').hidden=false;run(loadOrders);});
$('order-filter').addEventListener('change',()=>{page=1;run(loadOrders);});$('refresh-orders').addEventListener('click',()=>run(loadOrders));
$('prev-page').addEventListener('click',()=>{if(page>1){page--;run(loadOrders);}});$('next-page').addEventListener('click',()=>{page++;run(loadOrders);});
run(async()=>{await api('/api/admin/session');showDashboard(true);await loadProducts();});
