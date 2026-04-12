/**
 * Eval: All DB classes require tenantId as first param.
 * Static analysis eval: checks that OrdersDB, CreditDB, etc. follow the pattern.
 * Business rule: CLAUDE.md rule #1 — tenantId obligatorio como primer parametro.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const DB_DIR = path.resolve(__dirname, "../../lib/db");

describe("Multi-Tenant > DB Class tenantId Pattern", () => {
  it("orders.db.ts should have getById(tenantId, ...) signature", () => {
    const content = fs.readFileSync(path.join(DB_DIR, "orders.db.ts"), "utf-8");
    expect(content).toContain("async getById(tenantId: string");
  });

  it("orders.db.ts should have update(tenantId, ...) signature", () => {
    const content = fs.readFileSync(path.join(DB_DIR, "orders.db.ts"), "utf-8");
    expect(content).toContain("async update(tenantId: string");
  });

  it("orders.db.ts should have delete(tenantId, ...) signature", () => {
    const content = fs.readFileSync(path.join(DB_DIR, "orders.db.ts"), "utf-8");
    expect(content).toContain("async delete(tenantId: string");
  });

  it("credit.db.ts should have getProfile with tenantId param", () => {
    const content = fs.readFileSync(path.join(DB_DIR, "credit.db.ts"), "utf-8");
    expect(content).toContain("async getProfile(");
    expect(content).toContain("tenantId: string");
  });

  it("credit.db.ts should have listProfiles with tenantId param", () => {
    const content = fs.readFileSync(path.join(DB_DIR, "credit.db.ts"), "utf-8");
    expect(content).toContain("async listProfiles(");
    expect(content).toContain("tenantId: string");
  });

  it("DB files should exist for core modules", () => {
    const coreFiles = ["orders.db.ts", "credit.db.ts", "analytics.db.ts"];
    for (const file of coreFiles) {
      const filePath = path.join(DB_DIR, file);
      expect(fs.existsSync(filePath), `${file} should exist`).toBe(true);
    }
  });
});
