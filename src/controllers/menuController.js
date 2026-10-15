const pool = require("../config/db");
const menuModel = require("../models/menuModel");
const branchModel = require("../models/branchModel");
const categoryModel = require("../models/categoryModel");

function validateMenuFields({ name, price }) {
  if (typeof name !== "string" || name.trim() === "") {
    return "ต้องระบุชื่อเมนู";
  }
  if (!Number.isFinite(price) || price <= 0) {
    return "ราคาเมนูต้องมากกว่า 0";
  }
  return null;
}

/** GET /api/menus?branchId=1 */
exports.getAllMenus = async (req, res) => {
  const branchId =
    req.query.branchId !== undefined ? Number(req.query.branchId) : undefined;

  if (branchId !== undefined && !Number.isInteger(branchId)) {
    return res.status(400).json({ error: "branchId ไม่ถูกต้อง" });
  }

  try {
    const menus = await menuModel.findAll(branchId);
    return res.json(menus);
  } catch (error) {
    console.error("getAllMenus error:", error);
    return res.status(500).json({ error: "ไม่สามารถดึงข้อมูลเมนูได้" });
  }
};

/** GET /api/menus/:id */
exports.getMenuById = async (req, res) => {
  const menuId = Number(req.params.id);
  if (!Number.isInteger(menuId)) {
    return res.status(400).json({ error: "menuId ไม่ถูกต้อง" });
  }

  try {
    const menu = await menuModel.findById(pool, menuId);
    if (!menu) return res.status(404).json({ error: "ไม่พบเมนู" });
    return res.json(menu);
  } catch (error) {
    console.error("getMenuById error:", error);
    return res.status(500).json({ error: "ไม่สามารถดึงข้อมูลเมนูได้" });
  }
};

/** POST /api/menus  (US-07: เพิ่มเมนู) */
exports.createMenu = async (req, res) => {
  const { branchId, categoryId, name, price, stockQuantity = 0 } = req.body;

  const fieldError = validateMenuFields({ name, price });
  if (fieldError) return res.status(400).json({ error: fieldError });

  if (!Number.isInteger(branchId) || !Number.isInteger(categoryId)) {
    return res.status(400).json({ error: "ต้องระบุ branchId และ categoryId" });
  }
  if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
    return res.status(400).json({ error: "จำนวนสต็อกต้องไม่ติดลบ" });
  }

  try {
    if (!(await branchModel.findById(branchId))) {
      return res.status(400).json({ error: "ไม่พบสาขาที่ระบุ" });
    }
    if (!(await categoryModel.findById(categoryId))) {
      return res.status(400).json({ error: "ไม่พบหมวดหมู่ที่ระบุ" });
    }

    // เมนูชื่อเดียวกันซ้ำในสาขาเดียวกันไม่ได้
    if (await menuModel.findByName(pool, branchId, name.trim())) {
      return res.status(409).json({ error: "มีเมนูชื่อนี้ในสาขานี้แล้ว" });
    }

    const menuId = await menuModel.create({
      branchId,
      categoryId,
      name: name.trim(),
      price,
      stockQuantity,
    });
    return res.status(201).json({ menuId });
  } catch (error) {
    console.error("createMenu error:", error);
    return res.status(500).json({ error: "ไม่สามารถเพิ่มเมนูได้" });
  }
};

/** PUT /api/menus/:id  (US-07: แก้ไขเมนู) */
exports.updateMenu = async (req, res) => {
  const menuId = Number(req.params.id);
  const { categoryId, name, price } = req.body;

  if (!Number.isInteger(menuId)) {
    return res.status(400).json({ error: "menuId ไม่ถูกต้อง" });
  }
  const fieldError = validateMenuFields({ name, price });
  if (fieldError) return res.status(400).json({ error: fieldError });
  if (!Number.isInteger(categoryId)) {
    return res.status(400).json({ error: "ต้องระบุ categoryId" });
  }

  try {
    if (!(await categoryModel.findById(categoryId))) {
      return res.status(400).json({ error: "ไม่พบหมวดหมู่ที่ระบุ" });
    }

    const updated = await menuModel.update(menuId, {
      categoryId,
      name: name.trim(),
      price,
    });
    if (!updated) return res.status(404).json({ error: "ไม่พบเมนู" });
    return res.json({ message: "แก้ไขเมนูเรียบร้อย" });
  } catch (error) {
    console.error("updateMenu error:", error);
    return res.status(500).json({ error: "ไม่สามารถแก้ไขเมนูได้" });
  }
};

/** DELETE /api/menus/:id  (US-07: ลบเมนู) */
exports.deleteMenu = async (req, res) => {
  const menuId = Number(req.params.id);
  if (!Number.isInteger(menuId)) {
    return res.status(400).json({ error: "menuId ไม่ถูกต้อง" });
  }

  try {
    const removed = await menuModel.remove(menuId);
    if (!removed) return res.status(404).json({ error: "ไม่พบเมนู" });
    return res.json({ message: "ลบเมนูเรียบร้อย" });
  } catch (error) {
    // เมนูที่เคยถูกขายแล้วถูกอ้างอิงโดย order_item / stock_movement
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res
        .status(409)
        .json({ error: "ไม่สามารถลบเมนูที่เคยมีประวัติการขายหรือสต็อกได้" });
    }
    console.error("deleteMenu error:", error);
    return res.status(500).json({ error: "ไม่สามารถลบเมนูได้" });
  }
};