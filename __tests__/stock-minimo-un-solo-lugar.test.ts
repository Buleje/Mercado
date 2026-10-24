/**
 * Guardián: un solo stock mínimo (09-10).
 *
 * El mínimo efectivo de un producto es el suyo o, si no tiene, el del negocio
 * (`Settings.globalMinStock`), y se calcula SÓLO con `stockMinimoDe` /
 * `enStockBajo` (lib/inventario/stock-minimo.ts). Había ~40 lugares con el
 * mínimo escrito a mano (`stockMin ?? 5`, `?? 0`, `|| 5`, `COALESCE("stockMin", 5)`)
 * y cada pantalla contaba otro «stock bajo» (main: Sugerencias decía 23, Inicio 1).
 *
 * Trinquete: los archivos de LISTA_CONOCIDA son de otras tandas o de la
 * vitrina pública (no ve la configuración del negocio); su cuenta sólo puede
 * bajar. Un lugar nuevo con el mínimo a mano pone el test en rojo.
 */
import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { enStockBajo, stockMinimoDe } from "@/lib/inventario/stock-minimo";
import { normalizeProducts } from "@/components/admin/sugerencias/normalize";

import { minimoGlobalDelNegocio, minimosGlobalesPorNegocio } from "@/lib/inventario/stock-minimo.server";

const { getSettings } = vi.hoisted(() => ({ getSettings: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: (t: string) => getSettings(t) } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const RAIZ = join(__dirname, "..");
const CARPETAS = ["app", "lib", "components", "hooks", "contexts"];
const EXCLUIDOS = [/^lib\/generated\//, /^lib\/inventario\/stock-minimo\.ts$/];
const MINIMO_A_MANO = /\b(stockMin|minStock|stockMinimo)\s*(\?\?|\|\|)\s*\d|COALESCE\(\s*"stockMin"\s*,\s*\d/g;

/** Archivo → cuántos quedan (sólo puede bajar). Receta: `stockMinimoDe(p, useStockMinimoGlobal())`. */
const LISTA_CONOCIDA: Record<string, number> = {
  // Vitrina pública: /api/settings no le da globalMinStock a un visitante.
  "components/CategoryCatalog.tsx": 1,
  "components/ProductDetailClient.tsx": 1,
  "components/QuickViewModal.tsx": 1,
  // El PDF lo arma quien encola el trabajo (campo `minStock` del payload).
  "lib/workers/generate-pdf.worker.ts": 1,
  // Otras tandas (inventario y POS) — receta en el reporte del 09-10.
  "components/admin/InventoryTab.tsx": 2,
  "components/admin/inventario/ExpandedStockModal.tsx": 1,
  "components/admin/inventario/InventarioAlertaOC.tsx": 1,
  "components/admin/inventario/InventarioFilasTabla.tsx": 3,
  "components/admin/inventario/InventarioSelectorProductos.tsx": 1,
  "components/admin/inventario/StockLevelBar.tsx": 1,
  "components/admin/inventario/hooks/use-inventario-masivo.ts": 1,
  "components/admin/inventario/hooks/use-inventario-pedidos.ts": 3,
  "components/admin/inventario/hooks/useReorderAlerts.ts": 3,
  "components/admin/pos/POSCartItem.tsx": 1,
  "components/admin/pos/POSProductGrid.tsx": 1,
  "components/admin/pos/PuntoCompraProductCard.tsx": 1,
  "components/admin/pos/usePOSCarrito.ts": 1,
};

function recorrer(dir: string, out: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === "node_modules" || nombre.startsWith(".")) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) recorrer(ruta, out);
    else if (/\.(ts|tsx)$/.test(nombre)) out.push(ruta);
  }
  return out;
}

/** Cuenta las apariciones fuera de comentarios (`//`, `*`, `/*`). */
function contarMinimosAMano(fuente: string): number {
  let n = 0;
  for (const linea of fuente.split("\n")) {
    const t = linea.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue;
    const sinComentario = linea.replace(/\s\/\/.*$/, "");
    n += sinComentario.match(MINIMO_A_MANO)?.length ?? 0;
  }
  return n;
}

describe("un solo stock mínimo: nadie lo escribe a mano", () => {
  const archivos = CARPETAS.flatMap((c) => {
    try {
      return recorrer(join(RAIZ, c));
    } catch {
      return [];
    }
  });

  it("ningún archivo nuevo calcula el mínimo con `?? n` / `|| n` / COALESCE fijo", () => {
    const nuevos: string[] = [];
    for (const abs of archivos) {
      const rel = relative(RAIZ, abs).split("\\").join("/");
      if (EXCLUIDOS.some((r) => r.test(rel))) continue;
      const n = contarMinimosAMano(readFileSync(abs, "utf8"));
      const permitido = LISTA_CONOCIDA[rel] ?? 0;
      if (n > permitido) nuevos.push(`${rel}: ${n} (permitido ${permitido})`);
    }
    expect(nuevos, "usá stockMinimoDe/enStockBajo de lib/inventario/stock-minimo").toEqual([]);
  });

  it("el detector ve las formas que había y no los comentarios", () => {
    expect(contarMinimosAMano("const m = p.stockMin ?? 5;")).toBe(1);
    expect(contarMinimosAMano("x <= (p.stockMin || 5)")).toBe(1);
    expect(contarMinimosAMano('stock <= COALESCE("stockMin", 5)')).toBe(1);
    expect(contarMinimosAMano("const m = Number(product.minStock ?? 0);")).toBe(1);
    expect(contarMinimosAMano("// antes `stockMin ?? 5`")).toBe(0);
    expect(contarMinimosAMano("stockMin: p.stockMin ?? null,")).toBe(0);
  });
});

describe("enStockBajo: la misma regla en todas las alertas", () => {
  it("usa el mínimo propio, y el global sólo si no tiene", () => {
    expect(enStockBajo({ stock: 12, stockMin: 20 }, 5)).toBe(true);
    expect(enStockBajo({ stock: 4, stockMin: null }, 5)).toBe(true);
    expect(enStockBajo({ stock: 6, stockMin: null }, 5)).toBe(false);
    expect(enStockBajo({ stock: 5, stockMin: null }, 5)).toBe(true); // «en o bajo»
  });

  it("mínimo propio 0 = sólo al agotarse; agotados entran", () => {
    expect(enStockBajo({ stock: 1, stockMin: 0 }, 5)).toBe(false);
    expect(enStockBajo({ stock: 0, stockMin: 0 }, 5)).toBe(true);
    expect(enStockBajo({ stock: -2, stockMin: 3 }, 5)).toBe(true);
  });

  it("sin stock controlado (servicio) nunca alerta", () => {
    expect(enStockBajo({ stock: null, stockMin: 3 }, 5)).toBe(false);
    expect(enStockBajo({ stockMin: null }, 5)).toBe(false);
  });

  // Sugerencias (09-10): el stock vacío llegaba como 0 y «1/4 de pollo a la
  // brasa» salía como compra urgente; con datos de main pasaba de 0 a 13.
  it("un producto sin control de stock no es compra urgente", () => {
    const [p, vacio, conStock] = normalizeProducts([
      { id: 1, name: "Servicio", stock: null, stockMin: null },
      { id: 2, name: "Plato", stock: "", stockMin: null },
      { id: 3, name: "Arroz", stock: "3", stockMin: null },
    ]);
    expect(p.stock).toBeNull();
    expect(enStockBajo(p, 5)).toBe(false);
    expect(enStockBajo(vacio, 5)).toBe(false);
    expect(conStock.stock).toBe(3);
    expect(enStockBajo(conStock, 5)).toBe(true);
  });

  it("stockMinimoDe y enStockBajo dicen lo mismo", () => {
    const p = { stock: 7, stockMin: null };
    expect(enStockBajo(p, 8)).toBe(p.stock <= stockMinimoDe(p, 8));
  });
});

describe("minimoGlobalDelNegocio", () => {
  it("lee globalMinStock del negocio y, si falla, vale 5 (nunca 0)", async () => {
    getSettings.mockImplementation(async (t: string) => {
      if (t === "roto") throw new Error("db caída");
      return { globalMinStock: t === "a" ? 8 : null };
    });
    expect(await minimoGlobalDelNegocio("a")).toBe(8);
    expect(await minimoGlobalDelNegocio("b")).toBe(5);
    expect(await minimoGlobalDelNegocio("roto")).toBe(5);
    const mapa = await minimosGlobalesPorNegocio(["a", "a", "b"]);
    expect([...mapa.entries()]).toEqual([["a", 8], ["b", 5]]);
    expect(getSettings.mock.calls.filter(([t]) => t === "a").length).toBe(2); // 1 directo + 1 del mapa (deduplicado)
    // 60 s: el import diferido de settings.db tarda bajo la tanda de guardianes.
  }, 60_000);
});
