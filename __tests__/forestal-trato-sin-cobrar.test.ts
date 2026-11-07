/**
 * __tests__/forestal-trato-sin-cobrar.test.ts
 *
 * «El trato empieza después de la corrida» (caso WASACO, Blas 23-09): trato
 * global S/ 0,50 desde el 14/09 y 6 corridas del 07/09 sin precio. Qué corridas
 * califican, qué fecha se propone, que una versión anterior que ya cubría NO
 * dispara el adelanto, y que el POST cobra lo mismo que se vio.
 */
import { describe, expect, it } from "vitest";
import type { TarifaCliente } from "@/lib/forestal/precio-cliente";
import {
  arregloTratoInputSchema,
  cuantoSubio,
  idsACobrar,
  primeraVersion,
  proponerArreglo,
  propuestaTratoQuerySchema,
  resumenDelResultado,
  revisarAdelanto,
  textoDelAdelanto,
  textoDelAviso,
  textoDelResultado,
  tratoCubre,
  tratoDelDetalle,
  tratoParaCotizar,
  type CorridaDelTrato,
  type ResultadoDelArreglo,
} from "@/lib/forestal/trato-sin-cobrar";
import type { ResultadoDeTanda } from "@/lib/forestal/aserrio-cobro";

const trato = (parcial: Partial<TarifaCliente> = {}): TarifaCliente => ({
  id: "tc-14",
  parteId: "wasaco",
  servicio: "aserrio",
  vigenteDesde: "2026-09-14",
  basePt: 0.5,
  grupos: [],
  especies: [],
  tipos: [],
  nota: null,
  ...parcial,
});

const corrida = (parcial: Partial<CorridaDelTrato> & { id: string }): CorridaDelTrato => ({
  lineNo: 1,
  fecha: "2026-09-07",
  especie: "Cumala",
  importeActual: null,
  manual: false,
  pt: 100,
  importeConTrato: 50,
  ...parcial,
});

/* Las 6 corridas reales de WASACO en Blas (PT medidos; importe = PT × 0,50). */
const WASACO: CorridaDelTrato[] = [
  { n: 30, especie: "Panguana", pt: 542.99 },
  { n: 31, especie: "Mashonaste", pt: 223.34 },
  { n: 32, especie: "Cachimbo", pt: 931.49 },
  { n: 33, especie: "Tacho", pt: 250 },
  { n: 34, especie: "Copal", pt: 345.75 },
  { n: 35, especie: "Cumala", pt: 945.33 },
].map(({ n, especie, pt }) =>
  corrida({ id: `c${n}`, lineNo: n, especie, pt, importeConTrato: Math.round(pt * 50) / 100 }),
);

describe("qué corridas califican", () => {
  it("el caso WASACO: 6 corridas del 07/09, trato desde el 14/09 → adelantar al 07/09", () => {
    const a = proponerArreglo("wasaco", [trato()], WASACO);
    expect(a?.mover).toEqual({ tarifaId: "tc-14", vigenteDesde: "2026-09-14", desde: "2026-09-07" });
    expect(a?.sinCobrar.map((c) => c.lineNo)).toEqual([30, 31, 32, 33, 34, 35]);
    expect(a?.antesDelTrato).toBe(6);
    expect(a?.pt).toBe(3238.9);
    expect(a?.cambian).toEqual([]);
    expect(a?.quedanAntes).toBe(0);
  });

  it("la fecha propuesta es la corrida MÁS VIEJA sin cobrar, no la primera de la lista", () => {
    const a = proponerArreglo("wasaco", [trato()], [
      corrida({ id: "a", fecha: "2026-09-10" }),
      corrida({ id: "b", fecha: "2026-09-03" }),
      corrida({ id: "c", fecha: "2026-09-12" }),
    ]);
    expect(a?.mover?.desde).toBe("2026-09-03");
    expect(a?.sinCobrar.map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("una versión ANTERIOR que ya cubría esa fecha no dispara el adelanto (no se pisa)", () => {
    const tratos = [trato({ id: "tc-01", vigenteDesde: "2026-09-01", basePt: 0.4 }), trato()];
    /* Cobrada con la versión del 01/09: no falta nada. */
    expect(proponerArreglo("wasaco", tratos, [corrida({ id: "a", importeActual: 40, importeConTrato: 40 })])).toBeNull();
    /* Sin cargo aunque la versión del 01/09 la cubre (se declaró antes de pactar):
       se cobra con ESA versión, pero no se mueve ninguna. */
    const a = proponerArreglo("wasaco", tratos, [corrida({ id: "b" })]);
    expect(a?.mover).toBeNull();
    expect(a?.antesDelTrato).toBe(0);
    expect(a?.sinCobrar.map((c) => c.id)).toEqual(["b"]);
  });

  it("sólo se puede adelantar la versión más vieja", () => {
    const tratos = [trato(), trato({ id: "tc-20", vigenteDesde: "2026-09-20", basePt: 0.6 })];
    expect(primeraVersion(tratos)?.id).toBe("tc-14");
    expect(proponerArreglo("wasaco", tratos, [corrida({ id: "a" })])?.mover?.tarifaId).toBe("tc-14");
  });

  it("no califican: la de precio a mano, la ya cobrada, la que el trato no cubre, la del trato de venta", () => {
    expect(
      proponerArreglo("wasaco", [trato()], [
        corrida({ id: "manual", manual: true }),
        corrida({ id: "cobrada", importeActual: 20, importeConTrato: 20, fecha: "2026-09-15" }),
        corrida({ id: "sin-cubrir", importeConTrato: null }),
        corrida({ id: "cero", importeConTrato: 0 }),
      ]),
    ).toBeNull();
    expect(proponerArreglo("wasaco", [trato({ servicio: "venta" })], WASACO)).toBeNull();
    expect(proponerArreglo("wasaco", [], WASACO)).toBeNull();
  });

  it("sin cargo con el trato YA vigente (se pactó después de declarar): cobrar sin mover", () => {
    const a = proponerArreglo("wasaco", [trato()], [corrida({ id: "a", fecha: "2026-09-15" })]);
    expect(a?.mover).toBeNull();
    expect(a?.sinCobrar.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("lo que el adelanto cambia sin que se vea", () => {
  it("una cobrada con la planta dentro de la ventana pasa al trato y se dice con su diferencia", () => {
    const a = proponerArreglo("wasaco", [trato()], [
      corrida({ id: "sin", fecha: "2026-09-07" }),
      corrida({ id: "planta", fecha: "2026-09-10", importeActual: 30, importeConTrato: 50 }),
      corrida({ id: "igual", fecha: "2026-09-11", importeActual: 50, importeConTrato: 50 }),
      /* Fuera de la ventana (antes del 07/09): no se toca. */
      corrida({ id: "vieja", fecha: "2026-09-01", importeActual: 30, importeConTrato: 50 }),
    ]);
    expect(a?.cambian.map((c) => c.id)).toEqual(["planta"]);
    expect(a?.diferencia).toBe(20);
    expect(idsACobrar(a!)).toEqual(["sin", "planta"]);
  });
});

describe("la fecha pedida (el botón de Declarar producción usa la de la producción)", () => {
  it("adelanta a ESA fecha y deja fuera lo más viejo, diciéndolo", () => {
    const a = proponerArreglo("wasaco", [trato()], [
      corrida({ id: "vieja", fecha: "2026-09-03" }),
      corrida({ id: "a", fecha: "2026-09-08" }),
      corrida({ id: "vigente", fecha: "2026-09-16" }),
    ], { desde: "2026-09-07" });
    expect(a?.mover?.desde).toBe("2026-09-07");
    expect(a?.sinCobrar.map((c) => c.id)).toEqual(["a", "vigente"]);
    expect(a?.quedanAntes).toBe(1);
  });

  it("una fecha que no es anterior al trato no mueve nada: sólo cobra lo que ya cubre", () => {
    const a = proponerArreglo("wasaco", [trato()], [
      corrida({ id: "antes", fecha: "2026-09-07" }),
      corrida({ id: "vigente", fecha: "2026-09-16" }),
    ], { desde: "2026-09-20" });
    expect(a?.mover).toBeNull();
    expect(a?.sinCobrar.map((c) => c.id)).toEqual(["vigente"]);
  });
});

describe("tratoParaCotizar", () => {
  it("la vigente si rige; si la corrida es anterior a todo, la más vieja marcada `antes`", () => {
    const tratos = [trato(), trato({ id: "tc-20", vigenteDesde: "2026-09-20" })];
    expect(tratoParaCotizar(tratos, "2026-09-21")).toMatchObject({ tarifa: { id: "tc-20" }, antes: false });
    expect(tratoParaCotizar(tratos, "2026-09-14")).toMatchObject({ tarifa: { id: "tc-14" }, antes: false });
    expect(tratoParaCotizar(tratos, "2026-09-07")).toMatchObject({ tarifa: { id: "tc-14" }, antes: true });
    expect(tratoParaCotizar([], "2026-09-07")).toBeNull();
  });
});

describe("revisarAdelanto (lo que el servidor repite con lock)", () => {
  it("adelanta la más vieja a una fecha anterior", () => {
    expect(revisarAdelanto([trato()], "tc-14", "2026-09-07")).toEqual({ motivo: null, yaEmpieza: false, de: "2026-09-14" });
  });
  it("doble clic: si ya empieza ese día no es error, no hay nada que mover", () => {
    expect(revisarAdelanto([trato({ vigenteDesde: "2026-09-07" })], "tc-14", "2026-09-07")).toMatchObject({
      motivo: null,
      yaEmpieza: true,
    });
  });
  it("otra versión ya empieza antes → no se pisa (409)", () => {
    const tratos = [trato({ id: "tc-01", vigenteDesde: "2026-09-01" }), trato()];
    expect(revisarAdelanto(tratos, "tc-14", "2026-09-07").motivo).toBe("otra_version");
  });
  it("una fecha posterior no es adelantar (422); sin trato, 404", () => {
    expect(revisarAdelanto([trato()], "tc-14", "2026-09-20").motivo).toBe("no_es_antes");
    expect(revisarAdelanto([], "tc-14", "2026-09-07").motivo).toBe("sin_trato");
  });
});

describe("el cuerpo del POST", () => {
  it("adelantar pide versión Y fecha; cobrar sólo, ninguna", () => {
    expect(arregloTratoInputSchema.safeParse({ parteId: "p", tarifaId: "t", desde: "2026-09-07" }).success).toBe(true);
    expect(arregloTratoInputSchema.safeParse({ parteId: "p" }).success).toBe(true);
    expect(arregloTratoInputSchema.safeParse({ parteId: "p", desde: "2026-09-07" }).success).toBe(false);
    expect(arregloTratoInputSchema.safeParse({ parteId: "p", tarifaId: "t", desde: "2026-02-31" }).success).toBe(false);
  });
});

describe("cómo se lee el aviso", () => {
  const HOY = "2026-09-23";

  it("WASACO: el pedido de Brandon, palabra por palabra en lo que importa", () => {
    const t = textoDelAviso(proponerArreglo("wasaco", [trato()], WASACO)!, "WASACO", HOY);
    /* El separador de miles depende del ICU (punto aquí, coma o espacio en el navegador). */
    expect(t.titulo).toMatch(
      /^El trato de WASACO empieza el lunes 14\/09 y 6 corridas son del lunes 07\/09: quedaron sin precio \(3[.,\s\u00a0]?238[.,]90 PT\)\.$/,
    );
    expect(t.boton).toBe("Empezar el trato el 07/09");
    expect(t.detalle).toMatch(/S\/\s?1[.,\s]?619[.,]4[5-9]/);
  });

  it("varios días: «de antes (del … al …)»; otro año lleva el año en el botón", () => {
    const a = proponerArreglo("wasaco", [trato({ vigenteDesde: "2025-01-10" })], [
      corrida({ id: "a", fecha: "2024-12-16" }),
      corrida({ id: "b", fecha: "2024-12-20" }),
    ])!;
    const t = textoDelAviso(a, "QA", HOY);
    expect(t.titulo).toContain("de antes (del 16/12/2024 al 20/12/2024)");
    expect(t.boton).toBe("Empezar el trato el 16/12/2024");
  });

  it("sin adelanto: dice que se declaró antes de pactar y el botón cobra el monto", () => {
    const t = textoDelAviso(proponerArreglo("wasaco", [trato()], [corrida({ id: "a", fecha: "2026-09-15" })])!, "WASACO", HOY);
    expect(t.titulo).toContain("quedó sin cobrar aunque su trato ya regía");
    expect(t.boton).toMatch(/^Cobrar S\/\s?50[.,]00 con el trato$/);
  });

  it("lo que cambia con la planta se dice con signo", () => {
    const a = proponerArreglo("wasaco", [trato()], [
      corrida({ id: "sin" }),
      corrida({ id: "planta", fecha: "2026-09-10", importeActual: 30, importeConTrato: 50 }),
    ])!;
    expect(textoDelAviso(a, "WASACO", HOY).detalle).toMatch(/Una corrida ya cobrada con la tarifa de la planta pasa al trato: \+S\/\s?20[.,]00\./);
  });
});

describe("cuantoSubio (lo que el servidor HIZO)", () => {
  it("lo creado entero y lo recotizado sólo por su diferencia; lo que no se cobró no suma", () => {
    const arreglo = proponerArreglo("wasaco", [trato()], [
      corrida({ id: "sin", importeConTrato: 66.71 }),
      corrida({ id: "planta", fecha: "2026-09-10", importeActual: 23.35, importeConTrato: 33.35 }),
      corrida({ id: "falla", importeConTrato: 10 }),
    ]);
    const r: ResultadoDelArreglo = {
      parteNombre: "WASACO",
      movio: { tarifaId: "tc-14", de: "2026-09-14", a: "2026-09-07" },
      arreglo,
      cobro: {
        resultados: [
          { id: "sin", lineNo: 1, cobrado: true, importe: 66.71, parteNombre: "WASACO", motivo: null, accion: "crear" },
          { id: "planta", lineNo: 2, cobrado: true, importe: 33.35, parteNombre: "WASACO", motivo: null, accion: "actualizar" },
          { id: "falla", lineNo: 3, cobrado: false, importe: null, parteNombre: null, motivo: "x", accion: "nada" },
        ],
        resumen: { cobradas: 2, importeTotal: 100.06, sinCambio: 0, sinCobrar: 1, dadasDeBaja: 0, importeDadoDeBaja: 0 },
      },
    };
    expect(cuantoSubio(r)).toBe(76.71);
  });
});

// ── Revisión 23-09 (revisor + seguridad) ────────────────────────────────────

/** Un resultado del POST con las filas que devolvió `cobrarTanda`. */
const resultado = (filas: ResultadoDeTanda[], arreglo: ResultadoDelArreglo["arreglo"] = null): ResultadoDelArreglo => ({
  parteNombre: "WASACO",
  movio: { tarifaId: "tc-14", de: "2026-09-14", a: "2026-09-07" },
  arreglo,
  cobro: {
    resultados: filas,
    resumen: {
      cobradas: filas.filter((f) => f.cobrado && !f.sinCambio).length,
      importeTotal: 0,
      sinCambio: filas.filter((f) => f.sinCambio).length,
      sinCobrar: filas.filter((f) => !f.cobrado).length,
      dadasDeBaja: 0,
      importeDadoDeBaja: 0,
    },
  },
});
const fila = (p: Partial<ResultadoDeTanda> & { id: string }): ResultadoDeTanda => ({
  lineNo: 30,
  cobrado: true,
  importe: 50,
  parteNombre: "WASACO",
  motivo: null,
  accion: "crear",
  ...p,
});

describe("#6 — un POST sin `desde` no manda a cobrar corridas de antes del trato (seguridad P3)", () => {
  it("`sinMover`: sólo lo que el trato ya cubre; lo de antes queda fuera y se cuenta", () => {
    const a = proponerArreglo(
      "wasaco",
      [trato()],
      [corrida({ id: "antes", fecha: "2026-09-07" }), corrida({ id: "dentro", fecha: "2026-09-15" })],
      { sinMover: true },
    );
    expect(a?.mover).toBeNull();
    expect(a?.corte).toBe("2026-09-14");
    expect(idsACobrar(a!)).toEqual(["dentro"]);
    expect(a?.quedanAntes).toBe(1);
  });

  it("`sinMover` con TODO antes del trato: no hay nada que cobrar", () => {
    expect(proponerArreglo("wasaco", [trato()], WASACO, { sinMover: true })).toBeNull();
  });
});

describe("#5 — las cobradas con la planta DENTRO del trato también pasan a él", () => {
  it("un trato pactado después de cobrar con la planta: sin mover, se recotizan", () => {
    const a = proponerArreglo("wasaco", [trato()], [
      corrida({ id: "planta", fecha: "2026-09-16", importeActual: 30, importeConTrato: 50 }),
      /* Cobrada con el trato: corregir el trato no recotiza lo cobrado con él. */
      corrida({ id: "con-trato", fecha: "2026-09-17", importeActual: 40, importeConTrato: 50, cobradaConTrato: "tc-14" }),
    ]);
    expect(a?.mover).toBeNull();
    expect(a?.cambian.map((c) => c.id)).toEqual(["planta"]);
    expect(a?.diferencia).toBe(20);
  });

  it("tratoDelDetalle lee el `clienteTarifaId` de la cotización guardada", () => {
    expect(tratoDelDetalle({ clienteTarifaId: "tc-14", importe: 3 })).toBe("tc-14");
    expect(tratoDelDetalle({ clienteTarifaId: null })).toBeNull();
    expect(tratoDelDetalle(null)).toBeNull();
    expect(tratoDelDetalle({ versionId: "v1" })).toBeNull();
  });
});

describe("#3 — lo creado y lo recotizado van aparte, con su signo real", () => {
  const cambian = [
    { id: "c1", lineNo: 1, fecha: "2026-09-08", especie: null, pt: 100, importeActual: 100, importeConTrato: 60 },
  ];
  it("una recotización que BAJA la deuda se dice «−S/ 40», no «+S/ -40» ni «sin precio»", () => {
    const r = resultado(
      [fila({ id: "c1", importe: 60, accion: "actualizar" })],
      { ...proponerArreglo("wasaco", [trato()], [corrida({ id: "x" })])!, cambian },
    );
    const t = textoDelResultado(r);
    expect(t.cobros).toMatch(/^1 corrida ya cobrada con la tarifa de la planta pasó al trato \(−S\/\s?40\.00\)$/);
    expect(t.cobros).not.toMatch(/sin precio|\+S\/\s?-/);
    expect(t.cuenta).toMatch(/^la cuenta de WASACO bajó S\/\s?40\.00$/);
    expect(cuantoSubio(r)).toBe(-40);
  });

  it("creadas y recotizadas juntas: cada una con su parte; la cuenta dice el neto", () => {
    const r = resultado(
      [fila({ id: "n1", importe: 50 }), fila({ id: "c1", importe: 60, accion: "actualizar", importeAnterior: 100 })],
    );
    const s = resumenDelResultado(r);
    expect(s).toMatchObject({ creadas: 1, importeCreado: 50, recotizadas: 1, diferencia: -40, total: 10 });
    const t = textoDelResultado(r);
    expect(t.cobros).toMatch(/^se cobró 1 corrida que había quedado sin precio \(\+S\/\s?50\.00\) y 1 corrida ya cobrada/);
    expect(t.cuenta).toMatch(/subió S\/\s?10\.00$/);
  });

  it("el importe de antes lo dice el servidor (leído con el lock), no el aviso", () => {
    const r = resultado([fila({ id: "c1", importe: 60, accion: "actualizar", importeAnterior: 55 })], {
      ...proponerArreglo("wasaco", [trato()], [corrida({ id: "x" })])!,
      cambian,
    });
    expect(cuantoSubio(r)).toBe(5);
  });

  it("una actualización al MISMO importe (reintento, dos pestañas) no es un cobro", () => {
    const r = resultado([fila({ id: "c1", importe: 53.37, accion: "actualizar", importeAnterior: 53.37, sinCambio: true })]);
    expect(resumenDelResultado(r)).toMatchObject({ creadas: 0, recotizadas: 0, total: 0 });
    expect(textoDelResultado(r)).toEqual({ cobros: null, cuenta: "la cuenta de WASACO no cambió" });
  });
});

describe("#1 — la línea dice cuánto y qué ANTES del clic (misma propuesta que cobra el POST)", () => {
  const HOY = "2026-09-23";

  it("WASACO con la fecha de la producción: corridas, PT y el S/ del aviso de la ficha", () => {
    const a = proponerArreglo("wasaco", [trato()], WASACO, { desde: "2026-09-07" })!;
    const t = textoDelAdelanto(a, HOY);
    expect(t).toMatch(/^Si lo adelantas, también entran 6 corridas ya declaradas \(3[.,\s]?238[.,]90 PT\)\. /);
    /* El S/ sale de la MISMA oración que la ficha (`textoDelAviso().detalle`). */
    expect(t).toContain(textoDelAviso(proponerArreglo("wasaco", [trato()], WASACO)!, "WASACO", HOY).detalle);
  });

  it("sin nada más que cobrar lo dice; y lo más viejo que la fecha pedida, también", () => {
    expect(textoDelAdelanto(null, HOY)).toBe(
      "No hay otras corridas suyas sin cobrar desde ese día: adelantarlo no carga nada más.",
    );
    const a = proponerArreglo("wasaco", [trato()], [corrida({ id: "vieja", fecha: "2026-09-03" })], { desde: "2026-09-07" });
    expect(a?.quedanAntes).toBe(1);
    expect(textoDelAdelanto(a, HOY)).toMatch(/Una corrida de antes del 07\/09 sigue sin precio: el trato no la alcanza\.$/);
  });

  it("sólo recotiza: el texto no inventa corridas sin cobrar", () => {
    const a = proponerArreglo("wasaco", [trato()], [corrida({ id: "p", fecha: "2026-09-08", importeActual: 30, importeConTrato: 50 })], {
      desde: "2026-09-07",
    })!;
    expect(textoDelAdelanto(a, HOY)).toBe("Al adelantarlo, una corrida ya cobrada con la tarifa de la planta pasa al trato: +S/ 20.00.");
  });

  it("el GET acepta `desde` sólo como fecha real", () => {
    expect(propuestaTratoQuerySchema.safeParse({ parteId: "p", desde: "2026-09-07" }).success).toBe(true);
    expect(propuestaTratoQuerySchema.safeParse({ parteId: "p", desde: null }).success).toBe(true);
    expect(propuestaTratoQuerySchema.safeParse({ parteId: "p", desde: "2026-02-31" }).success).toBe(false);
    expect(propuestaTratoQuerySchema.safeParse({ parteId: "", desde: null }).success).toBe(false);
  });
});

describe("el aviso de la ficha cuando sólo hay cobradas con la planta", () => {
  it("no dice «0 corridas sin cobrar» ni ofrece «Cobrar S/ 0.00»", () => {
    const a = proponerArreglo("wasaco", [trato()], [corrida({ id: "p", fecha: "2026-09-16", importeActual: 30, importeConTrato: 50 })])!;
    const t = textoDelAviso(a, "WASACO", "2026-09-23");
    expect(t.titulo).toBe("1 corrida de WASACO se cobró con la tarifa de la planta aunque su trato ya regía.");
    expect(t.boton).toBe("Pasar la corrida al trato");
    expect(t.detalle).not.toMatch(/S\/\s?0\.00/);
  });
});

describe("#10 — no se ofrece adelantar un trato que no pone precio a esta madera", () => {
  const bloque = (especie: string) => ({ etiqueta: "PQ-1", especie, volumenM3: 0.5, pt: 212 });
  it("un trato sólo por especie cubre esa especie y nada más; un global cubre todo", () => {
    const soloTornillo = trato({ basePt: null, especies: [{ clave: "tornillo", nombre: "Tornillo", precioPt: 0.5 }] });
    expect(tratoCubre(soloTornillo, [bloque("Cumala")], [])).toBe(false);
    expect(tratoCubre(soloTornillo, [bloque("Cumala"), bloque("Tornillo")], [])).toBe(true);
    expect(tratoCubre(trato(), [bloque("Cumala")], [])).toBe(true);
    /* Sin bloques todavía no se sabe qué se declara: no se esconde. */
    expect(tratoCubre(soloTornillo, [], [])).toBe(true);
  });
});
