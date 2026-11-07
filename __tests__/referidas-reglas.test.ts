/**
 * Referidas «Trae a una amiga» (ADR-510) — reglas puras.
 */
import { describe, expect, it } from "vitest";
import {
  CONFIG_REFERIDAS_POR_DEFECTO,
  ConfigReferidasSchema,
  codigoDeCupon,
  combinarConOtrosDescuentos,
  configReferidasGuardada,
  cuponesAlComprar,
  cuponesAlVincular,
  esCuponDeReferida,
  leerAltasReferidas,
  leerConfigReferidas,
  mensajeInvitacion,
  montoDelPremio,
  puedeVincular,
  resumenDelPrograma,
  type ConfigReferidas,
} from "@/lib/referidas/reglas";

const MUSA: ConfigReferidas = {
  activo: true,
  premioQuienRefiere: { tipo: "monto", valor: 10 },
  premioAmiga: { tipo: "monto", valor: 10 },
  amigaRecibe: "tras_primera_compra",
  compraMinima: 59,
  acumulable: false,
  vigenciaDias: 60,
};
const H = { amiga: "a1".repeat(32), quienRefiere: "b2".repeat(32) };
const AHORA = new Date("2026-10-20T15:00:00Z");

describe("config", () => {
  it("sin nada guardado = lo que el código tenía fijo (10 % a la amiga, S/ 10 a quien recomienda, sin mínimo)", () => {
    const c = leerConfigReferidas({});
    expect(c).toEqual(CONFIG_REFERIDAS_POR_DEFECTO);
    expect(c.premioAmiga).toEqual({ tipo: "porcentaje", valor: 10 });
    expect(c.premioQuienRefiere).toEqual({ tipo: "monto", valor: 10 });
    expect(c.compraMinima).toBe(0);
    expect(configReferidasGuardada({})).toBe(false);
  });

  it("lo guardado manda; lo roto vuelve al defecto", () => {
    expect(leerConfigReferidas({ referidas: MUSA })).toEqual(MUSA);
    expect(configReferidasGuardada({ referidas: MUSA })).toBe(true);
    expect(leerConfigReferidas({ referidas: { ...MUSA, compraMinima: -1 } })).toEqual(CONFIG_REFERIDAS_POR_DEFECTO);
  });

  it("valida topes: % ≤ 50, días 1-365", () => {
    expect(ConfigReferidasSchema.safeParse({ ...MUSA, premioAmiga: { tipo: "porcentaje", valor: 80 } }).success).toBe(false);
    expect(ConfigReferidasSchema.safeParse({ ...MUSA, vigenciaDias: 0 }).success).toBe(false);
    expect(ConfigReferidasSchema.safeParse(MUSA).success).toBe(true);
  });

  it("altas: sólo claves de 6-9 dígitos con `por` y `desde` válidos; null = quitada", () => {
    const altas = leerAltasReferidas({
      referidasAltas: {
        "916409675": { por: "51999000111", desde: "2026-10-20T15:00:00.000Z" },
        abc: { por: "x", desde: "2026-10-20" },
        "999888777": null,
        "111222333": { por: "", desde: "2026-10-20" },
      },
    });
    expect(Object.keys(altas)).toEqual(["916409675"]);
  });
});

describe("plata", () => {
  it("monto fijo: S/ 10 desde S/ 59; debajo, nada; nunca más que el subtotal", () => {
    expect(montoDelPremio(MUSA, MUSA.premioAmiga, 59)).toBe(10);
    expect(montoDelPremio(MUSA, MUSA.premioAmiga, 58.99)).toBe(0);
    const sinMinimo = { ...MUSA, compraMinima: 0 };
    expect(montoDelPremio(sinMinimo, sinMinimo.premioAmiga, 7.5)).toBe(7.5);
  });

  it("porcentaje al céntimo", () => {
    const c = CONFIG_REFERIDAS_POR_DEFECTO;
    expect(montoDelPremio(c, c.premioAmiga, 33.33)).toBe(3.33);
  });

  it("no acumulable: se queda el descuento mayor; acumulable: ambos", () => {
    expect(combinarConOtrosDescuentos(MUSA, { premio: 10, otros: 15 })).toEqual({ premio: 0, otros: 15, seQueda: "otros" });
    expect(combinarConOtrosDescuentos(MUSA, { premio: 10, otros: 6 })).toEqual({ premio: 10, otros: 0, seQueda: "premio" });
    expect(combinarConOtrosDescuentos(CONFIG_REFERIDAS_POR_DEFECTO, { premio: 10, otros: 6 }).seQueda).toBe("ambos");
  });

  it("textos con lo configurado", () => {
    expect(resumenDelPrograma(MUSA)).toBe("S/ 10 para quien recomienda y S/ 10 para su amiga · desde S/ 59 · no se suma a otras promociones");
    expect(mensajeInvitacion(MUSA, "ROSA10", "Musa")).toContain("recibe S/ 10");
    expect(resumenDelPrograma({ ...MUSA, activo: false })).toMatch(/Pausado/);
  });
});

describe("vincular", () => {
  const base = { config: MUSA, amiga: "+51 916 409 675", quienRefiere: "51999000111", yaReferida: false, primeraCompra: null, ahora: AHORA };
  it("nueva sin compras: sí", () => expect(puedeVincular(base)).toEqual({ ok: true }));
  it("su propio celular con otro formato: no", () => {
    const r = puedeVincular({ ...base, quienRefiere: "916409675" });
    expect(r.ok === false && r.motivo).toBe("propio");
  });
  it("ya tenía a alguien: no", () => {
    const r = puedeVincular({ ...base, yaReferida: true });
    expect(r.ok === false && r.motivo).toBe("ya_referida");
  });
  it("primera compra hace 31 días: no es nueva; hace 5: sí", () => {
    const r = puedeVincular({ ...base, primeraCompra: new Date(AHORA.getTime() - 31 * 86_400_000) });
    expect(r.ok === false && r.motivo).toBe("no_es_nueva");
    expect(puedeVincular({ ...base, primeraCompra: new Date(AHORA.getTime() - 5 * 86_400_000) }).ok).toBe(true);
  });
  it("programa pausado: no", () => {
    const r = puedeVincular({ ...base, config: { ...MUSA, activo: false } });
    expect(r.ok === false && r.motivo).toBe("pausado");
  });
});

describe("cupones", () => {
  it("código estable por semilla, con prefijo por rol y sin letras confusas", () => {
    const a = codigoDeCupon("amiga", H.amiga);
    expect(a).toBe(codigoDeCupon("amiga", H.amiga));
    expect(a).toMatch(/^AMIGA-[2-9A-HJ-NP-Z]{8}$/);
    expect(codigoDeCupon("quien_refiere", H.quienRefiere)).toMatch(/^GRACIAS-/);
    expect(esCuponDeReferida(a.toLowerCase())).toBe(true);
    expect(esCuponDeReferida("BIENVENIDA10")).toBe(false);
  });

  it("Musa (después de comprar): al vincular nada; al comprar, los dos con mínimo S/ 59 y un uso", () => {
    expect(cuponesAlVincular(MUSA, H, { amiga: "Ana" }, AHORA)).toEqual([]);
    const c = cuponesAlComprar(MUSA, H, { amiga: "Ana", quienRefiere: "Rosa" }, new Set(), AHORA);
    expect(c.map((x) => x.rol).sort()).toEqual(["amiga", "quien_refiere"]);
    for (const x of c) {
      expect(x).toMatchObject({ discountType: "fixed", discountValue: 10, minPurchase: 59, maxUses: 1 });
      expect(x.expiresAt.getTime() - AHORA.getTime()).toBe(60 * 86_400_000);
    }
  });

  it("defecto (al usar el código): la amiga al vincular (10 %), quien recomienda al comprar (S/ 10)", () => {
    const d = CONFIG_REFERIDAS_POR_DEFECTO;
    const v = cuponesAlVincular(d, H, { amiga: "Ana" }, AHORA);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rol: "amiga", discountType: "percent", discountValue: 10, minPurchase: null });
    const c = cuponesAlComprar(d, H, { amiga: "Ana", quienRefiere: "Rosa" }, new Set(), AHORA);
    expect(c.map((x) => x.rol)).toEqual(["quien_refiere"]);
  });

  it("idempotente: lo ya emitido no se repite; premio 0 no emite", () => {
    const todos = cuponesAlComprar(MUSA, H, { amiga: "A", quienRefiere: "R" }, new Set(), AHORA);
    expect(cuponesAlComprar(MUSA, H, { amiga: "A", quienRefiere: "R" }, new Set(todos.map((x) => x.code)), AHORA)).toEqual([]);
    const sinAmiga = { ...MUSA, premioAmiga: { tipo: "monto" as const, valor: 0 } };
    expect(cuponesAlComprar(sinAmiga, H, { amiga: "A", quienRefiere: "R" }, new Set(), AHORA).map((x) => x.rol)).toEqual(["quien_refiere"]);
  });
});
