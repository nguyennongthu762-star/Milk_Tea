CREATE TABLE IF NOT EXISTS Orders (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  Code TEXT NOT NULL UNIQUE,
  CustomerName TEXT NOT NULL,
  Phone TEXT NOT NULL,
  Address TEXT NOT NULL,
  Note TEXT NOT NULL DEFAULT '',
  Total INTEGER NOT NULL CHECK(Total >= 0),
  Status TEXT NOT NULL DEFAULT 'pending' CHECK(Status IN ('pending','confirmed','shipping','completed','cancelled')),
  PaymentMethod TEXT NOT NULL DEFAULT 'COD' CHECK(PaymentMethod = 'COD'),
  IdempotencyKey TEXT NOT NULL UNIQUE,
  RequestHash TEXT NOT NULL,
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UpdatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS OrderItems (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  OrderId INTEGER NOT NULL REFERENCES Orders(Id) ON DELETE RESTRICT,
  ProductId INTEGER NOT NULL REFERENCES Products(Id) ON DELETE RESTRICT,
  ProductName TEXT NOT NULL,
  UnitPrice INTEGER NOT NULL CHECK(UnitPrice >= 0),
  Quantity INTEGER NOT NULL CHECK(Quantity BETWEEN 1 AND 99)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON OrderItems(OrderId);
CREATE INDEX IF NOT EXISTS idx_orders_status ON Orders(Status,Id);
CREATE TABLE IF NOT EXISTS Admins (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  Username TEXT NOT NULL UNIQUE,
  PasswordHash TEXT NOT NULL,
  Salt TEXT NOT NULL,
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS AdminSessions (
  TokenHash TEXT PRIMARY KEY,
  AdminId INTEGER NOT NULL REFERENCES Admins(Id) ON DELETE RESTRICT,
  ExpiresAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON AdminSessions(ExpiresAt);
CREATE TABLE IF NOT EXISTS RateLimits (
  Key TEXT PRIMARY KEY,
  Count INTEGER NOT NULL,
  ExpiresAt INTEGER NOT NULL
);
