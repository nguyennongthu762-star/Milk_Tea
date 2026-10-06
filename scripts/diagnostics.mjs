// CLI-only diagnostics: retain the underlying error without printing secrets or stacks.
export class SetupError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function safeError(error, env = {}) {
  const secrets = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'AUTH_SECRET', 'ADMIN_PASSWORD']
    .map(key => env[key]).filter(value => typeof value === 'string' && value.length);
  const variants = [...new Set(secrets.flatMap(value => [value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1)]))]
    .sort((a, b) => b.length - a.length);
  const seen = new Set(); const messages = [];
  for (let cause = error; cause && !seen.has(cause) && messages.length < 5; cause = cause.cause) {
    seen.add(cause);
    const code = /^[A-Z0-9_]{1,80}$/.test(cause.code || '') ? `[${cause.code}] ` : '';
    let message = code + (typeof cause.message === 'string' ? cause.message : 'Lỗi không xác định.');
    for (const value of variants) message = message.split(value).join('[REDACTED]');
    message = message.replace(/(?:https?|libsql):\/\/[^\s"'<>]+/gi, '[DATABASE_URL]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[TOKEN]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [TOKEN]')
      .replace(/[\r\n\u0000-\u001f\u007f]/g, ' ');
    if (!messages.includes(message)) messages.push(message.slice(0, 1500));
  }
  return messages.join(' | Nguyên nhân: ');
}
