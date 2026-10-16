/**
 * Cambiar el plan de «Despachar con guía» con datos escritos (15-10): lo del
 * permiso se toma del nuevo, lo escrito se queda, y el N° sólo se pierde si
 * el talonario es de otro titular.
 */
import { describe, expect, it } from "vitest";
import { gtfDatosVacio, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { conservarLoEscrito, mismoTalonario, sembradaParaElTraslado } from "@/lib/forestal/loth-guia-cambio-de-plan";

/** La siembra de un plan: su titular, su título y su N° de lista. */
function siembra(titular: string, titulo: string, lista: string): GtfDatos {
  const d = gtfDatosVacio();
  return {
    ...d,
    propietario: { ...d.propietario, nombre: titular, esElCtp: true },
    titulos: [titulo],
    guia: { ...d.guia, listaTrozasNro: lista, autoridad: `ARFFS ${titular}` },
  };
}

describe("conservarLoEscrito", () => {
  const antes = siembra("JUAN PÉREZ", "PO-001", "0001");
  const nueva = siembra("ANA RÍOS", "PO-002", "0050");
  const escrita: GtfDatos = {
    ...antes,
    destinatario: { ...antes.destinatario, nombre: "ASERRADERO EL PINO", docNumero: "20123456789" },
    vehiculo: { ...antes.vehiculo, placa: "ABC-123" },
    observaciones: "Sale de noche",
  };

  it("lo escrito que no es del permiso se queda", () => {
    const r = conservarLoEscrito(nueva, escrita, antes);
    expect(r.destinatario.nombre).toBe("ASERRADERO EL PINO");
    expect(r.destinatario.docNumero).toBe("20123456789");
    expect(r.vehiculo.placa).toBe("ABC-123");
    expect(r.observaciones).toBe("Sale de noche");
  });

  it("lo del permiso sale del nuevo aunque se haya tocado", () => {
    const tocada: GtfDatos = { ...escrita, titulos: ["PO-001 corregido"], guia: { ...escrita.guia, listaTrozasNro: "0099" } };
    const r = conservarLoEscrito(nueva, tocada, antes);
    expect(r.titulos).toEqual(["PO-002"]);
    expect(r.propietario.nombre).toBe("ANA RÍOS");
    expect(r.guia.listaTrozasNro).toBe("0050");
    expect(r.guia.autoridad).toBe("ARFFS ANA RÍOS");
  });

  it("sin nada escrito, es la siembra nueva", () => {
    expect(conservarLoEscrito(nueva, antes, antes)).toEqual(nueva);
  });

  it("el propietario escrito a mano («Es el titular» apagado) se queda", () => {
    const otro: GtfDatos = { ...escrita, propietario: { ...escrita.propietario, nombre: "COMPRADOR SAC", esElCtp: false } };
    expect(conservarLoEscrito(nueva, otro, antes).propietario.nombre).toBe("COMPRADOR SAC");
  });
});

describe("sembradaParaElTraslado", () => {
  const nueva = gtfDatosVacio();
  const llegada = { direccion: "Jr. Lima 120", departamento: "UCAYALI", provincia: "CORONEL PORTILLO", distrito: "CALLERIA" };

  it("una llegada que sigue al destinatario sigue siendo automática", () => {
    const final: GtfDatos = { ...nueva, destinatario: { ...nueva.destinatario, ...llegada }, traslado: { ...nueva.traslado, llegada } };
    expect(sembradaParaElTraslado(final, nueva)).toBe(final);
  });

  it("una llegada escrita a mano sigue contando como escrita", () => {
    const final: GtfDatos = { ...nueva, traslado: { ...nueva.traslado, llegada } };
    expect(sembradaParaElTraslado(final, nueva)).toBe(nueva);
  });
});

describe("mismoTalonario", () => {
  const juan = { titular: "JUAN PÉREZ", permiso: "PO-001", planId: "p1" };
  it("mismo titular y misma serie: el N° sirve", () => {
    expect(mismoTalonario({ serie: "019", dueno: juan }, { serie: "019", dueno: { ...juan, planId: "p2", permiso: "PO-002" } })).toBe(true);
  });
  it("otro titular: el N° es de otro talonario", () => {
    expect(mismoTalonario({ serie: "019", dueno: juan }, { serie: "019", dueno: { titular: "ANA RÍOS", permiso: "PO-002", planId: "p2" } })).toBe(false);
  });
  it("otra serie (otra región): tampoco", () => {
    expect(mismoTalonario({ serie: "019", dueno: juan }, { serie: "025", dueno: juan })).toBe(false);
  });
});
