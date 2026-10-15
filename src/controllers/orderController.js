const pool = require("../config/db");
const menuModel = require("../models/menuModel");
const orderModel = require("../models/orderModel");
const orderItemModel = require("../models/orderItemModel");
const employeeModel = require("../models/employeeModel");

const VALID_PAYMENT_METHODS = ["cash", "qr"];

exports.createOrder = async (req, res) => {
  const { branchId, employeeId, paymentMethod, items } = req.body;

  // ---- US-01 validation พื้นฐาน ----
  if (!Number.isInteger(branchId) || !Number.isInteger(employeeId)) {
    return res.status(400).json({ error: "ต้องระบุ branchId และ employeeId" });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({ error: "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ" });
  }

  const hasInvalidMenuId = items.some((item) => !Number.isInteger(item.menuId));
  if (hasInvalidMenuId) {
    return res.status(400).json({ error: "ต้องระบุ menuId ให้ครบทุกรายการ" });
  }

  const hasInvalidQuantity = items.some(
    (item) => !Number.isInteger(item.quantity) || item.quantity <= 0,
  );
  if (hasInvalidQuantity) {
    return res.status(400).json({ error: "จำนวนสินค้าต้องมากกว่า 0" });
  }

  // ---- US-02: รองรับเงินสดและ QR Payment ----
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ error: "paymentMethod ไม่ถูกต้อง" });
  }

  const connection = await pool.getConnection();

  try {
    // ---- พนักงานต้องมีอยู่จริงและอยู่สาขาเดียวกับออเดอร์ ----
    const employee = await employeeModel.findById(employeeId);
    if (!employee || employee.branch_id !== branchId) {
      return res
        .status(400)
        .json({ error: "ไม่พบพนักงานในสาขานี้" });
    }

    await connection.beginTransaction();

    const orderId = await orderModel.create(connection, {
      branchId,
      employeeId,
      paymentMethod,
    });

    let totalAmount = 0;

    for (const item of items) {
      // ---- Exception Flow 2c (UC-01): ไม่พบเมนูในระบบ ----
      const menu = await menuModel.findById(connection, item.menuId);
      if (!menu || menu.branch_id !== branchId) {
        await connection.rollback();
        return res
          .status(404)
          .json({ error: `ไม่พบเมนู (menuId ${item.menuId}) ในสาขานี้` });
      }

      // ---- US-04: ตัดสต็อกอัตโนมัติ (adjustStock ไม่ยอมให้ติดลบ) ----
      const ok = await menuModel.adjustStock(connection, menu.menu_id, -item.quantity);
      if (!ok) {
        await connection.rollback();
        return res.status(409).json({
          error: `สินค้า "${menu.name}" ไม่พร้อมจำหน่าย (สต็อกไม่เพียงพอ)`,
        });
      }

      // ---- เก็บราคา ณ ตอนขายจากฐานข้อมูล ไม่รับราคาจาก client ----
      await orderItemModel.create(connection, {
        orderId,
        menuId: menu.menu_id,
        quantity: item.quantity,
        unitPrice: menu.price,
      });

      totalAmount += Number(menu.price) * item.quantity;
    }

    await connection.commit();

    // ---- US-01: ตอบกลับหมายเลขออเดอร์และยอดรวมที่คำนวณได้ ----
    return res.status(201).json({
      orderId,
      totalAmount: Math.round(totalAmount * 100) / 100,
    });
  } catch (error) {
    await connection.rollback();
    console.error("createOrder error:", error);
    return res
      .status(500)
      .json({ error: "เกิดข้อผิดพลาดระหว่างบันทึกออเดอร์ กรุณาลองใหม่อีกครั้ง" });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/orders?branchId=1&date=2026-10-15
 * US-05: ค้นหาประวัติการขายตามวันที่
 */
exports.getOrdersByDate = async (req, res) => {
  const branchId = Number(req.query.branchId);
  const { date } = req.query;

  if (!Number.isInteger(branchId) || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    return res
      .status(400)
      .json({ error: "ต้องระบุ branchId และ date (YYYY-MM-DD)" });
  }

  try {
    const orders = await orderModel.findByDate(branchId, date);

    // ---- US-05: วันที่เลือกไม่มีข้อมูลการขาย ----
    if (orders.length === 0) {
      return res.json({ message: "ไม่มีข้อมูลการขายของวันที่เลือก", orders: [] });
    }
    return res.json({ orders });
  } catch (error) {
    console.error("getOrdersByDate error:", error);
    return res.status(500).json({ error: "ไม่สามารถดึงประวัติการขายได้" });
  }
};

/**
 * GET /api/orders/:id
 * ดูรายละเอียดออเดอร์พร้อมรายการสินค้า
 */
exports.getOrderById = async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId)) {
    return res.status(400).json({ error: "orderId ไม่ถูกต้อง" });
  }

  try {
    const order = await orderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "ไม่พบออเดอร์" });
    }
    const items = await orderItemModel.findByOrderId(orderId);
    return res.json({ ...order, items });
  } catch (error) {
    console.error("getOrderById error:", error);
    return res.status(500).json({ error: "ไม่สามารถดึงข้อมูลออเดอร์ได้" });
  }
};