-- DTF Inventory — skema MySQL 8. Aman dijalankan ulang (create if not exists).
-- Stok TIDAK disimpan sebagai angka; selalu dihitung dari inventory_logs (view stock_levels).

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role          ENUM('admin','staff') NOT NULL DEFAULT 'staff',
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS locations (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  kind       VARCHAR(30)  NOT NULL DEFAULT 'warehouse',
  notes      VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  live_key   TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) STORED, -- NULL untuk yang dihapus: nama boleh dipakai ulang
  UNIQUE KEY locations_name_uq (name, live_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS items (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  category   VARCHAR(60)  NULL,
  unit       VARCHAR(20)  NOT NULL DEFAULT 'pcs',
  min_stock  INT UNSIGNED NOT NULL DEFAULT 0,
  notes      VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  live_key   TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) STORED, -- NULL untuk yang dihapus: nama boleh dipakai ulang
  UNIQUE KEY items_name_uq (name, live_key)
) ENGINE=InnoDB;

-- qty selalu positif; arah ditentukan oleh `type`.
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
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT logs_qty_chk CHECK (qty > 0),
  CONSTRAINT logs_item_fk FOREIGN KEY (item_id) REFERENCES items (id),
  CONSTRAINT logs_loc_fk  FOREIGN KEY (location_id) REFERENCES locations (id),
  CONSTRAINT logs_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  KEY logs_item_idx (item_id),
  KEY logs_loc_idx (location_id),
  KEY logs_created_idx (created_at),
  KEY logs_transfer_idx (transfer_id)
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW stock_levels AS
SELECT item_id, location_id,
       CAST(SUM(CASE WHEN type IN ('in','transfer_in') THEN CAST(qty AS SIGNED) ELSE -CAST(qty AS SIGNED) END) AS SIGNED) AS qty
FROM inventory_logs
GROUP BY item_id, location_id;
