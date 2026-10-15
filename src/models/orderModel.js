const db = require("../config/db");

// สร้างออเดอร์ (ใช้ connection เพราะอยู่ใน transaction)
exports.create = async (connection, { branchId, employeeId, paymentMethod }) => {
  const [result] = await connection.query(
    "INSERT INTO orders (branch_id, employee_id, payment_method) VALUES (?, ?, ?)",
    [branchId, employeeId, paymentMethod],
  );
  return result.insertId;
};

exports.findById = async (orderId) => {
  const [rows] = await db.query(
    `SELECT order_id, branch_id, employee_id, payment_method, created_at
     FROM orders WHERE order_id = ?`,
    [orderId],
  );
  return rows.length > 0 ? rows[0] : null;
};

// ค้นหาประวัติการขายตามวันที่ (FR-07 / US-05) date = 'YYYY-MM-DD'
exports.findByDate = async (branchId, date) => {
  const [rows] = await db.query(
    `SELECT o.order_id, o.employee_id, o.payment_method, o.created_at,
            SUM(oi.quantity * oi.unit_price) AS total_price
     FROM orders o
     JOIN order_item oi ON oi.order_id = o.order_id
     WHERE o.branch_id = ? AND DATE(o.created_at) = ?
     GROUP BY o.order_id, o.employee_id, o.payment_method, o.created_at
     ORDER BY o.created_at`,
    [branchId, date],
  );
  return rows;
};

// ยอดขายแยกตามสาขา (FR-08 / US-06)
exports.salesByBranch = async () => {
  const [rows] = await db.query(
    `SELECT b.branch_id, b.name AS branch_name,
            COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_sales
     FROM branch b
     LEFT JOIN orders o ON o.branch_id = b.branch_id
     LEFT JOIN order_item oi ON oi.order_id = o.order_id
     GROUP BY b.branch_id, b.name
     ORDER BY b.branch_id`,
  );
  return rows;
};