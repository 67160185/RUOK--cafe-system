const db = require("../config/db");

// unitPrice เก็บราคา ณ ตอนขาย (ไม่ผูกกับราคาเมนูปัจจุบัน)
exports.create = async (connection, { orderId, menuId, quantity, unitPrice }) => {
  const [result] = await connection.query(
    `INSERT INTO order_item (order_id, menu_id, quantity, unit_price)
     VALUES (?, ?, ?, ?)`,
    [orderId, menuId, quantity, unitPrice],
  );
  return result.insertId;
};

exports.findByOrderId = async (orderId) => {
  const [rows] = await db.query(
    `SELECT oi.order_item_id, oi.menu_id, m.name, oi.quantity, oi.unit_price,
            oi.quantity * oi.unit_price AS line_total
     FROM order_item oi
     JOIN menu_item m ON m.menu_id = oi.menu_id
     WHERE oi.order_id = ?`,
    [orderId],
  );
  return rows;
};