# MilkTeaShop

Website tiếng Việt dùng HTML/CSS/JavaScript, Cloudflare Workers và Turso libSQL. Không kết nối Turso từ trình duyệt. Thanh toán hiện chỉ có COD.

## Chạy local

Yêu cầu Node.js 22 trở lên và npm.

```powershell
npm install
# Chỉ làm trên máy mới chưa có .dev.vars; không ghi đè cấu hình hiện có:
Copy-Item .dev.vars.example .dev.vars
```

Điền `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` và `AUTH_SECRET` trong `.dev.vars`. `AUTH_SECRET` là bí mật ngẫu nhiên ít nhất 32 ký tự, giữ ổn định; có thể dùng trình quản lý mật khẩu để tạo. Workspace hiện đã có bí mật ngẫu nhiên được tạo, không cần thay thế. Không đưa `.dev.vars` lên Git, vào `public` hoặc log. `.gitignore` bỏ qua file này nhưng cho phép `.dev.vars.example` chỉ chứa placeholder.

```powershell
npm run migrate
npm run dev
```

Mở `http://localhost:8787`; quản trị tại `/admin.html`. Nếu có tiến trình dev đã mở trước khi thay `.dev.vars`, cần khởi động lại để nạp secrets. Có thể dùng cổng khác:

```powershell
npm run dev -- --ip 127.0.0.1 --port 8790
```

Mở trang qua Workers, không mở trực tiếp file HTML hoặc một static server riêng: API và cookie cần cùng origin.

## Migration

`npm run migrate` dùng `.dev.vars` hoặc biến môi trường tiến trình (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`), kiểm tra sáu cột thực tế của `Products` trước khi chạy. Migration SQL nằm trong `migrations/001_orders_admin.sql` và `migrations/002_product_images.sql`; migration thứ hai thêm bảng ảnh `ProductImages`, giữ nguyên dữ liệu cũ; thêm `Orders`, `OrderItems`, `Admins`, `AdminSessions`, `RateLimits` và index. Bảng `SchemaMigrations` ghi nhận các migration đã áp dụng. Chạy lại an toàn; mỗi migration chạy trong một giao dịch. Không có `DROP`, không sửa hay xóa bảng/dữ liệu sản phẩm hiện hữu. Với CSDL hoàn toàn mới, cần tạo/import bảng `Products` có `Id INTEGER PRIMARY KEY`, `Name TEXT NOT NULL`, `Price INTEGER NOT NULL`, `ImageUrl TEXT`, `Description TEXT`, `IsActive INTEGER NOT NULL DEFAULT 1` trước.

Migration đã được áp dụng vào Turso của workspace này. Các bài kiểm thử đơn hàng dùng CSDL libSQL riêng, không ghi đơn thử vào Turso thật.

## Tạo admin ban đầu

Không có tài khoản/mật khẩu mặc định hoặc đăng ký admin qua API. Trên Windows, chạy từ workspace:

```powershell
powershell -NoProfile -File scripts/create-admin.ps1
```

Lệnh hỏi tên đăng nhập và nhập mật khẩu ẩn (12–200 ký tự). Mật khẩu chỉ được chuyển vào môi trường tiến trình con rồi xóa khỏi môi trường, không ghi vào file hoặc log. Tên đăng nhập dùng 3–80 ký tự `a-z`, `0-9`, `_`, `.`, `-` và được chuẩn hóa chữ thường. Cần chạy migration và cấu hình `AUTH_SECRET` trước. Lệnh chỉ tạo admin đầu tiên; kiểm tra và thêm admin nằm trong cùng giao dịch để tránh tạo hai tài khoản khi chạy đồng thời.

Trên môi trường khác, cung cấp `ADMIN_USERNAME` và `ADMIN_PASSWORD` bằng môi trường tiến trình từ secret manager hoặc nhập kín rồi chạy `npm run admin:create`; xóa hai biến sau đó. Không truyền mật khẩu trực tiếp vào câu lệnh hoặc lưu trong `.dev.vars`. Không deploy hai biến khởi tạo này.

CSDL chỉ lưu salt và hash PBKDF2-SHA512 (100.000 vòng), với HMAC-SHA256 bằng `AUTH_SECRET` trước khi băm. Phiên 8 giờ có token ngẫu nhiên, CSDL lưu hash token; cookie HttpOnly, SameSite=Strict, Secure và tiền tố `__Host-` khi dùng HTTPS. HTTP chỉ hỗ trợ môi trường localhost. Logout thu hồi phiên. Các API quản trị đều kiểm tra phiên tại backend. Yêu cầu thay đổi dữ liệu phải có Origin cùng website để ngăn CSRF. Có giới hạn đăng nhập theo IP/tài khoản và giới hạn đặt hàng theo IP, dùng bảng chung để áp dụng giữa các Workers.

Nếu tạo admin thất bại, script hiển thị bước và lỗi gốc đã che URL/token/mật khẩu. `ADMIN_USERNAME_INVALID` nghĩa là tên sai định dạng; `ADMIN_PASSWORD_INVALID` nghĩa là mật khẩu không đáp ứng 12–200 ký tự; `AUTH_CONFIG` nghĩa là thiếu/bí mật phiên quá ngắn; `ADMIN_TABLES_MISSING` yêu cầu chạy `npm run migrate`; `ADMIN_ALREADY_EXISTS` nghĩa là tài khoản đầu tiên đã được tạo. Lỗi kết nối/SQL giữ mã lỗi và nguyên nhân đã che bí mật. File `.dev.vars` được đọc từ thư mục dự án, độc lập với thư mục hiện tại của Terminal; biến môi trường tiến trình vẫn được ưu tiên. Không có mật khẩu mặc định, không tự tạo lại hoặc ghi đè tài khoản.

Giữ `AUTH_SECRET` khi deploy cùng CSDL; thay bí mật sẽ vô hiệu phiên và khiến hash mật khẩu hiện tại không còn xác thực được. Chưa có giao diện đổi/khôi phục mật khẩu hoặc quản lý nhiều admin.

## Chức năng

- Menu ảnh, mô tả, giá VNĐ và tìm kiếm theo tên; trạng thái đang tải, rỗng, lỗi và thử lại.
- Giỏ hàng tăng/giảm/xóa món và tổng tiền; localStorage chỉ lưu ID/số lượng, giá và trạng thái bán được tải lại từ API. Nếu localStorage bị chặn, giỏ vẫn hoạt động trong lần mở trang.
- Đặt COD không cần đăng nhập: họ tên, điện thoại Việt Nam, địa chỉ, ghi chú. Backend giới hạn 50 món khác nhau, 99 ly/món, 200 ly/đơn và kiểm tra sản phẩm đang bán. Giá/total gửi thêm từ trình duyệt bị bỏ qua.
- Đơn và chi tiết lưu trong một giao dịch; lưu tên món và giá lúc đặt. Khóa `Idempotency-Key` duy nhất kết hợp hash dữ liệu tránh gửi trùng, kể cả khi máy chủ đã lưu nhưng phản hồi bị mất. Khi lỗi, giữ giỏ; cùng thông tin dùng lại khóa. Khi thành công, hiện mã `MT-…` và tổng chính thức, xóa giỏ.
- Quản trị thêm/sửa/bật/tắt bán; không có xóa sản phẩm, bảo toàn lịch sử đơn. Ảnh cũ từ `/images/...` trong `public/images` vẫn dùng được. Khi thêm/sửa sản phẩm, bấm **Chọn ảnh** hoặc kéo một file ảnh vào vùng chọn, xem trước rồi bấm **Lưu sản phẩm**. Nhận JPEG/PNG/WebP tối đa 5 MB, thu nhỏ tối đa 1200 px và nén xuống tối đa 512 KB. Ảnh được lưu dạng BLOB trong bảng `ProductImages` của Turso qua API chỉ dành cho admin; ảnh được phục vụ qua `/api/images/:id` và dùng được trên máy khác. Ảnh trùng nội dung dùng lại cùng ID, chưa cần R2. Cách lưu này phù hợp cửa hàng nhỏ; ảnh đã tải lên được giữ lại khi thay ảnh sản phẩm.
- Danh sách đơn phân trang 30 đơn, lọc trạng thái, chi tiết và cập nhật: chờ xác nhận → đã xác nhận → đang giao → hoàn thành. Có thể hủy từ ba trạng thái đầu; hoàn thành/hủy là trạng thái cuối. Backend kiểm tra chuyển trạng thái và trạng thái trước đó để phát hiện cập nhật đồng thời.
- Truy vấn SQL có tham số, kiểm tra JSON/kích thước dữ liệu, render bằng `textContent`, CSP và các header bảo mật. Không log thông tin khách hàng hoặc lỗi CSDL chứa bí mật.

Tổng tiền hiện là tổng giá món, chưa có phí giao hàng/khuyến mãi và chưa tích hợp thanh toán online.

## Kiểm tra

```powershell
npm run check
npm test
npx playwright install chromium
npm run test:browser
# Khi Workers local đang chạy tại cổng 8790:
npm run test:runtime
# Hoặc đặt $env:SMOKE_URL="http://localhost:8787" trước lệnh test:runtime.
```

Kiểm thử API gọi handler Workers với client libSQL và CSDL riêng. Kiểm thử Chromium dùng cùng handler qua HTTP server kiểm thử; bao gồm giỏ sau reload, tăng/giảm, tìm kiếm, COD thành công/thất bại, mất phản hồi rồi thử lại, đăng nhập, sản phẩm, chọn/kéo thả ảnh, xem trước và lưu ảnh sau reload, lỗi tải ảnh lên, trạng thái đơn, logout, các trạng thái menu, XSS và chiều rộng 390/1280 px. CSDL thử nằm trong `.test-data/` bị Git bỏ qua, giữ lại để chẩn đoán khóa file SQLite trên Windows; không chứa token Turso hoặc dữ liệu khách hàng thật.

Kiểm thử API còn kiểm tra giá frontend bị sửa, sản phẩm ngừng bán, snapshot tên/giá, gửi đồng thời cùng khóa, rollback khi lưu chi tiết lỗi, CSRF, cookie HTTPS, API quản trị không có quyền, phiên hết hạn và giới hạn đăng nhập. Runtime Workers local đã được kiểm tra riêng với Turso thật cho health/menu, HTML/admin, chặn truy cập chưa đăng nhập và băm mật khẩu khi đăng nhập sai. Chưa chạy luồng tạo đơn/đăng nhập admin thật trên Turso để tránh tạo dữ liệu thử trong CSDL cửa hàng.

## Cloudflare deployment (chưa thực hiện)

Cấu hình Worker và static assets nằm trong `wrangler.jsonc`; assets đi qua Worker để thêm header bảo mật. Khi sẵn sàng, đăng nhập và nhập secrets bằng prompt kín của Wrangler:

```powershell
npx wrangler login
npx wrangler secret put TURSO_DATABASE_URL
npx wrangler secret put TURSO_AUTH_TOKEN
npx wrangler secret put AUTH_SECRET
# Xác nhận cấu hình CSDL mục tiêu, chạy migration và tạo admin nếu chưa có.
npm run migrate
# Chỉ chạy khi quyết định deploy:
npx wrangler deploy
```

Dùng đúng `AUTH_SECRET` đã dùng tạo admin cho CSDL mục tiêu. Có thể nhập secrets trong Cloudflare dashboard. Không đặt secrets trong `wrangler.jsonc`, mã frontend hay README. Migration là lệnh riêng, không tự chạy khi khởi động Worker. Sau deploy, kiểm tra HTTPS, menu, giỏ, đơn COD và quản trị; không cần R2.

Tài liệu chính thức: [libSQL transactions](https://tursodatabase.github.io/libsql-client-ts/interfaces/Transaction.html), [Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/), [Wrangler secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
