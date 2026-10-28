import { describe, expect, it } from "vitest";
import {
  avisoDePlazo,
  botonRegistrar,
  datosParaSerfor,
  diaCorto,
  leerEstadoRecorrido,
  leerRespuestaEjecutar,
  textoEjecutados,
  TOPE_VUELTAS_RECORRIDO,
  lineaDelPaso,
  mensajeDeError,
  pasosEnOrden,
  permisosDelLote,
  textoAvance,
  textoParaCopiar,
  textoRendimiento,
} from "@/lib/forestal/recorrido-pantalla";
import type { EstadoRecorrido, PasoDelRecorrido } from "@/lib/forestal/recorrido-permiso";

const paso = (p: PasoDelRecorrido["paso"], estado: PasoDelRecorrido["estado"], extra: Partial<PasoDelRecorrido> = {}): PasoDelRecorrido => ({
  paso: p,
  estado,
  ids: [],
  ...extra,
});

const estado = (pasos: PasoDelRecorrido[], siguiente: EstadoRecorrido["siguiente"]): EstadoRecorrido => ({
  distribucionId: "d1",
  bloqueId: "b1",
  permiso: "25-UCA-PER-001",
  especie: "Tornillo",
  rollizaM3: 18.214,
  amparadoM3: 10,
  producidoM3: 9.5,
  producidoPt: 4026,
  sinAtribuirM3: 0,
  pasos,
  siguiente,
  plazo: null,
  rendimiento: null,
});

describe("pasos del recorrido en pantalla", () => {
  it("siempre los 6 en orden; el que no llegó es pendiente, nunca hecho", () => {
    const p = pasosEnOrden(estado([paso("anexo", "hecho"), paso("datos", "hecho")], "trozas"));
    expect(p.map((x) => x.paso)).toEqual(["datos", "trozas", "lote", "jornadas", "anexo", "salida"]);
    expect(p.map((x) => x.numero)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(p.find((x) => x.paso === "trozas")?.estado).toBe("pendiente");
    expect(p.find((x) => x.paso === "anexo")?.estado).toBe("hecho");
  });

  it("«Vas en el paso N de 6» sale de `siguiente`", () => {
    expect(textoAvance("datos")).toBe("Vas en el paso 1 de 6");
    expect(textoAvance("jornadas")).toBe("Vas en el paso 4 de 6");
    expect(textoAvance(null)).toBe("Recorrido completo");
  });

  it("con problema muestra el motivo; si no, lo hecho", () => {
    expect(lineaDelPaso({ estado: "con_problema", motivo: "La guía QA19 no está recibida", detalle: "x" })).toBe("La guía QA19 no está recibida");
    expect(lineaDelPaso({ estado: "con_problema" })).toMatch(/sin decir por qué/);
    expect(lineaDelPaso({ estado: "hecho", detalle: "4 jornadas · 12 trozas" })).toBe("4 jornadas · 12 trozas");
    expect(lineaDelPaso({ estado: "pendiente" })).toBeNull();
  });
});

describe("botón «Registrar lote y jornadas»", () => {
  const base = [paso("datos", "hecho"), paso("trozas", "hecho")];
  it("activo cuando lo que falta es el lote", () => {
    const b = botonRegistrar(estado(base, "lote"), true);
    expect(b).toMatchObject({ mostrar: true, activo: true, etiqueta: "Registrar lote y jornadas" });
  });
  it("con el lote hecho dice «Registrar las jornadas»", () => {
    const b = botonRegistrar(estado([...base, paso("lote", "hecho")], "jornadas"), true);
    expect(b).toMatchObject({ activo: true, etiqueta: "Registrar las jornadas" });
  });
  it("apagado con el motivo si falta un paso de la persona", () => {
    const b = botonRegistrar(estado([paso("datos", "con_problema")], "datos"), true);
    expect(b.activo).toBe(false);
    expect(b.motivo).toBe("Primero: datos listos.");
  });
  it("apagado para quien no declara producción", () => {
    const b = botonRegistrar(estado(base, "lote"), false);
    expect(b.activo).toBe(false);
    expect(b.motivo).toMatch(/administrador o el dueño/);
  });
  it("se esconde con lote y jornadas hechos", () => {
    expect(botonRegistrar(estado([...base, paso("lote", "hecho"), paso("jornadas", "hecho")], "anexo"), true).mostrar).toBe(false);
  });
  it("ADR-521: con la corrida del lote consumido por declarar, el botón la nombra", () => {
    const jornadas = paso("jornadas", "pendiente", { code: "CORRIDA_POR_DECLARAR", motivo: "Declarar la corrida N° 7" });
    const b = botonRegistrar(estado([...base, paso("lote", "hecho"), jornadas], "jornadas"), true);
    expect(b).toMatchObject({ mostrar: true, activo: true, etiqueta: "Declarar la corrida N° 7" });
  });
});

describe("plazo y rendimiento", () => {
  it("día corto en UTC con su nombre", () => {
    expect(diaCorto("2026-10-29")).toBe("jueves 29-10");
    expect(diaCorto("2026-10-29T03:00:00.000Z")).toBe("jueves 29-10");
  });
  it("aviso: antes, el mismo día y vencido", () => {
    const plazo = { anexoId: "x", gtfNumber: "0001-064", venceEl: "2026-10-29" };
    expect(avisoDePlazo(plazo, "2026-10-27")).toEqual({ texto: "Registrar hoy: vence el jueves 29-10 (GTF 0001-064)", vencido: false });
    expect(avisoDePlazo(plazo, "2026-10-29")?.texto).toBe("Registrar hoy: vence hoy, jueves 29-10 (GTF 0001-064)");
    expect(avisoDePlazo(plazo, "2026-10-30")).toMatchObject({ vencido: true });
    expect(avisoDePlazo(null, "2026-10-27")).toBeNull();
  });
  it("rendimiento sugerido contra real", () => {
    expect(textoRendimiento({ sugeridoPct: 52, realPct: 48.46 })).toBe("Sugerido 52 % · real 48.5 %");
    expect(textoRendimiento({ sugeridoPct: 52, realPct: null })).toBe("Sugerido 52 % · real sin producción");
    expect(textoRendimiento(null)).toBeNull();
  });
});

describe("respuesta del servidor", () => {
  it("lee el estado pelado o envuelto", () => {
    const e = estado([], "datos");
    expect(leerEstadoRecorrido(e)).toBe(e);
    expect(leerEstadoRecorrido({ estado: e })).toBe(e);
    expect(leerEstadoRecorrido({ ok: true, recorrido: e })).toBe(e);
    expect(leerEstadoRecorrido({ ok: true })).toBeNull();
  });
  it("lee la respuesta del POST y suma lo escrito", () => {
    const e = estado([], "jornadas");
    const r = leerRespuestaEjecutar({
      estado: e,
      ejecutados: [
        { paso: "lote", detalle: "Lote L-1" },
        { paso: "jornadas", detalle: "Día 1 · corrida N° 4" },
        { paso: "jornadas", detalle: "Día 2 · corrida N° 5" },
        { paso: "otro", detalle: "x" },
        null,
      ],
      continuar: true,
    });
    expect(r.estado).toBe(e);
    expect(r.continuar).toBe(true);
    expect(r.ejecutados).toHaveLength(3);
    expect(textoEjecutados(r.ejecutados)).toBe("Se escribió el lote y 2 jornadas.");
    expect(leerRespuestaEjecutar({ estado: e, continuar: "si" }).continuar).toBe(false);
    expect(textoEjecutados([])).toBeNull();
    expect(TOPE_VUELTAS_RECORRIDO).toBeGreaterThanOrEqual(10);
  });
  it("el mensaje del servidor manda", () => {
    expect(mensajeDeError({ error: "MES_CERRADO", message: "Octubre está cerrado" }, 409)).toEqual({ mensaje: "Octubre está cerrado", code: "MES_CERRADO" });
    expect(mensajeDeError(null, 404).mensaje).toMatch(/Vuelve a guardarla/);
  });
});

describe("datos para SERFOR", () => {
  const ultima = {
    destinatario: { nombre: "Maderera del Oriente SAC", docTipo: "RUC" as const, docNumero: "20123456789", direccion: "Jr. Lima 120", autorizacion: "" },
    transportista: { nombre: "Transportes Ucayali", docTipo: "RUC" as const, docNumero: "20999999991", direccion: "", registroMtc: "" },
    vehiculo: { modo: "terrestre" as const, placa: "abc-123", placaRemolque: "", marca: "", tipo: "", embarcacion: "", conductor: "Juan Pérez", conductorDni: "", licencia: "", tipoTransporte: "privado" as const },
    traslado: { puntoPartida: "", puntoLlegada: "Av. Centenario km 5, Pucallpa", ruta: "", fechaInicio: "", fechaFin: "" },
  };
  const fuente = {
    permiso: "25-UCA-PER-001",
    especie: "Tornillo",
    producidoM3: 9.5,
    producidoPt: 4026,
    anexo: { numero: "A-014", empresa: "Inversiones Blas SA", totalPiezas: 120, totalM3: 9.482, totalPt: 4018 },
    ultima: ultima as never,
  };

  it("en el orden del formulario: título → destinatario → transporte → producto", () => {
    const ids = datosParaSerfor(fuente).map((d) => d.id);
    expect(ids.indexOf("permiso")).toBeLessThan(ids.indexOf("destinatario"));
    expect(ids.indexOf("destinatario")).toBeLessThan(ids.indexOf("placa"));
    expect(ids.indexOf("placa")).toBeLessThan(ids.indexOf("especie"));
    expect(ids.indexOf("especie")).toBeLessThan(ids.indexOf("m3"));
  });

  it("lo que falta queda vacío, sin inventar; el m³ es el del anexo", () => {
    const d = Object.fromEntries(datosParaSerfor(fuente).map((x) => [x.id, x]));
    expect(d.conductorDni).toMatchObject({ valor: "", origen: null });
    expect(d.placa).toMatchObject({ valor: "ABC-123", origen: "ultima" });
    expect(d.m3).toMatchObject({ valor: "9.482", origen: "anexo" });
    expect(d.destinatarioDoc.etiqueta).toBe("RUC del destinatario");
  });

  it("sin anexo, el volumen es el producido y se dice; sin última guía, faltan las partes", () => {
    const d = Object.fromEntries(datosParaSerfor({ ...fuente, anexo: null, ultima: null }).map((x) => [x.id, x]));
    expect(d.m3).toMatchObject({ valor: "9.500", origen: "produccion" });
    expect(d.especie).toMatchObject({ valor: "Tornillo", origen: "recorrido" });
    expect(d.destinatario.valor).toBe("");
    expect(d.titular.valor).toBe("");
    expect(textoParaCopiar([d.destinatario, d.permiso])).toBe("Destinatario: (falta)\nN° del título habilitante (permiso): 25-UCA-PER-001");
  });
});

describe("permisos del lote del cubicador", () => {
  it("ficha + bloques sin repetir; un solo bloque con permiso da su id", () => {
    const r = permisosDelLote("25-UCA-PER-001", [
      { id: "b1", permiso: "25-uca-per-001" },
      { id: "b2", permiso: null },
    ]);
    expect(r).toEqual({ permisos: ["25-UCA-PER-001"], bloqueId: "b1" });
    expect(permisosDelLote("", [{ id: "b1", permiso: "A" }, { id: "b2", permiso: "B" }])).toEqual({ permisos: ["A", "B"], bloqueId: null });
    expect(permisosDelLote(undefined, []).permisos).toEqual([]);
  });
});
