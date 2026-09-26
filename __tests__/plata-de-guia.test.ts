import { describe, expect, it } from "vitest";
import {
  aplicarAjuste,
  costoPorEspecie,
  costoPuestoEnPatio,
  cuadrarConFactura,
  esNoCierra,
  estadoDePagoDeGuias,
  gastoGuiaSchema,
  guardarPlataGuiaSchema,
  guiasSinPagarPorParte,
  proveedorDeLaGuia,
  ptDeLinea,
  repartirPorVolumen,
  METODOS_PAGO,
} from "@/lib/forestal/plata-de-guia";
import { limaDateKey } from "@/lib/utils";

const cent = (n: number) => Math.round(n * 100);
const suma = (xs: number[]) => xs.reduce((t, x) => t + cent(x), 0);

/** PRNG determinista: los casos «al azar» se repiten igual en cada corrida. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("repartirPorVolumen — la suma cierra al céntimo", () => {
  it("el resto va al último", () => {
    const r = repartirPorVolumen(100, [
      { id: "a", volumeM3: 1 },
      { id: "b", volumeM3: 1 },
      { id: "c", volumeM3: 1 },
    ]);
    expect(r.map((x) => x.costoTotal)).toEqual([33.33, 33.33, 33.34]);
  });

  it("proporcional al volumen", () => {
    const r = repartirPorVolumen(1000, [
      { id: "a", volumeM3: 3 },
      { id: "b", volumeM3: 1 },
    ]);
    expect(r).toEqual([
      { id: "a", costoTotal: 750 },
      { id: "b", costoTotal: 250 },
    ]);
  });

  it("sin volumen: partes iguales; sin líneas: vacío", () => {
    expect(repartirPorVolumen(10, [{ id: "a", volumeM3: 0 }, { id: "b", volumeM3: 0 }]).map((x) => x.costoTotal)).toEqual([5, 5]);
    expect(repartirPorVolumen(10, [])).toEqual([]);
  });

  it("volúmenes minúsculos al final nunca dejan al último en negativo", () => {
    const lineas = [
      { id: "a", volumeM3: 1 },
      { id: "b", volumeM3: 1 },
      { id: "c", volumeM3: 1 },
      { id: "d", volumeM3: 0.000001 },
    ];
    const r = repartirPorVolumen(0.05, lineas);
    expect(r.every((x) => x.costoTotal >= 0)).toBe(true);
    expect(suma(r.map((x) => x.costoTotal))).toBe(5);
  });

  it("500 guías al azar: Σ = total exacto y nadie en negativo", () => {
    const rnd = prng(437);
    for (let k = 0; k < 500; k++) {
      const n = 1 + Math.floor(rnd() * 6);
      const lineas = Array.from({ length: n }, (_, i) => ({ id: `l${i}`, volumeM3: Math.round(rnd() * 50_000) / 1000 }));
      const total = Math.round(rnd() * 5_000_000) / 100;
      const r = repartirPorVolumen(total, lineas);
      expect(suma(r.map((x) => x.costoTotal))).toBe(cent(total));
      expect(r.every((x) => x.costoTotal >= 0)).toBe(true);
      // Cada parte con 2 decimales exactos.
      expect(r.every((x) => Math.abs(x.costoTotal * 100 - Math.round(x.costoTotal * 100)) < 1e-6)).toBe(true);
    }
  });
});

describe("ptDeLinea y costoPorEspecie", () => {
  it("rolliza = aserrable al 56 %; aserrada = m³ × 424", () => {
    expect(ptDeLinea({ volumeM3: 10, productType: "rolliza" })).toBe(Math.round(10 * 0.56 * 424));
    expect(ptDeLinea({ volumeM3: 10, productType: "aserrada" })).toBe(4240);
    expect(ptDeLinea({ volumeM3: 0, productType: "rolliza" })).toBe(0);
  });

  it("la cantidad de la factura manda; sin ella se usa la nuestra y se marca derivada", () => {
    const lineas = [
      { id: "t", volumeM3: 10, productType: "rolliza" },
      { id: "c", volumeM3: 2, productType: "rolliza" },
      { id: "x", volumeM3: 5, productType: "rolliza" },
    ];
    const r = costoPorEspecie(lineas, {
      t: { precio: 180, unidad: "m3", cantidadFactura: null },
      c: { precio: 2.5, unidad: "pt", cantidadFactura: 1000 },
      // x sin precio: no sale.
    });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ id: "t", costoTotal: 1800, cantidad: 10, cantidadDerivada: true });
    expect(r[1]).toMatchObject({ id: "c", costoTotal: 2500, cantidad: 1000, cantidadDerivada: false });
  });

  it("pt derivado: precio × ≈pt redondeado al céntimo", () => {
    const [r] = costoPorEspecie([{ id: "t", volumeM3: 3.333, productType: "rolliza" }], {
      t: { precio: 1.37, unidad: "pt", cantidadFactura: null },
    });
    const pt = Math.round(3.333 * 0.56 * 424);
    expect(r.cantidad).toBe(pt);
    expect(r.costoTotal).toBe(Math.round(pt * 1.37 * 100) / 100);
  });
});

describe("cuadrarConFactura", () => {
  const lineas = [
    { id: "a", costoTotal: 1000, volumeM3: 2, speciesCommonName: "Cumala" },
    { id: "b", costoTotal: 3000, volumeM3: 8, speciesCommonName: "Tornillo" },
  ];

  it("cierra dentro de medio céntimo", () => {
    expect(cuadrarConFactura(lineas, 4000)).toMatchObject({ cierra: true, diferencia: 0, ajuste: null });
  });

  it("no cierra: dice la diferencia y propone ajustar la especie de MAYOR volumen", () => {
    const c = cuadrarConFactura(lineas, 4012.5);
    expect(c.cierra).toBe(false);
    expect(c.diferencia).toBe(12.5);
    expect(c.ajuste).toEqual({ id: "b", especie: "Tornillo", monto: 12.5, nuevoCosto: 3012.5 });
    const ajustadas = aplicarAjuste(lineas, c.ajuste);
    expect(cuadrarConFactura(ajustadas, 4012.5).cierra).toBe(true);
    // No muta la entrada.
    expect(lineas[1].costoTotal).toBe(3000);
  });

  it("no ofrece un ajuste que deje la especie en negativo", () => {
    const c = cuadrarConFactura(lineas, 500);
    expect(c.cierra).toBe(false);
    expect(c.ajuste).toBeNull();
  });
});

describe("guardarPlataGuiaSchema", () => {
  const detalle = { v: 1 as const, modo: "total" as const, unidad: "m3" as const, precio: null, cantidadFactura: null, ptDerivado: null, totalFactura: 100 };
  const compra = {
    tipo: "compra",
    gtfNumber: "019-0001",
    proveedorParteId: "p1",
    totalFactura: 100,
    lineas: [
      { woodEntryId: "a", costoTotal: 60, detalle },
      { woodEntryId: "b", costoTotal: 40, detalle },
    ],
    anotarEnCuenta: true,
    vistos: [{ id: "a", antes: null }],
  };

  it("acepta una compra que cierra", () => {
    expect(guardarPlataGuiaSchema.safeParse(compra).success).toBe(true);
  });

  it("no cierra por un céntimo → issue «no cierra» (la ruta da 422 no_cierra)", () => {
    const r = guardarPlataGuiaSchema.safeParse({ ...compra, totalFactura: 100.01 });
    expect(r.success).toBe(false);
    if (!r.success) expect(esNoCierra(r.error.issues)).toBe(true);
  });

  it("anotar en la cuenta exige a quién se le paga", () => {
    const r = guardarPlataGuiaSchema.safeParse({ ...compra, proveedorParteId: null });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(esNoCierra(r.error.issues)).toBe(false);
      expect(r.error.issues.some((i) => i.path[0] === "proveedorParteId")).toBe(true);
    }
    expect(guardarPlataGuiaSchema.safeParse({ ...compra, proveedorParteId: null, anotarEnCuenta: false }).success).toBe(true);
  });

  it("rechaza el mismo asiento dos veces, tres decimales y total 0", () => {
    expect(guardarPlataGuiaSchema.safeParse({ ...compra, lineas: [compra.lineas[0], { ...compra.lineas[0], costoTotal: 40 }] }).success).toBe(false);
    expect(guardarPlataGuiaSchema.safeParse({ ...compra, totalFactura: 100.001 }).success).toBe(false);
    expect(
      guardarPlataGuiaSchema.safeParse({ ...compra, totalFactura: 0, lineas: [{ ...compra.lineas[0], costoTotal: 0 }] }).success,
    ).toBe(false);
  });

  it("anotarEnCuenta no tiene default (Zod 4 .partial lo aplicaría)", () => {
    const { anotarEnCuenta: _omit, ...sin } = compra;
    void _omit;
    expect(guardarPlataGuiaSchema.safeParse(sin).success).toBe(false);
  });

  it("servicio y quitar_servicio", () => {
    expect(guardarPlataGuiaSchema.safeParse({ tipo: "servicio", gtfNumber: "X", duenoParteId: "w", vistos: [] }).success).toBe(true);
    expect(guardarPlataGuiaSchema.safeParse({ tipo: "servicio", gtfNumber: "X", vistos: [] }).success).toBe(false);
    expect(guardarPlataGuiaSchema.safeParse({ tipo: "quitar_servicio", gtfNumber: "X", vistos: [] }).success).toBe(true);
  });
});

describe("gastoGuiaSchema", () => {
  const base = { gtfNumber: "019-1", categoria: "estiba", monto: 120, fecha: "2026-09-20", metodo: "yape", pagado: true };
  it("acepta un gasto de hoy o antes", () => {
    expect(gastoGuiaSchema.safeParse(base).success).toBe(true);
    expect(gastoGuiaSchema.safeParse({ ...base, fecha: limaDateKey(new Date()) }).success).toBe(true);
  });
  it("rechaza fecha futura, categoría inventada, método fuera de la lista y monto 0", () => {
    expect(gastoGuiaSchema.safeParse({ ...base, fecha: "2999-01-01" }).success).toBe(false);
    expect(gastoGuiaSchema.safeParse({ ...base, categoria: "almuerzo" }).success).toBe(false);
    expect(gastoGuiaSchema.safeParse({ ...base, metodo: "credito" }).success).toBe(false);
    expect(gastoGuiaSchema.safeParse({ ...base, monto: 0 }).success).toBe(false);
  });
  it("los métodos son los de una liquidación", () => {
    expect([...METODOS_PAGO]).toEqual(["efectivo", "yape", "plin", "tarjeta", "transferencia"]);
  });
});

describe("proveedorDeLaGuia — nunca por RUC", () => {
  const partes = [
    { id: "nelly", nombre: "NELLY RAMOS", activo: true },
    { id: "santa", nombre: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", activo: true },
    { id: "wasaco", nombre: "WASACO S.A.C.", activo: true },
  ];

  it("orden: enlace → titular → nombre exacto → parecido (sólo propone)", () => {
    expect(proveedorDeLaGuia({ enlaceParteId: "wasaco", titularId: "santa", providerName: "NELLY RAMOS" }, partes)).toMatchObject({
      parteId: "wasaco",
      via: "enlace",
      seguro: true,
    });
    expect(proveedorDeLaGuia({ enlaceParteId: null, titularId: "santa", providerName: "NELLY RAMOS" }, partes)).toMatchObject({
      parteId: "santa",
      via: "titular",
    });
    expect(proveedorDeLaGuia({ enlaceParteId: null, titularId: null, providerName: "  nelly  ramos " }, partes)).toMatchObject({
      parteId: "nelly",
      via: "nombre",
      seguro: true,
    });
    expect(
      proveedorDeLaGuia({ enlaceParteId: null, titularId: null, providerName: "COMUNIDAD SANTA ROSA DE CHIVIS" }, partes),
    ).toMatchObject({ parteId: "santa", via: "parecido", seguro: false });
  });

  it("un enlace o titular que no existe cae al siguiente paso", () => {
    expect(proveedorDeLaGuia({ enlaceParteId: "borrada", titularId: "otra", providerName: "WASACO S.A.C." }, partes)).toMatchObject({
      parteId: "wasaco",
      via: "nombre",
    });
  });

  it("dos tocayos o nada parecido → null (no se elige a ciegas)", () => {
    const tocayos = [...partes, { id: "nelly2", nombre: "Nelly Ramos", activo: true }];
    expect(proveedorDeLaGuia({ enlaceParteId: null, titularId: null, providerName: "NELLY RAMOS" }, tocayos)).toBeNull();
    expect(proveedorDeLaGuia({ enlaceParteId: null, titularId: null, providerName: "JUAN PEREZ" }, partes)).toBeNull();
    expect(proveedorDeLaGuia({ enlaceParteId: null, titularId: null, providerName: "" }, partes)).toBeNull();
  });

  it("la entrada no acepta providerDocument: el RUC de la ATFFS no enlaza a nadie", () => {
    const guia = { enlaceParteId: null, titularId: null, providerName: "SIN FICHA", providerDocument: "20600000001" };
    // @ts-expect-error — `providerDocument` no es parte del contrato (ADR-437 §2).
    const r = proveedorDeLaGuia(guia, [{ id: "atffs", nombre: "ATFFS", docNumero: "20600000001" }]);
    expect(r).toBeNull();
  });
});

describe("costoPuestoEnPatio — un flete sin monto nunca suma 0", () => {
  it("madera + fletes del CTP + gastos; el del proveedor no suma", () => {
    const c = costoPuestoEnPatio({
      esServicio: false,
      madera: 10_000,
      volumenM3: 20,
      fletes: [
        { tipo: "ingreso", pagaQuien: "ctp", monto: 800 },
        { tipo: "ingreso", pagaQuien: "proveedor", monto: 500 },
        { tipo: "despacho", pagaQuien: "ctp", monto: 999 },
        { tipo: "ingreso", pagaQuien: "ctp", monto: 300, deletedAt: "2026-09-01" },
      ],
      gastos: [{ monto: 120 }, { monto: 80.5 }],
    });
    expect(c).toMatchObject({ madera: 10_000, fletes: 800, fletesDelProveedor: 500, gastos: 200.5, total: 11_000.5, incompleto: false });
    expect(c.porM3).toBe(550.03);
  });

  it("flete del CTP sin monto → incompleto y sin S/ por m³", () => {
    const c = costoPuestoEnPatio({
      esServicio: false,
      madera: 1000,
      volumenM3: 5,
      fletes: [{ tipo: "ingreso", pagaQuien: "ctp", monto: null }],
      gastos: [],
    });
    expect(c.incompleto).toBe(true);
    expect(c.fletesSinMonto).toBe(1);
    expect(c.porM3).toBeNull();
    expect(c.faltantes).toContain("el monto de un flete");
  });

  it("compra sin costo → incompleto; servicio → la madera no cuenta", () => {
    expect(costoPuestoEnPatio({ esServicio: false, madera: null, volumenM3: 1, fletes: [], gastos: [] }).faltantes).toContain(
      "el costo de la madera",
    );
    const s = costoPuestoEnPatio({ esServicio: true, madera: 999, volumenM3: 1, fletes: [], gastos: [{ monto: 50 }] });
    expect(s).toMatchObject({ madera: null, total: 50, incompleto: false });
  });
});

describe("estadoDePagoDeGuias — derivado, FIFO por antigüedad", () => {
  const g = (gtfNumber: string, fecha: string, monto: number, parteId = "p") => ({ gtfNumber, parteId, fecha, monto });
  const cargo = (monto: number, gtfNumber: string | null = null, parteId = "p", concepto = "pago_hecho") => ({
    parteId,
    tipo: "cargo" as const,
    concepto,
    monto,
    gtfNumber,
  });

  it("un pago con guía cubre SU guía; los sueltos cubren la más vieja primero", () => {
    const e = estadoDePagoDeGuias([g("B", "2026-09-10", 500), g("A", "2026-09-01", 1000)], [cargo(300, "B"), cargo(600)]);
    const a = e.find((x) => x.gtfNumber === "A")!;
    const b = e.find((x) => x.gtfNumber === "B")!;
    expect(a).toMatchObject({ pagado: 600, pendiente: 400, estado: "parcial", cubiertoPorAntiguedad: 600, cubiertoDirecto: 0 });
    expect(b).toMatchObject({ pagado: 300, pendiente: 200, estado: "parcial", cubiertoDirecto: 300 });
  });

  it("lo que un pago pasa de su guía se aplica a las demás y se muestra", () => {
    const e = estadoDePagoDeGuias([g("A", "2026-09-01", 100), g("B", "2026-09-02", 100)], [cargo(150, "A")]);
    expect(e.find((x) => x.gtfNumber === "A")).toMatchObject({ estado: "pagada", excedente: 50 });
    expect(e.find((x) => x.gtfNumber === "B")).toMatchObject({ estado: "parcial", pagado: 50, cubiertoPorAntiguedad: 50 });
  });

  it("pagada con tolerancia de medio céntimo; pendiente sin pagos; otra parte no cuenta", () => {
    const e = estadoDePagoDeGuias([g("A", "2026-09-01", 100)], [cargo(100), cargo(999, null, "otra")]);
    expect(e[0].estado).toBe("pagada");
    expect(estadoDePagoDeGuias([g("A", "2026-09-01", 100)], [cargo(50, null, "otra")])[0].estado).toBe("pendiente");
  });

  it("un pago a una guía que ya no está en la lista (anulada) cuenta como suelto", () => {
    const e = estadoDePagoDeGuias([g("A", "2026-09-01", 100)], [cargo(40, "MUERTA")]);
    expect(e[0]).toMatchObject({ pagado: 40, cubiertoPorAntiguedad: 40 });
  });

  it("INVARIANTE (ADR-437 §7): con sólo abonos de madera, Σ pendiente = max(0, Σ madera − Σ cargos) — 400 casos", () => {
    const rnd = prng(7);
    for (let k = 0; k < 400; k++) {
      const nG = 1 + Math.floor(rnd() * 6);
      const guias = Array.from({ length: nG }, (_, i) =>
        g(`G${i}`, `2026-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}`, Math.round(rnd() * 2_000_000) / 100),
      );
      const nC = Math.floor(rnd() * 6);
      const cargos = Array.from({ length: nC }, () =>
        cargo(Math.round(rnd() * 1_500_000) / 100 + 0.01, rnd() < 0.5 ? guias[Math.floor(rnd() * nG)].gtfNumber : null),
      );
      const e = estadoDePagoDeGuias(guias, cargos);
      const pendiente = e.reduce((t, x) => t + cent(x.pendiente), 0);
      const esperado = Math.max(0, suma(guias.map((x) => x.monto)) - suma(cargos.map((c) => c.monto)));
      expect(pendiente).toBe(esperado);
      for (const x of e) {
        expect(cent(x.pagado) + cent(x.pendiente)).toBe(cent(x.monto));
        expect(x.pendiente).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("estadoDePagoDeGuias — lo que se le debe por OTRA cosa se cubre antes (revisión 2026-09-26)", () => {
  const g = (gtfNumber: string, fecha: string, monto: number, parteId = "p") => ({ gtfNumber, parteId, fecha, monto });
  const mov = (tipo: "cargo" | "abono", concepto: string, monto: number, gtfNumber: string | null = null, parteId = "p") => ({
    parteId,
    tipo,
    concepto,
    monto,
    gtfNumber,
  });

  it("madera 1000 + aserrío recibido 1000 + pago suelto 1000 → la guía sigue debiendo 1000 (saldo −1000)", () => {
    const movs = [mov("abono", "madera", 1000, "G"), mov("abono", "aserrio_recibido", 1000), mov("cargo", "pago_hecho", 1000)];
    const [e] = estadoDePagoDeGuias([g("G", "2026-09-01", 1000)], movs);
    expect(e).toMatchObject({ pendiente: 1000, pagado: 0, estado: "pendiente" });
  });

  it("un cargo que NO es pago (aserrío prestado, venta) sí baja lo que se le debe por la guía", () => {
    const movs = [mov("abono", "madera", 1000, "G"), mov("cargo", "aserrio_prestado", 600), mov("cargo", "venta", 400)];
    expect(estadoDePagoDeGuias([g("G", "2026-09-01", 1000)], movs)[0]).toMatchObject({ pendiente: 0, estado: "pagada" });
  });

  it("un pago que NOMBRA la guía la cubre aunque haya otra deuda sin pagar", () => {
    const movs = [mov("abono", "madera", 1000, "G"), mov("abono", "otro", 500), mov("cargo", "pago_hecho", 1000, "G")];
    expect(estadoDePagoDeGuias([g("G", "2026-09-01", 1000)], movs)[0]).toMatchObject({ estado: "pagada", cubiertoDirecto: 1000 });
  });

  it("el abono madera de una guía que no está en la lista es deuda como cualquier otra", () => {
    const movs = [mov("abono", "madera", 1000, "G"), mov("abono", "madera", 300, "VIEJA"), mov("cargo", "pago_hecho", 1000)];
    expect(estadoDePagoDeGuias([g("G", "2026-09-01", 1000)], movs)[0]).toMatchObject({ pendiente: 300, pagado: 700 });
  });

  it("INVARIANTE: Σ pendiente = mín(lo que falta de las guías, máx(0, −saldo)) con abonos mezclados — 400 casos", () => {
    const rnd = prng(11);
    const conceptosAbono = ["aserrio_recibido", "otro", "pago"];
    const conceptosCargo = ["pago_hecho", "aserrio_prestado", "venta", "compensacion", "flete"];
    for (let k = 0; k < 400; k++) {
      const nG = 1 + Math.floor(rnd() * 5);
      const guias = Array.from({ length: nG }, (_, i) =>
        g(`G${i}`, `2026-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}`, Math.round(rnd() * 2_000_000) / 100 + 0.01),
      );
      const movs: ReturnType<typeof mov>[] = guias.map((x) => mov("abono", "madera", x.monto, x.gtfNumber));
      const nM = Math.floor(rnd() * 7);
      for (let j = 0; j < nM; j++) {
        const monto = Math.round(rnd() * 1_500_000) / 100 + 0.01;
        if (rnd() < 0.4) movs.push(mov("abono", conceptosAbono[Math.floor(rnd() * conceptosAbono.length)], monto));
        else
          movs.push(
            mov(
              "cargo",
              conceptosCargo[Math.floor(rnd() * conceptosCargo.length)],
              monto,
              rnd() < 0.4 ? guias[Math.floor(rnd() * nG)].gtfNumber : null,
            ),
          );
      }
      const e = estadoDePagoDeGuias(guias, movs);
      const pendiente = e.reduce((t, x) => t + cent(x.pendiente), 0);
      const saldo = movs.reduce((t, m) => t + (m.tipo === "cargo" ? cent(m.monto) : -cent(m.monto)), 0);
      const falta = e.reduce((t, x) => t + cent(x.monto) - cent(x.cubiertoDirecto), 0);
      expect(pendiente).toBe(Math.min(falta, Math.max(0, -saldo)));
      for (const x of e) {
        expect(cent(x.pagado) + cent(x.pendiente)).toBe(cent(x.monto));
        expect(x.pendiente).toBeGreaterThanOrEqual(0);
        // El desglose de «Cubierto» suma exacto al céntimo, sin partes negativas.
        const d = x.desglose;
        expect(cent(d.pagado) + cent(d.cruzado) + cent(d.otros)).toBe(cent(x.pagado));
        expect(Math.min(d.pagado, d.cruzado, d.otros)).toBeGreaterThanOrEqual(0);
      }
      // Lo pagado en plata nunca pasa de lo que se entregó en plata.
      const entregado = movs.filter((m) => m.tipo === "cargo" && m.concepto === "pago_hecho").reduce((t, m) => t + cent(m.monto), 0);
      expect(e.reduce((t, x) => t + cent(x.desglose.pagado), 0)).toBeLessThanOrEqual(entregado);
    }
  });
});

describe("estadoDePagoDeGuias — «Cubierto» se desglosa (revisión 2026-09-26)", () => {
  /* Dos «Pagado» distintos en el mismo modal: la sección Pago contaba cualquier
     cargo (aserrío prestado incluido) y la sección Cuenta sólo el pago
     entregado + cruces. Ahora Pago dice «Cubierto» y de qué. */
  const g = (gtfNumber: string, fecha: string, monto: number) => ({ gtfNumber, parteId: "p", fecha, monto });
  const mov = (tipo: "cargo" | "abono", concepto: string, monto: number, gtfNumber: string | null = null) => ({
    parteId: "p",
    tipo,
    concepto,
    monto,
    gtfNumber,
  });

  it("pago + cruce + aserrío prestado: cada parte dicha por su nombre, sin cambiar el total", () => {
    const movs = [
      mov("abono", "madera", 1000, "G"),
      mov("cargo", "pago_hecho", 500),
      mov("cargo", "compensacion", 300),
      mov("cargo", "aserrio_prestado", 200),
    ];
    const [e] = estadoDePagoDeGuias([g("G", "2026-09-01", 1000)], movs);
    expect(e).toMatchObject({ pagado: 1000, pendiente: 0, estado: "pagada" });
    expect(e.desglose).toEqual({ pagado: 500, cruzado: 300, otros: 200 });
  });

  it("sólo aserrío prestado: la guía queda cubierta pero NO pagada en plata", () => {
    const movs = [mov("abono", "madera", 1000, "G"), mov("cargo", "aserrio_prestado", 1000)];
    const [e] = estadoDePagoDeGuias([g("G", "2026-09-01", 1000)], movs);
    expect(e.estado).toBe("pagada");
    expect(e.desglose).toEqual({ pagado: 0, cruzado: 0, otros: 1000 });
  });

  it("la plata cubre primero la guía; lo que se debe por otra cosa se cubre primero con los otros cargos", () => {
    // Aserrío recibido 300 (otra deuda) + aserrío prestado 300 se cancelan entre sí;
    // el pago de 1000 queda entero para la guía.
    const movs = [
      mov("abono", "madera", 1000, "G"),
      mov("abono", "aserrio_recibido", 300),
      mov("cargo", "aserrio_prestado", 300),
      mov("cargo", "pago_hecho", 1000),
    ];
    const [e] = estadoDePagoDeGuias([g("G", "2026-09-01", 1000)], movs);
    expect(e.desglose).toEqual({ pagado: 1000, cruzado: 0, otros: 0 });
  });

  it("un pago que nombra la guía cuenta como pagado aunque haya un cruce suelto", () => {
    const movs = [mov("abono", "madera", 1000, "G"), mov("cargo", "pago_hecho", 600, "G"), mov("cargo", "compensacion", 400)];
    const [e] = estadoDePagoDeGuias([g("G", "2026-09-01", 1000)], movs);
    expect(e.desglose).toEqual({ pagado: 600, cruzado: 400, otros: 0 });
  });
});

describe("gastoGuiaSchema — la fecha tiene que existir en el calendario", () => {
  const base = { gtfNumber: "GTF-1", categoria: "estiba", monto: 50, metodo: null, pagado: false };
  it.each(["2025-13-01", "2026-02-31", "2025-00-10", "2025-04-31"])("%s → rechazada", (fecha) => {
    expect(gastoGuiaSchema.safeParse({ ...base, fecha }).success).toBe(false);
  });
  it("2024-02-29 (bisiesto) y 2026-01-31 se aceptan", () => {
    expect(gastoGuiaSchema.safeParse({ ...base, fecha: "2024-02-29" }).success).toBe(true);
    expect(gastoGuiaSchema.safeParse({ ...base, fecha: "2026-01-31" }).success).toBe(true);
  });
});

describe("guiasSinPagarPorParte — aviso de la tira", () => {
  const estados = estadoDePagoDeGuias(
    [
      { gtfNumber: "A", parteId: "nelly", fecha: "2026-08-01", monto: 5000 },
      { gtfNumber: "B", parteId: "nelly", fecha: "2026-09-20", monto: 7400 },
      { gtfNumber: "C", parteId: "santos", fecha: "2026-09-01", monto: 100 },
      { gtfNumber: "D", parteId: "pagado", fecha: "2026-09-01", monto: 100 },
    ],
    [{ parteId: "pagado", tipo: "cargo", concepto: "pago_hecho", monto: 100, gtfNumber: null }],
  );
  const partes = [
    { id: "nelly", nombre: "Nelly", condicionPago: "credito", diasCredito: 30 },
    { id: "santos", nombre: "Santos", condicionPago: "contado", diasCredito: null },
    { id: "pagado", nombre: "Al día" },
  ];

  it("una fila por parte con pendiente, la más grande primero; atrasado sólo con crédito vencido", () => {
    const r = guiasSinPagarPorParte(estados, partes, "2026-09-26");
    expect(r.map((x) => x.parteId)).toEqual(["nelly", "santos"]);
    expect(r[0]).toMatchObject({ guias: 2, pendiente: 12_400, desde: "2026-08-01", nivel: "atrasado", gtfNumbers: ["A", "B"] });
    expect(r[1].nivel).toBe("pendiente");
  });

  it("crédito todavía en plazo → pendiente", () => {
    const r = guiasSinPagarPorParte(estados, partes, "2026-08-15");
    expect(r[0].nivel).toBe("pendiente");
  });
});
