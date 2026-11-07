/**
 * Personas de Adelantos (Brandon 30-10): chips por tipo que recortan la tabla
 * y los indicadores, «Completar datos» en lote (qué cambió en cada fila y qué
 * viaja en el PATCH) y la columna Tipo del Excel/CSV.
 */
import { describe, expect, it } from "vitest";
import {
  coincideBusqueda,
  cuentasPorTipo,
  cumpleTipo,
  filtrarPersonas,
  tipoDePersona,
  type PersonaOrdenable,
} from "@/lib/adelantos/ordenar-personas";
import { cambioDeLaFila, celularParaGuardar, cuerpoPatch, faltaParaCompletar, filaCompletarDe, type PersonaDatos } from "@/lib/adelantos/datos-persona";
import { personasACsv, personasAFilasExcel } from "@/lib/adelantos/exportar-csv";
import type { BeneficiarioConSaldo } from "@/components/admin/adelantos/crear-adelanto/tipos";

const p = (x: Partial<PersonaOrdenable> & { nombre: string }): PersonaOrdenable => ({
  totalAdelantado: {},
  saldoPendiente: {},
  totalEntregado: {},
  saldoAFavor: {},
  adelantosAbiertos: 0,
  adelantosLiquidados: 0,
  adelantosCancelados: 0,
  ultimoAdelanto: null,
  totalRecibido: {},
  recibidoPendiente: {},
  recibidoExcedido: {},
  recibidosAbiertos: 0,
  teDebe: {},
  leDebes: {},
  neto: {},
  ...x,
});
const nombres = (xs: PersonaOrdenable[]) => xs.map((x) => x.nombre);

const gente = [
  p({ nombre: "Juan Chofer", tipoRelacion: "chofer", saldoPendiente: { PEN: 100 }, telefono: "987654321", documento: "45678912" }),
  p({ nombre: "Rosa Chofer", tipoRelacion: "chofer", telefono: "987 111 222" }),
  p({ nombre: "María Proveedora", tipoRelacion: "proveedor", saldoPendiente: { PEN: 50 }, documento: "20123456789" }),
  p({ nombre: "Pedro", tipoRelacion: null }),
  p({ nombre: "Lucho", tipoRelacion: "astronauta" }),
];

describe("tipo de la persona", () => {
  it("sin tipo, vacío o un valor que no es de la lista = «sin-tipo»", () => {
    expect(tipoDePersona({ tipoRelacion: "chofer" })).toBe("chofer");
    expect(tipoDePersona({ tipoRelacion: null })).toBe("sin-tipo");
    expect(tipoDePersona({ tipoRelacion: "  " })).toBe("sin-tipo");
    expect(tipoDePersona({ tipoRelacion: "astronauta" })).toBe("sin-tipo");
  });

  it("sin tipo elegido pasan todas", () => {
    expect(gente.every((x) => cumpleTipo(x, null))).toBe(true);
  });

  it("cuenta cuántas hay de cada tipo, con los seis tipos y «sin-tipo» siempre presentes", () => {
    const c = cuentasPorTipo(gente);
    expect(c.chofer).toBe(2);
    expect(c.proveedor).toBe(1);
    expect(c["sin-tipo"]).toBe(2);
    expect(c.familia).toBe(0);
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(gente.length);
  });
});

describe("filtrarPersonas: tipo + situación + buscador juntos", () => {
  it("el tipo recorta y se combina con la situación", () => {
    expect(nombres(filtrarPersonas(gente, { filtro: "todas", tipo: "chofer", q: "" }))).toEqual(["Juan Chofer", "Rosa Chofer"]);
    expect(nombres(filtrarPersonas(gente, { filtro: "deben", tipo: "chofer", q: "" }))).toEqual(["Juan Chofer"]);
    expect(nombres(filtrarPersonas(gente, { filtro: "deben", tipo: null, q: "" }))).toEqual(["Juan Chofer", "María Proveedora"]);
  });

  it("«Sin tipo» junta a los que no tienen y a los de un tipo desconocido", () => {
    expect(nombres(filtrarPersonas(gente, { filtro: "todas", tipo: "sin-tipo", q: "" }))).toEqual(["Pedro", "Lucho"]);
  });

  it("y con el buscador", () => {
    expect(nombres(filtrarPersonas(gente, { filtro: "todas", tipo: "chofer", q: "rosa" }))).toEqual(["Rosa Chofer"]);
    expect(nombres(filtrarPersonas(gente, { filtro: "todas", tipo: "proveedor", q: "rosa" }))).toEqual([]);
  });

  it("el buscador: sin tildes, por documento y por teléfono escrito con espacios", () => {
    expect(coincideBusqueda(gente[2], "maria")).toBe(true);
    expect(coincideBusqueda(gente[2], "2012345")).toBe(true);
    expect(coincideBusqueda(gente[1], "987111")).toBe(true);
    expect(coincideBusqueda(gente[1], "987 111 2")).toBe(true);
    expect(coincideBusqueda(gente[0], "")).toBe(true);
    expect(coincideBusqueda(gente[0], "zzz")).toBe(false);
  });
});

/** Una ficha completa, como la devuelve la lista (lo que NO se toca tiene que volver igual). */
const ficha: PersonaDatos = {
  nombre: "QA Recibo",
  documento: null,
  telefono: "987654321",
  notas: "Paga los sábados",
  limiteCredito: 500,
  email: "qa@ejemplo.pe",
  banco: "BCP",
  cuentaBancaria: "191-1234",
  cci: null,
  direccion: "Jr. Ucayali 123",
  departamento: "Ucayali",
  provincia: "Coronel Portillo",
  distrito: "Callería",
  tipoDocumento: null,
  razonSocial: null,
  estadoSunat: null,
  condicionSunat: null,
  verificadoEn: "2026-10-01T12:00:00.000Z",
  activo: true,
  tipoRelacion: null,
};

describe("Completar datos en lote: qué cambió en la fila", () => {
  it("lo que está en la ficha, como texto para los campos", () => {
    expect(filaCompletarDe(ficha)).toEqual({ documento: "", telefono: "987654321", tipoRelacion: "" });
  });

  it("sin escribir nada no hay cambio", () => {
    expect(cambioDeLaFila(ficha, filaCompletarDe(ficha))).toBeNull();
    /* El celular guardado con espacios no es un cambio si nadie lo tocó. */
    const conEspacios = { ...ficha, telefono: "987 654 321" };
    expect(cambioDeLaFila(conEspacios, filaCompletarDe(conEspacios))).toBeNull();
  });

  it("sólo viaja lo que cambió", () => {
    expect(cambioDeLaFila(ficha, { documento: "", telefono: "987654321", tipoRelacion: "chofer" })).toEqual({ tipoRelacion: "chofer" });
    expect(cambioDeLaFila(ficha, { documento: "45678912", telefono: "987654321", tipoRelacion: "" })).toEqual({ documento: "45678912" });
    /* Quitarle el tipo es un cambio (a null). */
    expect(cambioDeLaFila({ ...ficha, tipoRelacion: "chofer" }, { documento: "", telefono: "987654321", tipoRelacion: "" })).toEqual({ tipoRelacion: null });
  });

  it("el documento con espacios es el mismo documento", () => {
    const conDoc = { ...ficha, documento: "45678912" };
    expect(cambioDeLaFila(conDoc, { documento: " 4567 8912 ", telefono: "987654321", tipoRelacion: "" })).toBeNull();
  });

  it("el celular se guarda limpio si es un celular peruano; si no, tal cual lo escribió", () => {
    expect(celularParaGuardar("987 654-321")).toBe("987654321");
    expect(celularParaGuardar(" 061 57 1234 ")).toBe("061 57 1234");
  });

  it("falta algo para completar: DNI/RUC, celular o tipo", () => {
    expect(faltaParaCompletar(ficha)).toBe(true);
    expect(faltaParaCompletar({ ...ficha, documento: "45678912" })).toBe(true); // falta el tipo
    expect(faltaParaCompletar({ ...ficha, documento: "45678912", tipoRelacion: "chofer" })).toBe(false);
  });
});

describe("cuerpoPatch con el tipo", () => {
  it("sin cambio de tipo NO manda la clave (la ruta deja tipo, Yape, referencia y foto como estaban)", () => {
    const cuerpo = cuerpoPatch(ficha, { documento: "45678912" });
    expect("tipoRelacion" in cuerpo).toBe(false);
    expect("yape" in cuerpo).toBe(false);
    expect("fotoDocumentoKey" in cuerpo).toBe(false);
  });

  it("con el tipo manda sólo eso encima de la ficha entera, sin perder nada", () => {
    const cuerpo = cuerpoPatch(ficha, { tipoRelacion: "chofer" });
    expect(cuerpo).toMatchObject({
      nombre: "QA Recibo",
      telefono: "987654321",
      notas: "Paga los sábados",
      limiteCredito: 500,
      email: "qa@ejemplo.pe",
      banco: "BCP",
      direccion: "Jr. Ucayali 123",
      verificadoEn: "2026-10-01T12:00:00.000Z",
      activo: true,
      tipoRelacion: "chofer",
    });
    /* Sin documento en la ficha ni en el cambio: no viaja (no se borra ni se inventa). */
    expect(cuerpo.documento).toBeUndefined();
  });

  it("quitar el tipo manda null", () => {
    expect(cuerpoPatch({ ...ficha, tipoRelacion: "chofer" }, { tipoRelacion: null }).tipoRelacion).toBeNull();
  });
});

describe("Excel y CSV con la columna Tipo", () => {
  const b = (x: Partial<BeneficiarioConSaldo>) => ({ ...p({ nombre: "X" }), id: "1", activo: true, ...x }) as BeneficiarioConSaldo;

  it("el CSV trae «Tipo» después del teléfono, con la palabra y no el código", () => {
    const [cab, fila, sinTipo] = personasACsv([b({ nombre: "Juan", telefono: "987654321", tipoRelacion: "chofer" }), b({ nombre: "Pedro" })])
      .replace(/^﻿/, "")
      .split("\n");
    const cols = cab.split(";");
    expect(cols.slice(0, 4)).toEqual(["Nombre", "Documento", "Teléfono", "Tipo"]);
    expect(fila.split(";")[3]).toBe("Chofer");
    expect(sinTipo.split(";")[3]).toBe("");
  });

  it("el Excel también", () => {
    const [fila] = personasAFilasExcel([b({ nombre: "María", tipoRelacion: "proveedor" })]);
    expect(fila.Tipo).toBe("Proveedor");
  });
});
