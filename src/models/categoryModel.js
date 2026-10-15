const db = require("../config/db");

const COLUMNS = "category_id, name";

exports.findAll = async () => {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM category ORDER BY name`);
  return rows;
};

exports.findById = async (categoryId) => {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM category WHERE category_id = ?`,
    [categoryId],
  );
  return rows.length > 0 ? rows[0] : null;
};