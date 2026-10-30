
const express = require("express");
const pool = require("../config/db");
const { MAX_INT, isPositiveInt } = require("../utils/validate");

const router = express.Router();

// POST /api/stock-movements
// body: { "menu_id": 2, "quantity_change": 5 }
router.post("/stock-movements", async (req, res) => {
  const { menu_id, quantity_change } = req.body || {};

  // ตรวจสอบข้อมูลที่ส่งเข้ามา (ต้องเป็นจำนวนเต็มจริงๆ ไม่แปลงชนิดข้อมูลให้เอง
  // เพราะ Number(true) = 1 จะทำให้ menu_id: true ผ่านการตรวจแบบเดิม)
  if (
    !isPositiveInt(menu_id) ||
    !Number.isInteger(quantity_change) ||
    quantity_change === 0 ||
    Math.abs(quantity_change) > MAX_INT
  ) {
    return res.status(400).json({
      message: "menu_id must be a positive integer and quantity_change must be a non-zero integer",
    });
  }

  const menuId = menu_id;
  const change = quantity_change;

  let conn;
  let transactionStarted = false;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    transactionStarted = true;

    // ล็อกแถวเมนูไว้ระหว่างปรับสต็อก ป้องกันการแก้ยอดพร้อมกัน
    const [rows] = await conn.query(
      "SELECT stock_quantity FROM menu_item WHERE menu_id = ? AND is_active = TRUE FOR UPDATE",
      [menuId]
    );

    if (rows.length === 0) {
      await conn.rollback();
      transactionStarted = false;

      return res.status(404).json({
        message: "Menu not found",
      });
    }

    const currentStock = Number(rows[0].stock_quantity ?? 0);
    const newStock = currentStock + change;

    // ไม่อนุญาตให้สต็อกติดลบ หรือเกินขอบเขตของคอลัมน์ INT
    if (newStock > MAX_INT) {
      await conn.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message: "Resulting stock is too large",
      });
    }

    if (newStock < 0) {
      await conn.rollback();
      transactionStarted = false;

      return res.status(400).json({
        message: "Insufficient stock",
        current_stock: currentStock,
        quantity_change: change,
      });
    }

    // บันทึกประวัติและอัปเดตยอดใน Transaction เดียวกัน
    const [movement] = await conn.query(
      "INSERT INTO stock_movement (menu_id, quantity_change) VALUES (?, ?)",
      [menuId, change]
    );

    await conn.query(
      "UPDATE menu_item SET stock_quantity = ? WHERE menu_id = ?",
      [newStock, menuId]
    );

    await conn.commit();
    transactionStarted = false;

    return res.status(201).json({
      message: "Stock movement recorded",
      movement_id: movement.insertId,
      menu_id: menuId,
      quantity_change: change,
      stock_quantity: newStock,
    });
  } catch (err) {
    if (conn && transactionStarted) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("Stock transaction rollback failed:", rollbackError.message);
      }
    }

    console.error("Stock movement error:", err.message);

    return res.status(500).json({
      message: "Failed to record stock movement",
    });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
