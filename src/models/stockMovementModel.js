const db = require("../config/db");

// ประวัติการเคลื่อนไหวสต็อกของเมนู (การเขียนทำผ่าน menuModel.adjustStock)
exports.findByMenuId = async (menuId) => {
  const [rows] = await db.query(
    `SELECT movement_id, menu_id, quantity_change, moved_at
     FROM stock_movement WHERE menu_id = ? ORDER BY moved_at DESC`,
    [menuId],
  );
  return rows;
};