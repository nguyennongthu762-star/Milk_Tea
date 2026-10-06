export const money=value=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(value);
export function element(tag,content,className) {const node=document.createElement(tag);if(content!==undefined)node.textContent=content;if(className)node.className=className;return node;}
export function button(label,handler,className) {const node=element('button',label,className);node.type='button';node.addEventListener('click',handler);return node;}
export async function api(path,options={}) {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try {const response=await fetch(path,{...options,signal:controller.signal,headers:{...(typeof options.body==='string'?{'Content-Type':'application/json'}:{}),...options.headers}});let data;try{data=await response.json();}catch{throw new Error('Phản hồi máy chủ không hợp lệ.');}
    if(!response.ok || !data.success){const error=new Error(data.message || 'Yêu cầu thất bại.');error.status=response.status;throw error;}return data;
  }catch(error){if(error.name==='AbortError')throw new Error('Kết nối quá thời gian. Vui lòng thử lại.');throw error;}finally{clearTimeout(timer);}
}
export function imagePath(value) {if(typeof value==='string' && /^\/api\/images\/[a-f0-9]{64}$/.test(value))return value;return typeof value==='string' && /^\/images\/[a-zA-Z0-9_./-]+\.(png|jpe?g|webp|gif|avif)$/i.test(value) && !value.includes('..') && !value.includes('//')?value:null;}
