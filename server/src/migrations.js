// Daftar objek database yang dipakai aplikasi. Satu sumber untuk dua hal:
//  - scripts/init-db.js menambahkan kolom yang belum ada (upgrade dari versi lama),
//  - src/schema-check.js memeriksa apakah database sudah sesuai versi aplikasi (dan melaporkannya dengan jelas).
// Saat menambah kolom baru di schema.sql, tambahkan juga di sini.

/** [tabel, kolom, definisi] untuk kolom yang ditambahkan setelah skema awal. */
export const COLUMNS = [
  ['items', 'price', 'BIGINT UNSIGNED NOT NULL DEFAULT 0'],
  ['items', 'image_url', 'VARCHAR(255) NULL'],
  ['items', 'in_market', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['locations', 'sell_in_market', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['items', 'in_sale', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['items', 'in_process', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['items', 'min_sale_qty', 'INT UNSIGNED NOT NULL DEFAULT 1'],
  ['items', 'in_buyback', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['items', 'buyback_price', 'BIGINT UNSIGNED NOT NULL DEFAULT 0'],
  ['items', 'cost_price', 'BIGINT UNSIGNED NOT NULL DEFAULT 0'],
  ['order_items', 'cost', 'BIGINT UNSIGNED NOT NULL DEFAULT 0'],
  ['request_items', 'cost', 'BIGINT UNSIGNED NOT NULL DEFAULT 0'],
  ['requests', 'total', 'BIGINT UNSIGNED NOT NULL DEFAULT 0'],
  ['request_items', 'price', 'BIGINT UNSIGNED NOT NULL DEFAULT 0'],
  ['cash_entries', 'ref_type', 'VARCHAR(20) NULL'],
  ['cash_entries', 'ref_id', 'BIGINT UNSIGNED NULL'],
  ['inventory_logs', 'ref_type', 'VARCHAR(20) NULL'],
  ['inventory_logs', 'ref_id', 'BIGINT UNSIGNED NULL'],
  ['orders', 'paid', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['orders', 'paid_at', 'TIMESTAMP NULL'],
  ['orders', 'paid_by_name', 'VARCHAR(100) NULL'],
  ['order_items', 'handed_at', 'TIMESTAMP NULL'],
  ['order_items', 'handed_by_name', 'VARCHAR(100) NULL'],
  ['items', 'max_buy_member', 'INT UNSIGNED NULL'],
  ['items', 'max_buy_highrank', 'INT UNSIGNED NULL'],
]

export const TABLES = [
  'users',
  'locations',
  'items',
  'inventory_logs',
  'orders',
  'order_items',
  'order_allocations',
  'requests',
  'request_items',
  'cash_entries',
  'audit_log',
  'notifications',
  'account_requests',
]

export const VIEWS = ['stock_levels']
