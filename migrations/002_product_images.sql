CREATE TABLE IF NOT EXISTS ProductImages (
  Id TEXT PRIMARY KEY,
  ContentType TEXT NOT NULL CHECK(ContentType IN ('image/jpeg','image/png','image/webp')),
  Data BLOB NOT NULL CHECK(length(Data) BETWEEN 1 AND 524288),
  CreatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
