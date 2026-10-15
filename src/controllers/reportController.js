const orderModel = require("../models/orderModel");
const menuModel = require("../models/menuModel");

/** GET /api/reports/sales-by-branch  (FR-08) */
exports.getSalesByBranch = async (req, res) => {
  try {
    const sales = await orderModel.salesByBranch();
    return res.json(sales);
  } catch (error) {
    console.error("getSalesByBranch error:", error);
    return res.status(500).json({ error: "ไม่สามารถดึงรายงานยอดขายได้" });
  }
};

/** GET /api/reports/stock?branchId=1  (FR-09) */
exports.getStock = async (req, res) => {
  const branchId =
    req.query.branchId !== undefined ? Number(req.query.branchId) : undefined;

  if (branchId !== undefined && !Number.isInteger(branchId)) {
    return res.status(400).json({ error: "branchId ไม่ถูกต้อง" });
  }

  try {
    const stock = await menuModel.findAll(branchId);
    return res.json(stock);
  } catch (error) {
    console.error("getStock error:", error);
    return res.status(500).json({ error: "ไม่สามารถดึงข้อมูลสต็อกได้" });
  }
};