-- Migration 002: allow removing ordered menu items without losing sales history.
-- Run once against an existing cafe_system database.

USE cafe_system;

ALTER TABLE menu_item
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
