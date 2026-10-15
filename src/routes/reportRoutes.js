const express = require("express");
const pool = require("../config/db");
const router = express.Router();

// GET /api/reports/summary?branch_id=1 -> ภาพรวมยอดขาย
router.get("/reports/summary", async (req, res) => {
  const { branch_id } = req.query;
  const [rows] = await pool.query(
    `SELECT COUNT(DISTINCT o.order_id) AS total_orders,
            COALESCE(SUM(oi.quantity), 0) AS total_items,
            COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_sales
     FROM orders o
     LEFT JOIN order_item oi ON oi.order_id = o.order_id
     ${branch_id ? "WHERE o.branch_id = ?" : ""}`,
    branch_id ? [branch_id] : []
  );
  res.json(rows[0]);
});

// GET /api/reports/daily-sales?date=2026-10-16&branch_id=1  (ไม่ใส่ date = วันนี้)
router.get("/reports/daily-sales", async (req, res) => {
  const { date, branch_id } = req.query;
  const params = [];
  let where = date ? "DATE(o.created_at) = ?" : "DATE(o.created_at) = CURDATE()";
  if (date) params.push(date);
  if (branch_id) { where += " AND o.branch_id = ?"; params.push(branch_id); }

  const [rows] = await pool.query(
    `SELECT COUNT(DISTINCT o.order_id) AS total_orders,
            COALESCE(SUM(oi.quantity), 0) AS total_items,
            COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_sales
     FROM orders o
     LEFT JOIN order_item oi ON oi.order_id = o.order_id
     WHERE ${where}`,
    params
  );
  res.json({ date: date || "today", ...rows[0] });
});

// GET /api/reports/sales-by-branch -> ยอดขายแยกสาขา
router.get("/reports/sales-by-branch", async (req, res) => {
  const [rows] = await pool.query(
    `SELECT b.branch_id, b.name AS branch_name,
            COUNT(DISTINCT o.order_id) AS total_orders,
            COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_sales
     FROM branch b
     LEFT JOIN orders o ON o.branch_id = b.branch_id
     LEFT JOIN order_item oi ON oi.order_id = o.order_id
     GROUP BY b.branch_id, b.name
     ORDER BY total_sales DESC`
  );
  res.json(rows);
});

// GET /api/reports/sales-by-payment?branch_id=1 -> ยอดขายแยกวิธีชำระเงิน
router.get("/reports/sales-by-payment", async (req, res) => {
  const { branch_id } = req.query;
  const [rows] = await pool.query(
    `SELECT o.payment_method,
            COUNT(DISTINCT o.order_id) AS total_orders,
            COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_sales
     FROM orders o
     LEFT JOIN order_item oi ON oi.order_id = o.order_id
     ${branch_id ? "WHERE o.branch_id = ?" : ""}
     GROUP BY o.payment_method
     ORDER BY total_sales DESC`,
    branch_id ? [branch_id] : []
  );
  res.json(rows);
});

// GET /api/reports/top-menu?limit=5&branch_id=1 -> เมนูขายดี
router.get("/reports/top-menu", async (req, res) => {
  const { branch_id } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 5, 50);
  const params = [];
  if (branch_id) params.push(branch_id);
  params.push(limit);

  const [rows] = await pool.query(
    `SELECT m.menu_id, m.name, m.branch_id,
            SUM(oi.quantity) AS total_quantity,
            SUM(oi.quantity * oi.unit_price) AS total_sales
     FROM order_item oi
     JOIN menu_item m ON m.menu_id = oi.menu_id
     ${branch_id ? "WHERE m.branch_id = ?" : ""}
     GROUP BY m.menu_id, m.name, m.branch_id
     ORDER BY total_quantity DESC
     LIMIT ?`,
    params
  );
  res.json(rows);
});

// GET /api/reports/low-stock?threshold=10&branch_id=1 -> เมนูที่สต็อกใกล้หมด
router.get("/reports/low-stock", async (req, res) => {
  const { branch_id } = req.query;
  const threshold = parseInt(req.query.threshold) || 10;
  const params = [threshold];
  if (branch_id) params.push(branch_id);

  const [rows] = await pool.query(
    `SELECT m.menu_id, m.name, m.branch_id, b.name AS branch_name, m.stock_quantity
     FROM menu_item m
     JOIN branch b ON b.branch_id = m.branch_id
     WHERE m.stock_quantity <= ? ${branch_id ? "AND m.branch_id = ?" : ""}
     ORDER BY m.stock_quantity ASC`,
    params
  );
  res.json(rows);
});

module.exports = router;