import {imagePath} from './ui.js';
export function createImagePicker(form) {
  const input=document.getElementById('product-image'),drop=document.getElementById('image-drop'),preview=document.getElementById('image-preview'),notice=document.getElementById('image-message'),choose=document.getElementById('choose-image'),remove=document.getElementById('remove-image');
  let selected=null,previewUrl=null,version=0,pending=false,locked=false;
  function release(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;}
  function clear(){version++;release();selected=null;pending=false;input.value='';form.elements.ImageUrl.value='';preview.removeAttribute('src');preview.hidden=true;remove.hidden=true;notice.textContent='';}
  function reset(url=''){clear();const source=imagePath(url);if(source){form.elements.ImageUrl.value=source;preview.src=source;preview.hidden=false;remove.hidden=false;}}
  function setLocked(value){locked=value;input.disabled=choose.disabled=remove.disabled=value;drop.classList.toggle('disabled',value);}
  async function select(file){
    if(locked)return;const ticket=++version;pending=false;notice.textContent='';
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){notice.textContent='Chỉ chọn ảnh JPEG, PNG hoặc WebP.';return;}
    if(file.size>5*1024*1024){notice.textContent='Ảnh quá lớn. Hãy chọn ảnh tối đa 5 MB.';return;}
    pending=true;notice.textContent='Đang chuẩn bị ảnh…';let bitmap;
    try {
      bitmap=await createImageBitmap(file);if(ticket!==version)return;
      if(bitmap.width*bitmap.height>32000000)throw new Error('Kích thước ảnh quá lớn. Hãy chọn ảnh nhỏ hơn.');
      const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.82));if(ticket!==version)return;
      if(!blob || blob.size>524288)throw new Error('Ảnh sau thu nhỏ vẫn quá lớn. Hãy chọn ảnh đơn giản hoặc nhỏ hơn.');
      release();selected=blob;previewUrl=URL.createObjectURL(blob);preview.src=previewUrl;preview.hidden=false;remove.hidden=false;notice.textContent=`Đã chọn ${file.name}. Ảnh sẽ được lưu khi bạn lưu sản phẩm.`;
    }catch(error){if(ticket===version)notice.textContent=error.message?.includes('quá lớn')?error.message:'Không đọc được ảnh. Hãy chọn một file ảnh hợp lệ.';}
    finally{bitmap?.close();if(ticket===version)pending=false;}
  }
  input.addEventListener('change',()=>select(input.files[0]));choose.addEventListener('click',()=>input.click());remove.addEventListener('click',()=>{if(!locked)clear();});
  for(const type of ['dragenter','dragover'])drop.addEventListener(type,event=>{event.preventDefault();if(!locked){drop.classList.add('drag-over');if(event.dataTransfer)event.dataTransfer.dropEffect='copy';}});
  drop.addEventListener('dragleave',()=>drop.classList.remove('drag-over'));
  drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('drag-over');if(locked)return;const files=event.dataTransfer?.files;if(files?.length!==1){notice.textContent='Mỗi sản phẩm chỉ chọn một ảnh.';return;}select(files[0]);});
  return {reset,setLocked,get blob(){return selected;},get pending(){return pending;}};
}
