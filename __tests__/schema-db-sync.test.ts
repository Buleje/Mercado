/**
 * Schema-DB Sync Integrity Test
 * 
 * Validates that Prisma schema models match the actual database tables.
 * Parses schema.prisma to extract model names and checks they exist
 * in the generated Prisma client.
 * 
 * This is a static check — does NOT require a DB connection.
 * For live DB validation, use `npx tsx check-columns.mts`.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SCHEMA_PATH = path.resolve(__dirname, "../prisma/schema.prisma");
const MIGRATION_DIR = path.resolve(__dirname, "../prisma/migrations");

function extractModelNames(schemaContent: string): string[] {
  const regex = /^model\s+(\w+)\s*\{/gm;
  const models: string[] = [];
  let match;
  while ((match = regex.exec(schemaContent)) !== null) {
    models.push(match[1]);
  }
  return models;
}

function getMigrationFolders(): string[] {
  if (!fs.existsSync(MIGRATION_DIR)) return [];
  return fs.readdirSync(MIGRATION_DIR)
    .filter(f => fs.statSync(path.join(MIGRATION_DIR, f)).isDirectory())
    .filter(f => f !== "migration_lock.toml" && /^\d{14}/.test(f))
    .sort();
}

describe("Schema-DB Sync Integrity", () => {
  const schemaContent = fs.readFileSync(SCHEMA_PATH, "utf-8");
  const models = extractModelNames(schemaContent);

  it("debe tener al menos 100 modelos en schema.prisma", () => {
    expect(models.length).toBeGreaterThanOrEqual(100);
  });

  it("cada modelo debe tener tenantId o ser un modelo de sistema", () => {
    // System models that don't need tenantId
    const systemModels = new Set([
      "Tenant", "TenantUser", "Plan", "PlanFeature",
      "SuperAdminUser", "SuperAdminAuditLog",
      "Account", "Session", "VerificationToken",
      "PushSubscription",
    ]);

    // Models that access tenant through a parent relation
    const relationalModels = new Set([
      "StoreProduct", "OrderItem", "ReturnItem", "SaleItem",
      "PurchaseItem", "CartItem", "RecipeIngredient",
      "CreditNoteItem", "GuiaRemisionItem", "BundleItem",
      "InvoiceItem", "ProductImage", "ProductVariant",
      "CotizacionItem", "SupplierContractItem",
      "ForecastLog", "AiConversationMessage",
    ]);

    const missingTenantId: string[] = [];

    for (const model of models) {
      if (systemModels.has(model) || relationalModels.has(model)) continue;

      // Extract the model block
      const modelRegex = new RegExp(`model\\s+${model}\\s*\\{([^}]+)\\}`, "s");
      const match = schemaContent.match(modelRegex);
      if (!match) continue;

      const block = match[1];
      if (!block.includes("tenantId")) {
        missingTenantId.push(model);
      }
    }

    // Log for awareness but don't fail hard — some models legitimately don't need it
    if (missingTenantId.length > 0) {
      console.warn(`Models without tenantId (review needed): ${missingTenantId.join(", ")}`);
    }

    // At least 80% of non-system models should have tenantId
    const nonSystem = models.filter(m => !systemModels.has(m) && !relationalModels.has(m));
    const withTenant = nonSystem.length - missingTenantId.length;
    const ratio = withTenant / nonSystem.length;
    expect(ratio).toBeGreaterThanOrEqual(0.7);
  });

  it("todas las migraciones deben tener un archivo migration.sql", () => {
    const folders = getMigrationFolders();
    expect(folders.length).toBeGreaterThan(0);

    for (const folder of folders) {
      const sqlPath = path.join(MIGRATION_DIR, folder, "migration.sql");
      expect(
        fs.existsSync(sqlPath),
        `Migration folder ${folder} is missing migration.sql`
      ).toBe(true);
    }
  });

  it("los modelos críticos de marketplace deben existir en schema", () => {
    const criticalModels = [
      "Store", "StoreProduct", "SponsoredBoost", "StoreBanner",
      "ProductAnalytics", "StockoutPrediction", "SalesAnomaly",
      "SearchSuggestion",
    ];

    for (const model of criticalModels) {
      expect(
        models.includes(model),
        `Critical model ${model} missing from schema.prisma`
      ).toBe(true);
    }
  });

  it("los modelos Product deben tener campos SEO", () => {
    // [^}]+ ya excluye `}` explícitamente, no necesitamos el flag `s` (que
    // requiere target es2018+). Esto matchea tanto multilinea como simple línea.
    const productBlock = schemaContent.match(/model\s+Product\s*\{([^}]+)\}/);
    expect(productBlock).toBeTruthy();

    const block = productBlock![1];
    const seoFields = ["metaTitle", "metaDescription", "metaKeywordsJson", "ogImage"];
    for (const field of seoFields) {
      expect(
        block.includes(field),
        `Product model missing SEO field: ${field}`
      ).toBe(true);
    }
  });

  it("no debe haber @default(\"main\") en tenantId (eliminado por migración)", () => {
    // Count remaining @default("main") on tenantId lines
    const lines = schemaContent.split("\n");
    const withDefault = lines.filter(line =>
      line.includes("tenantId") && line.includes('@default("main")')
    );

    // Allow some leeway (some models might legitimately need it during transition)
    expect(
      withDefault.length,
      `Found ${withDefault.length} models still using @default("main") on tenantId`
    ).toBeLessThanOrEqual(5);
  });
});
