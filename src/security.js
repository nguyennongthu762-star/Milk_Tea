const encoder = new TextEncoder();
export const bytesHex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const randomToken = () => bytesHex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value) { return bytesHex(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
export function requireSecret(env) {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {const error=new Error('AUTH_SECRET is missing');error.code='AUTH_CONFIG';throw error;}
}
export async function keyedHash(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return bytesHex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
export async function passwordHash(password, salt, secret) {
  const peppered = await keyedHash(password, secret);
  const key = await crypto.subtle.importKey('raw', encoder.encode(peppered), 'PBKDF2', false, ['deriveBits']);
  return bytesHex(await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-512', salt:encoder.encode(salt), iterations:100000}, key, 256));
}
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0; for (let i=0; i<a.length; i++) difference |= a.charCodeAt(i)^b.charCodeAt(i);
  return difference === 0;
}
export function cookieName(request) { return new URL(request.url).protocol === 'https:' ? '__Host-milktea_session' : 'milktea_session'; }
export function sessionCookie(request, token, maxAge = 28800) {
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('HTTPS required');
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${url.protocol === 'https:' ? '; Secure' : ''}`;
}
export function readCookie(request) {
  const prefix = cookieName(request) + '=';
  return (request.headers.get('Cookie') || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(prefix))?.slice(prefix.length) || '';
}
