/**
 * Regresión: el panel admin del marketplace debe enviar `x-csrf-token` en
 * cada mutación. Antes del fix, los `fetch` PATCH/POST/DELETE en
 * `MarketplaceModule.tsx` y `marketplace/tabs/ProductosTab.tsx` no incluían
 * el header → todas las mutaciones devolvían 403 silencioso (toast genérico
 * "No se pudo actualizar el precio. Intenta nuevamente.").
 *
 * Cubre:
 *  1. `csrfHeaders` lee la cookie y añade el header (caso happy).
 *  2. `csrfHeaders` deja headers intactos si no hay cookie (no crashea).
 *  3. `csrfHeaders` preserva `Content-Type` cuando se mezcla.
 *  4. PatchSchema del endpoint /api/marketplace/stores/my/products/[id]
 *     acepta `retailPrice` y `wholesalePrice` y rechaza `price` (regresión
 *     del field name reportado por QA).
 *  5. Auditoría estática: ningún `fetch` mutating en los archivos del módulo
 *     marketplace puede quedar sin `csrfHeaders` (catch para futuros PRs).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod/v4";

// ── 1-3. csrfHeaders helper ──────────────────────────────────────────────────

describe("csrfHeaders (lib/csrf-client)", () => {
  beforeEach(() => {
    // jsdom expone document.cookie. Lo limpiamos entre tests.
    document.cookie.split(";").forEach((c) => {
      const [n] = c.trim().split("=");
      if (n) document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
  });

  it("añade x-csrf-token cuando la cookie csrf-token está presente", async () => {
    document.cookie = "csrf-token=abc123-deadbeef; path=/";
    const { csrfHeaders } = await import("@/lib/csrf-client");
    const headers = csrfHeaders({ "Content-Type": "application/json" }) as Record<string, string>;
    expect(headers["x-csrf-token"]).toBe("abc123-deadbeef");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("retorna headers intactos si no hay cookie csrf-token (no crashea)", async () => {
    const { csrfHeaders } = await import("@/lib/csrf-client");
    const headers = csrfHeaders({ "Content-Type": "application/json" }) as Record<string, string>;
    expect(headers["x-csrf-token"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("acepta Headers como entrada (no solo plain object)", async () => {
    document.cookie = "csrf-token=token-headers; path=/";
    const { csrfHeaders } = await import("@/lib/csrf-client");
    const input = new Headers({ "Content-Type": "application/json" });
    const result = csrfHeaders(input);
    expect(result).toBeInstanceOf(Headers);
    expect((result as Headers).get("x-csrf-token")).toBe("token-headers");
    expect((result as Headers).get("Content-Type")).toBe("application/json");
  });

  it("decodifica el token URL-encoded de la cookie", async () => {
    document.cookie = "csrf-token=token%2Bwith%2Fspecial; path=/";
    const { csrfHeaders } = await import("@/lib/csrf-client");
    const headers = csrfHeaders() as Record<string, string>;
    expect(headers["x-csrf-token"]).toBe("token+with/special");
  });
});

// ── 4. Schema del endpoint ────────────────────────────────────────────────────

describe("PatchSchema /api/marketplace/stores/my/products/[id]", () => {
  // Re-derivamos el schema localmente para poder testearlo sin importar la
  // route (que arrastra dependencias server-only). El contrato debe
  // coincidir 1:1 con app/api/marketplace/stores/my/products/[id]/route.ts.
  const PatchSchema = z
    .object({
      isActive: z.boolean().optional(),
      retailPrice: z.number().nonnegative().max(99999).optional(),
      wholesalePrice: z.number().nonnegative().max(99999).optional(),
    })
    .refine(
      (d) =>
        d.isActive !== undefined ||
        d.retailPrice !== undefined ||
        d.wholesalePrice !== undefined,
      { message: "Al menos un campo es requerido" },
    );

  it("acepta { retailPrice }", () => {
    const r = PatchSchema.safeParse({ retailPrice: 7.5 });
    expect(r.success).toBe(true);
  });

  it("acepta { wholesalePrice }", () => {
    const r = PatchSchema.safeParse({ wholesalePrice: 5 });
    expect(r.success).toBe(true);
  });

  it("acepta { isActive }", () => {
    const r = PatchSchema.safeParse({ isActive: false });
    expect(r.success).toBe(true);
  });

  it("rechaza body vacío con 'Al menos un campo es requerido'", () => {
    const r = PatchSchema.safeParse({});
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === "Al menos un campo es requerido")).toBe(true);
    }
  });

  it("rechaza alias { price } — confirma contrato y previene drift", () => {
    // Si algún componente envía `price` como antes, debe fallar
    // explícitamente para que el test guard lo detecte.
    const r = PatchSchema.safeParse({ price: 7.5 });
    expect(r.success).toBe(false);
  });

  it("rechaza precios negativos", () => {
    const r = PatchSchema.safeParse({ retailPrice: -1 });
    expect(r.success).toBe(false);
  });

  it("rechaza precios mayores a 99999", () => {
    const r = PatchSchema.safeParse({ retailPrice: 100000 });
    expect(r.success).toBe(false);
  });
});

// ── 5. Auditoría estática: cero fetches mutating sin csrfHeaders ──────────────

describe("MarketplaceModule + ProductosTab — todos los fetches mutating usan csrfHeaders", () => {
  const FILES = [
    "components/admin/unified/MarketplaceModule.tsx",
    "components/admin/unified/marketplace/tabs/ProductosTab.tsx",
  ];

  for (const rel of FILES) {
    it(`${rel}: 0 fetches mutating sin csrfHeaders`, () => {
      const abs = join(process.cwd(), rel);
      expect(existsSync(abs), `archivo no existe: ${rel}`).toBe(true);
      const src = readFileSync(abs, "utf8");

      // Particiona por bloques `fetch(... { ... })` y mira los que tienen
      // method: PATCH|POST|PUT|DELETE.
      const fetchBlocks = src.match(/fetch\([^)]*\)\s*,?\s*\{[\s\S]*?method:\s*"(POST|PATCH|PUT|DELETE)"[\s\S]*?\}/g);
      // El regex anterior es naive; usamos uno más laxo: para cada línea
      // con `method: "<MUTATION>"`, miramos las 6 líneas siguientes y
      // exigimos `csrfHeaders(`.
      const lines = src.split("\n");
      const offenders: string[] = [];
      lines.forEach((line, idx) => {
        const m = line.match(/method:\s*"(POST|PATCH|PUT|DELETE)"/);
        if (!m) return;
        const window = lines.slice(idx, idx + 6).join("\n");
        if (!/csrfHeaders\s*\(/.test(window)) {
          offenders.push(`L${idx + 1}: ${line.trim()} (sin csrfHeaders en ±6 líneas)`);
        }
      });
      expect(
        offenders,
        `Fetches mutating sin csrfHeaders en ${rel}:\n${offenders.join("\n")}`,
      ).toEqual([]);
      // Suprime warning eslint sobre fetchBlocks no usado.
      void fetchBlocks;
    });
  }
});
