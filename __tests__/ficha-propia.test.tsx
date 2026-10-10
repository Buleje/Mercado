/**
 * ADR-460 · la ficha propia (`lib/extensiones/FichaPropia.tsx`): mismas
 * garantías que el catálogo propio.
 * · Sin `Ficha` o con `?sinPiezas=1` → `null` (la ficha general) y la búsqueda
 *   ni se espera cuando no hay ficha propia.
 * · Si `Ficha()` tira → `null` + aviso; un `notFound()` pasa de largo.
 * · Metadatos: `undefined` = los de la ficha general; `null` = no es de esta
 *   tienda; si tiran o tardan más de 2 s → `undefined` + aviso.
 */
import type { ReactElement, ReactNode } from "react";
import { notFound } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  piezas: [] as unknown[],
  reportar: vi.fn(),
}));

vi.mock("@/lib/store-metadata", () => ({ resolveStoreContext: async () => ({ name: "Buleje Beauty", tenantId: "salon", isTenant: true }) }));
vi.mock("@/lib/tenant", () => ({ findTenantByIdOrSlug: async () => ({ id: "cuid-1", slug: "salon" }) }));
vi.mock("@/lib/extensiones/resolver", () => ({ resolverPiezas: async () => H.piezas }));
vi.mock("@/lib/extensiones/tope", async (real) => ({
  ...(await real<typeof import("@/lib/extensiones/tope")>()),
  reportarFalloPieza: (...a: unknown[]) => H.reportar(...a),
}));
vi.mock("@/lib/extensiones/BordeDePieza", () => ({
  BordeDePieza: function BordeDePieza(p: { children: ReactNode }) {
    return p.children;
  },
}));

import { fichaPropia, metadatosDeFichaPropia } from "@/lib/extensiones/FichaPropia";
import { RecargarSinPiezas } from "@/lib/extensiones/RecargarSinPiezas";

type Borde = ReactElement<{ piezaId: string; fallback: ReactNode; mientrasCarga: ReactNode; children: ReactNode }>;

const Pagina = () => null;
const conPieza = (pieza: Record<string, unknown>) => {
  H.piezas = [
    { piezaId: "pagina-salon", enchufe: "tienda.pagina", opciones: { tono: "vino" }, version: "2.1.0", orden: 0, entrada: { manifiesto: { id: "pagina-salon" }, pagina: async () => ({ Pagina, ...pieza }) } },
  ];
};
const CTX = { tenantId: "cuid-1", slug: "salon", enchufe: "tienda.pagina" };

beforeEach(() => {
  vi.clearAllMocks();
  H.piezas = [];
});
afterEach(() => vi.useRealTimers());

describe("fichaPropia", () => {
  it("sin página propia o sin `Ficha` → null y la búsqueda ni se espera", async () => {
    const busqueda = vi.fn();
    const promesa = { then: busqueda } as unknown as Promise<Record<string, string>>;
    expect(await fichaPropia("shampoo", promesa)).toBeNull();
    conPieza({});
    expect(await fichaPropia("shampoo", promesa)).toBeNull();
    expect(busqueda).not.toHaveBeenCalled();
  });

  it("con `?sinPiezas=1` → null sin llamar a la ficha", async () => {
    const Ficha = vi.fn(() => "propia");
    conPieza({ Ficha });
    expect(await fichaPropia("shampoo", Promise.resolve({ sinPiezas: "1" }))).toBeNull();
    expect(Ficha).not.toHaveBeenCalled();
  });

  it("con ficha → dentro del borde, respaldo liviano y el producto de la URL", async () => {
    const Ficha = vi.fn(() => "propia");
    conPieza({ Ficha });
    const el = (await fichaPropia("shampoo-300-ml", Promise.resolve({ q: "x" }))) as Borde;
    expect(el.props.children).toBe("propia");
    expect((el.props.fallback as ReactElement).type).toBe(RecargarSinPiezas);
    expect(el.props.mientrasCarga).toBeNull();
    expect(Ficha).toHaveBeenCalledWith({ ctx: CTX, opciones: { tono: "vino" }, searchParams: { q: "x" }, producto: "shampoo-300-ml" });
  });

  it("si `Ficha()` tira → null (la ficha general) + aviso", async () => {
    conPieza({
      Ficha: () => {
        throw new Error("ficha rota");
      },
    });
    expect(await fichaPropia("shampoo", Promise.resolve({}))).toBeNull();
    expect(H.reportar).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ etapa: "ficha" }));
  });

  it("un `notFound()` de la pieza pasa de largo (no es una falla)", async () => {
    conPieza({ Ficha: () => notFound() });
    await expect(fichaPropia("shampoo", Promise.resolve({}))).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(H.reportar).not.toHaveBeenCalled();
  });
});

describe("metadatosDeFichaPropia", () => {
  const META = { titulo: "Shampoo — S/ 43.90 · Buleje Beauty", descripcion: "…", ruta: "/t/salon/tienda/shampoo" };

  it("sin ficha propia, o con ficha pero sin metadatos → undefined (los de siempre)", async () => {
    expect(await metadatosDeFichaPropia("shampoo", Promise.resolve({}))).toBeUndefined();
    conPieza({ Ficha: () => null });
    expect(await metadatosDeFichaPropia("shampoo", Promise.resolve({}))).toBeUndefined();
  });

  it("metadatos sin `Ficha` no se usan (la ficha sería la general)", async () => {
    const metadatosFicha = vi.fn(async () => META);
    conPieza({ metadatosFicha });
    expect(await metadatosDeFichaPropia("shampoo", Promise.resolve({}))).toBeUndefined();
    expect(metadatosFicha).not.toHaveBeenCalled();
  });

  it("los de la pieza; `null` = no es de esta tienda; `?sinPiezas=1` → undefined", async () => {
    const metadatosFicha = vi.fn(async ({ producto }: { producto: string }) => (producto === "arroz" ? null : META));
    conPieza({ Ficha: () => null, metadatosFicha });
    expect(await metadatosDeFichaPropia("shampoo", Promise.resolve({}))).toEqual(META);
    expect(await metadatosDeFichaPropia("arroz", Promise.resolve({}))).toBeNull();
    expect(await metadatosDeFichaPropia("shampoo", Promise.resolve({ sinPiezas: "1" }))).toBeUndefined();
    expect(metadatosFicha).toHaveBeenCalledWith(expect.objectContaining({ ctx: CTX, producto: "shampoo" }));
  });

  it("si tiran o tardan más de 2 s → undefined + aviso", async () => {
    conPieza({ Ficha: () => null, metadatosFicha: async () => Promise.reject(new Error("base caída")) });
    expect(await metadatosDeFichaPropia("shampoo", Promise.resolve({}))).toBeUndefined();
    expect(H.reportar).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ etapa: "ficha-metadatos" }));

    vi.useFakeTimers();
    conPieza({ Ficha: () => null, metadatosFicha: () => new Promise(() => {}) });
    const r = metadatosDeFichaPropia("shampoo", Promise.resolve({}));
    await vi.advanceTimersByTimeAsync(2001);
    expect(await r).toBeUndefined();
  });
});
