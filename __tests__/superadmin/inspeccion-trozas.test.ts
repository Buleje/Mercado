/**
 * Las trozas de una inspección: el conteo se clava al libro congelado al
 * abrirla (no a lo que mande el equipo) y los totales salen de la misma cuenta
 * del acta del patio, con los códigos desconocidos entre los sobrantes.
 */
import { describe, expect, it } from "vitest";
import { anotarDesconocido, anotarTroza, nuevoConteo, type TrozaDelConteo } from "@/lib/forestal/conteo-patio";
import {
  conteoDeLaInspeccion,
  trozasDeConteo,
  trozasDeResumen,
} from "@/lib/superadmin/plantas-forestales/inspeccion";
import type { InspeccionPlanta } from "@/lib/superadmin/plantas-forestales/tipos";

const troza = (id: string, m3: number): TrozaDelConteo => ({
  id,
  codificacion: null,
  codigoPlanta: id.toUpperCase(),
  especieComun: "Cumala",
  gtfNumber: "019-001-0000001",
  volumenM3: m3,
  motivo: null,
});

const PATIO = [troza("t-a", 1.2), troza("t-b", 0.8)];
const TOMADA = "2026-10-17T14:00:00.000Z";

const inspeccion: Pick<InspeccionPlanta, "fecha" | "inspector" | "libro"> = {
  fecha: "2026-10-17",
  inspector: "superadmin",
  libro: {
    tomadaEn: TOMADA,
    trozas: null,
    aserrada: null,
    movimiento: null,
    incoherencias: { error: 0, warning: 0, info: 0, m3EnJuego: 0 },
    trozasDelPatio: PATIO,
    trozasDelPatioTruncado: true,
    incoherenciasDetalle: [],
  },
};

describe("trozas de la inspección", () => {
  it("1 contada + 1 desconocida: faltan 1, sobran 1 (el código que no es de ninguna troza)", () => {
    let c = nuevoConteo({ fecha: "2026-10-17", quien: "x", trozas: PATIO, ahora: TOMADA });
    c = anotarTroza(c, PATIO[0], TOMADA);
    c = anotarDesconocido(c, "ZZ-9", TOMADA);
    expect(trozasDeConteo(c)).toEqual({
      esperadas: 2,
      contadas: 1,
      faltantes: 1,
      sobrantes: 1,
      m3Esperado: 2,
      m3Contado: 1.2,
    });
  });

  it("contar la misma troza dos veces no suma dos", () => {
    let c = nuevoConteo({ fecha: "2026-10-17", quien: "x", trozas: PATIO, ahora: TOMADA });
    c = anotarTroza(anotarTroza(c, PATIO[0], TOMADA), PATIO[0], TOMADA);
    expect(trozasDeConteo(c)).toMatchObject({ contadas: 1, faltantes: 1, sobrantes: 0 });
  });

  it("las cuentas de la base sin sorpresas (actas viejas) no inventan sobrantes", () => {
    expect(
      trozasDeResumen({ esperadas: 5, contadas: 4, faltan: 1, sobrantes: 2, m3Esperado: 3, m3Contado: 2.4 }),
    ).toMatchObject({ faltantes: 1, sobrantes: 2 });
    expect(
      trozasDeResumen({ esperadas: 5, contadas: 4, faltan: 1, sobrantes: 2, sorpresas: 3, m3Esperado: 3, m3Contado: 2.4 }),
    ).toMatchObject({ sobrantes: 5 });
  });

  it("el conteo del equipo se clava a la foto congelada: trozas, día, inicio y truncado del servidor", () => {
    let c = nuevoConteo({ fecha: "2020-01-01", quien: "  ", trozas: [], ahora: "2020-01-01T00:00:00.000Z" });
    c = anotarTroza(c, PATIO[1], TOMADA);
    const clavado = conteoDeLaInspeccion(c, inspeccion);
    expect(clavado.trozas).toBe(PATIO);
    expect(clavado.fecha).toBe("2026-10-17");
    expect(clavado.iniciadoEn).toBe(TOMADA);
    expect(clavado.fotoEn).toBe(TOMADA);
    expect(clavado.truncado).toBe(true);
    expect(clavado.quien).toBe("superadmin");
    /* Lo que sí manda el equipo: las lecturas. Contra el patio vacío era sorpresa; clavado, es encontrada. */
    expect(trozasDeConteo(c)).toMatchObject({ esperadas: 0, sobrantes: 1 });
    expect(trozasDeConteo(clavado)).toMatchObject({ esperadas: 2, contadas: 1, faltantes: 1, sobrantes: 0 });
  });
});
