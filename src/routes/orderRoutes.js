const express = require("express");
const pool = require("../config/db");
const {
  httpError,
  PAYMENT_METHODS,
  isPositiveInt,
  optionalQueryId,
  optionalQueryDate,
  pathId,
  nextDay,
} = require("../utils/validate");

const router = express.Router();

const PAYMENT_MESSAGE = `payment_method must be one of: ${PAYMENT_METHODS.join(", ")}`;

// GET /api/orders?branch_id=1&employee_id=1&date=2026-10-16
router.get("/orders", async (req, res) => {
  // ตรวจทุก query ก่อนนำไปใช้ใน SQL (ไม่ให้ "1abc" ถูกแปลงเป็น 1 เงียบๆ)
  const branchId = optionalQueryId(req.query, "branch_id");
  const employeeId = optionalQueryId(req.query, "employee_id");
  const date = optionalQueryDate(req.query, "date");

  const where = [];
  const params = [];

  if (branchId !== undefined) {
    where.push("o.branch_id = ?");
    params.push(branchId);
  }

  if (employeeId !== undefined) {
    where.push("o.employee_id = ?");
    params.push(employeeId);
  }

  if (date !== undefined) {
    // ใช้ช่วงเวลาแทน DATE(o.created_at) = ? เพื่อให้ใช้ index ของ created_at ได้
    where.push("o.created_at >= ? AND o.created_at < ?");
    params.push(date, nextDay(date));
  }

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
    ORDER BY o.created_at DESC, o.order_id DESC
  `;

  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// GET /api/orders/:id  (พร้อมรายการสินค้า)
router.get("/orders/:id", async (req, res) => {
  const orderId = pathId(req.params);

  const [orders] = await pool.query(
    `SELECT o.*, b.name AS branch_name, e.name AS employee_name
     FROM orders o
     JOIN branch b ON b.branch_id = o.branch_id
     JOIN employee e ON e.employee_id = o.employee_id
     WHERE o.order_id = ?`,
    [orderId]
  );
  if (orders.length === 0) return res.status(404).json({ message: "Order not found" });

  const [items] = await pool.query(
    `SELECT oi.order_item_id, oi.menu_id, m.name, oi.quantity, oi.unit_price,
            (oi.quantity * oi.unit_price) AS subtotal
     FROM order_item oi
     JOIN menu_item m ON m.menu_id = oi.menu_id
     WHERE oi.order_id = ?`,
    [orderId]
  );
  const total_price =
    Math.round(items.reduce((sum, i) => sum + Number(i.subtotal), 0) * 100) / 100;
  res.json({ ...orders[0], total_price, items });
});

// POST /api/orders
// body: { "branch_id": 1, "employee_id": 1, "payment_method": "cash",
//         "items": [ { "menu_id": 1, "quantity": 2 }, { "menu_id": 3, "quantity": 1 } ] }
// ระบบจะดึงราคาจาก menu_item, ตัดสต็อก และบันทึก stock_movement ให้อัตโนมัติ
router.post("/orders", async (req, res) => {
  const { branch_id, employee_id, payment_method, items } = req.body || {};

  if (branch_id === undefined || employee_id === undefined || payment_method === undefined) {
    return res
      .status(400)
      .json({ message: "branch_id, employee_id and payment_method are required" });
  }
  if (!isPositiveInt(branch_id) || !isPositiveInt(employee_id)) {
    return res
      .status(400)
      .json({ message: "branch_id and employee_id must be positive integers" });
  }
  if (!PAYMENT_METHODS.includes(payment_method)) {
    return res.status(400).json({ message: PAYMENT_MESSAGE });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items must be a non-empty array" });
  }

  // รวมรายการที่ menu_id ซ้ำกัน (ตรวจชนิดข้อมูลก่อน เพื่อให้ key ของ Map เป็น number เสมอ
  // ไม่เช่นนั้น "1" กับ 1 จะถูกมองเป็นคนละเมนู และหาเมนูไม่เจอทั้งที่มีอยู่)
  const merged = new Map();
  for (const it of items) {
    if (!it || !isPositiveInt(it.menu_id) || !isPositiveInt(it.quantity)) {
      return res
        .status(400)
        .json({ message: "each item needs menu_id and quantity (positive integers)" });
    }
    merged.set(it.menu_id, (merged.get(it.menu_id) || 0) + it.quantity);
  }

  let conn;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [emp] = await conn.query(
      "SELECT employee_id FROM employee WHERE employee_id = ? AND branch_id = ?",
      [employee_id, branch_id]
    );
    if (emp.length === 0) throw httpError(400, "employee not found in this branch");

    // ORDER BY menu_id ทำให้ทุกคำสั่งซื้อล็อกแถวตามลำดับเดียวกัน ลดโอกาส deadlock
    const [menus] = await conn.query(
      `SELECT menu_id, name, price, stock_quantity
       FROM menu_item
      WHERE branch_id = ? AND is_active = TRUE AND menu_id IN (?)
       ORDER BY menu_id
       FOR UPDATE`,
      [branch_id, [...merged.keys()]]
    );
    const menuMap = new Map(menus.map((m) => [m.menu_id, m]));

    let total = 0;
    for (const [menuId, qty] of merged) {
      const menu = menuMap.get(menuId);
      if (!menu) throw httpError(400, `menu_id ${menuId} not found in this branch`);
      if (menu.stock_quantity < qty) {
        throw httpError(
          400,
          `Insufficient stock for "${menu.name}": ${menu.stock_quantity} left`
        );
      }
      total += Number(menu.price) * qty;
    }
    total = Math.round(total * 100) / 100;

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
      await conn.query(
        "UPDATE menu_item SET stock_quantity = stock_quantity - ? WHERE menu_id = ?",
        [qty, menuId]
      );
      await conn.query(
        "INSERT INTO stock_movement (menu_id, quantity_change) VALUES (?, ?)",
        [menuId, -qty]
      );
    }

    await conn.commit();
    res.status(201).json({ message: "Order created", order_id: orderId, total_price: total });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("Order transaction rollback failed:", rollbackError.message);
      }
    }
    throw err;
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/orders/:id   body: { "payment_method": "qr", "employee_id": 2 }
router.put("/orders/:id", async (req, res) => {
  const orderId = pathId(req.params);
  const { payment_method, employee_id } = req.body || {};

  if (payment_method === undefined && employee_id === undefined) {
    return res.status(400).json({ message: "payment_method or employee_id is required" });
  }
  if (payment_method !== undefined && !PAYMENT_METHODS.includes(payment_method)) {
    return res.status(400).json({ message: PAYMENT_MESSAGE });
  }
  if (employee_id !== undefined && !isPositiveInt(employee_id)) {
    return res.status(400).json({ message: "employee_id must be a positive integer" });
  }

  let conn;
  let transactionStarted = false;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    transactionStarted = true;

    const [orders] = await conn.query(
      "SELECT branch_id FROM orders WHERE order_id = ? FOR UPDATE",
      [orderId]
    );
    if (orders.length === 0) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: "Order not found" });
    }

    if (employee_id !== undefined) {
      const [emp] = await conn.query(
        "SELECT employee_id FROM employee WHERE employee_id = ? AND branch_id = ?",
        [employee_id, orders[0].branch_id]
      );
      if (emp.length === 0) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(400).json({ message: "employee not found in this order's branch" });
      }
    }

    await conn.query(
      "UPDATE orders SET payment_method = COALESCE(?, payment_method), employee_id = COALESCE(?, employee_id) WHERE order_id = ?",
      [payment_method ?? null, employee_id ?? null, orderId]
    );
    await conn.commit();
    transactionStarted = false;
    res.json({ message: "Order updated" });
  } catch (err) {
    if (conn && transactionStarted) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("Order update rollback failed:", rollbackError.message);
      }
    }
    throw err;
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/orders/:id  (คืนสต็อกและบันทึก stock_movement ให้อัตโนมัติ)
router.delete("/orders/:id", async (req, res) => {
  const orderId = pathId(req.params);
  let conn;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [orders] = await conn.query(
      "SELECT order_id FROM orders WHERE order_id = ? FOR UPDATE",
      [orderId]
    );
    if (orders.length === 0) throw httpError(404, "Order not found");

    const [items] = await conn.query(
      "SELECT menu_id, quantity FROM order_item WHERE order_id = ?",
      [orderId]
    );
    for (const it of items) {
      await conn.query(
        "UPDATE menu_item SET stock_quantity = stock_quantity + ? WHERE menu_id = ?",
        [it.quantity, it.menu_id]
      );
      await conn.query(
        "INSERT INTO stock_movement (menu_id, quantity_change) VALUES (?, ?)",
        [it.menu_id, it.quantity]
      );
    }

    await conn.query("DELETE FROM order_item WHERE order_id = ?", [orderId]);
    await conn.query("DELETE FROM orders WHERE order_id = ?", [orderId]);

    await conn.commit();
    res.json({ message: "Order deleted and stock restored" });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("Order transaction rollback failed:", rollbackError.message);
      }
    }
    throw err;
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
