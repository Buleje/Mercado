import { describe, it, expect } from "vitest";
import { parteDelDestinatario } from "@/lib/forestal/cliente-de-la-guia";
import {
  aplicarTratoDeVenta,
  leyendaDeVenta,
  type TratoDeVenta,
  enviosDeLista,
  excesosDeCorrida,
  filasDeCorridas,
  valorPropuesto,
  type CorridaDisponible,
  type PaqueteDisponible,
  payloadDeFila,
  piezasTotales,
  problemasDeLista,
  proponerVenta,
  ptDeLaFila,
  resumenPorProducto,
  uidDeFila,
  volumenPorCorrida,
  volumenTotal,
  type FilaDespacho,
} from "@/lib/forestal/despacho-lista";
import { cadenaDeGuia, despachoDeGuia, lineasDeGuia } from "@/lib/forestal/guia-desde-lista";

/**
 * La lista de productos de una GTF de salida.
 *
 * Lo que se prueba acá es lo que evita registrar MEDIA guía: una guía lleva N
 * productos y el libro los guarda como N líneas, así que el chequeo de saldo
 * tiene que mirar el conjunto (dos paquetes de la misma corrida comparten un
 * único saldo) ANTES de mandar la primera línea.
 */

const fila = (over: Partial<FilaDespacho> = {}): FilaDespacho => ({
  uid: uidDeFila(over.corridaId ?? "c1", over.paqueteId ?? "p1"),
  corridaId: "c1",
  lineNo: 12,
  paqueteId: "p1",
  especie: "Sapotillo",
  especieCientifica: "Matisia bicolor",
  cites: false,
  producto: "MADERA ASERRADA (TABLA DE PULGADA)",
  codigo: "SAP-TAB-1",
  presentacion: "PIEZAS",
  cantidad: 123,
  espesorCm: null,
  anchoCm: null,
  largoM: null,
  volumen: 2.035,
  unidad: "m3",
  disponibleCorrida: 5,
  gtfOrigen: ["3-19-0235806"],
  titularOrigen: ["19-SEC/PER/FMC-2024-008"],
  lote: "4-2025",
  linea: "LP",
  fechaProduccion: "2025-06-17T00:00:00.000Z",
  ...over,
});

describe("totales de la lista", () => {
  it("suma el volumen movilizado con la precisión del libro", () => {
    const filas = [fila(), fila({ uid: "c1:p2", paqueteId: "p2", volumen: 0.676 })];
    expect(volumenTotal(filas)).toBe(2.711);
    expect(piezasTotales(filas)).toBe(246);
  });

  it("no explota con una fila a medio editar (volumen NaN)", () => {
    const filas = [fila({ volumen: Number.NaN })];
    expect(volumenTotal(filas)).toBe(0);
  });
});

describe("resumen por especie y producto", () => {
  it("junta las filas del mismo producto y separa los distintos", () => {
    const filas = [
      fila(),
      fila({ uid: "c1:p2", paqueteId: "p2", volumen: 1 }),
      fila({ uid: "c2:p3", corridaId: "c2", paqueteId: "p3", producto: "MADERA ASERRADA (LARGA ANGOSTA)", cantidad: 56, volumen: 0.42 }),
    ];
    const resumen = resumenPorProducto(filas);
    expect(resumen).toHaveLength(2);
    expect(resumen[0]).toMatchObject({ producto: "MADERA ASERRADA (LARGA ANGOSTA)", cantidad: 56, volumen: 0.42 });
    expect(resumen[1]).toMatchObject({ cantidad: 246, volumen: 3.035 });
  });
});

describe("saldo de la corrida (I5 antes de guardar)", () => {
  it("acepta dos paquetes de una corrida mientras entren en su saldo", () => {
    const filas = [
      fila({ volumen: 2, disponibleCorrida: 5 }),
      fila({ uid: "c1:p2", paqueteId: "p2", volumen: 3, disponibleCorrida: 5 }),
    ];
    expect(volumenPorCorrida(filas).get("c1")).toBe(5);
    expect(excesosDeCorrida(filas)).toEqual([]);
    expect(problemasDeLista(filas)).toEqual([]);
  });

  it("detecta la sobre-atribución que el backend rechazaría a mitad de la carga", () => {
    const filas = [
      fila({ volumen: 3, disponibleCorrida: 5 }),
      fila({ uid: "c1:p2", paqueteId: "p2", volumen: 2.5, disponibleCorrida: 5 }),
    ];
    const excesos = excesosDeCorrida(filas);
    expect(excesos).toHaveLength(1);
    expect(excesos[0]).toMatchObject({ corridaId: "c1", pedido: 5.5, disponible: 5 });
    expect(problemasDeLista(filas)[0]).toContain("5.5000");
  });

  it("un redondeo de 0.00005 m³ NO es sobre-atribución", () => {
    const filas = [fila({ volumen: 5.00005, disponibleCorrida: 5 })];
    expect(excesosDeCorrida(filas)).toEqual([]);
  });
});

describe("problemas de la lista", () => {
  it("una lista vacía pide productos", () => {
    expect(problemasDeLista([])).toEqual(["Agrega al menos un producto a la lista."]);
  });

  it("avisa del producto sin volumen", () => {
    expect(problemasDeLista([fila({ volumen: 0 })])[0]).toContain("no tiene volumen");
  });

  it("avisa cuando se mezclan unidades (el total dejaría de ser sumable)", () => {
    const filas = [fila(), fila({ uid: "c2:p9", corridaId: "c2", paqueteId: "p9", unidad: "pt" })];
    expect(problemasDeLista(filas).some((p) => p.includes("mezcla unidades"))).toBe(true);
  });
});

describe("traducción a la línea del libro", () => {
  it("el volumen va a quantity y las piezas a pieces (no al revés)", () => {
    const p = payloadDeFila(fila(), {
      entryDate: "2026-08-07",
      docType: "GTF",
      gtfNumber: "001-00000025",
      destino: "Maderera del Centro SAC",
      observations: null,
    });
    expect(p.quantity).toBe(2.035);
    expect(p.pieces).toBe(123);
    expect(p.unit).toBe("m3");
    expect(p.origenes).toEqual([{ produccionEntryId: "c1", quantity: 2.035 }]);
    expect(p.codigoProducto).toBe("SAP-TAB-1");
    expect("gtfDatos" in p).toBe(false);
  });

  it("adjunta la guía cuando se le pasa, para que la línea nazca con ella", () => {
    const p = payloadDeFila(fila(), { entryDate: "2026-08-07", docType: "GTF", gtfNumber: "001-1", destino: null, observations: null }, { propietario: {} });
    expect(p.gtfDatos).toEqual({ propietario: {} });
  });
});

describe("de la lista al papel de la guía", () => {
  const dos = [
    fila(),
    fila({ uid: "c2:p3", corridaId: "c2", lineNo: 13, paqueteId: "p3", especie: "Lupuna", especieCientifica: "Ceiba pentandra", cantidad: 60, volumen: 0.44, gtfOrigen: ["001-0000202"] }),
  ];

  it("el detalle (37) lleva un renglón por producto, con su volumen", () => {
    const lineas = lineasDeGuia(dos);
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatchObject({ comun: "Sapotillo", presentacion: "PIEZAS", cantidad: 123, unidad: "m³", total: 2.035 });
    expect(lineas[1]!.comun).toBe("Lupuna");
  });

  it("la cadena junta los renglones de la MISMA corrida en una fila", () => {
    const mismaCorrida = [fila({ volumen: 1 }), fila({ uid: "c1:p2", paqueteId: "p2", volumen: 2, gtfOrigen: ["OTRA-GTF"] })];
    const cadena = cadenaDeGuia(mismaCorrida);
    expect(cadena.corridas).toHaveLength(1);
    expect(cadena.corridas[0]).toMatchObject({ lineNo: 12, quantity: 3 });
    expect(cadena.corridas[0]!.guias.sort()).toEqual(["3-19-0235806", "OTRA-GTF"]);
  });

  it("con varias especies la cabecera NO declara la primera", () => {
    const d = despachoDeGuia(dos, { id: "e1", lineNo: 54, entryDate: "2026-08-07", gtfNumber: "001-25", destino: "Cliente SAC" });
    expect(d.speciesCommon).toBe("Varias especies (2)");
    expect(d.speciesScientific).toBeNull();
    expect(d.quantity).toBe("2.475");
    expect(d.pieces).toBe(183);
  });

  it("con una sola especie la cabecera la dice, con su científico", () => {
    const d = despachoDeGuia([fila()], { id: "e1", lineNo: 54, entryDate: "2026-08-07", gtfNumber: "001-25", destino: null });
    expect(d.speciesCommon).toBe("Sapotillo");
    expect(d.speciesScientific).toBe("Matisia bicolor");
    expect(d.cites).toBe(false);
  });

  it("marca CITES si alguno de los productos lo es", () => {
    const d = despachoDeGuia([fila({ cites: true }), fila({ uid: "x", paqueteId: "x" })], { id: "e1", lineNo: 1, entryDate: "2026-08-07", gtfNumber: "g", destino: null });
    expect(d.cites).toBe(true);
  });
});

describe("trozas que salen sin aserrar (ADR-363)", () => {
  const troza = (over: Partial<FilaDespacho> = {}): FilaDespacho =>
    fila({
      uid: `troza:${over.trozaId ?? "t1"}:corrida`,
      corridaId: "",
      trozaId: "t1",
      lineNo: null,
      paqueteId: null,
      producto: "MADERA EN ROLLO",
      presentacion: "TROZAS",
      codigo: "29/A",
      cantidad: 1,
      volumen: 1.2,
      disponibleCorrida: 1.2,
      ...over,
    });

  it("dos trozas NO se leen como una corrida sobre-atribuida", () => {
    const dos = [troza(), troza({ trozaId: "t2", uid: "troza:t2:corrida", volumen: 0.9, disponibleCorrida: 0.9 })];
    expect(excesosDeCorrida(dos)).toEqual([]);
    expect(problemasDeLista(dos)).toEqual([]);
  });

  it("avisa si se declara más volumen del que la troza mide", () => {
    const p = problemasDeLista([troza({ volumen: 2, disponibleCorrida: 1.2 })]);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain("1.200");
  });

  it("las trozas de una especie van en UNA línea del libro, con sus piezas", () => {
    const comun = { entryDate: "2026-08-07", docType: "GTF", gtfNumber: "001-9", destino: null, observations: null };
    const envios = enviosDeLista(
      [
        troza(),
        troza({ trozaId: "t2", uid: "troza:t2:corrida", volumen: 0.9, disponibleCorrida: 0.9 }),
        troza({ trozaId: "t3", uid: "troza:t3:corrida", especie: "Lupuna", volumen: 2, disponibleCorrida: 2 }),
      ],
      comun,
    );
    expect(envios).toHaveLength(2);
    const sapotillo = envios.find((e) => e.payload.speciesCommon === "Sapotillo")!;
    expect(sapotillo.payload).toMatchObject({ quantity: 2.1, pieces: 2, productType: "MADERA EN ROLLO" });
    expect("trozas" in sapotillo.payload && sapotillo.payload.trozas).toEqual(["t1", "t2"]);
    // Sin corridas: la atribución de una salida en rollo son las piezas.
    expect("origenes" in sapotillo.payload).toBe(false);
    expect(sapotillo.uids).toHaveLength(2);
  });

  it("la cadena del papel NO inventa una «corrida #0» para las trozas", () => {
    const cadena = cadenaDeGuia([
      troza(),
      troza({ trozaId: "t2", uid: "troza:t2:corrida", volumen: 0.9 }),
      fila(),
    ]);
    const sinCorrida = cadena.corridas.filter((c) => c.lineNo === null);
    expect(sinCorrida).toHaveLength(1);
    expect(sinCorrida[0]).toMatchObject({ quantity: 2.1 });
    expect(cadena.corridas.some((c) => c.lineNo === 0)).toBe(false);
    // Y la corrida real sigue con su número.
    expect(cadena.corridas.some((c) => c.lineNo === 12)).toBe(true);
  });

  it("con una sola pieza el código del producto sí viaja", () => {
    const envios = enviosDeLista([troza()], { entryDate: "2026-08-07", docType: "GTF", gtfNumber: "g", destino: null, observations: null });
    expect(envios[0]!.payload.codigoProducto).toBe("29/A");
  });

  it("mezcla: el producto transformado sigue yendo línea por línea", () => {
    const envios = enviosDeLista([fila(), troza()], { entryDate: "2026-08-07", docType: "GTF", gtfNumber: "g", destino: null, observations: null });
    expect(envios).toHaveLength(2);
    expect("origenes" in envios[0]!.payload).toBe(true);
    expect("trozas" in envios[1]!.payload).toBe(true);
  });
});

describe("payload extra", () => {
  it("la guía viaja tal cual", () => {
    const p = payloadDeFila(fila(), { entryDate: "2026-08-07", docType: "GTF", gtfNumber: "001-1", destino: null, observations: null }, { propietario: {} });
    expect(p.gtfDatos).toEqual({ propietario: {} });
  });
});

/**
 * ADR-429 · «el precio de la madera propia se propone al despachar»: el
 * paquete trae el precio por PT que se puso al declarar y su PT medido; la
 * fila entra con la venta ya calculada, prorrateada si sale sólo una parte.
 */
describe("venta propuesta desde el precio de la producción (ADR-429)", () => {
  const corrida = (disponible: number, paquete: Partial<PaqueteDisponible>): CorridaDisponible => ({
    id: "c1", lineNo: 7, fecha: "2026-09-22", especie: "Tornillo", especieCientifica: null,
    producto: "MADERA ASERRADA", presentacion: "PIEZAS", unidad: "m3", disponible,
    lote: null, lineaProduccion: "LP", gtfOrigen: [], titularOrigen: [],
    paquetes: [{ id: "p1", codigo: "PQ-1", producto: null, presentacion: null, cantidad: 12, volumenM3: 0.3774, espesorCm: 5.08, anchoCm: 20.32, largoM: 3.05, ...paquete }],
  } as CorridaDisponible);

  it("PT medido × precio: 160 PT a S/ 3,50 entran como S/ 560 propuestos", () => {
    const [f] = filasDeCorridas([corrida(0.3774, { pieTablar: 160, precioVentaPt: 3.5 })]);
    expect(f.valorVenta).toBe(560);
    expect(f.valorPropuesto).toBe(true);
  });

  it("si la corrida ya despachó parte, la venta se prorratea con lo que sale", () => {
    const [f] = filasDeCorridas([corrida(0.1887, { pieTablar: 160, precioVentaPt: 3.5 })]);
    expect(f.volumen).toBe(0.1887);
    expect(f.valorVenta).toBe(280);
  });

  it("sin precio o sin PT medido no se inventa: queda vacía, nunca 0", () => {
    expect(filasDeCorridas([corrida(0.3774, { pieTablar: 160, precioVentaPt: null })])[0].valorVenta).toBeUndefined();
    expect(filasDeCorridas([corrida(0.3774, { pieTablar: null, precioVentaPt: 3.5 })])[0].valorVenta).toBeUndefined();
    expect(valorPropuesto({ volumen: 0, precioVentaPt: 3.5, ptPorM3: 424 })).toBeNull();
  });
});

describe("la venta propuesta sigue al volumen editado (selector de stock)", () => {
  it("medio paquete propone media venta; tocada a mano ya no se recalcula", () => {
    const [f] = filasDeCorridas([{
      id: "c1", lineNo: 6, fecha: "2026-09-22", especie: "Cumala", especieCientifica: null, producto: "MADERA ASERRADA",
      presentacion: "PIEZAS", unidad: "m3", disponible: 0.3302, lote: null, lineaProduccion: "LP",
      paquetes: [{ id: "p5", codigo: "PQ-005", producto: null, presentacion: null, cantidad: 6, volumenM3: 0.3302, espesorCm: 7.62, anchoCm: 10.16, largoM: 3.66, pieTablar: 140, precioVentaPt: 2.8 }],
    } as CorridaDisponible]);
    expect(f.valorVenta).toBe(392);
    const mitad = { ...f, volumen: 0.1651 };
    expect(valorPropuesto(mitad)).toBe(196);
  });
});

/**
 * ADR-430 · la venta al despachar sale del trato de VENTA del cliente de la
 * guía (su precio por PT × el PT de la fila); si no lo cubre, del precio del
 * paquete; nunca 0. La leyenda dice de dónde salió.
 */
describe("venta propuesta con el trato de venta del cliente de la guía (ADR-430)", () => {
  const TRATO: TratoDeVenta = {
    parteNombre: "Maderera del Sur",
    grupos: [{ id: "g-duras", nombre: "Duras", claves: ["shihuahuaco"] }],
    tarifa: {
      id: "tv", parteId: "p1", servicio: "venta", vigenteDesde: "2026-09-01", basePt: null,
      grupos: [{ grupoId: "g-duras", precioPt: 5 }], especies: [{ clave: "tornillo", nombre: "Tornillo", precioPt: 3 }], tipos: [], nota: null,
    },
  };
  const corrida = (especie: string, paquete: Partial<PaqueteDisponible> | null, disponible = 0.3774): CorridaDisponible => ({
    id: `c-${especie}`, lineNo: 7, fecha: "2026-09-22", especie, especieCientifica: null,
    producto: "MADERA ASERRADA", presentacion: "PIEZAS", unidad: "m3", disponible,
    lote: null, lineaProduccion: "LP", gtfOrigen: [], titularOrigen: [],
    paquetes: paquete
      ? [{ id: "p1", codigo: "PQ-1", producto: null, presentacion: null, cantidad: 12, volumenM3: 0.3774, espesorCm: 5.08, anchoCm: 20.32, largoM: 3.05, ...paquete }]
      : [],
  } as CorridaDisponible);

  it("PT medido × su precio pactado: 160 PT de Tornillo a S/ 3 son S/ 480, no los S/ 560 del paquete", () => {
    const [f] = filasDeCorridas([corrida("Tornillo", { pieTablar: 160, precioVentaPt: 3.5 })], { trato: TRATO });
    expect(f.valorVenta).toBe(480);
    expect(f).toMatchObject({ valorPropuesto: true, precioVentaPt: 3, precioVentaDesde: "cliente-especie", precioPaquetePt: 3.5 });
    expect(leyendaDeVenta(f)).toBe("propuesto · S/ 3.00 por PT · precio del cliente para Tornillo · Maderera del Sur");
  });

  it("por grupo de la planta: el Shihuahuaco sale del grupo Duras", () => {
    const [f] = filasDeCorridas([corrida("Shihuahuaco", { pieTablar: 160, precioVentaPt: null })], { trato: TRATO });
    expect(f).toMatchObject({ valorVenta: 800, precioVentaDesde: "cliente-grupo" });
  });

  it("si su trato no cubre la madera, el precio del paquete, como hoy", () => {
    const [f] = filasDeCorridas([corrida("Cumala", { pieTablar: 160, precioVentaPt: 3.5 })], { trato: TRATO });
    expect(f).toMatchObject({ valorVenta: 560, precioVentaDesde: "paquete" });
    expect(leyendaDeVenta(f)).toMatch(/precio que se puso al declarar/);
  });

  it("ni trato ni precio del paquete: vacía, nunca 0", () => {
    const [f] = filasDeCorridas([corrida("Cumala", { pieTablar: 160, precioVentaPt: null })], { trato: TRATO });
    expect(f.valorVenta).toBeUndefined();
    expect(f.valorPropuesto).toBeUndefined();
  });

  it("sin PT medido, el trato del cliente usa la regla de la plaza (m³ × 424); el precio del paquete no", () => {
    const [conTrato] = filasDeCorridas([corrida("Tornillo", { pieTablar: null, precioVentaPt: 3.5 })], { trato: TRATO });
    expect(conTrato.valorVenta).toBe(Math.round(0.3774 * 424 * 3 * 100) / 100);
    const [sinTrato] = filasDeCorridas([corrida("Tornillo", { pieTablar: null, precioVentaPt: 3.5 })]);
    expect(sinTrato.valorVenta).toBeUndefined();
  });

  it("una corrida sin paquetes también se propone con su trato", () => {
    const [f] = filasDeCorridas([corrida("Tornillo", null, 0.5)], { trato: TRATO });
    expect(f).toMatchObject({ paqueteId: null, valorVenta: 636, precioVentaDesde: "cliente-especie" });
  });

  it("elegir el cliente después de armar la lista re-propone lo propuesto y respeta lo tipeado", () => {
    const [propuesta, vacia, tipeada] = filasDeCorridas([
      corrida("Tornillo", { pieTablar: 160, precioVentaPt: 3.5 }),
      corrida("Shihuahuaco", { pieTablar: 160, precioVentaPt: null }),
      corrida("Tornillo", { pieTablar: 160, precioVentaPt: 3.5 }),
    ]);
    const aMano = { ...tipeada!, uid: "tipeada", valorVenta: 999, valorPropuesto: false };
    const [a, b, c] = aplicarTratoDeVenta([propuesta!, vacia!, aMano], TRATO);
    expect(a!.valorVenta).toBe(480);
    expect(b!.valorVenta).toBe(800);
    expect(c).toBe(aMano);
    /* Sin cambios, el mismo arreglo: un setState con esto no re-renderiza. */
    const ya = [a!, b!, c!];
    expect(aplicarTratoDeVenta(ya, TRATO)).toBe(ya);
    /* Y si la guía se queda sin cliente, vuelve el precio del paquete. */
    expect(aplicarTratoDeVenta([a!], null)[0]).toMatchObject({ valorVenta: 560, precioVentaDesde: "paquete" });
  });

  it("la venta propuesta sigue al volumen editado también con el trato", () => {
    const [f] = filasDeCorridas([corrida("Tornillo", { pieTablar: 160, precioVentaPt: 3.5 })], { trato: TRATO });
    expect(valorPropuesto({ ...f!, volumen: 0.1887 })).toBe(240);
  });
});

/**
 * Defectos confirmados del ADR-430 («venta propuesta al despachar»).
 */
describe("una troza/rollizo NUNCA recibe venta propuesta (defecto alto)", () => {
  const TRATO: TratoDeVenta = {
    parteNombre: "Maderera del Sur",
    grupos: [],
    tarifa: {
      id: "tv", parteId: "p1", servicio: "venta", vigenteDesde: "2026-09-01", basePt: 0.6,
      grupos: [], especies: [], tipos: [], nota: null,
    },
  };
  const troza: FilaDespacho = {
    uid: "troza:t1:corrida", corridaId: "", trozaId: "t1", lineNo: null, paqueteId: null,
    especie: "Tornillo", especieCientifica: null, cites: false, producto: "MADERA EN ROLLO",
    codigo: "29/A", presentacion: "TROZAS", cantidad: 1, espesorCm: null, anchoCm: null, largoM: null,
    volumen: 1.5, unidad: "m3", disponibleCorrida: 1.5,
    gtfOrigen: [], titularOrigen: [], lote: null, linea: null, fechaProduccion: null,
  };

  it("una troza rolliza (con trozaId) no se propone: 1,5 m³ NO da S/ 381,60", () => {
    const propuesta = proponerVenta(troza, TRATO);
    expect(propuesta.valorVenta).toBeUndefined();
    expect(propuesta.valorPropuesto).toBeUndefined();
    expect(ptDeLaFila(troza)).toBeNull();
  });

  it("un producto declarado en rollo sin trozaId (corrida en rollo) tampoco se propone", () => {
    const enRollo: FilaDespacho = { ...troza, corridaId: "c9", trozaId: null, lineNo: 3, uid: "c9:corrida" };
    expect(proponerVenta(enRollo, TRATO).valorVenta).toBeUndefined();
  });

  it("una troza que YA tenía una venta tipeada a mano la conserva igual", () => {
    const conVenta: FilaDespacho = { ...troza, valorVenta: 250, valorPropuesto: false };
    expect(proponerVenta(conVenta, TRATO)).toBe(conVenta);
  });
});

describe("una venta vaciada a mano no se re-propone (defecto medio)", () => {
  const TRATO_A: TratoDeVenta = {
    parteNombre: "Maderera del Sur", grupos: [],
    tarifa: { id: "tv-a", parteId: "p1", servicio: "venta", vigenteDesde: "2026-09-01", basePt: 3, grupos: [], especies: [], tipos: [], nota: null },
  };
  const TRATO_B: TratoDeVenta = {
    parteNombre: "Otro Cliente SAC", grupos: [],
    tarifa: { id: "tv-b", parteId: "p2", servicio: "venta", vigenteDesde: "2026-09-01", basePt: 5, grupos: [], especies: [], tipos: [], nota: null },
  };
  const corrida = (): CorridaDisponible => ({
    id: "c1", lineNo: 7, fecha: "2026-09-22", especie: "Tornillo", especieCientifica: null,
    producto: "MADERA ASERRADA", presentacion: "PIEZAS", unidad: "m3", disponible: 0.3774,
    lote: null, lineaProduccion: "LP", gtfOrigen: [], titularOrigen: [],
    paquetes: [{ id: "p1", codigo: "PQ-1", producto: null, presentacion: null, cantidad: 12, volumenM3: 0.3774, espesorCm: 5.08, anchoCm: 20.32, largoM: 3.05, pieTablar: 160, precioVentaPt: null }],
  } as CorridaDisponible);

  it("vaciada a mano (ventaTocada) NO vuelve a llenarse al cambiar de destinatario", () => {
    const [propuesta] = filasDeCorridas([corrida()], { trato: TRATO_A });
    expect(propuesta!.valorVenta).toBe(160 * 3);
    // El operador la vacía: «todavía no sé en cuánto se vendió» (cambiarFila).
    const vaciada: FilaDespacho = { ...propuesta!, valorVenta: null, valorPropuesto: false, ventaTocada: true };
    const [tras] = aplicarTratoDeVenta([vaciada], TRATO_B);
    expect(tras).toBe(vaciada);
    expect(tras!.valorVenta == null).toBe(true);
  });

  it("propuesta sola (sin tocar) SÍ se actualiza al cambiar de trato", () => {
    const [propuesta] = filasDeCorridas([corrida()], { trato: TRATO_A });
    expect(propuesta!.valorVenta).toBe(480);
    const [tras] = aplicarTratoDeVenta([propuesta!], TRATO_B);
    expect(tras!.valorVenta).toBe(800);
    expect(tras!.valorPropuesto).toBe(true);
  });
});

describe("aplicarTratoDeVenta es idempotente (soporta el efecto que depende de `filas`)", () => {
  it("aplicarlo dos veces seguidas con el mismo trato devuelve el MISMO arreglo la segunda vez", () => {
    const TRATO: TratoDeVenta = {
      parteNombre: "Cliente", grupos: [],
      tarifa: { id: "tv", parteId: "p1", servicio: "venta", vigenteDesde: "2026-09-01", basePt: 3, grupos: [], especies: [], tipos: [], nota: null },
    };
    const [f] = filasDeCorridas([{
      id: "c1", lineNo: 7, fecha: "2026-09-22", especie: "Tornillo", especieCientifica: null,
      producto: "MADERA ASERRADA", presentacion: "PIEZAS", unidad: "m3", disponible: 0.3774,
      lote: null, lineaProduccion: "LP", gtfOrigen: [], titularOrigen: [],
      paquetes: [{ id: "p1", codigo: "PQ-1", producto: null, presentacion: null, cantidad: 12, volumenM3: 0.3774, espesorCm: 5.08, anchoCm: 20.32, largoM: 3.05, pieTablar: 160, precioVentaPt: null }],
    } as CorridaDisponible]);
    const primeraPasada = aplicarTratoDeVenta([f!], TRATO);
    const segundaPasada = aplicarTratoDeVenta(primeraPasada, TRATO);
    expect(segundaPasada).toBe(primeraPasada);
  });
});

describe("el cliente de la guía en el Directorio", () => {
  const partes = [
    { id: "a", nombre: "MADERERA DEL SUR", docNumero: "20123456789" },
    { id: "b", nombre: "Juan Pérez", docNumero: null },
  ];
  it("por documento primero, después por nombre normalizado", () => {
    expect(parteDelDestinatario(partes, { nombre: "Otro nombre", docNumero: "20123456789" })?.id).toBe("a");
    expect(parteDelDestinatario(partes, { nombre: "juan perez" })?.id).toBe("b");
    expect(parteDelDestinatario(partes, { nombre: "Nadie" })).toBeNull();
    expect(parteDelDestinatario(partes, { nombre: "", docNumero: "20123456789" })).toBeNull();
  });
});
