/**
 * Pagar con el PT Oxapampa (ADR-440 §6, Brandon 2026-09-26).
 *
 * La regla: por pt, manda la cantidad de la FACTURA; si no la trae, el PT
 * Oxapampa de la línea cuando TODAS sus trozas originales que llegaron están
 * cubicadas; si falta una, el ≈ estimado. El servidor SELLA en el acta con
 * cuál se pagó: una re-medición posterior no cambia lo pagado.
 */
import { describe, expect, it } from "vitest";
import { cobroPorPt, fleteInputSchema, montoPorPt } from "@/lib/forestal/fletes";
import {
  costoPorEspecie,
  oxapampaPorLinea,
  ptDeLaGuia,
  ptDelBorrador,
  ptParaPagar,
  sellarActas,
  textoFuentePt,
  type AsientoParaSellar,
  type CostoDetalle,
  type LineaPlataDTO,
  type PtParaPagar,
  type TrozaParaPt,
} from "@/lib/forestal/plata-de-guia";

const troza = (woodEntryId: string, oxPt: number | null, extra: Partial<TrozaParaPt> = {}): TrozaParaPt => ({
  woodEntryId,
  especieComun: "Tornillo",
  oxPt,
  ...extra,
});
const TORNILLO = { id: "t", speciesCommonName: "Tornillo" };

describe("oxapampaPorLinea — sólo trozas originales que llegaron, cada una en su especie", () => {
  it("0 cubicadas: pt 0 y el total cuenta las que faltan", () => {
    const m = oxapampaPorLinea([TORNILLO], [troza("t", null), troza("t", null)]);
    expect(m.get("t")).toEqual({ pt: 0, cubicadas: 0, total: 2, noLlegaron: 0 });
    expect(ptParaPagar(900, m.get("t"))).toMatchObject({ pt: 900, fuente: "estimado", oxapampa: null, cubicadas: 0, total: 2 });
  });

  it("todas cubicadas: se paga con el Oxapampa", () => {
    const m = oxapampaPorLinea([TORNILLO], [troza("t", 195.92), troza("t", 100.08)]);
    expect(ptParaPagar(900, m.get("t"))).toMatchObject({ pt: 296, fuente: "oxapampa", estimado: 900, cubicadas: 2, total: 2 });
  });

  it("parcial: sigue el estimado, pero el Oxapampa de lo medido se informa", () => {
    const m = oxapampaPorLinea([TORNILLO], [troza("t", 195.92), troza("t", null), troza("t", null)]);
    const p = ptParaPagar(900, m.get("t"));
    expect(p).toMatchObject({ pt: 900, fuente: "estimado", oxapampa: 195.92, cubicadas: 1, total: 3 });
    expect(textoFuentePt(p)).toBe("≈ estimado · 1 de 3 cubicadas");
  });

  it("con retrozos: los pedazos NO suman (la madre ya es esa madera)", () => {
    const m = oxapampaPorLinea(
      [TORNILLO],
      [troza("t", 300, { trozaOrigenId: null }), troza("t", 150, { trozaOrigenId: "madre" }), troza("t", 150, { trozaOrigenId: "madre" })],
    );
    expect(m.get("t")).toEqual({ pt: 300, cubicadas: 1, total: 1, noLlegaron: 0 });
  });

  it("con retrozos medidos y la madre sin medir: la línea NO está entera", () => {
    const m = oxapampaPorLinea([TORNILLO], [troza("t", null), troza("t", 150, { trozaOrigenId: "m" })]);
    expect(ptParaPagar(500, m.get("t")).fuente).toBe("estimado");
  });

  it("la que no llegó sale del total y se cuenta aparte", () => {
    const m = oxapampaPorLinea([TORNILLO], [troza("t", 200), troza("t", null, { noRecepcionada: true })]);
    expect(m.get("t")).toEqual({ pt: 200, cubicadas: 1, total: 1, noLlegaron: 1 });
    expect(ptParaPagar(900, m.get("t")).fuente).toBe("oxapampa");
  });

  it("GTF multi-especie: la troza de Cachimbo colgada en la fila de Azúcar huayo va a Cachimbo (ADR-435)", () => {
    const lineas = [
      { id: "az", speciesCommonName: "Azucar huayo" },
      { id: "ca", speciesCommonName: "Cachimbo" },
    ];
    const m = oxapampaPorLinea(lineas, [
      troza("az", 100, { especieComun: "Azúcar huayo" }),
      troza("az", 80, { especieComun: "CACHIMBO" }),
    ]);
    expect(m.get("az")).toMatchObject({ pt: 100, total: 1 });
    expect(m.get("ca")).toMatchObject({ pt: 80, total: 1 });
  });

  it("trozas de una fila que no está en la guía viva (anulada) no cuentan", () => {
    const m = oxapampaPorLinea([TORNILLO], [troza("muerta", 500)]);
    expect(m.get("t")).toEqual({ pt: 0, cubicadas: 0, total: 0, noLlegaron: 0 });
    expect(ptParaPagar(700, m.get("t"))).toMatchObject({ fuente: "estimado", pt: 700, total: 0 });
  });
});

describe("ptDeLaGuia — la guía entera, sin mezclar medidas", () => {
  const ox = (pt: number, estimado = 1000): PtParaPagar => ({ pt, fuente: "oxapampa", estimado, oxapampa: pt, cubicadas: 2, total: 2, noLlegaron: 0 });
  const est = (estimado: number, oxapampa: number | null = null): PtParaPagar => ({
    pt: estimado,
    fuente: "estimado",
    estimado,
    oxapampa,
    cubicadas: oxapampa == null ? 0 : 1,
    total: 2,
    noLlegaron: 0,
  });

  it("todas Oxapampa → Σ Oxapampa", () => {
    expect(ptDeLaGuia([ox(300.5), ox(200.25)])).toMatchObject({ pt: 500.75, fuente: "oxapampa", cubicadas: 4, total: 4 });
  });

  it("una sin cubicar entera → Σ ≈ estimado de TODAS (no 300 medidos + 800 estimados)", () => {
    expect(ptDeLaGuia([ox(300, 900), est(800, 150)])).toMatchObject({ pt: 1700, fuente: "estimado", oxapampa: 450, cubicadas: 3, total: 4 });
  });

  it("sin líneas: estimado 0", () => {
    expect(ptDeLaGuia([])).toMatchObject({ pt: 0, fuente: "estimado" });
  });
});

describe("costoPorEspecie — la factura manda; si no, el PT para pagar", () => {
  const linea = { id: "t", volumeM3: 10, productType: "rolliza" };
  const conOx = { ...linea, ptPago: { pt: 2000, fuente: "oxapampa" as const } };

  it("sin factura y la línea cubicada entera: multiplica el Oxapampa", () => {
    const [c] = costoPorEspecie([conOx], { t: { precio: 1.5, unidad: "pt", cantidadFactura: null } });
    expect(c).toMatchObject({ cantidad: 2000, costoTotal: 3000, fuentePt: "oxapampa", cantidadDerivada: true });
  });

  it("con PT de factura: manda la factura aunque haya Oxapampa", () => {
    const [c] = costoPorEspecie([conOx], { t: { precio: 1.5, unidad: "pt", cantidadFactura: 1800 } });
    expect(c).toMatchObject({ cantidad: 1800, costoTotal: 2700, fuentePt: "factura", cantidadDerivada: false });
  });

  it("sin `ptPago` (llamada vieja): el ≈ estimado de siempre", () => {
    const [c] = costoPorEspecie([linea], { t: { precio: 1, unidad: "pt", cantidadFactura: null } });
    expect(c).toMatchObject({ cantidad: Math.round(10 * 0.56 * 424), fuentePt: "estimado" });
  });

  it("por m³: sin fuente de PT", () => {
    const [c] = costoPorEspecie([conOx], { t: { precio: 180, unidad: "m3", cantidadFactura: null } });
    expect(c).toMatchObject({ cantidad: 10, costoTotal: 1800, fuentePt: null });
  });
});

// ── El sello del servidor ────────────────────────────────────────────────────

const vig = (pt: number, fuente: "oxapampa" | "estimado", cubicadas = 3, total = 3): PtParaPagar => ({
  pt,
  fuente,
  estimado: 999,
  oxapampa: fuente === "oxapampa" ? pt : null,
  cubicadas,
  total,
  noLlegaron: 0,
});
const acta = (extra: Partial<CostoDetalle> = {}): CostoDetalle => ({
  v: 1,
  modo: "especie",
  unidad: "pt",
  precio: 2,
  cantidadFactura: null,
  ptDerivado: 999,
  totalFactura: 700,
  ...extra,
});
const asiento = (extra: Partial<AsientoParaSellar> = {}): AsientoParaSellar => ({
  id: "t",
  speciesCommonName: "Tornillo",
  volumeM3: 5,
  costoTotal: null,
  costoDetalle: null,
  ptPago: vig(350, "oxapampa"),
  ...extra,
});

describe("sellarActas — el servidor decide con qué PT se pagó", () => {
  it("el PT de hoy: se sella con su fuente y la cuenta de trozas", () => {
    const r = sellarActas([{ woodEntryId: "t", costoTotal: 700, detalle: acta({ ptUsado: 350 }) }], [asiento()]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.detalles.get("t")).toMatchObject({ ptUsado: 350, fuentePt: "oxapampa", ptCubicadas: 3, ptTrozas: 3 });
  });

  it("la fuente nunca sale del navegador: un «oxapampa» mandado por el cliente se pisa", () => {
    const r = sellarActas(
      [{ woodEntryId: "t", costoTotal: 1998, detalle: acta({ ptUsado: 999, fuentePt: "oxapampa", ptCubicadas: 99 }) }],
      [asiento({ ptPago: vig(999, "estimado", 1, 3) })],
    );
    expect(r.ok && r.detalles.get("t")).toMatchObject({ fuentePt: "estimado", ptCubicadas: 1, ptTrozas: 3 });
  });

  it("alguien midió mientras miraba (calculó con el estimado, hoy es Oxapampa) → CUBICACION_CAMBIO", () => {
    const r = sellarActas([{ woodEntryId: "t", costoTotal: 1998, detalle: acta({ ptUsado: 999 }) }], [asiento()]);
    expect(r).toMatchObject({ ok: false, codigo: "CUBICACION_CAMBIO", woodEntryId: "t" });
    if (!r.ok) expect(r.mensaje).toMatch(/999 pt.*350 pt/);
  });

  it("cliente viejo (sin `ptUsado`): se toma su `ptDerivado`", () => {
    const ok = sellarActas([{ woodEntryId: "t", costoTotal: 1998, detalle: acta() }], [asiento({ ptPago: vig(999, "estimado", 0, 3) })]);
    expect(ok.ok).toBe(true);
    const no = sellarActas([{ woodEntryId: "t", costoTotal: 1998, detalle: acta() }], [asiento()]);
    expect(no).toMatchObject({ ok: false, codigo: "CUBICACION_CAMBIO" });
  });

  it("re-medir DESPUÉS de pagar: el PT sellado se conserva aunque se corrija el precio", () => {
    const pagado = acta({ ptUsado: 350, fuentePt: "oxapampa", ptCubicadas: 3, ptTrozas: 3 });
    const hoy = asiento({ costoTotal: 700, costoDetalle: pagado, ptPago: vig(380, "oxapampa") });
    const r = sellarActas([{ woodEntryId: "t", costoTotal: 735, detalle: acta({ precio: 2.1, ptUsado: 350, totalFactura: 735 }) }], [hoy]);
    expect(r.ok && r.detalles.get("t")).toMatchObject({ ptUsado: 350, fuentePt: "oxapampa", ptCubicadas: 3, ptTrozas: 3 });
  });

  it("…y si la persona pide la cubicación de hoy, se sella la nueva", () => {
    const pagado = acta({ ptUsado: 350, fuentePt: "oxapampa", ptCubicadas: 3, ptTrozas: 3 });
    const hoy = asiento({ costoTotal: 700, costoDetalle: pagado, ptPago: vig(380, "oxapampa", 4, 4) });
    const r = sellarActas([{ woodEntryId: "t", costoTotal: 760, detalle: acta({ ptUsado: 380, totalFactura: 760 }) }], [hoy]);
    expect(r.ok && r.detalles.get("t")).toMatchObject({ ptUsado: 380, ptCubicadas: 4, ptTrozas: 4 });
  });

  it("totales en el servidor: precio × PT tiene que dar el costo, salvo la especie mayor (el ajuste)", () => {
    const chica = asiento({ id: "c", speciesCommonName: "Cachimbo", volumeM3: 1, ptPago: vig(100, "oxapampa") });
    const grande = asiento({ id: "g", volumeM3: 9, ptPago: vig(900, "oxapampa") });
    const trucha = sellarActas(
      [
        { woodEntryId: "c", costoTotal: 150, detalle: acta({ ptUsado: 100 }) },
        { woodEntryId: "g", costoTotal: 1800, detalle: acta({ ptUsado: 900 }) },
      ],
      [chica, grande],
    );
    expect(trucha).toMatchObject({ ok: false, codigo: "COSTO_NO_CUADRA", woodEntryId: "c" });
    const ajustada = sellarActas(
      [
        { woodEntryId: "c", costoTotal: 200, detalle: acta({ ptUsado: 100 }) },
        { woodEntryId: "g", costoTotal: 1803.4, detalle: acta({ ptUsado: 900 }) },
      ],
      [chica, grande],
    );
    expect(ajustada.ok).toBe(true);
  });

  it("sin precio, un costo mayor que 0 no pasa sin controlar; costo 0 sin precio sí (revisión 26-09)", () => {
    const chica = asiento({ id: "c", speciesCommonName: "Cachimbo", volumeM3: 1, ptPago: vig(100, "oxapampa") });
    const grande = asiento({ id: "g", volumeM3: 9, ptPago: vig(900, "oxapampa") });
    const sinPrecio = sellarActas(
      [
        { woodEntryId: "c", costoTotal: 150, detalle: acta({ precio: null, ptUsado: 100 }) },
        { woodEntryId: "g", costoTotal: 1800, detalle: acta({ ptUsado: 900 }) },
      ],
      [chica, grande],
    );
    expect(sinPrecio).toMatchObject({ ok: false, codigo: "COSTO_NO_CUADRA", woodEntryId: "c" });
    const enCero = sellarActas(
      [
        { woodEntryId: "c", costoTotal: 0, detalle: acta({ precio: null, ptUsado: 100 }) },
        { woodEntryId: "g", costoTotal: 1800, detalle: acta({ ptUsado: 900 }) },
      ],
      [chica, grande],
    );
    expect(enCero.ok).toBe(true);
  });

  it("factura, m³ y reparto del total", () => {
    const r = sellarActas(
      [
        { woodEntryId: "f", costoTotal: 2400, detalle: acta({ cantidadFactura: 1200, ptUsado: 1200 }) },
        { woodEntryId: "m", costoTotal: 900, detalle: acta({ unidad: "m3", precio: 180, ptUsado: 42 }) },
      ],
      [asiento({ id: "f", volumeM3: 1 }), asiento({ id: "m", volumeM3: 5 })],
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.detalles.get("f")).toMatchObject({ ptUsado: 1200, fuentePt: "factura", ptCubicadas: null });
      expect(r.detalles.get("m")).toMatchObject({ ptUsado: null, fuentePt: null });
    }
    const total = sellarActas([{ woodEntryId: "t", costoTotal: 700, detalle: acta({ modo: "total", unidad: "m3", ptUsado: 5 }) }], [asiento()]);
    expect(total.ok && total.detalles.get("t")).toMatchObject({ ptUsado: null, fuentePt: null });
  });
});

describe("re-medir después de pagar no cambia lo pagado (camino completo, puro)", () => {
  const lineaDto = (over: Partial<LineaPlataDTO>): LineaPlataDTO => ({
    id: "t",
    speciesCommonName: "Tornillo",
    productType: "rolliza",
    volumeM3: 5,
    pieces: 3,
    status: "validado",
    entryDate: "2026-09-20",
    costoTotal: null,
    costoDetalle: null,
    ptDerivado: 999,
    ptPago: vig(350, "oxapampa"),
    congelado: false,
    periodoCerrado: false,
    ...over,
  });

  it("pagar con 350 → re-medir a 380 → la pantalla y el re-guardado siguen en S/ 700", () => {
    // 1. Pagar: el borrador multiplica el PT de hoy y el servidor lo sella.
    const hoy1 = ptDelBorrador(lineaDto({}));
    expect(hoy1).toEqual({ pt: 350, fuente: "oxapampa", congelado: false });
    const [c1] = costoPorEspecie([{ id: "t", volumeM3: 5, productType: "rolliza", ptPago: hoy1 }], {
      t: { precio: 2, unidad: "pt", cantidadFactura: null },
    });
    const s1 = sellarActas([{ woodEntryId: "t", costoTotal: c1.costoTotal, detalle: acta({ ptUsado: c1.cantidad }) }], [asiento()]);
    expect(c1.costoTotal).toBe(700);
    if (!s1.ok) throw new Error(s1.mensaje);
    const guardada = s1.detalles.get("t")!;

    // 2. Re-medir: el PT de hoy pasa a 380. Lo guardado (costo y acta) no se tocó.
    const reabierta = lineaDto({ costoTotal: 700, costoDetalle: guardada, ptPago: vig(380, "oxapampa") });
    const hoy2 = ptDelBorrador(reabierta);
    expect(hoy2).toEqual({ pt: 350, fuente: "oxapampa", congelado: true });
    const [c2] = costoPorEspecie([{ id: "t", volumeM3: 5, productType: "rolliza", ptPago: hoy2 }], {
      t: { precio: 2, unidad: "pt", cantidadFactura: null },
    });
    expect(c2.costoTotal).toBe(700); // la vista previa NO salta a 760

    // 3. Re-guardar (p. ej. para cambiar el proveedor): el servidor conserva el sello.
    const s2 = sellarActas(
      [{ woodEntryId: "t", costoTotal: c2.costoTotal, detalle: acta({ ptUsado: c2.cantidad }) }],
      [asiento({ costoTotal: 700, costoDetalle: guardada, ptPago: vig(380, "oxapampa") })],
    );
    expect(s2.ok && s2.detalles.get("t")).toMatchObject({ ptUsado: 350, fuentePt: "oxapampa" });

    // 4. «Usar la de hoy» es explícito.
    expect(ptDelBorrador(reabierta, true)).toEqual({ pt: 380, fuente: "oxapampa", congelado: false });
  });

  it("una línea pagada por m³ no se congela por pt", () => {
    const l = lineaDto({ costoTotal: 900, costoDetalle: acta({ unidad: "m3", precio: 180 }) });
    expect(ptDelBorrador(l).congelado).toBe(false);
  });
});

// ── Flete por pie tablar ─────────────────────────────────────────────────────


describe("cobroPorPt — flete = tarifa × PT de la guía, congelado al cobrar", () => {
  const vigente = { pt: 3120, fuente: "oxapampa" as const, cubicadas: 84, total: 84 };

  it("con la guía cubicada entera: tarifa × PT Oxapampa al céntimo", () => {
    expect(cobroPorPt({ tarifaPorPt: 0.3, ptVisto: 3120, vigente, previo: null })).toEqual({
      ok: true,
      pt: 3120,
      fuente: "oxapampa",
      monto: 936,
      congelado: false,
    });
    expect(montoPorPt(0.275, 195.92)).toBe(53.88);
  });

  it("guía a medio cubicar: ≈ estimado, rotulado", () => {
    const r = cobroPorPt({ tarifaPorPt: 0.3, ptVisto: 3309, vigente: { pt: 3309, fuente: "estimado", cubicadas: 40, total: 84 }, previo: null });
    expect(r).toMatchObject({ ok: true, fuente: "estimado", monto: 992.7 });
  });

  it("re-medir después de anotar el flete: se conserva lo cobrado (aunque se corrija la tarifa)", () => {
    const previo = { ptCobrado: 3000, ptFuente: "oxapampa" };
    expect(cobroPorPt({ tarifaPorPt: 0.3, ptVisto: 3000, vigente, previo })).toMatchObject({ ok: true, pt: 3000, monto: 900, congelado: true });
    expect(cobroPorPt({ tarifaPorPt: 0.35, ptVisto: 3000, vigente, previo })).toMatchObject({ ok: true, pt: 3000, monto: 1050, congelado: true });
    // «Usar la de hoy» manda el vigente.
    expect(cobroPorPt({ tarifaPorPt: 0.3, ptVisto: 3120, vigente, previo })).toMatchObject({ ok: true, pt: 3120, monto: 936, congelado: false });
  });

  it("un PT que no es el de hoy ni el cobrado → CUBICACION_CAMBIO; sin PT visto o sin pie tablar → error", () => {
    expect(cobroPorPt({ tarifaPorPt: 0.3, ptVisto: 2000, vigente, previo: null })).toMatchObject({ ok: false, codigo: "CUBICACION_CAMBIO" });
    expect(cobroPorPt({ tarifaPorPt: 0.3, ptVisto: null, vigente, previo: null })).toMatchObject({ ok: false, codigo: "FALTA_PT_VISTO" });
    expect(cobroPorPt({ tarifaPorPt: 0.3, ptVisto: 0, vigente: { pt: 0, fuente: "estimado", cubicadas: 0, total: 0 }, previo: null })).toMatchObject({
      ok: false,
      codigo: "GUIA_SIN_PT",
    });
  });

  it("Zod: tarifa positiva y con tope; sin tarifa sigue valiendo el monto a mano", () => {
    const base = { fecha: "2026-09-26", gtfNumber: "019-001-0000004" };
    expect(fleteInputSchema.safeParse({ ...base, tarifaPorPt: 0.3, ptVisto: 3120 }).success).toBe(true);
    expect(fleteInputSchema.safeParse({ ...base, tarifaPorPt: 0 }).success).toBe(false);
    expect(fleteInputSchema.safeParse({ ...base, tarifaPorPt: 5000 }).success).toBe(false);
    expect(fleteInputSchema.safeParse({ ...base, tarifaPorPt: 0.3333 }).success).toBe(true);
    expect(fleteInputSchema.safeParse({ ...base, tarifaPorPt: 0.33333 }).success).toBe(false);
    expect(fleteInputSchema.safeParse({ ...base, monto: 450 }).success).toBe(true);
  });
});
