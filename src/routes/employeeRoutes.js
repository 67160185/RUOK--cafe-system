const express = require("express");
const employeeModel = require("../models/employeeModel");
const { optionalQueryId } = require("../utils/validate");

const router = express.Router();

router.get("/employees", async (req, res) => {
  const branchId = optionalQueryId(req.query, "branch_id");
  const employees =
    branchId === undefined
      ? await employeeModel.findAll()
      : await employeeModel.findByBranch(branchId);
  res.json(employees);
});

module.exports = router;
