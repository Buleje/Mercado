import { describe, expect, it } from "vitest";
import { componerPunto, conPunto, faltantesGtf, gtfDatosVacio, ubicacionDelPunto } from "@/lib/forestal/ctp-gtf-datos";
import { partidaSembrada, rellenarGuia, ubicacionDePlanta } from "@/lib/forestal/gtf-autocompletar";

const FICHA = { razonSocial: "ASERRADERO X", ruc: "20123456789", direccion: "JR. LOS PINOS 120", region: "Pasco", provincia: "Oxapampa", distrito: "Constitucion" };

describe("Traslado del CTP por partes", () => {
  it("la partida sale de la Ficha: dirección + ubigeo del padrón, y el texto impreso en el orden de SERFOR", () => {
    const u = ubicacionDePlanta(FICHA);
    expect(u.direccion).toBe("JR. LOS PINOS 120");
    expect(u).toEqual({ direccion: "JR. LOS PINOS 120", departamento: "Pasco", provincia: "Oxapampa", distrito: "Constitución" });
    expect(componerPunto(u)).toBe("JR. LOS PINOS 120, Constitución, Oxapampa, Pasco");
  });

  it("sin ubigeo en la Ficha los casilleros quedan vacíos (no se inventan)", () => {
    const u = ubicacionDePlanta({ direccion: "Jr. Sin Ubigeo 5" });
    expect(u).toEqual({ direccion: "Jr. Sin Ubigeo 5", departamento: "", provincia: "", distrito: "" });
  });

  it("con sólo el código de ubigeo de la Ficha, los nombres salen del padrón", () => {
    const u = ubicacionDePlanta({ direccion: "Jr. X 1", ubigeo: "190301" });
    expect(u).toEqual({ direccion: "Jr. X 1", departamento: "Pasco", provincia: "Oxapampa", distrito: "Oxapampa" });
  });

  it("partidaSembrada no pisa una partida que ya dice algo", () => {
    const tr = { ...gtfDatosVacio().traslado, puntoPartida: "Mi patio" };
    expect(partidaSembrada(tr, FICHA)).toEqual({});
    expect(partidaSembrada(gtfDatosVacio().traslado, { direccion: "" })).toEqual({});
  });

  it("rellenarGuia siembra partida y llegada por casilleros y deja el texto compuesto", () => {
    const d = gtfDatosVacio();
    d.destinatario = { ...d.destinatario, nombre: "Cliente", direccion: "Av. Lima 9", departamento: "LIMA", provincia: "LIMA", distrito: "ATE" };
    const r = rellenarGuia(d, { ficha: FICHA }).datos.traslado;
    expect(r.partida.provincia).toBe("Oxapampa");
    expect(r.puntoPartida).toBe(componerPunto(r.partida));
    expect(r.llegada).toEqual({ direccion: "Av. Lima 9", departamento: "LIMA", provincia: "LIMA", distrito: "ATE" });
    expect(r.puntoLlegada).toBe("Av. Lima 9, ATE, LIMA, LIMA");
  });

  it("una guía vieja (sólo texto) se ve en la dirección y se puede desarmar sin perderlo", () => {
    const tr = { ...gtfDatosVacio().traslado, puntoPartida: "Pucallpa km 5" };
    expect(ubicacionDelPunto(tr, "partida").direccion).toBe("Pucallpa km 5");
    const nuevo = conPunto(tr, "partida", { ...ubicacionDelPunto(tr, "partida"), departamento: "UCAYALI" });
    expect(nuevo.puntoPartida).toBe("Pucallpa km 5, UCAYALI");
  });

  it("faltantesGtf pide el ubigeo sólo cuando la partida va por casilleros; la vieja se imprime como estaba", () => {
    const base = gtfDatosVacio();
    const vieja = { ...base, traslado: { ...base.traslado, puntoPartida: "Pucallpa", puntoLlegada: "Lima" } };
    expect(faltantesGtf(vieja).some((f) => f.campo.startsWith("Partida:"))).toBe(false);
    const nueva = { ...base, traslado: conPunto(vieja.traslado, "partida", { direccion: "Jr. X 1" }) };
    const campos = faltantesGtf(nueva).map((f) => f.campo);
    expect(campos).toEqual(expect.arrayContaining(["Partida: departamento", "Partida: provincia", "Partida: distrito"]));
    const completa = { ...base, traslado: conPunto(nueva.traslado, "partida", { departamento: "Pasco", provincia: "Oxapampa", distrito: "Oxapampa" }) };
    expect(faltantesGtf(completa).some((f) => f.campo.startsWith("Partida:"))).toBe(false);
  });
});
