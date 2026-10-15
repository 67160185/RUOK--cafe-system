const express = require("express");
const pool = require("../config/db");
const router = express.Router();

const httpError = (status, message) => Object.assign(new Error(message), { status });

// GET /api/orders?branch_id=1&employee_id=1&date=2026-10-16
router.get("/orders", async (req, res) => {
  const { branch_id, employee_id, date } = req.query;
  const where = [];
  const params = [];
  if (branch_id) { where.push("o.branch_id = ?"); params.push(branch_id); }
  if (employee_id) { where.push("o.employee_id = ?"); params.push(employee_id); }
  if (date) { where.push("DATE(o.created_at) = ?"); params.push(date); }

  const sql = `
    SELECT o.order_id, o.branch_id, b.name AS branch_name,
           o.employee_id, e.name AS employee_name,
           o.payment_method, o.created_at,
           COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_price
    FROM orders o
    JOIN branch b ON b.branch_id = o.branch_id
    JOIN employee e ON e.employee_id = o.employee_id
    LEFT JOIN order_item oi ON oi.order_id = o.order_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    GROUP BY o.order_id, b.name, e.name
    ORDER BY o.created_at DESC, o.order_id DESC`;
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// GET /api/orders/:id  (พร้อมรายการสินค้า)
router.get("/orders/:id", async (req, res) => {
  const [orders] = await pool.query(
    `SELECT o.*, b.name AS branch_name, e.name AS employee_name
     FROM orders o
     JOIN branch b ON b.branch_id = o.branch_id
     JOIN employee e ON e.employee_id = o.employee_id
     WHERE o.order_id = ?`,
    [req.params.id]
  );
  if (orders.length === 0) return res.status(404).json({ message: "Order not found" });

  const [items] = await pool.query(
    `SELECT oi.order_item_id, oi.menu_id, m.name, oi.quantity, oi.unit_price,
            (oi.quantity * oi.unit_price) AS subtotal
     FROM order_item oi
     JOIN menu_item m ON m.menu_id = oi.menu_id
     WHERE oi.order_id = ?`,
    [req.params.id]
  );
  const total_price = items.reduce((sum, i) => sum + Number(i.subtotal), 0);
  res.json({ ...orders[0], total_price, items });
});

// POST /api/orders
// body: { "branch_id": 1, "employee_id": 1, "payment_method": "cash",
//         "items": [ { "menu_id": 1, "quantity": 2 }, { "menu_id": 3, "quantity": 1 } ] }
// ระบบจะดึงราคาจาก menu_item, ตัดสต็อก และบันทึก stock_movement ให้อัตโนมัติ
router.post("/orders", async (req, res) => {
  const { branch_id, employee_id, payment_method, items } = req.body;
  if (!branch_id || !employee_id || !payment_method) {
    return res.status(400).json({ message: "branch_id, employee_id and payment_method are required" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items must be a non-empty array" });
  }

  // รวมรายการที่ menu_id ซ้ำกัน
  const merged = new Map();
  for (const it of items) {
    const qty = Number(it.quantity);
    if (!it.menu_id || !Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ message: "each item needs menu_id and quantity (integer >= 1)" });
    }
    merged.set(it.menu_id, (merged.get(it.menu_id) || 0) + qty);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [emp] = await conn.query("SELECT employee_id FROM employee WHERE employee_id = ? AND branch_id = ?", [
      employee_id,
      branch_id,
    ]);
    if (emp.length === 0) throw httpError(400, "employee not found in this branch");

    const [menus] = await conn.query(
      "SELECT menu_id, name, price, stock_quantity FROM menu_item WHERE branch_id = ? AND menu_id IN (?) FOR UPDATE",
      [branch_id, [...merged.keys()]]
    );
    const menuMap = new Map(menus.map((m) => [m.menu_id, m]));

    let total = 0;
    for (const [menuId, qty] of merged) {
      const menu = menuMap.get(menuId);
      if (!menu) throw httpError(400, `menu_id ${menuId} not found in this branch`);
      if (menu.stock_quantity < qty) {
        throw httpError(400, `สต็อกไม่พอ: ${menu.name} เหลือ ${menu.stock_quantity} ชิ้น`);
      }
      total += Number(menu.price) * qty;
    }

    const [orderResult] = await conn.query(
      "INSERT INTO orders (branch_id, employee_id, payment_method) VALUES (?, ?, ?)",
      [branch_id, employee_id, payment_method]
    );
    const orderId = orderResult.insertId;

    for (const [menuId, qty] of merged) {
      const menu = menuMap.get(menuId);
      await conn.query(
        "INSERT INTO order_item (order_id, menu_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
        [orderId, menuId, qty, menu.price]
      );
      await conn.query("UPDATE menu_item SET stock_quantity = stock_quantity - ? WHERE menu_id = ?", [qty, menuId]);
      await conn.query("INSERT INTO stock_movement (menu_id, quantity_change) VALUES (?, ?)", [menuId, -qty]);
    }

    await conn.commit();
    res.status(201).json({ message: "Order created", order_id: orderId, total_price: total });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// PUT /api/orders/:id   body: { "payment_method": "qr", "employee_id": 2 }
router.put("/orders/:id", async (req, res) => {
  const { payment_method, employee_id } = req.body;
  if (payment_method === undefined && employee_id === undefined) {
    return res.status(400).json({ message: "payment_method or employee_id is required" });
  }

  const [orders] = await pool.query("SELECT branch_id FROM orders WHERE order_id = ?", [req.params.id]);
  if (orders.length === 0) return res.status(404).json({ message: "Order not found" });

  if (employee_id !== undefined) {
    const [emp] = await pool.query("SELECT employee_id FROM employee WHERE employee_id = ? AND branch_id = ?", [
      employee_id,
      orders[0].branch_id,
    ]);
    if (emp.length === 0) return res.status(400).json({ message: "employee not found in this order's branch" });
  }

  await pool.query(
    "UPDATE orders SET payment_method = COALESCE(?, payment_method), employee_id = COALESCE(?, employee_id) WHERE order_id = ?",
    [payment_method ?? null, employee_id ?? null, req.params.id]
  );
  res.json({ message: "Order updated" });
});

// DELETE /api/orders/:id  (คืนสต็อกและบันทึก stock_movement ให้อัตโนมัติ)
router.delete("/orders/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orders] = await conn.query("SELECT order_id FROM orders WHERE order_id = ? FOR UPDATE", [req.params.id]);
    if (orders.length === 0) throw httpError(404, "Order not found");

    const [items] = await conn.query("SELECT menu_id, quantity FROM order_item WHERE order_id = ?", [req.params.id]);
    for (const it of items) {
      await conn.query("UPDATE menu_item SET stock_quantity = stock_quantity + ? WHERE menu_id = ?", [
        it.quantity,
        it.menu_id,
      ]);
      await conn.query("INSERT INTO stock_movement (menu_id, quantity_change) VALUES (?, ?)", [
        it.menu_id,
        it.quantity,
      ]);
    }

    await conn.query("DELETE FROM order_item WHERE order_id = ?", [req.params.id]);
    await conn.query("DELETE FROM orders WHERE order_id = ?", [req.params.id]);

    await conn.commit();
    res.json({ message: "Order deleted and stock restored" });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

module.exports = router;