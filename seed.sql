-- RUOK Cafe System - ข้อมูลตัวอย่างสำหรับทดสอบ
-- ใช้กับฐานข้อมูลที่ "ว่างเปล่า" หลังรัน schema.sql เท่านั้น (ID ต้องเริ่มจาก 1)
-- เพื่อให้ตัวอย่างใน Swagger UI (branch_id 1, employee_id 1, menu_id 1-2 ฯลฯ) ใช้งานได้ทันที
--
-- รัน:  mysql -u root -p < seed.sql

SET NAMES utf8mb4;
USE cafe_system;

INSERT INTO category (name) VALUES
  ('กาแฟ'),
  ('ชา'),
  ('เบเกอรี่');

INSERT INTO branch (name, address) VALUES
  ('RUOK Cafe สาขาตัวอย่าง 1', 'กรุงเทพมหานคร'),
  ('RUOK Cafe สาขาตัวอย่าง 2', 'เชียงใหม่');

INSERT INTO employee (branch_id, name, role) VALUES
  (1, 'พนักงานตัวอย่าง A', 'cashier'),
  (1, 'พนักงานตัวอย่าง B', 'barista'),
  (1, 'ผู้จัดการตัวอย่าง C', 'manager'),
  (2, 'พนักงานตัวอย่าง D', 'cashier'),
  (2, 'ผู้จัดการตัวอย่าง E', 'manager');

INSERT INTO menu_item (branch_id, category_id, name, price, stock_quantity) VALUES
  (1, 1, 'อเมริกาโน่', 50.00, 30),
  (1, 1, 'ลาเต้',      60.00, 30),
  (1, 2, 'ชาไทย',      45.00, 20),
  (1, 3, 'ครัวซองต์',   55.00, 12),
  (2, 1, 'อเมริกาโน่', 55.00, 25),
  (2, 1, 'ลาเต้',      65.00, 25),
  (2, 2, 'ชาเขียว',    50.00,  8);

-- บันทึกสต็อกตั้งต้นลงประวัติ เหมือนที่ POST /api/menu ทำให้อัตโนมัติ
INSERT INTO stock_movement (menu_id, quantity_change)
SELECT menu_id, stock_quantity FROM menu_item WHERE stock_quantity > 0;
