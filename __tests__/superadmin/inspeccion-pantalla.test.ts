/**
 * Lo puro de la pantalla de inspección de planta (superadmin, fase 3): leer lo
 * que tipea el inspector, la aserrada contra el libro congelado, convertir una
 * incoherencia en hallazgo, el conteo clavado al libro y lo que va al acta.
 */
import { describe, expect, it } from "vitest";
import { anotarTroza, type TrozaDelConteo } from "@/lib/forestal/conteo-patio";
import type { ConteoAserrada, IncoherenciaPlanta, InspeccionPlanta } from "@/lib/superadmin/plantas-forestales/tipos";
import {
  aserradaInicial,
  borradorDe,
  conteoNuevo,
  filasConDiferencia,
  hallazgoDeIncoherencia,
  idDeIncoherencia,
  leerNumero,
  type InspeccionDeLaPantalla,
} from "@/components/superadmin/plantas/inspeccion/inspeccion-datos";
import { inspeccionParaActa } from "@/components/superadmin/plantas/inspeccion/imprimir-acta";
import { ordenarInspecciones } from "@/components/superadmin/plantas/inspeccion/use-inspecciones";
import type { FilaDeInspeccion } from "@/components/superadmin/plantas/inspeccion/TablaInspecciones";

const troza = (id: string, m3: number): TrozaDelConteo => ({
  id,
  codificacion: null,
  codigoPlanta: id.toUpperCase(),
  especieComun: "Cumala",
  gtfNumber: "001-123",
  volumenM3: m3,
  motivo: null,
});

const fila = (producto: string, libroM3: number, contadoM3: number | null): ConteoAserrada => ({
  producto,
  especie: "Cumala",
  libroM3,
  contadoM3,
  libroPiezas: null,
  contadoPiezas: null,
});

function inspeccion(extra: Partial<InspeccionPlanta> = {}): InspeccionDeLaPantalla {
  return {
    id: "insp-1",
    tenantId: "t-1",
    fecha: "2026-10-16",
    inspector: "Brandon",
    estado: "abierta",
    hallazgos: 0,
    faltantesTrozas: null,
    conteoPatioId: null,
    trozas: null,
    aserrada: [],
    hallazgosDetalle: [],
    conclusion: null,
    responsablePlanta: null,
    cerradaAt: null,
    libro: {
      tomadaEn: "2026-10-16T14:00:00.000Z",
      trozasDelPatio: [troza("a", 1.2), troza("b", 0.8)],
      aserrada: { porProducto: [{ producto: "Tabla 1x8", especie: "Cumala", m3: 3.5, pt: 1484, corridas: 1, paquetes: 2 }] },
    } as unknown as InspeccionPlanta["libro"],
    ...extra,
  };
}

describe("leerNumero", () => {
  it("acepta coma o punto decimal", () => {
    expect(leerNumero("12,5")).toBe(12.5);
    expect(leerNumero("12.5")).toBe(12.5);
    expect(leerNumero(" 3 ")).toBe(3);
  });
  it("coma de miles con punto decimal", () => {
    expect(leerNumero("1,234.5")).toBe(1234.5);
  });
  it("vacío = sin contar (null), nunca 0", () => {
    expect(leerNumero("")).toBeNull();
    expect(leerNumero("   ")).toBeNull();
  });
  it("lo que no es número = NaN (el campo lo marca)", () => {
    expect(leerNumero("abc")).toBeNaN();
    expect(leerNumero("-2")).toBeNaN();
  });
});

describe("aserradaInicial", () => {
  it("suma los productos del libro sin contar y no repite los ya anotados", () => {
    const i = inspeccion({ aserrada: [fila("Tabla 1x8", 3.5, 3.4)] });
    const r = aserradaInicial(i);
    expect(r).toHaveLength(1);
    expect(r[0].contadoM3).toBe(3.4);
  });
  it("un producto del libro sin contar entra con contado null", () => {
    const r = aserradaInicial(inspeccion());
    expect(r).toEqual([fila("Tabla 1x8", 3.5, null)]);
  });
});

describe("filasConDiferencia", () => {
  it("cuenta sólo las contadas que difieren más que la tolerancia", () => {
    expect(filasConDiferencia([fila("a", 3.5, 3.5), fila("b", 2, 1.5), fila("c", 1, null), fila("d", 1, 1.0004)])).toBe(1);
  });
});

describe("hallazgoDeIncoherencia", () => {
  const inc: IncoherenciaPlanta = {
    id: "saldo:cumala",
    tenantId: "t-1",
    plantaNombre: "Planta",
    origen: "saldo",
    clave: "saldo:cumala",
    gravedad: "error",
    titulo: "Cumala en −3,214 m³",
    detalle: "Salió más de lo que entró",
    m3EnJuego: -3.214,
    referencia: { tipo: "especie", valor: "Cumala" },
    enlaceLibro: "tab=ctp-libro-operaciones",
  };
  it("m³ en positivo, id estable y texto con el detalle", () => {
    const h = hallazgoDeIncoherencia(inc);
    expect(h.m3).toBe(3.214);
    expect(h.id).toBe(idDeIncoherencia(inc));
    expect(h.id).toBe(hallazgoDeIncoherencia({ ...inc }).id);
    expect(h.texto).toBe("Cumala en −3,214 m³. Salió más de lo que entró");
    expect(h.referencia).toEqual({ tipo: "especie", valor: "Cumala" });
  });
  it("sin m³ en juego queda null, no 0", () => {
    expect(hallazgoDeIncoherencia({ ...inc, m3EnJuego: null }).m3).toBeNull();
  });
});

describe("conteoNuevo", () => {
  it("clavado al libro congelado: inicio y foto = tomadaEn, trozas del libro", () => {
    const c = conteoNuevo(inspeccion());
    expect(c.iniciadoEn).toBe("2026-10-16T14:00:00.000Z");
    expect(c.fotoEn).toBe("2026-10-16T14:00:00.000Z");
    expect(c.trozas.map((t) => t.id)).toEqual(["a", "b"]);
    expect(c.lecturas).toEqual([]);
    expect(c.quien).toBe("Brandon");
  });
});

describe("inspeccionParaActa", () => {
  it("el borrador de la pantalla pisa lo guardado y el conteo del equipo da las trozas", () => {
    const i = inspeccion();
    const b = { ...borradorDe(i), conclusion: "  Cuadra  ", responsablePlanta: "" };
    const c = anotarTroza(conteoNuevo(i), troza("a", 1.2), "2026-10-16T14:05:00.000Z");
    const a = inspeccionParaActa(i, b, c);
    expect(a.conclusion).toBe("Cuadra");
    expect(a.responsablePlanta).toBeNull();
    expect(a.conteoPatio).toBe(c);
    expect(a.trozas).toMatchObject({ esperadas: 2, contadas: 1, faltantes: 1 });
  });
  it("sin conteo en el equipo ni en la base, deja las trozas como estaban", () => {
    const i = inspeccion({ trozas: null });
    expect(inspeccionParaActa(i, null, null).trozas).toBeNull();
  });
});

describe("ordenarInspecciones", () => {
  const f = (id: string, fecha: string, estado: FilaDeInspeccion["estado"]): FilaDeInspeccion => ({
    id,
    tenantId: "t",
    fecha,
    estado,
    inspector: "x",
    hallazgos: 0,
    faltantesTrozas: null,
  });
  it("la más nueva primero; el mismo día, la abierta antes", () => {
    const r = ordenarInspecciones([f("1", "2026-10-10", "cerrada"), f("2", "2026-10-16", "anulada"), f("3", "2026-10-16", "abierta")]);
    expect(r.map((x) => x.id)).toEqual(["3", "2", "1"]);
  });
});
