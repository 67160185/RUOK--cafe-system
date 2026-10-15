const db = require("../config/db");

const COLUMNS = "menu_id, branch_id, category_id, name, price, stock_quantity";

// ค้นหาเมนูตาม id
exports.findById = async (connection, menuId) => {
  const [rows] = await connection.query(
    `SELECT ${COLUMNS} FROM menu_item WHERE menu_id = ?`,
    [menuId],
  );
  return rows.length > 0 ? rows[0] : null;
};

// ค้นหาเมนูตามชื่อภายในสาขา
exports.findByName = async (connection, branchId, name) => {
  const [rows] = await connection.query(
    `SELECT ${COLUMNS} FROM menu_item WHERE branch_id = ? AND name = ?`,
    [branchId, name],
  );
  return rows.length > 0 ? rows[0] : null;
};

// ดึงเมนูทั้งหมด (กรองตามสาขาได้ถ้าส่ง branchId) ใช้ดูสต็อกด้วย (FR-09)
exports.findAll = async (branchId) => {
  if (branchId !== undefined && branchId !== null) {
    const [rows] = await db.query(
      `SELECT ${COLUMNS} FROM menu_item WHERE branch_id = ? ORDER BY category_id, name`,
      [branchId],
    );
    return rows;
  }
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM menu_item ORDER BY branch_id, category_id, name`,
  );
  return rows;
};

// จำนวนสต็อกคงเหลือ (ไม่พบเมนู = 0)
exports.getStockQuantity = async (connection, menuId) => {
  const [rows] = await connection.query(
    "SELECT stock_quantity FROM menu_item WHERE menu_id = ?",
    [menuId],
  );
  return rows.length > 0 ? rows[0].stock_quantity : 0;
};

// ปรับสต็อก (ห้ามติดลบ) พร้อมบันทึก stock_movement
exports.adjustStock = async (connection, menuId, quantityChange) => {
  const [result] = await connection.query(
    `UPDATE menu_item
     SET stock_quantity = stock_quantity + ?
     WHERE menu_id = ? AND stock_quantity + ? >= 0`,
    [quantityChange, menuId, quantityChange],
  );
  if (result.affectedRows === 0) return false;

  await connection.query(
    "INSERT INTO stock_movement (menu_id, quantity_change) VALUES (?, ?)",
    [menuId, quantityChange],
  );
  return true;
};

// เพิ่มเมนู (US-07)
exports.create = async ({ branchId, categoryId, name, price, stockQuantity = 0 }) => {
  const [result] = await db.query(
    `INSERT INTO menu_item (branch_id, category_id, name, price, stock_quantity)
     VALUES (?, ?, ?, ?, ?)`,
    [branchId, categoryId, name, price, stockQuantity],
  );
  return result.insertId;
};

// แก้ไขข้อมูลเมนู (ไม่แตะสต็อก ให้ใช้ adjustStock แทน)
exports.update = async (menuId, { categoryId, name, price }) => {
  const [result] = await db.query(
    `UPDATE menu_item SET category_id = ?, name = ?, price = ? WHERE menu_id = ?`,
    [categoryId, name, price, menuId],
  );
  return result.affectedRows > 0;
};

// ลบเมนู
exports.remove = async (menuId) => {
  const [result] = await db.query("DELETE FROM menu_item WHERE menu_id = ?", [menuId]);
  return result.affectedRows > 0;
};