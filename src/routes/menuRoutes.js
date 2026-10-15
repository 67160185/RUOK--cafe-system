const express = require("express");
const pool = require("../config/db");
const router = express.Router();

const BASE_SELECT = `
  SELECT m.menu_id, m.branch_id, b.name AS branch_name,
         m.category_id, c.name AS category_name,
         m.name, m.price, m.stock_quantity
  FROM menu_item m
  JOIN branch b ON b.branch_id = m.branch_id
  JOIN category c ON c.category_id = m.category_id`;

// GET /api/menu?branch_id=1&category_id=2
router.get("/menu", async (req, res) => {
  const { branch_id, category_id } = req.query;
  const where = [];
  const params = [];
  if (branch_id) { where.push("m.branch_id = ?"); params.push(branch_id); }
  if (category_id) { where.push("m.category_id = ?"); params.push(category_id); }
  const sql = BASE_SELECT + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY m.menu_id";
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// GET /api/menu/:id
router.get("/menu/:id", async (req, res) => {
  const [rows] = await pool.query(BASE_SELECT + " WHERE m.menu_id = ?", [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ message: "Menu not found" });
  res.json(rows[0]);
});

// POST /api/menu
// body: { "branch_id": 1, "category_id": 1, "name": "มอคค่า", "price": 60, "stock_quantity": 30 }
router.post("/menu", async (req, res) => {
  const { branch_id, category_id, name, price, stock_quantity = 0 } = req.body;
  if (!branch_id || !category_id || !name || price === undefined) {
    return res.status(400).json({ message: "branch_id, category_id, name and price are required" });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      "INSERT INTO menu_item (branch_id, category_id, name, price, stock_quantity) VALUES (?, ?, ?, ?, ?)",
      [branch_id, category_id, name, price, stock_quantity]
    );
    // บันทึกสต็อกเริ่มต้นลง stock_movement
    if (Number(stock_quantity) > 0) {
      await conn.query("INSERT INTO stock_movement (menu_id, quantity_change) VALUES (?, ?)", [
        result.insertId,
        stock_quantity,
      ]);
    }
    await conn.commit();
    res.status(201).json({ message: "Menu created", menu_id: result.insertId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// PUT /api/menu/:id   (ส่งเฉพาะ field ที่ต้องการแก้ก็ได้)
// หมายเหตุ: การแก้จำนวนสต็อกให้ใช้ POST /api/stock-movements เพื่อให้มีประวัติ
router.put("/menu/:id", async (req, res) => {
  const { branch_id, category_id, name, price } = req.body;
  const [result] = await pool.query(
    `UPDATE menu_item
     SET branch_id = COALESCE(?, branch_id),
         category_id = COALESCE(?, category_id),
         name = COALESCE(?, name),
         price = COALESCE(?, price)
     WHERE menu_id = ?`,
    [branch_id ?? null, category_id ?? null, name ?? null, price ?? null, req.params.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: "Menu not found" });
  res.json({ message: "Menu updated" });
});

// DELETE /api/menu/:id  (ลบไม่ได้ถ้าเคยถูกสั่งหรือมีประวัติสต็อกแล้ว)
router.delete("/menu/:id", async (req, res) => {
  const [result] = await pool.query("DELETE FROM menu_item WHERE menu_id = ?", [req.params.id]);
  if (result.affectedRows === 0) return res.status(404).json({ message: "Menu not found" });
  res.json({ message: "Menu deleted" });
});

module.exports = router;