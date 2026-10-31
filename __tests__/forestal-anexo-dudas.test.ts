/**
 * ADR-446 · revisión 26-10 — lo que «Guías sin registrar» NO decide solo:
 * dos papeles en una guía, el mismo papel en dos guías, huecos del talonario
 * y las confirmaciones guía por guía (decisiones 5, 8 y 9).
 *
 * El caso 065/066 copia lo medido en Blas el 26-10 (READ ONLY): la 065 con un
 * anexo del 04/10 de 11 especies y otro del 20/10 sólo de Tornillo, y ese
 * mismo papel del 20/10 guardado también con la 066. Acá es sintético (las
 * piezas son otras); las reglas son las mismas.
 */
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/adr446-blas-anexos-y-corridas.json";
import {
  claveStockPorDefecto,
  clasificarAnexos,
  confirmacionesDe,
  faltaConfirmar,
  gruposDelAnexo,
  proponerDespachoDeAnexo,
  proponerTanda,
  redondearA3,
  type AnexoParaDespacho,
  type CorridaOrigen,
  type EstadoDelLibro,
} from "@/lib/forestal/anexo-a-despacho";
import {
  HUECO_MAX,
  bloqueosPorDuda,
  dudasDeAnexos,
  firmaDelPapel,
  huecosDelTalonario,
  tipoDePregunta,
} from "@/lib/forestal/anexo-dudas";
import { claveNumeroGtf } from "@/lib/forestal/gtf-talonario";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";

type FilaPieza = [number, number, number, number, string | null, number, number];
type FilaPaquete = [string, string, string | null, string | null, number, number, boolean];

const anexosBlas: AnexoParaDespacho[] = fixture.anexos.map((a) => ({
  id: a.id,
  numero: a.numero,
  gtf: a.gtf,
  fecha: a.fecha,
  createdAt: a.createdAt,
  totalM3: a.totalM3,
  totalManualM3: a.totalManualM3,
  especieGlobal: a.especieGlobal ?? undefined,
  ctpEntryId: a.ctpEntryId ?? undefined,
  piezas: (a.piezas as FilaPieza[]).map(
    ([cantidad, espesor, ancho, largo, especie, m3, pieTablar], i): PiezaCubicada => ({
      id: `f${i}`,
      cantidad, espesor, ancho, largo,
      uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
      especie: especie ?? undefined,
      m3, pieTablar,
    }),
  ),
}));

const corridasBlas: CorridaOrigen[] = fixture.corridas.map((c) => ({
  id: c.id,
  lineNo: c.lineNo,
  fecha: c.fecha,
  especie: c.especie,
  producto: c.producto,
  presentacion: null,
  unidad: c.unidad,
  disponibleM3: c.disponibleM3,
  usado: c.usado,
  sinOrigen: c.sinOrigen,
  duenoMadera: c.duenoMadera,
  titularNombre: c.titularNombre,
  paquetes: (c.paquetes as FilaPaquete[]).map(([id, codigo, producto, presentacion, cantidad, volumenM3, conMedidas]) => ({
    id, codigo, producto, presentacion, cantidad, volumenM3, conMedidas, despachado: false, apartado: false,
  })),
  salidoSinPaquete: [],
}));

function estadoDe(corridas: CorridaOrigen[]): EstadoDelLibro {
  const stock: Record<string, number> = {};
  for (const c of corridas) {
    const k = claveStockPorDefecto(c.producto, c.especie);
    stock[k] = (stock[k] ?? 0) + c.disponibleM3;
  }
  return { corridas, stock };
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

const fila = (cantidad: number, e: number, a: number, l: number, especie: string): PiezaCubicada => {
  const base = { cantidad, espesor: e, ancho: a, largo: l, uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const };
  return { id: `p${cantidad}${e}${a}${l}${especie}`, ...base, especie, ...cubicarPieza(base) };
};
const papel = (id: string, gtf: string, fecha: string, piezas: PiezaCubicada[], hora = "10:00"): AnexoParaDespacho => ({
  id, numero: id.toUpperCase(), gtf, fecha, createdAt: `${fecha}T${hora}:00.000Z`, totalM3: 0, piezas,
});

const G65 = "19-001-0000065";
const G66 = "19-001-0000066";
const K65 = claveNumeroGtf(G65)!;
const K66 = claveNumeroGtf(G66)!;
const TORNILLO = [fila(100, 1, 6, 8, "Tornillo")];
/** El del 04/10: varias especies. */
const A = papel("a65-04", G65, "2026-10-04", [fila(80, 1, 6, 8, "Tornillo"), fila(40, 2, 6, 10, "Copal"), fila(30, 1, 8, 8, "Cumala")]);
/** El del 20/10: sólo Tornillo… */
const B = papel("a65-20", G65, "2026-10-20", TORNILLO);
/** …y el mismo papel guardado con la 066. */
const C = papel("a66", G66, "2026-10-20", TORNILLO, "11:00");

const [grupoTornillo] = gruposDelAnexo(B);
const corridaTornillo = (over: Partial<CorridaOrigen> = {}): CorridaOrigen => ({
  id: "c-torn", lineNo: 7, fecha: "2026-08-01", especie: "Tornillo", producto: grupoTornillo.producto, presentacion: null,
  unidad: "m3", disponibleM3: r4(grupoTornillo.m3 + 0.1), usado: false, sinOrigen: false, duenoMadera: null,
  titularNombre: null, paquetes: [], salidoSinPaquete: [], ...over,
});

describe("redondearA3", () => {
  it("cada grupo a 3 decimales y la suma igual a la del papel redondeado", () => {
    const v = [1.0004, 1.0004, 1.0004];
    const r = redondearA3(v);
    expect(r.every((x) => Math.abs(x * 1000 - Math.round(x * 1000)) < 1e-9)).toBe(true);
    expect(r4(r.reduce((a, b) => a + b, 0))).toBe(3.001);
  });

  it("3,6882 de Copal es 3,688: lo que dice el papel, sin la cola de 4 decimales", () => {
    expect(redondearA3([3.6882])).toEqual([3.688]);
    expect(redondearA3([3.688])).toEqual([3.688]);
    expect(redondearA3([])).toEqual([]);
  });
});

describe("las dudas con los anexos de Blas del 28-09", () => {
  it("ninguna duda: la 064 con dos papeles de las mismas especies es una corrección (decisión 1)", () => {
    expect(dudasDeAnexos(anexosBlas, new Set())).toEqual([]);
    const la064 = anexosBlas.filter((a) => a.gtf === "19-001-0000064");
    expect(la064).toHaveLength(2);
    expect(firmaDelPapel(la064[0])).not.toBe(firmaDelPapel(la064[1]));
    expect(dudasDeAnexos(la064, new Set())).toEqual([]);
  });

  it("el talonario tiene dos huecos dentro del tramo: 059 y 061", () => {
    const pendientes = clasificarAnexos(anexosBlas, new Set()).pendientes.map((a) => a.gtf);
    const huecos = huecosDelTalonario([], pendientes);
    expect(huecos.map((h) => h.numero)).toEqual(["19-001-0000059", "19-001-0000061"]);
    expect(huecos[0].entre).toEqual(["19-001-0000058", "19-001-0000060"]);
    expect(huecos.every((h) => h.respuesta === null && tipoDePregunta(h.clave) === "hueco")).toBe(true);
  });
});

describe("dos papeles en la 065 y el mismo papel en la 066", () => {
  it("la 065 pregunta cuál viajó y sugiere el que no está repetido en otra guía", () => {
    const dudas = dudasDeAnexos([A, B, C], new Set());
    expect(dudas).toHaveLength(1);
    const [d] = dudas;
    expect(d).toMatchObject({ tipo: "dos_papeles", clave: `guia:${K65}`, guias: [K65] });
    expect(d.porQue).toContain(G66);
    const sugerida = d.opciones.find((o) => o.sugerida)!;
    expect(sugerida.accion).toEqual({ tipo: "elegir", vale: A.id, descartar: [B.id] });
    expect(d.anexos.find((x) => x.anexoId === B.id)!.tambienEn).toEqual([G66]);
    expect(d.anexos.find((x) => x.anexoId === A.id)!.especies).toBe("3 especies");
  });

  it("sin papel repetido sugiere el más reciente, pero igual pregunta", () => {
    const [d] = dudasDeAnexos([A, B], new Set());
    expect(d.tipo).toBe("dos_papeles");
    expect(d.opciones.find((o) => o.sugerida)!.clave).toBe(`vale:${B.id}`);
    expect(d.porQue).toContain("más reciente");
  });

  it("la guía en duda no se registra ni consume: la 066 toma el Tornillo que alcanza para una sola", () => {
    const estado = estadoDe([corridaTornillo()]);
    const { pendientes } = clasificarAnexos([A, B, C], new Set());
    expect(pendientes.map((a) => a.id)).toEqual([B.id, C.id]);

    const sinRevision = proponerTanda(pendientes, estado);
    expect(sinRevision.guias.map((g) => g.registrable)).toEqual([true, false]);

    const bloqueos = bloqueosPorDuda(dudasDeAnexos([A, B, C], new Set()));
    expect([...bloqueos.keys()]).toEqual([K65]);
    const enDuda = new Map(pendientes.filter((a) => bloqueos.has(claveNumeroGtf(a.gtf)!)).map((a) => [a.id, bloqueos.get(claveNumeroGtf(a.gtf)!)!]));
    const t = proponerTanda(pendientes, estado, { enDuda });
    expect(t.guias[0].registrable).toBe(false);
    expect(t.guias[0].bloqueos[0].codigo).toBe("ANEXO_EN_DUDA");
    expect(t.guias[1].registrable).toBe(true);
    expect(t.guias[1].atribuidoM3).toBeCloseTo(grupoTornillo.m3, 4);
  });

  it("elige el del 04/10: la duda se va y la 065 lleva sus 3 especies", () => {
    const anexos = [A, { ...B, reemplazadoPor: A.id }, C];
    expect(dudasDeAnexos(anexos, new Set())).toEqual([]);
    const cl = clasificarAnexos(anexos, new Set());
    expect(cl.pendientes.map((a) => a.id)).toEqual([A.id, C.id]);
    expect(cl.reemplazados).toEqual([expect.objectContaining({ anexoId: B.id, por: A.id, marcado: true })]);
  });

  it("elige el del 20/10: aparece la pregunta del mismo papel en la 065 y la 066", () => {
    const anexos = [{ ...A, reemplazadoPor: B.id }, B, C];
    const [d] = dudasDeAnexos(anexos, new Set());
    expect(d.tipo).toBe("mismo_papel");
    expect(d.guias.sort()).toEqual([K65, K66].sort());
    expect(d.opciones.map((o) => o.clave)).toEqual([`quitar:${K65}`, `quitar:${K66}`, "distintas"]);
    expect(d.opciones.every((o) => !o.sugerida)).toBe(true);
    expect(d.opciones[1].accion).toEqual({ tipo: "quitar", anexoIds: [C.id], por: B.id });
    expect(tipoDePregunta(d.clave)).toBe("papel");
    expect([...bloqueosPorDuda([d]).values()][0]).toContain(G66);

    /* «Salieron dos veces» queda contestado y no vuelve. */
    expect(dudasDeAnexos(anexos, new Set(), { [d.clave]: "distintas" })).toEqual([]);

    /* «No es de la 066»: la 066 deja de tener salida propia y dice de qué guía es el papel. */
    const sin066 = [...anexos.slice(0, 2), { ...C, reemplazadoPor: B.id }];
    expect(dudasDeAnexos(sin066, new Set())).toEqual([]);
    const cl = clasificarAnexos(sin066, new Set());
    expect(cl.pendientes.map((a) => a.id)).toEqual([B.id]);
    expect(cl.reemplazados.find((x) => x.anexoId === C.id)).toMatchObject({ por: B.id, porGtf: G65, marcado: true });
  });

  it("si una ya está registrada, la pregunta sigue para la que falta y propone dejarlo en la registrada", () => {
    const anexos = [{ ...A, reemplazadoPor: B.id }, { ...B, despachoIds: ["d65"] }, C];
    const [d] = dudasDeAnexos(anexos, new Set(["d65"]));
    expect(d.tipo).toBe("mismo_papel");
    expect(d.guias).toEqual([K66]);
    expect(d.opciones[0].accion).toEqual({ tipo: "quitar", anexoIds: [C.id], por: B.id });
  });
});

describe("huecos del talonario (decisión 9)", () => {
  const pend = ["19-001-0000058", "19-001-0000060"];

  it("un número gastado (también en un despacho anulado) no es hueco", () => {
    expect(huecosDelTalonario(["19-001-0000059"], pend)).toEqual([]);
  });

  it("la respuesta guardada vuelve con el hueco", () => {
    const [h] = huecosDelTalonario([], pend);
    const [conRespuesta] = huecosDelTalonario([], pend, { [h.clave]: "no_salio" });
    expect(conRespuesta).toMatchObject({ numero: "19-001-0000059", respuesta: "no_salio" });
  });

  it(`más de ${HUECO_MAX} seguidos es otro tramo, y fuera de las pendientes no se pregunta`, () => {
    expect(huecosDelTalonario([], ["19-001-0000010", "19-001-0000020"])).toEqual([]);
    expect(huecosDelTalonario(["19-001-0000001", "19-001-0000003"], ["19-001-0000005", "19-001-0000006"])).toEqual([]);
    expect(huecosDelTalonario([], ["19-001-0000005", "19-002-0000007"])).toEqual([]);
  });
});

describe("confirmaciones guía por guía (decisiones 5 y 8)", () => {
  it("toma de una corrida «usado»: pide confirmarlo y con la confirmación pasa", () => {
    const p = proponerDespachoDeAnexo(B, estadoDe([corridaTornillo({ usado: true })]));
    expect(p.registrable).toBe(true);
    expect(confirmacionesDe(p)).toEqual(["usado"]);
    const [b] = faltaConfirmar(p);
    expect(b.codigo).toBe("FALTA_CONFIRMAR_USADO");
    expect(b.mensaje).toContain("la corrida N° 7 del 01/08/2026");
    expect(faltaConfirmar(p, { usadas: ["c-torn"] })).toEqual([]);
  });

  it("confirmar una corrida «usado» no vale para OTRA que aparezca después", () => {
    const p = proponerDespachoDeAnexo(B, estadoDe([corridaTornillo({ usado: true, id: "c-otra" })]));
    const [b] = faltaConfirmar(p, { usadas: ["c-torn"] });
    expect(b.codigo).toBe("FALTA_CONFIRMAR_USADO");
    expect(b.mensaje).toContain("no estaba cuando confirmaste");
  });

  it("de una corrida normal no pide nada", () => {
    const p = proponerDespachoDeAnexo(B, estadoDe([corridaTornillo()]));
    expect(confirmacionesDe(p)).toEqual([]);
    expect(faltaConfirmar(p)).toEqual([]);
  });

  it("en Blas, la que va con m³ sin corrida pide «sin origen» y la del 1/08 pide «usado»", () => {
    const t = proponerTanda(clasificarAnexos(anexosBlas, new Set()).pendientes, estadoDe(corridasBlas));
    const sinOrigen = t.guias.find((g) => g.registrable && g.sinOrigenPorConfirmar)!;
    expect(sinOrigen).toBeDefined();
    const b = faltaConfirmar(sinOrigen).find((x) => x.codigo === "FALTA_CONFIRMAR_SIN_ORIGEN")!;
    expect(b.m3).toBe(sinOrigen.sinOrigenM3);
    expect(faltaConfirmar(sinOrigen, { sinOrigenM3: sinOrigen.sinOrigenM3, usadas: sinOrigen.usadasComoOrigen.map((u) => u.corridaId) })).toEqual([]);
    const la054 = t.guias.find((g) => g.gtf.endsWith("054"))!;
    expect(confirmacionesDe(la054)).toContain("usado");
  });
});

describe("producción que falta para registrar todas", () => {
  const pendientes = clasificarAnexos(anexosBlas, new Set()).pendientes;
  const la064 = pendientes.find((a) => a.gtf.endsWith("064"))!;

  it("Azúcar huayo: ≈0,92 m³ de la 064, fechada ese día o antes", () => {
    const t = proponerTanda(pendientes, estadoDe(corridasBlas));
    const az = t.faltaProduccion.find((f) => f.especie.toLowerCase().startsWith("az"))!;
    expect(az.faltaM3).toBeCloseTo(0.92, 2);
    expect(az.stockM3).toBe(0);
    expect(az.guias).toEqual([la064.gtf]);
    expect(az.fechaTope).toBe(la064.fecha);
  });

  it("una guía en duda no cuenta en lo que falta", () => {
    const t = proponerTanda(pendientes, estadoDe(corridasBlas), { enDuda: new Map([[la064.id, "duda"]]) });
    expect(t.faltaProduccion.some((f) => f.guias.includes(la064.gtf))).toBe(false);
  });
});
