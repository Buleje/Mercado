/**
 * ADR-458 · el enchufe `tienda.pagina` (la página ENTERA de un negocio).
 *
 * · Sin página propia, la general tal cual (el mismo objeto, sin envoltorio).
 * · Con página propia: la suya, dentro de `<BordeDePieza>` con un respaldo
 *   LIVIANO (`<RecargarSinPiezas>`: recarga con `?sinPiezas=1`) y nada en el
 *   `Suspense`. Con la general armada de respaldo viajaba dos veces (medido
 *   01-10: 247 KB con ella en el Suspense, 203 KB en el ErrorBoundary).
 * · Portada de `/t/[slug]` con `recargaSinPiezas`: el reemplazo, igual de liviano.
 * · Si no carga su código, tira, rechaza o tarda más de 2 s → la general +
 *   aviso a Sentry.
 * · `notFound()` adentro no es una falla: se deja pasar.
 * · El negocio (`ctx`) lo pone la ruta; la pieza recibe toda la búsqueda.
 */
import type { ReactElement, ReactNode } from "react";
import { notFound } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  piezas: [] as unknown[],
  resolverPiezas: vi.fn(),
  reportar: vi.fn(),
}));

vi.mock("@/lib/extensiones/resolver", () => ({
  resolverPiezas: (...a: unknown[]) => H.resolverPiezas(...a),
}));
vi.mock("@/lib/extensiones/tope", async (real) => ({
  ...(await real<typeof import("@/lib/extensiones/tope")>()),
  reportarFalloPieza: (...a: unknown[]) => H.reportar(...a),
}));
vi.mock("@/lib/extensiones/BordeDePieza", () => ({
  BordeDePieza: function BordeDePieza(p: { children: ReactNode }) {
    return p.children;
  },
}));

import { Enchufe } from "@/lib/extensiones/Enchufe";
import { EnchufePagina } from "@/lib/extensiones/EnchufePagina";
import { PiezaLentaError } from "@/lib/extensiones/tope";
import { RecargarSinPiezas } from "@/lib/extensiones/RecargarSinPiezas";

const GENERAL = <main data-general="si">la página general</main>;
const BUSQUEDA = { preview: "true", categoria: ["a", "b"] };
const props = {
  nombre: "tienda.pagina" as const,
  tenantId: "t1",
  slug: "tienda-1",
  fallback: GENERAL,
  searchParams: BUSQUEDA,
};

type Borde = ReactElement<{ piezaId: string; fallback: ReactNode; mientrasCarga: ReactNode; children: ReactNode }>;

function pieza(id: string, Pagina?: (p: unknown) => unknown, orden = 0) {
  return {
    piezaId: id,
    enchufe: "tienda.pagina",
    opciones: { color: "x" },
    version: "1.0.0",
    orden,
    // El registro la carga perezosa (`import()`): acá, una promesa ya resuelta.
    entrada: { manifiesto: { id }, ...(Pagina ? { pagina: async () => ({ Pagina }) } : {}) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  H.piezas = [];
  H.resolverPiezas.mockImplementation(async () => H.piezas);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("enchufe tienda.pagina", () => {
  it("sin página propia → la general, el MISMO objeto (sin envoltorio)", async () => {
    expect(await EnchufePagina(props)).toBe(GENERAL);
    expect(H.resolverPiezas).toHaveBeenCalledWith("t1", "tienda.pagina");
  });

  it("una pieza del enchufe sin `pagina` en el código → la general", async () => {
    H.piezas = [pieza("sin-codigo")];
    expect(await EnchufePagina(props)).toBe(GENERAL);
  });

  it("con página propia → la suya dentro del borde, respaldo LIVIANO (recargar) y nada en el Suspense", async () => {
    const Pagina = vi.fn(() => <p>la propia</p>);
    H.piezas = [pieza("propia", Pagina)];
    const el = (await EnchufePagina(props)) as Borde;
    expect(el.props.piezaId).toBe("propia");
    // La general NO va armada de respaldo (viajaba en cada visita): si algo falla al dibujarse, se recarga.
    expect((el.props.fallback as ReactElement).type).toBe(RecargarSinPiezas);
    expect(el.props.mientrasCarga).toBeNull();
    expect((el.props.children as ReactElement<{ children: string }>).props.children).toBe("la propia");
    // El negocio lo pone la ruta; la pieza recibe sus opciones y TODA la búsqueda.
    expect(Pagina).toHaveBeenCalledWith({
      ctx: { tenantId: "t1", slug: "tienda-1", enchufe: "tienda.pagina" },
      opciones: { color: "x" },
      searchParams: BUSQUEDA,
    });
    expect(H.reportar).not.toHaveBeenCalled();
  });

  it("`<Enchufe nombre=\"tienda.pagina\">` despacha a la página (no a la portada)", async () => {
    H.piezas = [pieza("propia", () => <p>la propia</p>)];
    const el = (await Enchufe(props)) as Borde;
    expect(el.props.piezaId).toBe("propia");
    expect((el.props.fallback as ReactElement).type).toBe(RecargarSinPiezas);
  });

  it("si por error hay dos prendidas, gana la primera (nunca dos páginas enteras)", async () => {
    const segunda = vi.fn(() => <p>segunda</p>);
    H.piezas = [pieza("primera", () => <p>primera</p>), pieza("segunda", segunda, 1)];
    const el = (await EnchufePagina(props)) as Borde;
    expect(el.props.piezaId).toBe("primera");
    expect(segunda).not.toHaveBeenCalled();
  });

  it("tira (síncrono) → la general y aviso a Sentry", async () => {
    H.piezas = [
      pieza("rota", () => {
        throw new Error("rota");
      }),
    ];
    expect(await EnchufePagina(props)).toBe(GENERAL);
    expect(H.reportar).toHaveBeenCalledWith(expect.any(Error), {
      piezaId: "rota",
      enchufe: "tienda.pagina",
      tenantId: "t1",
      etapa: "pagina",
    });
  });

  it("rechaza (async) → la general", async () => {
    H.piezas = [pieza("rechaza", async () => Promise.reject(new Error("db caída")))];
    expect(await EnchufePagina(props)).toBe(GENERAL);
    expect(H.reportar).toHaveBeenCalledTimes(1);
  });

  it("el código de la página no carga (import() que falla) → la general", async () => {
    H.piezas = [{ ...pieza("no-carga"), entrada: { manifiesto: { id: "no-carga" }, pagina: () => Promise.reject(new Error("chunk")) } }];
    expect(await EnchufePagina(props)).toBe(GENERAL);
    expect(H.reportar.mock.calls[0][1]).toMatchObject({ piezaId: "no-carga", etapa: "pagina" });
  });

  it("tarda más de 2 s → la general (PiezaLentaError)", async () => {
    vi.useFakeTimers();
    H.piezas = [pieza("lenta", () => new Promise(() => {}))];
    const r = EnchufePagina(props);
    await vi.advanceTimersByTimeAsync(2001);
    expect(await r).toBe(GENERAL);
    expect(H.reportar.mock.calls[0][0]).toBeInstanceOf(PiezaLentaError);
  });

  it("notFound() adentro se deja pasar: es la página diciendo 404, no una falla", async () => {
    H.piezas = [pieza("cuatrocientos", () => notFound())];
    await expect(EnchufePagina(props)).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    expect(H.reportar).not.toHaveBeenCalled();
  });
});

describe("portada de /t/[slug] que reemplaza (recargaSinPiezas)", () => {
  const CUERPO = <section>cuerpo normal</section>;
  const portada = (modo: "reemplaza" | "agrega") => ({
    piezaId: `p-${modo}`,
    enchufe: "tienda.portada",
    opciones: {},
    version: "1.0.0",
    orden: modo === "reemplaza" ? 0 : 1,
    entrada: { manifiesto: { id: `p-${modo}` }, portada: { modo, cargar: async () => "ok", Vista: () => <p>{modo}</p> } },
  });
  const partes = (el: unknown) => (el as ReactElement<{ children: [Borde, Borde[]] }>).props.children;
  const base = { nombre: "tienda.portada" as const, tenantId: "t1", slug: "tienda-1", fallback: CUERPO };

  it("con recargaSinPiezas: el reemplazo lleva el respaldo liviano; los que agregan, null como siempre", async () => {
    H.piezas = [portada("reemplaza"), portada("agrega")];
    const [cuerpo, extras] = partes(await Enchufe({ ...base, recargaSinPiezas: true }));
    expect((cuerpo.props.fallback as ReactElement).type).toBe(RecargarSinPiezas);
    expect(cuerpo.props.mientrasCarga).toBeNull();
    expect(extras.filter(Boolean)[0].props.fallback).toBeNull();
  });

  it("sin la marca (portada por subdominio, que no respeta ?sinPiezas): el cuerpo de respaldo de siempre", async () => {
    H.piezas = [portada("reemplaza")];
    const [cuerpo] = partes(await Enchufe(base));
    expect(cuerpo.props.fallback).toBe(CUERPO);
    expect(cuerpo.props.mientrasCarga).toBeUndefined();
  });

  it("si cargar() falla, se ve el cuerpo ya (no hace falta recargar)", async () => {
    H.piezas = [{ ...portada("reemplaza"), entrada: { ...portada("reemplaza").entrada, portada: { modo: "reemplaza", cargar: async () => Promise.reject(new Error("x")), Vista: () => null } } }];
    const [cuerpo] = partes(await Enchufe({ ...base, recargaSinPiezas: true }));
    expect(cuerpo).toBe(CUERPO);
  });
});
