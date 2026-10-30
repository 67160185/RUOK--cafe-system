const express = require("express");
const pool = require("../config/db");
const {
  httpError,
  optionalQueryId,
  optionalQueryDate,
  nextDay,
} = require("../utils/validate");

const router = express.Router();

// จำนวนเต็มจาก query string (ไม่บังคับ) พร้อมค่าต่ำสุด/ค่าเริ่มต้น
const optionalQueryInt = (query, name, { min, fallback }) => {
  const value = query[name];
  if (value === undefined || value === "") return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value) || Number(value) < min) {
    throw httpError(400, `${name} must be an integer >= ${min}`);
  }
  return Number(value);
};

// GET /api/reports/summary?branch_id=1 -> ภาพรวมยอดขาย
router.get("/reports/summary", async (req, res) => {
  const branchId = optionalQueryId(req.query, "branch_id");

  const [rows] = await pool.query(
    `SELECT COUNT(DISTINCT o.order_id) AS total_orders,
            COALESCE(SUM(oi.quantity), 0) AS total_items,
            COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_sales
     FROM orders o
     LEFT JOIN order_item oi ON oi.order_id = o.order_id
     ${branchId !== undefined ? "WHERE o.branch_id = ?" : ""}`,
    branchId !== undefined ? [branchId] : []
  );
  res.json(rows[0]);
});

// GET /api/reports/daily-sales?date=2026-10-16&branch_id=1  (ไม่ใส่ date = วันนี้)
router.get("/reports/daily-sales", async (req, res) => {
  const date = optionalQueryDate(req.query, "date");
  const branchId = optionalQueryId(req.query, "branch_id");

  const params = [];
  let where;
  if (date !== undefined) {
    // ใช้ช่วงเวลาแทน DATE(created_at) = ? เพื่อให้ใช้ index ได้
    where = "o.created_at >= ? AND o.created_at < ?";
    params.push(date, nextDay(date));
  } else {
    where = "o.created_at >= CURDATE() AND o.created_at < CURDATE() + INTERVAL 1 DAY";
  }
  if (branchId !== undefined) {
    where += " AND o.branch_id = ?";
    params.push(branchId);
  }

  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today,
            COUNT(DISTINCT o.order_id) AS total_orders,
            COALESCE(SUM(oi.quantity), 0) AS total_items,
            COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_sales
     FROM orders o
     LEFT JOIN order_item oi ON oi.order_id = o.order_id
     WHERE ${where}`,
    params
  );

  // ส่งวันที่จริงกลับเสมอ (เดิมส่งคำว่า "today" ทำให้ไม่รู้ว่าเป็นวันไหน)
  const { today, ...summary } = rows[0];
  res.json({ date: date ?? today, ...summary });
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
     ORDER BY total_sales DESC, b.branch_id ASC`
  );
  res.json(rows);
});

// GET /api/reports/sales-by-payment?branch_id=1 -> ยอดขายแยกวิธีชำระเงิน
router.get("/reports/sales-by-payment", async (req, res) => {
  const branchId = optionalQueryId(req.query, "branch_id");

  const [rows] = await pool.query(
    `SELECT o.payment_method,
            COUNT(DISTINCT o.order_id) AS total_orders,
            COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_sales
     FROM orders o
     LEFT JOIN order_item oi ON oi.order_id = o.order_id
     ${branchId !== undefined ? "WHERE o.branch_id = ?" : ""}
     GROUP BY o.payment_method
     ORDER BY total_sales DESC`,
    branchId !== undefined ? [branchId] : []
  );
  res.json(rows);
});

// GET /api/reports/top-menu?limit=5&branch_id=1 -> เมนูขายดี
router.get("/reports/top-menu", async (req, res) => {
  const branchId = optionalQueryId(req.query, "branch_id");
  // limit ต้องเป็นจำนวนเต็ม >= 1 และถูกจำกัดสูงสุดที่ 50
  const limit = Math.min(optionalQueryInt(req.query, "limit", { min: 1, fallback: 5 }), 50);

  const params = [];
  if (branchId !== undefined) params.push(branchId);
  params.push(limit);

  const [rows] = await pool.query(
    `SELECT m.menu_id, m.name, m.branch_id,
            SUM(oi.quantity) AS total_quantity,
            SUM(oi.quantity * oi.unit_price) AS total_sales
     FROM order_item oi
     JOIN menu_item m ON m.menu_id = oi.menu_id
     ${branchId !== undefined ? "WHERE m.branch_id = ?" : ""}
     GROUP BY m.menu_id, m.name, m.branch_id
     ORDER BY total_quantity DESC, m.menu_id ASC
     LIMIT ?`,
    params
  );
  res.json(rows);
});

// GET /api/reports/low-stock?threshold=10&branch_id=1 -> เมนูที่สต็อกใกล้หมด
router.get("/reports/low-stock", async (req, res) => {
  const branchId = optionalQueryId(req.query, "branch_id");
  // threshold=0 ใช้ได้ (หมายถึงของหมดสต็อก) เดิมใช้ parseInt(...) || 10 ทำให้ 0 กลายเป็น 10
  const threshold = optionalQueryInt(req.query, "threshold", { min: 0, fallback: 10 });

  const params = [threshold];
  if (branchId !== undefined) params.push(branchId);

  const [rows] = await pool.query(
    `SELECT m.menu_id, m.name, m.branch_id, b.name AS branch_name, m.stock_quantity
     FROM menu_item m
     JOIN branch b ON b.branch_id = m.branch_id
     WHERE m.is_active = TRUE AND m.stock_quantity <= ? ${branchId !== undefined ? "AND m.branch_id = ?" : ""}
     ORDER BY m.stock_quantity ASC, m.menu_id ASC`,
    params
  );
  res.json(rows);
});

// GET /api/reports/sales?branch_id=1
// รายงานยอดขายแยกตามเมนูของสาขาที่เลือก (branch_id จำเป็น)
router.get("/reports/sales", async (req, res) => {
  const branchId = optionalQueryId(req.query, "branch_id");
  if (branchId === undefined) {
    throw httpError(400, "branch_id must be a positive integer");
  }

  const [rows] = await pool.query(
    `SELECT m.menu_id,
            m.name,
            SUM(oi.quantity) AS total_quantity,
            SUM(oi.quantity * oi.unit_price) AS total_sales
     FROM orders o
     JOIN order_item oi ON oi.order_id = o.order_id
     JOIN menu_item m ON m.menu_id = oi.menu_id
     WHERE o.branch_id = ?
       AND m.branch_id = o.branch_id
     GROUP BY m.menu_id, m.name
     ORDER BY total_quantity DESC, m.name ASC`,
    [branchId]
  );

  res.json(rows);
});

module.exports = router;
