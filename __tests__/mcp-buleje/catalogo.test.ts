// @ts-nocheck — importa .mjs del MCP
// Catálogo del MCP «buleje» (carril C): cada herramienta apunta a una ruta real, sin genéricas de escritura,
// cada «confirmar» explica en español qué hará, y armar el pedido no toca la red.
import { describe, it, expect, vi } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const RAIZ = process.cwd();
const GRUPOS = ["sistema", "hoy", "ventas", "caja", "pedidos", "inventario", "compras", "clientes", "adelantos", "ctp", "gtf", "cubicacion", "documentos", "rrhh", "tareas"];

const modulos = await Promise.all(GRUPOS.map((g) => import(`../../tools/mcp-buleje/src/herramientas/${g}.mjs`)));
const TODAS = modulos.flatMap((m) => m.herramientas);

/** Valor de ejemplo según el JSON schema de un campo. */
function ejemplo(s: any): any {
  if (s.enum) return s.enum[0];
  if (s.anyOf) return ejemplo(s.anyOf.find((x: any) => x.type !== "null") ?? s.anyOf[0]);
  switch (s.type) {
    case "string": {
      const p = s.pattern ?? "";
      if (p.includes("\\d{4}-\\d{2}-\\d{2}")) return "2026-10-29";
      if (p.includes("[01]\\d|2[0-3]")) return "08:00";
      if (p.includes("\\d{1,9}(\\.")) return "1500.00";
      if (p.includes("\\w-")) return "abc123";
      return "Don Lucho";
    }
    case "number":
    case "integer":
      return s.minimum !== undefined && s.minimum > 0 ? s.minimum : s.exclusiveMinimum !== undefined ? s.exclusiveMinimum + 1 : 500;
    case "boolean":
      return true;
    case "array":
      return [ejemplo(s.items ?? { type: "string" })];
    case "object":
      return Object.fromEntries((s.required ?? []).map((k: string) => [k, ejemplo(s.properties[k])]));
    default:
      return "x";
  }
}

/** Variantes de args: una por valor de `vista` (o `modo`), con los campos requeridos rellenos. */
function variantes(def: any): any[] {
  const js: any = z.toJSONSchema(z.object(def.entrada), { io: "input" });
  const base: any = {};
  for (const k of js.required ?? []) base[k] = ejemplo(js.properties[k]);
  // los opcionales con enum de una sola clase también se llenan: aseguran caminos del pedido()
  const opciones = (js.properties.vista?.enum ?? js.properties.modo?.enum) as string[] | undefined;
  const campo = js.properties.vista ? "vista" : "modo";
  if (!opciones) return [base];
  return opciones.map((o) => ({ ...base, [campo]: o }));
}

function rutaExiste(ruta: string): boolean {
  const segs = ruta.replace(/^\/api\//, "").split("/").filter(Boolean);
  let dir = join(RAIZ, "app", "api");
  for (const s of segs) {
    const directo = join(dir, s);
    if (existsSync(directo)) {
      dir = directo;
      continue;
    }
    const dinamico = existsSync(dir) ? readdirSync(dir).find((d) => /^\[.+\]$/.test(d)) : undefined;
    if (!dinamico) return false;
    dir = join(dir, dinamico);
  }
  return existsSync(join(dir, "route.ts"));
}

describe("catálogo del MCP buleje", () => {
  it("hay herramientas en los 15 grupos y los nombres no se repiten", () => {
    const nombres = TODAS.map((d) => d.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
    for (const g of GRUPOS) expect(TODAS.some((d) => d.grupo === g), `grupo ${g} vacío`).toBe(true);
    for (const d of TODAS) {
      expect(d.nombre).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(["lectura", "escritura", "confirmar"]).toContain(d.tipo);
      expect(d.descripcion.length).toBeGreaterThan(20);
    }
  });

  it("toda entrada admite `negocio`", () => {
    for (const d of TODAS) expect(d.entrada.negocio, d.nombre).toBeDefined();
  });

  it("ninguna escritura es genérica (método o ruta libres)", () => {
    for (const d of TODAS.filter((x) => x.tipo !== "lectura" && x.nombre !== "doc_subir")) {
      for (const k of ["ruta", "url", "path", "cuerpo", "body"]) expect(d.entrada[k], `${d.nombre}.${k}`).toBeUndefined();
    }
  });

  it("cada herramienta apunta a una ruta real de app/api y las lecturas son GET", () => {
    for (const d of TODAS) {
      for (const args of variantes(d)) {
        const ped = [].concat(d.pedido(args));
        expect(ped.length, d.nombre).toBeGreaterThan(0);
        for (const p of ped) {
          expect(p.ruta, d.nombre).toMatch(/^\/api\//);
          expect(rutaExiste(p.ruta), `${d.nombre} → ${p.metodo} ${p.ruta} no existe`).toBe(true);
          if (d.tipo === "lectura") expect(p.metodo, d.nombre).toBe("GET");
        }
      }
    }
  });

  it("los ids de ruta se validan con ^[\\w-]{1,40}$", () => {
    for (const d of TODAS) {
      const ev = d.entrada.id ?? d.entrada.despachoId;
      if (!ev || !/\[id\]|\/\$\{/.test(String(d.pedido.toString()))) continue;
      expect(ev.safeParse("../etc/passwd").success, d.nombre).toBe(false);
      expect(ev.safeParse("a/b").success, d.nombre).toBe(false);
    }
  });

  it("cada «confirmar» tiene resumen en español con texto, sin undefined ni NaN", () => {
    const C = TODAS.filter((d) => d.tipo === "confirmar");
    expect(C.length).toBeGreaterThanOrEqual(15);
    for (const d of C) {
      expect(typeof d.resumen, `${d.nombre} sin resumen`).toBe("function");
      for (const args of variantes(d)) {
        const t = d.resumen(args, null);
        expect(typeof t).toBe("string");
        expect(t.trim().length, d.nombre).toBeGreaterThan(15);
        expect(t, d.nombre).not.toMatch(/undefined|NaN|\[object/);
      }
    }
  });

  it("las escrituras con plata muestran el monto como S/ 1.234,50", () => {
    const d = TODAS.find((x) => x.nombre === "adelanto_dar");
    expect(d).toBeDefined();
    const t = d.resumen({ ...variantes(d)[0], monto: 1234.5 }, null);
    expect(t).toMatch(/S\/\s?1\.234,50/);
  });

  it("armar el pedido no hace ninguna llamada de red", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    try {
      for (const d of TODAS) for (const a of variantes(d)) d.pedido(a);
      expect(f).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("las herramientas forestales declaran soloEn", () => {
    for (const d of TODAS.filter((x) => ["ctp", "gtf", "cubicacion"].includes(x.grupo))) expect(d.soloEn, d.nombre).toContain("forestal");
  });
});
