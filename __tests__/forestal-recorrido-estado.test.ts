/**
 * `derivarRecorrido` (ADR-519, fase 2): el estado del Recorrido del permiso
 * sale del Libro, paso por paso. Se fija cada paso, el `siguiente`, el plazo
 * de registro de la salida (con el predicado de `ctp-compliance`) y el
 * rendimiento real contra el sugerido. Un día que la propuesta cuenta y el
 * Libro no (su madera salió con «Completar») se nombra, no se cuenta.
 */
import { describe, expect, it } from "vitest";
import {
  derivarRecorrido,
  faltanDiasListos,
  jornadasHuerfanas,
  SIN_ASERRADA,
  tomadosPorOtros,
  venceElRegistro,
  type DatosDelRecorrido,
} from "@/lib/forestal/recorrido-estado";
import { estaFueraDePlazo } from "@/lib/forestal/ctp-compliance";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";

const PERMISO = "25-UCA/C-J-001-20";

const bloque = (x: Partial<BloqueRolliza> = {}): BloqueRolliza =>
  ({
    id: "b1",
    etiqueta: "B1",
    especie: "Cachimbo",
    m3: 4,
    origen: "trozas",
    trozaIds: ["t1", "t2", "t3"],
    trozasElegidas: ["t1", "t2"],
    dias: 2,
    aprovechablePct: 50,
    permiso: PERMISO,
    fecha: "2026-10-20",
    ...x,
  }) as BloqueRolliza;

const troza = (id: string, x: Partial<DatosDelRecorrido["trozas"][number]> = {}) => ({
  id,
  codigo: id.toUpperCase(),
  volumenM3: 1,
  permiso: PERMISO,
  porRecepcionar: false,
  consumidaEnId: null,
  motivo: null,
  ...x,
});

const datos = (x: Partial<DatosDelRecorrido> = {}): DatosDelRecorrido => ({
  distribucionId: "d1",
  bloque: bloque(),
  trozas: [troza("t1"), troza("t2"), troza("t3")],
  noEncontradas: [],
  lote: undefined,
  anexos: [],
  despachos: [],
  hoy: "2026-10-27",
  ...x,
});

const corrida = (id: string, lineNo: number, x: Record<string, unknown> = {}) => ({
  id,
  lineNo,
  viva: true,
  quantity: 0.5 as number | null,
  volumeInputM3: 1,
  unit: "m3",
  ...x,
});

/** El lote del bloque con t1 en la corrida c1 y t2 en c2 (o libres, según se pida). */
const lote = (consumo: Record<string, string | null>, corridas = [corrida("c1", 31), corrida("c2", 32)]) => ({
  id: "lote-7",
  code: "LA-7",
  status: "en_proceso",
  trozas: ["t1", "t2"].map((id) => ({ id, consumidaEnId: consumo[id] ?? null })),
  corridas,
});

const jornadasLibro = (dias: [number, string, number][]) =>
  dias.map(([dia, corridaId, lineNo]) => ({ dia, corridaId, lineNo, estado: "declarada" as const, fecha: "2026-10-20" }));

const paso = (e: ReturnType<typeof derivarRecorrido>, p: string) => e.pasos.find((x) => x.paso === p)!;

describe("derivarRecorrido · primeros pasos", () => {
  it("bloque recién elegido: datos y trozas hechos, falta el lote; totales sobre las ELEGIDAS", () => {
    const e = derivarRecorrido(datos());
    expect(e.pasos.map((p) => [p.paso, p.estado])).toEqual([
      ["datos", "hecho"],
      ["trozas", "hecho"],
      ["lote", "pendiente"],
      ["jornadas", "pendiente"],
      ["anexo", "pendiente"],
      ["salida", "pendiente"],
    ]);
    expect(e.siguiente).toBe("lote");
    expect(paso(e, "trozas").ids).toEqual(["t1", "t2"]);
    expect(e.rollizaM3).toBe(2);
    /* Ampara 4 × 50 % = 2; las elegidas dan 2 × 50 % = 1: falta 1, se muestra. */
    expect(e.amparadoM3).toBe(2);
    expect(e.sinAtribuirM3).toBe(1);
    expect(e.rendimiento).toEqual({ sugeridoPct: 50, realPct: null });
    expect(e.plazo).toBeNull();
  });

  it("lo amparado de la pantalla manda sobre la capacidad", () => {
    expect(derivarRecorrido(datos({ usadoM3: 1.5 })).sinAtribuirM3).toBe(0.5);
  });

  it("datos con problema: troza que ya no existe, guía sin recibir, permisos distintos, sin permiso", () => {
    expect(paso(derivarRecorrido(datos({ noEncontradas: ["t9"] })), "datos")).toMatchObject({ estado: "con_problema", code: "TROZA_NO_ENCONTRADA" });
    const sinRecibir = derivarRecorrido(datos({ trozas: [troza("t1", { porRecepcionar: true, motivo: "su guía no está recibida" }), troza("t2")] }));
    expect(paso(sinRecibir, "datos")).toMatchObject({ estado: "con_problema", code: "GUIA_SIN_RECIBIR", ids: ["t1"] });
    expect(sinRecibir.siguiente).toBe("datos");
    const dos = derivarRecorrido(datos({ bloque: bloque({ permiso: null }), trozas: [troza("t1"), troza("t2", { permiso: "OTRO-1" })] }));
    expect(paso(dos, "datos").code).toBe("PERMISO_DISTINTO");
    const ninguno = derivarRecorrido(datos({ bloque: bloque({ permiso: null }), trozas: [troza("t1", { permiso: null }), troza("t2", { permiso: null })] }));
    expect(paso(ninguno, "datos").code).toBe("SIN_PERMISO");
    expect(ninguno.permiso).toBeNull();
  });

  it("sin permiso en el bloque, toma el único de sus trozas", () => {
    expect(derivarRecorrido(datos({ bloque: bloque({ permiso: null }) })).permiso).toBe(PERMISO);
  });

  it("trozas: sin elegir → pendiente; una elegida que se fue a otro lote → con problema", () => {
    expect(paso(derivarRecorrido(datos({ bloque: bloque({ trozasElegidas: null }) })), "trozas").estado).toBe("pendiente");
    const ida = derivarRecorrido(datos({ trozas: [troza("t1", { motivo: "está en el lote LA-9" }), troza("t2")] }));
    expect(paso(ida, "trozas")).toMatchObject({ estado: "con_problema", code: "TROZA_NO_DISPONIBLE", ids: ["t1"] });
  });

  it("lote: el de `loteId` vivo; borrado o anulado → con problema", () => {
    expect(paso(derivarRecorrido(datos({ bloque: bloque({ loteId: "lote-7" }), lote: null })), "lote").code).toBe("LOTE_NO_ENCONTRADO");
    expect(paso(derivarRecorrido(datos({ lote: { ...lote({}), status: "anulado" } })), "lote").estado).toBe("con_problema");
    const e = derivarRecorrido(datos({ lote: lote({}, []) }));
    expect(paso(e, "lote")).toMatchObject({ estado: "hecho", ids: ["lote-7"] });
    expect(e.siguiente).toBe("jornadas");
  });
});

describe("derivarRecorrido · jornadas (lo dice el Libro)", () => {
  it("los dos días con corrida viva y declarada → hecho; rendimiento real = producido ÷ rolliza consumida", () => {
    const e = derivarRecorrido(
      datos({ bloque: bloque({ jornadasLibro: jornadasLibro([[1, "c1", 31], [2, "c2", 32]]) }), lote: lote({ t1: "c1", t2: "c2" }) }),
    );
    expect(paso(e, "jornadas")).toMatchObject({ estado: "hecho", ids: ["c1", "c2"] });
    expect(e.producidoM3).toBe(1);
    expect(e.producidoPt).toBe(424);
    expect(e.rendimiento).toEqual({ sugeridoPct: 50, realPct: 50 });
    expect(e.siguiente).toBe("anexo");
  });

  it("corrida abierta (consumió y falta declarar) → con problema con su N°", () => {
    const e = derivarRecorrido(
      datos({
        bloque: bloque({ jornadasLibro: jornadasLibro([[1, "c1", 31]]) }),
        lote: lote({ t1: "c1" }, [corrida("c1", 31, { quantity: null })]),
      }),
    );
    expect(paso(e, "jornadas")).toMatchObject({ estado: "con_problema", code: "CORRIDA_ABIERTA" });
    expect(paso(e, "jornadas").motivo).toContain("N° 31");
  });

  it("1 de 2 días y quedan trozas libres → pendiente", () => {
    const e = derivarRecorrido(datos({ bloque: bloque({ jornadasLibro: jornadasLibro([[1, "c1", 31]]) }), lote: lote({ t1: "c1" }) }));
    expect(paso(e, "jornadas")).toMatchObject({ estado: "pendiente", detalle: "1 de 2 días en el Libro" });
  });

  it("un día que salió con «Completar» no se cuenta como jornada, pero se nombra (aviso del carril 1)", () => {
    const e = derivarRecorrido(
      datos({
        bloque: bloque({
          jornadasLibro: jornadasLibro([[1, "c1", 31]]),
          complementos: [{ linea: "LPC", corridaId: "c2", lineNo: 32, claves: ["tipo:viga"], m3: 0.5, fecha: "2026-10-21" }],
        }),
        lote: lote({ t1: "c1", t2: "c2" }),
      }),
    );
    expect(paso(e, "jornadas").estado).toBe("hecho");
    expect(paso(e, "jornadas").ids).toEqual(["c1"]);
    expect(paso(e, "jornadas").detalle).toContain("1 de 2 días en el Libro · 1 con «Completar»");
    expect(paso(e, "jornadas").detalle).toContain("1 día no se registra");
    /* La producción del complemento sí suma: es madera de este bloque. */
    expect(e.producidoM3).toBe(1);
  });

  it("una corrida anulada no cuenta: el día vuelve a faltar", () => {
    const e = derivarRecorrido(
      datos({
        bloque: bloque({ jornadasLibro: jornadasLibro([[1, "c1", 31], [2, "c2", 32]]) }),
        lote: lote({ t1: "c1" }, [corrida("c1", 31), corrida("c2", 32, { viva: false })]),
      }),
    );
    expect(paso(e, "jornadas")).toMatchObject({ estado: "pendiente", ids: ["c1"] });
    expect(e.producidoM3).toBe(0.5);
  });

  it("madera ya aserrada: jornadas no aplica y no hay rendimiento", () => {
    const e = derivarRecorrido(datos({ bloque: bloque({ tipo: "aserrada" }), lote: lote({}, []) }));
    expect(paso(e, "jornadas").estado).toBe("no_aplica");
    expect(e.rendimiento).toBeNull();
    expect(e.sinAtribuirM3).toBe(0);
  });
});

describe("derivarRecorrido · anexo, salida y plazo", () => {
  const hecho = () => ({ bloque: bloque({ jornadasLibro: jornadasLibro([[1, "c1", 31], [2, "c2", 32]]) }), lote: lote({ t1: "c1", t2: "c2" }) });
  const anexo = (x: Record<string, unknown> = {}) => ({
    id: "ax1",
    numero: "0012",
    gtf: "GTF-77",
    fecha: "2026-10-26",
    permiso: ` ${PERMISO.toLowerCase()} `,
    especieGlobal: "Cachimbo",
    despachoIds: ["dsp1"],
    ...x,
  });
  const despacho = (x: Record<string, unknown> = {}) => ({
    id: "dsp1",
    gtfNumber: "GTF-77",
    status: "registrado",
    entryDate: new Date("2026-10-26T12:00:00.000Z"),
    ...x,
  });

  it("anexo del permiso (normalizado) y salida con guía → recorrido completo y SIN aviso de plazo (ya está en el Libro)", () => {
    const e = derivarRecorrido(datos({ ...hecho(), anexos: [anexo()], despachos: [despacho()] }));
    expect(paso(e, "anexo")).toMatchObject({ estado: "hecho", ids: ["ax1"] });
    expect(paso(e, "salida")).toMatchObject({ estado: "hecho", ids: ["dsp1"], detalle: "GTF GTF-77" });
    expect(e.siguiente).toBeNull();
    /* La prueba del 27-10: 6/6 y seguía «Registrar hoy: vence el jueves 29-10». */
    expect(e.plazo).toBeNull();
  });

  /* El plazo viene de la lista única del servidor (`salidasPorRegistrar`), no de una cuenta propia. */
  const pend = (x: Record<string, unknown> = {}) => ({ anexoId: "ax1", numero: "0012", gtfNumber: "GTF-77", venceEl: "2026-10-28", fueraDePlazo: false, ...x });

  it("anexo emitido y su salida todavía sin registrar → avisa el plazo desde la fecha de la guía", () => {
    const e = derivarRecorrido(datos({ ...hecho(), anexos: [anexo({ despachoIds: [] })], despachos: [], salidasPendientes: [pend()] }));
    expect(paso(e, "salida").estado).toBe("pendiente");
    /* Lunes 26 → vence el miércoles 28 (2 días hábiles). */
    expect(e.plazo).toEqual({ anexoId: "ax1", gtfNumber: "GTF-77", venceEl: "2026-10-28" });
    /* Citada pero anulada = sigue faltando registrar. */
    const anulada = derivarRecorrido(datos({ ...hecho(), anexos: [anexo()], despachos: [despacho({ status: "anulado" })], salidasPendientes: [pend()] }));
    expect(anulada.plazo).toMatchObject({ anexoId: "ax1", venceEl: "2026-10-28" });
  });

  it("anexo reemplazado, de otro permiso, de otra especie o anterior al bloque no cuenta", () => {
    for (const a of [anexo({ reemplazadoPor: "ax2" }), anexo({ permiso: "OTRO-1" }), anexo({ especieGlobal: "Tornillo" }), anexo({ fecha: "2026-10-01" })]) {
      expect(paso(derivarRecorrido(datos({ ...hecho(), anexos: [a] })), "anexo").estado).toBe("pendiente");
    }
  });

  it("un despacho anulado no es salida; uno ya vencido no da plazo", () => {
    expect(paso(derivarRecorrido(datos({ ...hecho(), anexos: [anexo()], despachos: [despacho({ status: "anulado" })] })), "salida").estado).toBe("pendiente");
    const viejo = derivarRecorrido(datos({ ...hecho(), anexos: [anexo()], despachos: [despacho({ entryDate: new Date("2026-10-20T12:00:00.000Z") })] }));
    expect(paso(viejo, "salida").estado).toBe("hecho");
    expect(viejo.plazo).toBeNull();
    /* Un anexo sin salida cuyo plazo ya pasó tampoco da aviso de «registrar hoy». */
    const vencido = derivarRecorrido(datos({ ...hecho(), anexos: [anexo({ despachoIds: [], fecha: "2026-10-20" })], salidasPendientes: [pend({ venceEl: "2026-10-22", fueraDePlazo: true })] }));
    expect(vencido.plazo).toBeNull();
    /* Una guía pendiente de OTRO anexo (no del bloque) no avisa en este recorrido. */
    expect(derivarRecorrido(datos({ ...hecho(), anexos: [anexo({ despachoIds: [] })], salidasPendientes: [pend({ anexoId: "otro" })] })).plazo).toBeNull();
  });
});

describe("venceElRegistro: el mismo predicado que el badge", () => {
  it.each([
    ["2026-10-26", "2026-10-28"], // lunes → miércoles
    ["2026-10-23", "2026-10-27"], // viernes → martes (el fin de semana no cuenta)
  ])("%s vence el %s", (fecha, vence) => {
    expect(venceElRegistro(fecha)).toBe(vence);
    expect(venceElRegistro(new Date(`${fecha}T12:00:00.000Z`))).toBe(vence);
    /* Último segundo del día en que vence: en plazo; el día siguiente, fuera. */
    const base = new Date(`${fecha}T00:00:00.000Z`);
    expect(estaFueraDePlazo({ entryDate: base, createdAt: new Date(`${vence}T23:59:59.000Z`) })).toBe(false);
    const despues = new Date(new Date(`${vence}T00:00:00.000Z`).getTime() + 86_400_000);
    expect(estaFueraDePlazo({ entryDate: base, createdAt: despues })).toBe(true);
  });
});

describe("jornadas sin día listo: se dice por qué (revisión ADR-519)", () => {
  it("el reparto no trae aserrada (usadoM3 = 0, nada en el Libro) → con problema SIN_DIAS_LISTOS", () => {
    const e = derivarRecorrido(datos({ usadoM3: 0, lote: lote({}) }));
    expect(paso(e, "jornadas")).toMatchObject({ estado: "con_problema", code: "SIN_DIAS_LISTOS", motivo: SIN_ASERRADA });
  });

  it("el motivo que calculó la ruta manda sobre el genérico", () => {
    const e = derivarRecorrido(datos({ lote: lote({}), sinDiasListos: { code: "JORNADA_NO_REGISTRABLE", motivo: "La troza T1 ya está en la corrida N° 40." } }));
    expect(paso(e, "jornadas")).toMatchObject({ estado: "con_problema", code: "JORNADA_NO_REGISTRABLE", motivo: "La troza T1 ya está en la corrida N° 40." });
  });

  it("faltanDiasListos: sin días o todos sin producción → SIN_DIAS_LISTOS; uno listo, todos en el Libro u oculto → nada", () => {
    expect(faltanDiasListos({ motivo: null, jornadas: [] })).toEqual({ code: "SIN_DIAS_LISTOS", motivo: SIN_ASERRADA });
    expect(faltanDiasListos({ motivo: null, jornadas: [{ estado: "sin-produccion" }, { estado: "sin-produccion" }] })?.code).toBe("SIN_DIAS_LISTOS");
    expect(faltanDiasListos({ motivo: null, jornadas: [{ estado: "en-libro" }, { estado: "lista" }] })).toBeNull();
    expect(faltanDiasListos({ motivo: null, jornadas: [{ estado: "en-libro" }, { estado: "en-libro" }] })).toBeNull();
    expect(faltanDiasListos({ oculto: true, motivo: null, jornadas: [] })).toBeNull();
  });

  it("faltanDiasListos: un día apagado por una troza ajena → JORNADA_NO_REGISTRABLE con el motivo del plan", () => {
    expect(faltanDiasListos({ motivo: "T2 está en otra corrida.", jornadas: [{ estado: "apagada" }] })).toEqual({
      code: "JORNADA_NO_REGISTRABLE",
      motivo: "T2 está en otra corrida.",
    });
    expect(faltanDiasListos({ motivo: null, jornadas: [{ estado: "apagada", motivo: "Falta el día 1.", porOrden: true }] })).toBeNull();
  });
});

describe("jornadasHuerfanas: adoptar la corrida que quedó en el Libro sin anotar (A1)", () => {
  /* La corrida del día N lleva la nota del Recorrido (B5) o la de «Al Libro» del cubicador. */
  const conFecha = (id: string, lineNo: number, fecha: string, x: Record<string, unknown> = {}) =>
    corrida(id, lineNo, {
      entryDate: new Date(`${fecha}T12:00:00Z`),
      observations: `Jornada ${Number(fecha.slice(8)) - 19} de 2 · bloque B1 · recorrido del permiso`,
      ...x,
    });
  const HOY = "2026-10-27";

  it("una corrida viva y declarada con trozas del bloque y la fecha del día → se adopta ese día", () => {
    const l = lote({ t1: "c1", t2: "c2" }, [conFecha("c1", 31, "2026-10-20"), conFecha("c2", 32, "2026-10-21")]);
    expect(jornadasHuerfanas(bloque(), [1, 2], l, HOY)).toEqual([
      { dia: 1, corridaId: "c1", lineNo: 31, estado: "declarada", fecha: "2026-10-20" },
      { dia: 2, corridaId: "c2", lineNo: 32, estado: "declarada", fecha: "2026-10-21" },
    ]);
  });

  it("no adopta lo que ya es del bloque, lo abierto, lo anulado ni lo de otra fecha", () => {
    const b = bloque({ jornadasLibro: jornadasLibro([[1, "c1", 31]]) });
    const l = lote({ t1: "c1", t2: "c2" }, [conFecha("c1", 31, "2026-10-20"), conFecha("c2", 32, "2026-10-21", { quantity: null })]);
    expect(jornadasHuerfanas(b, [1, 2], l, HOY)).toEqual([]);
    const anulada = lote({ t2: "c2" }, [conFecha("c2", 32, "2026-10-21", { viva: false })]);
    expect(jornadasHuerfanas(bloque(), [1, 2], anulada, HOY)).toEqual([]);
    const otraFecha = lote({ t2: "c2" }, [conFecha("c2", 32, "2026-10-25")]);
    expect(jornadasHuerfanas(bloque(), [1, 2], otraFecha, HOY)).toEqual([]);
  });

  it("una corrida con una troza fuera del bloque, o dos candidatas el mismo día → ninguna", () => {
    const ajena = { ...lote({ t1: "c1" }, [conFecha("c1", 31, "2026-10-20")]) };
    ajena.trozas = [...ajena.trozas, { id: "t9", consumidaEnId: "c1" }];
    expect(jornadasHuerfanas(bloque(), [1, 2], ajena, HOY)).toEqual([]);
    const dos = lote({ t1: "c1", t2: "c2" }, [conFecha("c1", 31, "2026-10-20"), conFecha("c2", 32, "2026-10-20")]);
    expect(jornadasHuerfanas(bloque(), [1, 2], dos, HOY)).toEqual([]);
  });
});

describe("adopción: sólo lo inequívoco (2.ª revisión de ADR-519)", () => {
  const HOY = "2026-10-27";
  const del20 = (x: Record<string, unknown> = {}) =>
    lote({ t1: "c1" }, [corrida("c1", 31, { entryDate: new Date("2026-10-20T12:00:00Z"), ...x })]);

  it("una corrida a mano del mismo día (sin la nota de la jornada) no se adopta", () => {
    expect(jornadasHuerfanas(bloque(), [1, 2], del20({ observations: "Corte para un cliente" }), HOY)).toEqual([]);
    expect(jornadasHuerfanas(bloque(), [1, 2], del20({ observations: null }), HOY)).toEqual([]);
    /* La nota de otro bloque, o la del día 2 en la fecha del día 1, tampoco. */
    expect(jornadasHuerfanas(bloque(), [1, 2], del20({ observations: "Jornada 1 de 2 · bloque B10 · recorrido del permiso" }), HOY)).toEqual([]);
    expect(jornadasHuerfanas(bloque(), [1, 2], del20({ observations: "Jornada 2 de 2 · bloque B1 · recorrido del permiso" }), HOY)).toEqual([]);
    /* La de «Al Libro» del cubicador sí: es la misma jornada. */
    expect(jornadasHuerfanas(bloque(), [1, 2], del20({ observations: "Jornada 1 de 2 · bloque B1 · distribución de rolliza" }), HOY)).toHaveLength(1);
  });

  it("una corrida que ya anotó otro bloque (de otra distribución) no se adopta", () => {
    const l = del20({ observations: "Jornada 1 de 2 · bloque B1 · recorrido del permiso" });
    expect(jornadasHuerfanas(bloque(), [1, 2], l, HOY, new Set(["c1"]))).toEqual([]);
  });

  it("tomadosPorOtros mira TODAS las distribuciones menos el propio bloque y dice de quién es", () => {
    const original = { id: "d0", nombre: "Octubre", bloques: [bloque({ loteId: "lote-7", jornadasLibro: jornadasLibro([[1, "c1", 31]]) })] };
    const copia = { id: "d1", nombre: "Copia", bloques: [bloque({ loteId: "lote-7", jornadasLibro: jornadasLibro([[1, "c1", 31]]) })] };
    const t = tomadosPorOtros([original, copia], "d1", "b1");
    expect(t.lotes.get("lote-7")).toBe("bloque B1 de la distribución Octubre");
    expect(t.corridas.get("c1")).toBe("bloque B1 de la distribución Octubre");
    expect(tomadosPorOtros([copia], "d1", "b1").lotes.size).toBe(0);
  });
});

describe("ADR-521 · el bloque de un lote ya consumido adopta su corrida abierta", () => {
  /* La corrida c1 consumió JUSTO las trozas elegidas del bloque (t1 y t2). */
  const adoptado = (x: Partial<DatosDelRecorrido> = {}) =>
    datos({
      bloque: bloque({ dias: 1, jornadasLibro: [{ dia: 1, corridaId: "c1", lineNo: 31, estado: "abierta", fecha: "2026-10-20" }] }),
      trozas: [troza("t1", { consumidaEnId: "c1", motivo: "ya entró a una corrida" }), troza("t2", { consumidaEnId: "c1", motivo: "ya entró a una corrida" })],
      lote: { ...lote({ t1: "c1", t2: "c1" }, [corrida("c1", 31, { quantity: null })]), status: "consumido" },
      ...x,
    });

  it("trozas y lote hechos; jornadas pendiente con «Declarar la corrida N° X» (no con problema)", () => {
    const e = derivarRecorrido(adoptado());
    expect(paso(e, "trozas").estado).toBe("hecho");
    expect(paso(e, "lote").estado).toBe("hecho");
    expect(paso(e, "jornadas")).toMatchObject({ estado: "pendiente", code: "CORRIDA_POR_DECLARAR", motivo: "Declarar la corrida N° 31" });
    expect(e.siguiente).toBe("jornadas");
  });

  it("con los días de la pantalla y uno que no se puede declarar, el paso dice por qué", () => {
    const e = derivarRecorrido(adoptado({ sinDiasListos: { code: "JORNADA_NO_REGISTRABLE", motivo: "La corrida N° 31 es un día: junta los días del bloque en uno." } }));
    expect(paso(e, "jornadas")).toMatchObject({ estado: "con_problema", code: "JORNADA_NO_REGISTRABLE" });
  });

  it("una corrida abierta que no es del bloque entero sigue yendo al Libro (CORRIDA_ABIERTA)", () => {
    const e = derivarRecorrido(adoptado({ lote: { ...lote({ t1: "c1" }, [corrida("c1", 31, { quantity: null })]), status: "consumido" } }));
    expect(paso(e, "jornadas")).toMatchObject({ estado: "con_problema", code: "CORRIDA_ABIERTA" });
  });

  it("faltanDiasListos: la adoptada declarable cuenta como lista; trabada, su motivo", () => {
    expect(faltanDiasListos({ motivo: null, jornadas: [{ estado: "abierta", corridaDelBloque: true, declarable: true }] })).toBeNull();
    expect(faltanDiasListos({ motivo: null, jornadas: [{ estado: "abierta", corridaDelBloque: true, motivo: "Pasa el tope." }] })).toEqual({
      code: "JORNADA_NO_REGISTRABLE",
      motivo: "Pasa el tope.",
    });
    /* La abierta de siempre (no adoptada) la dice el paso con CORRIDA_ABIERTA. */
    expect(faltanDiasListos({ motivo: null, jornadas: [{ estado: "abierta", motivo: "Declárala en el Libro." }] })).toBeNull();
  });
});
