-- Migration 001: ปรับ schema เดิมให้ตรงกับ schema.sql ฉบับปัจจุบัน
-- ใช้กับฐานข้อมูลที่สร้างจาก schema.sql ฉบับเก่าเท่านั้น (ติดตั้งใหม่ไม่ต้องรันไฟล์นี้)
-- ต้องใช้ MySQL 8.0.16+ หรือ MariaDB 10.2+
--
-- ก่อนรัน ให้ตรวจข้อมูลเดิมว่าไม่ขัดกับข้อกำหนดใหม่ (ทั้งสามคำสั่งควรได้ 0 แถว):
--   SELECT branch_id, name, COUNT(*) FROM menu_item GROUP BY branch_id, name HAVING COUNT(*) > 1;
--   SELECT order_id, payment_method FROM orders WHERE payment_method NOT IN ('cash', 'qr');
--   SELECT menu_id, price, stock_quantity FROM menu_item WHERE price <= 0 OR stock_quantity < 0;
-- และควรสำรองข้อมูลก่อนเสมอ:  mysqldump -u root -p cafe_system > backup.sql

USE cafe_system;

-- สต็อกที่เป็น NULL ถือเป็น 0 (ของเดิมคอลัมน์นี้อนุญาต NULL ทำให้ stock_quantity - 1 กลายเป็น NULL)
UPDATE menu_item SET stock_quantity = 0 WHERE stock_quantity IS NULL;

ALTER TABLE menu_item
  MODIFY stock_quantity INT NOT NULL DEFAULT 0,
  ADD CONSTRAINT uq_menu_branch_name UNIQUE (branch_id, name),
  ADD CONSTRAINT chk_menu_price CHECK (price > 0),
  ADD CONSTRAINT chk_menu_stock CHECK (stock_quantity >= 0);

ALTER TABLE orders
  ADD CONSTRAINT chk_orders_payment CHECK (payment_method IN ('cash', 'qr')),
  ADD INDEX idx_orders_branch_created (branch_id, created_at),
  ADD INDEX idx_orders_created (created_at);

ALTER TABLE order_item
  ADD CONSTRAINT chk_order_item_qty CHECK (quantity > 0);
