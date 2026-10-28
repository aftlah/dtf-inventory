-- DTF Inventory — skema MySQL 8. Aman dijalankan ulang (create if not exists).
-- Stok TIDAK disimpan sebagai angka; selalu dihitung dari inventory_logs (view stock_levels).
-- Database lama di-upgrade oleh scripts/init-db.js (kolom/tabel baru ditambahkan di sana juga).

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role          ENUM('admin','staff','member') NOT NULL DEFAULT 'staff',
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS locations (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  kind           VARCHAR(30)  NOT NULL DEFAULT 'warehouse',
  notes          VARCHAR(500) NULL,
  sell_in_market TINYINT(1) NOT NULL DEFAULT 0,  -- stok di lokasi ini dijual di Market
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at     TIMESTAMP NULL,
  live_key       TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) STORED, -- NULL untuk yang dihapus: nama boleh dipakai ulang
  UNIQUE KEY locations_name_uq (name, live_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS items (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  category   VARCHAR(60)  NULL,
  unit       VARCHAR(20)  NOT NULL DEFAULT 'pcs',
  min_stock  INT UNSIGNED NOT NULL DEFAULT 0,
  notes      VARCHAR(500) NULL,
  price      BIGINT UNSIGNED NOT NULL DEFAULT 0, -- harga jual di Market (USD)
  image_url  VARCHAR(255) NULL,
  in_market  TINYINT(1) NOT NULL DEFAULT 0,
  in_sale    TINYINT(1) NOT NULL DEFAULT 0,       -- boleh diajukan di Penjualan
  in_process TINYINT(1) NOT NULL DEFAULT 0,       -- boleh diajukan sebagai bahan Pemrosesan
  min_sale_qty INT UNSIGNED NOT NULL DEFAULT 1,   -- minimal jumlah per pengajuan Penjualan
  in_buyback TINYINT(1) NOT NULL DEFAULT 0,       -- boleh dijual member ke toko (Jual Barang)
  buyback_price BIGINT UNSIGNED NOT NULL DEFAULT 0, -- harga beli toko per unit
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  live_key   TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) STORED, -- NULL untuk yang dihapus: nama boleh dipakai ulang
  UNIQUE KEY items_name_uq (name, live_key)
) ENGINE=InnoDB;

-- qty selalu positif; arah ditentukan oleh `type`.
-- ref_type/ref_id menautkan baris ke dokumen asal (mis. pesanan Market).
CREATE TABLE IF NOT EXISTS inventory_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id     BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  type        ENUM('in','out','transfer_in','transfer_out') NOT NULL,
  qty         INT UNSIGNED NOT NULL,
  note        VARCHAR(500) NULL,
  user_id     BIGINT UNSIGNED NULL,
  user_name   VARCHAR(100) NOT NULL,           -- snapshot, tetap terbaca walau akun dinonaktifkan
  transfer_id CHAR(36) NULL,
  ref_type    VARCHAR(20) NULL,
  ref_id      BIGINT UNSIGNED NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT logs_qty_chk CHECK (qty > 0),
  CONSTRAINT logs_item_fk FOREIGN KEY (item_id) REFERENCES items (id),
  CONSTRAINT logs_loc_fk  FOREIGN KEY (location_id) REFERENCES locations (id),
  CONSTRAINT logs_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  KEY logs_item_idx (item_id),
  KEY logs_loc_idx (location_id),
  KEY logs_created_idx (created_at),
  KEY logs_transfer_idx (transfer_id),
  KEY logs_ref_idx (ref_type, ref_id)
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW stock_levels AS
SELECT item_id, location_id,
       CAST(SUM(CASE WHEN type IN ('in','transfer_in') THEN CAST(qty AS SIGNED) ELSE -CAST(qty AS SIGNED) END) AS SIGNED) AS qty
FROM inventory_logs
GROUP BY item_id, location_id;

-- Pesanan Market. Stok "dipesan" selama status pending (tidak mengurangi stok sampai disetujui).
CREATE TABLE IF NOT EXISTS orders (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT UNSIGNED NOT NULL,
  user_name         VARCHAR(100) NOT NULL,
  status            ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  total             BIGINT UNSIGNED NOT NULL,
  note              VARCHAR(500) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by_name   VARCHAR(100) NULL,          -- yang menyetujui / menolak
  decided_at        TIMESTAMP NULL,
  cancelled_by_name VARCHAR(100) NULL,
  cancelled_at      TIMESTAMP NULL,
  paid              TINYINT(1) NOT NULL DEFAULT 0,  -- sudah dibayar? (ditandai staff)
  paid_at           TIMESTAMP NULL,
  paid_by_name      VARCHAR(100) NULL,
  CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users (id),
  KEY orders_status_idx (status, created_at),
  KEY orders_user_idx (user_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id   BIGINT UNSIGNED NOT NULL,
  item_id    BIGINT UNSIGNED NOT NULL,
  item_name  VARCHAR(150) NOT NULL,             -- snapshot
  image_url  VARCHAR(255) NULL,                 -- snapshot
  qty        INT UNSIGNED NOT NULL,
  unit_price BIGINT UNSIGNED NOT NULL,          -- harga saat dipesan; mengubah harga tidak mengubah pesanan lama
  CONSTRAINT oi_qty_chk CHECK (qty > 0),
  CONSTRAINT oi_order_fk FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT oi_item_fk FOREIGN KEY (item_id) REFERENCES items (id),
  KEY oi_order_idx (order_id),
  KEY oi_item_idx (item_id)
) ENGINE=InnoDB;

-- Dari lokasi mana barang pesanan yang disetujui keluar (agar pembatalan mengembalikan ke lokasi asal).
CREATE TABLE IF NOT EXISTS order_allocations (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    BIGINT UNSIGNED NOT NULL,
  item_id     BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  qty         INT UNSIGNED NOT NULL,
  CONSTRAINT oa_order_fk FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT oa_item_fk FOREIGN KEY (item_id) REFERENCES items (id),
  CONSTRAINT oa_loc_fk FOREIGN KEY (location_id) REFERENCES locations (id),
  KEY oa_order_idx (order_id)
) ENGINE=InnoDB;

-- Pengajuan Penjualan (sale), Pemrosesan (process), dan Jual Barang (buyback).
-- sale/process: pending -> approved (bahan keluar dari stok) -> reported (member lapor + bukti) -> completed (staff konfirmasi).
-- buyback: pending -> completed (disetujui: barang member masuk ke stok toko dengan harga beli tetap).
CREATE TABLE IF NOT EXISTS requests (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind              ENUM('sale','process','buyback') NOT NULL,
  total             BIGINT UNSIGNED NOT NULL DEFAULT 0,  -- buyback: nilai yang dibayar toko
  user_id           BIGINT UNSIGNED NOT NULL,
  user_name         VARCHAR(100) NOT NULL,
  status            ENUM('pending','approved','reported','completed','rejected','cancelled') NOT NULL DEFAULT 'pending',
  result_money      BIGINT UNSIGNED NULL,         -- sale: uang hasil yang dilaporkan
  proof_url         VARCHAR(500) NULL,
  review_note       VARCHAR(500) NULL,
  reviewed_by_name  VARCHAR(100) NULL,
  reviewed_at       TIMESTAMP NULL,
  reported_at       TIMESTAMP NULL,
  completed_at      TIMESTAMP NULL,
  confirmed_by_name VARCHAR(100) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT requests_user_fk FOREIGN KEY (user_id) REFERENCES users (id),
  KEY requests_status_idx (status, created_at),
  KEY requests_user_idx (user_id, created_at),
  KEY requests_kind_idx (kind, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS request_items (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id BIGINT UNSIGNED NOT NULL,
  role       ENUM('input','result') NOT NULL DEFAULT 'input',
  item_id    BIGINT UNSIGNED NOT NULL,
  item_name  VARCHAR(150) NOT NULL,               -- snapshot
  image_url  VARCHAR(255) NULL,                   -- snapshot
  qty        INT UNSIGNED NOT NULL,
  price      BIGINT UNSIGNED NOT NULL DEFAULT 0,  -- buyback: harga beli per unit saat diajukan
  CONSTRAINT ri_qty_chk CHECK (qty > 0),
  CONSTRAINT ri_request_fk FOREIGN KEY (request_id) REFERENCES requests (id) ON DELETE CASCADE,
  CONSTRAINT ri_item_fk FOREIGN KEY (item_id) REFERENCES items (id),
  KEY ri_request_idx (request_id),
  KEY ri_item_idx (item_id)
) ENGINE=InnoDB;
