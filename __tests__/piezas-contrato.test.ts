/**
 * ADR-457 · el contrato de las piezas: lo que el registro promete y que nadie
 * debería poder romper sin que un test se ponga rojo.
 *
 * · Toda pieza tiene id kebab-case, versión semver y enchufes que existen.
 * · Sus opciones son `.strict()`: un `tenantId` (o cualquier campo de más) por
 *   las opciones se rechaza al guardar Y al leer.
 * · El registro del cliente y el del servidor hablan de las mismas piezas.
 * · En `extensiones/**` no hay ids de negocio: la asignación vive en la tabla.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/tenant-pieza.db", () => ({ TenantPiezaDB: {} }));
vi.mock("@/lib/db/tenants.db", () => ({ TenantsDB: {} }));

import { ENCHUFES } from "@/extensiones/_contrato";
import { PIEZAS_SERVIDOR } from "@/extensiones/registro.servidor";
import { PIEZAS_CLIENTE } from "@/extensiones/registro.cliente";
import { catalogoDePiezas, validarAsignacion, validarOpciones } from "@/lib/extensiones/resolver";

const RAIZ = path.resolve(__dirname, "..", "extensiones");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : [p];
  });
}

describe("registro de piezas", () => {
  it("hay al menos la pieza piloto de la guía", () => {
    expect(PIEZAS_SERVIDOR.map((e) => e.manifiesto.id)).toContain("gtf-hoja-de-control");
  });

  it("ids únicos, kebab-case, semver, enchufes que existen", () => {
    const ids = PIEZAS_SERVIDOR.map((e) => e.manifiesto.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { manifiesto: m } of PIEZAS_SERVIDOR) {
      expect(m.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(m.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(m.enchufes.length).toBeGreaterThan(0);
      for (const e of m.enchufes) expect(ENCHUFES).toContain(e);
      // La carpeta de la pieza se llama como su id.
      expect(statSync(path.join(RAIZ, m.id)).isDirectory()).toBe(true);
    }
  });

  it("las opciones son .strict(): un tenantId por las opciones se rechaza", () => {
    for (const { manifiesto: m } of PIEZAS_SERVIDOR) {
      const porDefecto = validarOpciones(m, {});
      expect(porDefecto.ok).toBe(true);
      if (!porDefecto.ok) continue;
      expect(validarOpciones(m, { ...porDefecto.opciones, tenantId: "otro-negocio" }).ok).toBe(false);
      expect(m.opciones.safeParse({ tenantId: "otro-negocio" }).success).toBe(false);
    }
  });

  it("el cliente y el servidor registran las mismas piezas y el mismo manifiesto", () => {
    for (const { manifiesto: m } of PIEZAS_SERVIDOR) {
      const c = PIEZAS_CLIENTE[m.id];
      expect(c, `falta ${m.id} en registro.cliente.ts`).toBeDefined();
      expect(c.manifiesto).toBe(m);
      if (m.enchufes.includes("forestal.guia-impresa")) expect(typeof c.guia).toBe("function");
      // Sin `pestana`, «A medida» saldría vacía para el negocio que la tenga prendida.
      if (m.enchufes.includes("panel.pestana")) expect(c.pestana?.Vista, `${m.id} llena panel.pestana y no trae \`pestana\``).toBeDefined();
    }
    expect(Object.keys(PIEZAS_CLIENTE).sort()).toEqual(PIEZAS_SERVIDOR.map((e) => e.manifiesto.id).sort());
  });

  it("en extensiones/** no hay ids de negocio (la asignación vive en TenantPieza)", () => {
    const ofensas: string[] = [];
    for (const f of archivos(RAIZ).filter((p) => /\.(ts|tsx)$/.test(p))) {
      const txt = readFileSync(f, "utf8");
      // Un cuid de Prisma (los ids de Tenant) o comparar contra un slug/tenant literal.
      if (/\bc[a-z0-9]{24}\b/.test(txt)) ofensas.push(`${f}: cuid`);
      if (/(tenantId|slug|tenant\.id|tenant\.slug)\s*[!=]==?\s*["'`]/.test(txt)) ofensas.push(`${f}: compara contra un negocio`);
    }
    expect(ofensas).toEqual([]);
  });
});

describe("catálogo y validación de una asignación", () => {
  it("el catálogo trae el JSON Schema estricto y las opciones por defecto", () => {
    const c = catalogoDePiezas().find((p) => p.id === "gtf-hoja-de-control");
    expect(c).toBeDefined();
    expect(c?.enchufes).toEqual(["forestal.guia-impresa"]);
    expect(c?.opcionesSchema).toMatchObject({ type: "object", additionalProperties: false });
    expect(c?.opcionesPorDefecto).toMatchObject({ mostrarOrigen: true, nota: "" });
    expect((c?.opcionesPorDefecto?.firmas as string[]).length).toBeGreaterThan(0);
  });

  it("pieza que no existe → pieza_desconocida", () => {
    expect(validarAsignacion("no-existe", "tienda.portada", {})).toMatchObject({ ok: false, error: "pieza_desconocida" });
  });

  it("enchufe que la pieza no llena → enchufe_no_soportado", () => {
    expect(validarAsignacion("gtf-hoja-de-control", "tienda.portada", {})).toMatchObject({
      ok: false,
      error: "enchufe_no_soportado",
    });
  });

  it("opciones con un campo de más (tenantId) → opciones_invalidas", () => {
    expect(validarAsignacion("gtf-hoja-de-control", "forestal.guia-impresa", { tenantId: "x" })).toMatchObject({
      ok: false,
      error: "opciones_invalidas",
    });
  });

  it("opciones válidas → ok, con los defaults aplicados y la versión del manifiesto", () => {
    const r = validarAsignacion("gtf-hoja-de-control", "forestal.guia-impresa", { nota: "Avisar antes de salir" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifiesto.version).toBe("1.0.0");
    expect(r.opciones).toMatchObject({ nota: "Avisar antes de salir", mostrarOrigen: true });
  });
});
