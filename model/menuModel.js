const pool = require("../db");

// Get all menu items
const findAll = async () => {
  const [rows] = await pool.query(`
    SELECT
      menu_id,
      name,
      price
    FROM menu_item
    ORDER BY menu_id
  `);

  return rows;
};

// Get menu item by ID
const findById = async (menuId) => {
  const [rows] = await pool.query(`
    
    SELECT
      menu_id,
      name,
      price
    FROM menu_item
    WHERE menu_id = ?
    ,
    [menuId]
  `);

  return rows[0] || null;
};

// Get menu items with stock for a branch
const findByBranch = async (branchId) => {
  const [rows] = await pool.query(`
    
    SELECT
      m.menu_id,
      m.name,
      m.price,
      bs.branch_id,
      bs.stock_quantity
    FROM menu_item m
    LEFT JOIN branch_stock bs
      ON m.menu_id = bs.menu_id
      AND bs.branch_id = ?
    ORDER BY m.menu_id
    ,
    [branchId]
  `);

  return rows;
};

// Create menu item
const create = async ({ name, price }) => {
  const [result] = await pool.query(`
    
    INSERT INTO menu_item (name, price)
    VALUES (?, ?)
    ,
    [name, price]
  `);

  return {
    menu_id: result.insertId,
    name,
    price
  };
};

// Update menu item
const update = async (menuId, { name, price }) => {
  const [result] = await pool.query(`
    
    UPDATE menu_item
    SET name = ?, price = ?
    WHERE menu_id = ?
    ,
    [name, price, menuId]
  `);

  return result.affectedRows > 0;
};

// Delete menu item
const remove = async (menuId) => {
  const [result] = await pool.query(`
    
    DELETE FROM menu_item
    WHERE menu_id = ?
    ,
    [menuId]
  `);

  return result.affectedRows > 0;
};

module.exports = {
  findAll,
  findById,
  findByBranch,
  create,
  update,
  remove
};
menuModel.js