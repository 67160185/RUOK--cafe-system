const db = require("../config/db");

const COLUMNS = "branch_id, name, address";

exports.findAll = async () => {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM branch ORDER BY branch_id`);
  return rows;
};

exports.findById = async (branchId) => {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM branch WHERE branch_id = ?`,
    [branchId],
  );
  return rows.length > 0 ? rows[0] : null;
};