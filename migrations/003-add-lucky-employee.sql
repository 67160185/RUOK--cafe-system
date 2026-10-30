-- Migration 003: add Lucky as a cashier at the main branch (branch_id 1).
-- Safe to run more than once.

USE cafe_system;

INSERT INTO employee (branch_id, name, role)
SELECT b.branch_id, 'ลัคกี้', 'cashier'
FROM branch b
WHERE b.branch_id = 1
  AND NOT EXISTS (
    SELECT 1
    FROM employee e
    WHERE e.branch_id = b.branch_id AND e.name = 'ลัคกี้'
  );
