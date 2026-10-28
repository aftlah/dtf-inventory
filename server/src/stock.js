// Potongan SQL bersama untuk menghitung stok. Dipakai di dalam query yang meng-alias tabel barang sebagai `i`.

// Total stok barang di semua lokasi yang masih aktif.
export const TOTAL_STOCK = `(SELECT COALESCE(SUM(s.qty), 0) FROM stock_levels s
   JOIN locations l ON l.id = s.location_id AND l.deleted_at IS NULL
  WHERE s.item_id = i.id)`

// Stok yang dijual di Market = stok di lokasi bertanda "Dijual di Market".
export const MARKET_STOCK = `(SELECT COALESCE(SUM(s.qty), 0) FROM stock_levels s
   JOIN locations l ON l.id = s.location_id AND l.deleted_at IS NULL AND l.sell_in_market = 1
  WHERE s.item_id = i.id)`

// Barang yang sudah "dipesan" tapi belum keluar dari stok: pesanan Market dan bahan pengajuan yang masih menunggu.
export const RESERVED = `(
  (SELECT COALESCE(SUM(oi.qty), 0) FROM order_items oi
     JOIN orders o ON o.id = oi.order_id AND o.status = 'pending'
    WHERE oi.item_id = i.id)
  + (SELECT COALESCE(SUM(ri.qty), 0) FROM request_items ri
       JOIN requests r ON r.id = ri.request_id AND r.status = 'pending'
      WHERE ri.item_id = i.id AND ri.role = 'input' AND r.kind <> 'buyback')
)`
