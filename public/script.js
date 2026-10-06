import {CART_KEY,ATTEMPT_KEY,readCart,changeQuantity,totals} from './cart.js';
import {api,money,element,button,imagePath} from './ui.js';
const $=id=>document.getElementById(id);let products=[],loaded=false,busy=false,storage;
try{storage=window.localStorage;}catch{}
let cart=storage?readCart(storage):[];let lastAttempt=null;
function store() {try{storage.setItem(CART_KEY,JSON.stringify(cart));}catch{$('cart-message').textContent='Trình duyệt không cho lưu giỏ hàng. Giỏ chỉ giữ trong lần mở trang này.';}}
function change(id,delta) {if(busy)return;cart=changeQuantity(cart,id,delta);store();renderCart();}
function renderMenu() {
  $('product-list').replaceChildren();const query=$('search').value.trim().toLocaleLowerCase('vi');const visible=products.filter(p=>p.Name.toLocaleLowerCase('vi').includes(query));
  if(loaded)$('status').textContent=products.length?(visible.length?'':'Không tìm thấy món phù hợp.'):'Chưa có sản phẩm đang bán.';
  for(const product of visible){const card=element('article',undefined,'product');const source=imagePath(product.ImageUrl);
    if(source){const image=element('img');image.src=source;image.alt=product.Name;image.loading='lazy';image.addEventListener('error',()=>image.replaceWith(element('div','MilkTeaShop','image-placeholder')));card.append(image);}else card.append(element('div','MilkTeaShop','image-placeholder'));
    card.append(element('h3',product.Name),element('p',product.Description || '','description'),element('p',money(Number(product.Price)),'price'),button('Thêm vào giỏ',()=>change(Number(product.Id),1)));$('product-list').append(card);
  }
}
function renderCart() {
  $('cart-items').replaceChildren();$('cart-count').textContent=cart.reduce((sum,item)=>sum+item.quantity,0);$('cart-total').textContent=money(totals(cart,products));
  if(!cart.length)$('cart-items').append(element('p','Giỏ hàng đang trống. Chọn một ly trà bạn thích nhé.','muted'));
  for(const item of cart){const product=products.find(p=>Number(p.Id)===item.productId);const row=element('div',undefined,'cart-row');row.append(element('strong',product?.Name || `Món #${item.productId}`));
    row.append(element('p',product?money(Number(product.Price)*item.quantity):(loaded?'Món đã ngừng bán. Hãy xóa khỏi giỏ.':'Đang xác nhận sản phẩm…'),'muted'));
    const controls=element('div',undefined,'quantity');const minus=button('−',()=>change(item.productId,-1));minus.setAttribute('aria-label',`Giảm số lượng ${product?.Name || item.productId}`);
    const plus=button('+',()=>change(item.productId,1));plus.setAttribute('aria-label',`Tăng số lượng ${product?.Name || item.productId}`);plus.disabled=busy||item.quantity>=99||!product;
    const remove=button('Xóa',()=>{if(busy)return;cart=cart.filter(x=>x.productId!==item.productId);store();renderCart();},'secondary');minus.disabled=remove.disabled=busy;
    controls.append(minus,element('span',String(item.quantity)),plus,remove);row.append(controls);$('cart-items').append(row);
  }
  $('place-order').disabled=busy || !loaded || !cart.length || cart.some(item=>!products.some(p=>Number(p.Id)===item.productId));
  $('place-order').textContent=busy?'Đang gửi đơn…':'Đặt hàng · Thanh toán COD';
}
async function loadProducts() {
  loaded=false;$('status').textContent='Đang tải sản phẩm…';$('retry').hidden=true;renderCart();
  try{products=(await api('/api/products')).products;loaded=true;renderMenu();}catch{$('status').textContent='Không kết nối được menu. Vui lòng thử lại.';$('retry').hidden=false;}renderCart();
}
$('search').addEventListener('input',renderMenu);$('retry').addEventListener('click',loadProducts);
$('checkout').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||$('place-order').disabled)return;
  const fields=Object.fromEntries(new FormData(event.target));const payload={...fields,items:cart.map(item=>({...item}))};const serialized=JSON.stringify(payload);
  let attempt=lastAttempt;try{attempt=JSON.parse(storage?.getItem(ATTEMPT_KEY) || 'null') || lastAttempt;}catch{}
  if(!attempt||attempt.payload!==serialized)attempt={payload:serialized,key:crypto.randomUUID()};
  lastAttempt=attempt;try{storage?.setItem(ATTEMPT_KEY,JSON.stringify(attempt));}catch{}
  busy=true;$('order-message').textContent='Đang gửi đơn hàng…';for(const field of event.target.elements)field.disabled=true;renderCart();
  try{
    const result=await api('/api/orders',{method:'POST',headers:{'Idempotency-Key':attempt.key},body:serialized});
    cart=[];lastAttempt=null;store();try{storage?.removeItem(ATTEMPT_KEY);}catch{}event.target.reset();
    $('order-message').textContent=`Đặt hàng thành công! Mã đơn: ${result.code}. Tổng tiền: ${money(result.total)}. Thanh toán khi nhận hàng.`;
  }catch(error){$('order-message').textContent=`${error.message} Giỏ hàng được giữ lại. Khi thử lại cùng thông tin, hệ thống sẽ không tạo trùng đơn.`;
  }finally{busy=false;for(const field of event.target.elements)field.disabled=false;renderCart();}
});
window.addEventListener('storage',event=>{if(event.key===CART_KEY&&!busy){cart=readCart(storage);renderCart();}});
renderCart();loadProducts();
