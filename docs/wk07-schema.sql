-- RUOK Cafe System - database schema
-- ต้องใช้ MySQL 8.0.16+ หรือ MariaDB 10.2+ (รองรับ CHECK constraint)
--
-- ติดตั้งใหม่:   mysql -u root -p < schema.sql   แล้วตามด้วย   mysql -u root -p < seed.sql
-- ฐานข้อมูลเดิม: ดู migrations/ สำหรับไฟล์ migration ที่ยังไม่ได้รัน

CREATE DATABASE IF NOT EXISTS cafe_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE cafe_system;

CREATE TABLE IF NOT EXISTS category (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS branch (
  branch_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  address VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS employee (
  employee_id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL,
  FOREIGN KEY (branch_id) REFERENCES branch(branch_id)
);

CREATE TABLE IF NOT EXISTS menu_item (
  menu_id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  category_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (branch_id) REFERENCES branch(branch_id),
  FOREIGN KEY (category_id) REFERENCES category(category_id),
  CONSTRAINT uq_menu_branch_name UNIQUE (branch_id, name),
  CONSTRAINT chk_menu_price CHECK (price > 0),
  CONSTRAINT chk_menu_stock CHECK (stock_quantity >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
  order_id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  employee_id INT NOT NULL,
  payment_method VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branch(branch_id),
  FOREIGN KEY (employee_id) REFERENCES employee(employee_id),
  CONSTRAINT chk_orders_payment CHECK (payment_method IN ('cash', 'qr')),
  INDEX idx_orders_branch_created (branch_id, created_at),
  INDEX idx_orders_created (created_at)
);

CREATE TABLE IF NOT EXISTS order_item (
  order_item_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  menu_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id),
  FOREIGN KEY (menu_id) REFERENCES menu_item(menu_id),
  CONSTRAINT chk_order_item_qty CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS stock_movement (
  movement_id INT AUTO_INCREMENT PRIMARY KEY,
  menu_id INT NOT NULL,
  quantity_change INT NOT NULL,
  moved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (menu_id) REFERENCES menu_item(menu_id)
);
