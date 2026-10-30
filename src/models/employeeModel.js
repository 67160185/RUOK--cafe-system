const db = require("../config/db");

const COLUMNS = "employee_id, branch_id, name, role";

exports.findById = async (employeeId) => {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM employee WHERE employee_id = ?`,
    [employeeId],
  );
  return rows.length > 0 ? rows[0] : null;
};

// พนักงานทั้งหมดในสาขา
exports.findByBranch = async (branchId) => {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM employee WHERE branch_id = ? ORDER BY name`,
    [branchId],
  );
  return rows;
};

exports.findAll = async () => {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM employee ORDER BY branch_id, name, employee_id`,
  );
  return rows;
};