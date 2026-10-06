export const CART_KEY='milkteashop.cart.v1';
export const ATTEMPT_KEY='milkteashop.order-attempt.v1';
export function readCart(storage) {
  try {const data=JSON.parse(storage.getItem(CART_KEY) || '[]');if(!Array.isArray(data))return [];
    const seen=new Set();return data.filter(item=>item && Number.isSafeInteger(item.productId)&&item.productId>0&&Number.isInteger(item.quantity)&&item.quantity>0&&item.quantity<=99&&!seen.has(item.productId)&&(seen.add(item.productId),true)).slice(0,50).map(({productId,quantity})=>({productId,quantity}));
  }catch{return [];}
}
export function changeQuantity(cart,id,delta) {
  const result=cart.map(item=>({...item}));const index=result.findIndex(x=>x.productId===id);
  if(index<0){if(delta>0&&result.length<50)result.push({productId:id,quantity:1});}
  else {result[index].quantity=Math.min(99,result[index].quantity+delta);if(result[index].quantity<=0)result.splice(index,1);}
  return result;
}
export function totals(cart,products) {
  return cart.reduce((total,item)=>total+Number(products.find(p=>Number(p.Id)===item.productId)?.Price || 0)*item.quantity,0);
}
