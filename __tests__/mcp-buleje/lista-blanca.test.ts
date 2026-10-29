// @ts-nocheck — importa .mjs del MCP
import { describe, it, expect } from "vitest";
import { rutaLecturaPermitida } from "../../tools/mcp-buleje/src/lista-blanca.mjs";

describe("lista blanca de leer_get", () => {
  it.each([
    "/api/sales",
    "/api/admin/today-summary",
    "/api/admin/forestal/ctp",
    "/api/admin/forestal/gtf/resumen-interno",
    "/api/adelantos/resumen",
    "/api/cierre-diario/preview",
    "/api/admin/documents",
    "/api/activity-log",
  ])("permite %s y devuelve esa misma ruta", (r) => expect(rutaLecturaPermitida(r)).toEqual({ ok: true, motivo: "ok", ruta: r }));

  // Revisión de seguridad 29-10 (hallazgo 1): «%3F» cortaba la ruta en el filtro y el «..» lo resolvía new URL.
  it.each([
    "/api/sales%3F/../../api/admin/export-all",
    "/api/sales%3f/../../api/auth/me",
    "/api/sales%3F",
    "/api/sales%23/../../admin-users",
    "/api/sales#/../../admin-users",
    "/api/sales?x=/../../admin-users",
    "/api/sales?today=1",
    "/api/sales/./x",
    "/api/sales/.",
    "/api/./sales",
    "//api/sales",
    "/api//sales",
    "/api/SALES",
    "/API/sales",
    "/api/Admin-Users",
    "/api/sales/%41",
    "/api/sales/\u0000",
    "/api/sales/ñ",
  ])("rechaza «?», «#» (crudos o codificados), «/./», «//» y mayúsculas: %j", (r) => expect(rutaLecturaPermitida(r).ok).toBe(false));

  it.each([
    "/api/auth/me",
    "/api/admin-users",
    "/api/api-keys",
    "/api/superadmin/tenants",
    "/api/cron/x",
    "/api/sync/pull",
    "/api/backup",
    "/api/webhooks/stripe",
    "/api/admin/security/log",
    "/api/admin/export-all",
    "/api/admin/forestal/ctp/purga",
    "/api/admin/forestal/ctp/anular-dia",
    "/api/sales/export",
    "/api/orders/csv",
    "/api/admin/agenda/calendario/ics",
    "/api/customers/shares",
    "/api/fiados/statement-link",
  ])("prohibido gana: %s", (r) => expect(rutaLecturaPermitida(r).ok).toBe(false));

  it.each([
    "/api/%2e%2e/admin-users",
    "/api/%252e%252e/admin-users",
    "/api/sales/..%2fadmin-users",
    "/api/sales/%2e%2e/auth/me",
    "/api/sales//x",
    "/api/sales\\..\\auth",
    "/api/sales/%5c..",
    "/api/sales;x=1",
    "/api/sales/../admin-users",
    "/api/%2561uth/me",
    "/api/salesx",
    "/api/otra-cosa",
    "/admin",
    "",
  ])("rechaza evasión/fuera de lista: %j", (r) => expect(rutaLecturaPermitida(r).ok).toBe(false));

  it("distingue mayúsculas en el prefijo prohibido", () => expect(rutaLecturaPermitida("/api/AUTH/me").ok).toBe(false));
});
