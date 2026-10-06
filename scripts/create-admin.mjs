import { loadEnv, connect } from './env.mjs';
import { randomToken, passwordHash } from '../src/security.js';
import { SetupError, safeError } from './diagnostics.mjs';

let env = { ...process.env }, db, tx;
let stage = 'đọc cấu hình';
try {
  env = loadEnv();
  if (typeof env.AUTH_SECRET !== 'string' || env.AUTH_SECRET.length < 32) {
    throw new SetupError('AUTH_CONFIG', 'AUTH_SECRET bị thiếu hoặc ngắn hơn 32 ký tự. Kiểm tra .dev.vars và biến môi trường.');
  }
  stage = 'kiểm tra thông tin đăng nhập';
  const username = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!/^[a-z0-9_.-]{3,80}$/.test(username)) {
    throw new SetupError('ADMIN_USERNAME_INVALID', 'Tên đăng nhập cần 3–80 ký tự, chỉ gồm a-z, 0-9, dấu gạch dưới, dấu chấm hoặc dấu gạch ngang.');
  }
  if (password.length < 12 || password.length > 200 || !password.trim()) {
    throw new SetupError('ADMIN_PASSWORD_INVALID', 'Mật khẩu cần 12–200 ký tự và không được chỉ chứa khoảng trắng. Hãy chạy lại và nhập mật khẩu đáp ứng yêu cầu.');
  }
  stage = 'kết nối Turso';
  db = connect(env);
  stage = 'kiểm tra bảng quản trị';
  const required = {
    Admins: ['Id', 'Username', 'PasswordHash', 'Salt'],
    AdminSessions: ['TokenHash', 'AdminId', 'ExpiresAt'],
    RateLimits: ['Key', 'Count', 'ExpiresAt']
  };
  const missing = [];
  for (const [table, columns] of Object.entries(required)) {
    // Names are hard-coded above, never derived from input.
    const actual = (await db.execute(`PRAGMA table_info(${table})`)).rows.map(row => row.name);
    if (!actual.length) { missing.push(table); continue; }
    const absent = columns.filter(column => !actual.includes(column));
    if (absent.length) throw new SetupError('ADMIN_SCHEMA_INVALID', `Bảng ${table} thiếu cột ${absent.join(', ')}. Kiểm tra schema trước khi tạo admin; không xóa dữ liệu.`);
  }
  if (missing.length) throw new SetupError('ADMIN_TABLES_MISSING', `Thiếu bảng ${missing.join(', ')}. Chạy npm run migrate rồi chạy lại lệnh tạo admin.`);
  stage = 'băm mật khẩu';
  const salt = randomToken();
  const hash = await passwordHash(password, salt, env.AUTH_SECRET);
  stage = 'mở giao dịch';
  tx = await db.transaction('write');
  stage = 'kiểm tra admin hiện có';
  if ((await tx.execute('SELECT Id FROM Admins LIMIT 1')).rows.length) {
    throw new SetupError('ADMIN_ALREADY_EXISTS', 'Đã có tài khoản admin. Lệnh này chỉ tạo tài khoản đầu tiên; dùng tài khoản hiện có để đăng nhập.');
  }
  stage = 'lưu tài khoản admin';
  await tx.execute({ sql: 'INSERT INTO Admins (Username,PasswordHash,Salt) VALUES (?,?,?)', args: [username, hash, salt] });
  stage = 'commit giao dịch';
  await tx.commit();
  console.log('Đã tạo admin thành công. Mật khẩu không được in hoặc lưu dạng rõ.');
} catch (error) {
  // Preserve the original failure even if the connection also fails during rollback.
  console.error(`Không tạo được admin tại bước ${stage}: ${safeError(error, env)}`);
  try { await tx?.rollback(); }
  catch (rollbackError) { console.error(`Rollback cũng thất bại: ${safeError(rollbackError, env)}`); }
  process.exitCode = 1;
} finally {
  try { tx?.close(); } catch (error) { console.error(`Đóng giao dịch thất bại: ${safeError(error, env)}`); process.exitCode = 1; }
  try { db?.close(); } catch (error) { console.error(`Đóng kết nối thất bại: ${safeError(error, env)}`); process.exitCode = 1; }
}
