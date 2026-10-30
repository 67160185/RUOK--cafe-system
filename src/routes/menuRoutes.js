const express = require("express");
const pool = require("../config/db");
const {
  MAX_INT,
  isPositiveInt,
  optionalQueryId,
  pathId,
  isValidPrice,
  PRICE_MESSAGE,
} = require("../utils/validate");

const router = express.Router();

const NAME_MAX_LENGTH = 100;
const CATEGORY_NAME_MAX_LENGTH = 50;

const BASE_SELECT = `
  SELECT m.menu_id, m.branch_id, b.name AS branch_name,
         m.category_id, c.name AS category_name,
         m.name, m.price, m.stock_quantity
  FROM menu_item m
  JOIN branch b ON b.branch_id = m.branch_id
  JOIN category c ON c.category_id = m.category_id`;

const DUPLICATE_NAME_MESSAGE = "A menu item with this name already exists in this branch";
const DUPLICATE_CATEGORY_MESSAGE = "A category with this name already exists";

// ชื่อเมนู: ข้อความไม่ว่าง และยาวไม่เกิน 100 ตัวอักษร (ตรงกับ VARCHAR(100))
const validateName = (name) => {
  if (typeof name !== "string" || !name.trim()) {
    return "name must be a non-empty string";
  }
  if (name.trim().length > NAME_MAX_LENGTH) {
    return `name must be at most ${NAME_MAX_LENGTH} characters`;
  }
  return null;
};

const validateCategoryName = (name) => {
  if (typeof name !== "string" || !name.trim()) {
    return "name must be a non-empty string";
  }
  if (name.trim().length > CATEGORY_NAME_MAX_LENGTH) {
    return `name must be at most ${CATEGORY_NAME_MAX_LENGTH} characters`;
  }
  return null;
};

router.get("/categories", async (req, res) => {
  const [rows] = await pool.query(
    "SELECT category_id, name FROM category ORDER BY name, category_id"
  );
  res.json(rows);
});

router.post("/categories", async (req, res) => {
  const { name } = req.body || {};
  const nameError = validateCategoryName(name);
  if (nameError) return res.status(400).json({ message: nameError });

  const trimmedName = name.trim();
  const [existing] = await pool.query("SELECT category_id FROM category WHERE name = ?", [
    trimmedName,
  ]);
  if (existing.length > 0) {
    return res.status(409).json({ message: DUPLICATE_CATEGORY_MESSAGE });
  }

  try {
    const [result] = await pool.query("INSERT INTO category (name) VALUES (?)", [trimmedName]);
    return res.status(201).json({
      message: "Category created",
      category_id: result.insertId,
      name: trimmedName,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: DUPLICATE_CATEGORY_MESSAGE });
    }
    throw error;
  }
});

// GET /api/menu?branch_id=1&category_id=2
router.get("/menu", async (req, res) => {
  const branchId = optionalQueryId(req.query, "branch_id");
  const categoryId = optionalQueryId(req.query, "category_id");

  const where = ["m.is_active = TRUE"];
  const params = [];
  if (branchId !== undefined) {
    where.push("m.branch_id = ?");
    params.push(branchId);
  }
  if (categoryId !== undefined) {
    where.push("m.category_id = ?");
    params.push(categoryId);
  }

  const sql = BASE_SELECT + " WHERE " + where.join(" AND ") + " ORDER BY m.menu_id";
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// GET /api/menu/:id
router.get("/menu/:id", async (req, res) => {
  const menuId = pathId(req.params);

  const [rows] = await pool.query(
    BASE_SELECT + " WHERE m.is_active = TRUE AND m.menu_id = ?",
    [menuId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ message: "Menu not found" });
  }
  return res.json(rows[0]);
});

// POST /api/menu
// body: { "branch_id": 1, "category_id": 1, "name": "มอคค่า", "price": 60, "stock_quantity": 30 }
router.post("/menu", async (req, res) => {
  const { branch_id, category_id, name, price, stock_quantity = 0 } = req.body || {};

  if (!isPositiveInt(branch_id) || !isPositiveInt(category_id)) {
    return res.status(400).json({ message: "branch_id and category_id must be positive integers" });
  }

  const nameError = validateName(name);
  if (nameError) {
    return res.status(400).json({ message: nameError });
  }

  if (!isValidPrice(price)) {
    return res.status(400).json({ message: PRICE_MESSAGE });
  }

  if (!Number.isInteger(stock_quantity) || stock_quantity < 0 || stock_quantity > MAX_INT) {
    return res.status(400).json({ message: "stock_quantity must be a non-negative integer" });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // ตรวจสอบว่าสาขาและหมวดหมู่มีอยู่จริง
    const [branches] = await conn.query("SELECT branch_id FROM branch WHERE branch_id = ?", [
      branch_id,
    ]);
    if (branches.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: "Branch not found" });
    }

    const [categories] = await conn.query(
      "SELECT category_id FROM category WHERE category_id = ?",
      [category_id]
    );
    if (categories.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: "Category not found" });
    }

    const [result] = await conn.query(
      `INSERT INTO menu_item (branch_id, category_id, name, price, stock_quantity)
       VALUES (?, ?, ?, ?, ?)`,
      [branch_id, category_id, name.trim(), price, stock_quantity]
    );

    // บันทึกประวัติสต็อกเริ่มต้นเมื่อมีสต็อกมากกว่า 0
    if (stock_quantity > 0) {
      await conn.query(
        "INSERT INTO stock_movement (menu_id, quantity_change) VALUES (?, ?)",
        [result.insertId, stock_quantity]
      );
    }

    await conn.commit();
    return res.status(201).json({ message: "Menu created", menu_id: result.insertId });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("Menu creation rollback error:", rollbackError);
      }
    }
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: DUPLICATE_NAME_MESSAGE });
    }
    throw error;
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/menu/:id   (ส่งเฉพาะ field ที่ต้องการแก้ก็ได้)
// หมายเหตุ: การแก้จำนวนสต็อกให้ใช้ POST /api/stock-movements เพื่อให้มีประวัติ
router.put("/menu/:id", async (req, res) => {
  const menuId = pathId(req.params);
  const body = req.body || {};
  const allowedFields = ["branch_id", "category_id", "name", "price"];

  const fields = Object.keys(body);
  if (fields.length === 0) {
    return res.status(400).json({ message: "At least one field is required" });
  }

  const unknownFields = fields.filter((field) => !allowedFields.includes(field));
  if (unknownFields.length > 0) {
    return res.status(400).json({ message: `Unsupported fields: ${unknownFields.join(", ")}` });
  }

  const { branch_id, category_id, name, price } = body;

  if (branch_id !== undefined && !isPositiveInt(branch_id)) {
    return res.status(400).json({ message: "branch_id must be a positive integer" });
  }
  if (category_id !== undefined && !isPositiveInt(category_id)) {
    return res.status(400).json({ message: "category_id must be a positive integer" });
  }
  if (name !== undefined) {
    const nameError = validateName(name);
    if (nameError) return res.status(400).json({ message: nameError });
  }
  if (price !== undefined && !isValidPrice(price)) {
    return res.status(400).json({ message: PRICE_MESSAGE });
  }

  let conn;
  let transactionStarted = false;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    transactionStarted = true;

    const [existing] = await conn.query(
      "SELECT branch_id FROM menu_item WHERE menu_id = ? AND is_active = TRUE FOR UPDATE",
      [menuId]
    );
    if (existing.length === 0) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: "Menu not found" });
    }

    if (branch_id !== undefined) {
      const [branches] = await conn.query("SELECT branch_id FROM branch WHERE branch_id = ?", [
        branch_id,
      ]);
      if (branches.length === 0) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(400).json({ message: "Branch not found" });
      }

      // การล็อกแถวเมนูป้องกันการย้ายสาขาชนกับการสร้างออเดอร์ที่ล็อกเมนูเดียวกัน
      if (branch_id !== existing[0].branch_id) {
        const [ordered] = await conn.query(
          "SELECT 1 FROM order_item WHERE menu_id = ? LIMIT 1",
          [menuId]
        );
        if (ordered.length > 0) {
          await conn.rollback();
          transactionStarted = false;
          return res
            .status(409)
            .json({ message: "Cannot change the branch of a menu item that has been ordered" });
        }
      }
    }

    if (category_id !== undefined) {
      const [categories] = await conn.query(
        "SELECT category_id FROM category WHERE category_id = ?",
        [category_id]
      );
      if (categories.length === 0) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(400).json({ message: "Category not found" });
      }
    }

    const [result] = await conn.query(
      `UPDATE menu_item
       SET branch_id = COALESCE(?, branch_id),
           category_id = COALESCE(?, category_id),
           name = COALESCE(?, name),
           price = COALESCE(?, price)
       WHERE menu_id = ?`,
      [
        branch_id ?? null,
        category_id ?? null,
        name === undefined ? null : name.trim(),
        price ?? null,
        menuId,
      ]
    );

    await conn.commit();
    transactionStarted = false;
    return res.json({ message: "Menu updated", changed: result.changedRows > 0 });
  } catch (error) {
    if (conn && transactionStarted) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("Menu update rollback error:", rollbackError);
      }
    }
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: DUPLICATE_NAME_MESSAGE });
    }
    throw error;
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/menu/:id
// เมนูที่เคยขายแล้วจะถูกเก็บเข้าคลังเพื่อรักษาประวัติการขาย
// เมนูที่ยังไม่เคยขายจะลบถาวรพร้อมประวัติสต็อกได้
router.delete("/menu/:id", async (req, res) => {
  const menuId = pathId(req.params);

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [menus] = await conn.query(
      "SELECT menu_id FROM menu_item WHERE menu_id = ? FOR UPDATE",
      [menuId]
    );
    if (menus.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Menu not found" });
    }

    const [ordered] = await conn.query("SELECT 1 FROM order_item WHERE menu_id = ? LIMIT 1", [
      menuId,
    ]);
    if (ordered.length > 0) {
      await conn.query("UPDATE menu_item SET is_active = FALSE WHERE menu_id = ?", [menuId]);
      await conn.commit();
      return res.json({
        message: "Menu archived; sales history preserved",
        archived: true,
      });
    }

    await conn.query("DELETE FROM stock_movement WHERE menu_id = ?", [menuId]);
    await conn.query("DELETE FROM menu_item WHERE menu_id = ?", [menuId]);

    await conn.commit();
    return res.json({ message: "Menu deleted" });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error("Menu deletion rollback error:", rollbackError);
      }
    }
    throw error;
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
