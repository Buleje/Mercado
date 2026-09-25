/**
 * Reservas vencidas → pendientes del libro: qué cuenta como vencida y cómo se dice.
 *
 * El caso que lo motivó es real (Blas, 23/09/2026): el paquete SL-7 de la corrida
 * N° 29, Cachimbo, apartado «para Juancho» hasta el martes 22/09 y nunca soltado.
 * Lo que no puede fallar:
 *   · vence por DÍA en Lima, no por hora — la reserva «hasta el martes» vale el
 *     martes entero, también a las 23:30 de Pucallpa (04:30 UTC del miércoles);
 *   · sin plazo no vence nunca, y una liberada ya no congela nada;
 *   · la más vieja primero, y el texto que lee el operador.
 */
import { describe, expect, it } from "vitest";
import {
  DIAS_EXTENSION,
  detalleReservaVencida,
  esReservaVencida,
  plazoPropuesto,
  reservasVencidas,
  resumenReservasVencidas,
  textoReservaVencida,
  type ApartadoConPlazo,
} from "@/lib/forestal/reservas-vencidas";
import { formatNumber } from "@/lib/format";

/** 23/09/2026 al mediodía en Lima. */
const MIERCOLES = new Date("2026-09-23T12:00:00-05:00");

const reserva = (x: Partial<ApartadoConPlazo> = {}): ApartadoConPlazo => ({
  id: "ap-juancho",
  para: "Juancho",
  hasta: "2026-09-22",
  liberadoAt: null,
  lineNo: 29,
  especie: "Cachimbo",
  producto: "MADERA ASERRADA (COMERCIAL)",
  paqueteCodigo: "SL-7",
  volumenM3: 1.25,
  ...x,
});

describe("esReservaVencida — por día en Lima, no por hora", () => {
  it("el plazo de ayer está vencido", () => {
    expect(esReservaVencida(reserva(), MIERCOLES)).toBe(true);
  });

  it("el plazo de hoy todavía vale (vence al terminar el día)", () => {
    expect(esReservaVencida(reserva({ hasta: "2026-09-23" }), MIERCOLES)).toBe(false);
  });

  it("a las 23:30 del martes en Pucallpa (ya miércoles en UTC) la del martes NO venció", () => {
    const martesNoche = new Date("2026-09-22T23:30:00-05:00");
    expect(martesNoche.toISOString().slice(0, 10)).toBe("2026-09-23"); // la trampa
    expect(esReservaVencida(reserva(), martesNoche)).toBe(false);
  });

  it("a las 00:30 del miércoles en Pucallpa sí venció", () => {
    expect(esReservaVencida(reserva(), new Date("2026-09-23T00:30:00-05:00"))).toBe(true);
  });

  it("sin plazo no vence nunca", () => {
    expect(esReservaVencida(reserva({ hasta: null }), MIERCOLES)).toBe(false);
  });

  it("una liberada no cuenta, aunque su plazo haya pasado", () => {
    expect(
      esReservaVencida(reserva({ liberadoAt: "2026-09-22T15:00:00.000Z" }), MIERCOLES),
    ).toBe(false);
  });
});

describe("reservasVencidas — cuáles y en qué orden", () => {
  it("se queda sólo con las vencidas vivas y cuenta los días", () => {
    const lista = reservasVencidas(
      [
        reserva(),
        reserva({ id: "sin-plazo", hasta: null }),
        reserva({ id: "liberada", liberadoAt: new Date("2026-09-20T10:00:00Z") }),
        reserva({ id: "vigente", hasta: "2026-09-30" }),
        reserva({ id: "hoy", hasta: "2026-09-23" }),
      ],
      MIERCOLES,
    );
    expect(lista.map((r) => r.id)).toEqual(["ap-juancho"]);
    expect(lista[0]!.diasVencida).toBe(1);
  });

  it("la más vieja primero; a igual antigüedad, por N° de corrida", () => {
    const lista = reservasVencidas(
      [
        reserva({ id: "b", lineNo: 31, hasta: "2026-09-22" }),
        reserva({ id: "vieja", lineNo: 40, hasta: "2026-09-10" }),
        reserva({ id: "a", lineNo: 29, hasta: "2026-09-22" }),
      ],
      MIERCOLES,
    );
    expect(lista.map((r) => [r.id, r.diasVencida])).toEqual([
      ["vieja", 13],
      ["a", 1],
      ["b", 1],
    ]);
  });

  it("recorta el `hasta` a su día aunque llegue con hora", () => {
    const [r] = reservasVencidas([reserva({ hasta: "2026-09-22T00:00:00.000Z" })], MIERCOLES);
    expect(r!.hasta).toBe("2026-09-22");
  });
});

describe("cómo se lee", () => {
  const [juancho] = reservasVencidas([reserva()], MIERCOLES);

  it("el texto de la fila, con el día por su nombre", () => {
    expect(textoReservaVencida(juancho!)).toBe(
      "Reserva vencida: N° 29 Cachimbo para Juancho, venció el martes 22/09 (hace 1 día)",
    );
  });

  it("plural de los días y sin especie no deja un espacio suelto", () => {
    const [r] = reservasVencidas(
      [reserva({ especie: null, lineNo: 3, para: "Maderera B.", hasta: "2026-09-19" })],
      MIERCOLES,
    );
    expect(textoReservaVencida(r!)).toBe(
      "Reserva vencida: N° 3 para Maderera B, venció el sábado 19/09 (hace 4 días)",
    );
  });

  it("el detalle dice qué madera es: el paquete con sus m³, o la corrida entera sin inventarlos", () => {
    expect(detalleReservaVencida(juancho!)).toBe(
      `Paquete SL-7 · ${formatNumber(1.25, 3)} m³ · MADERA ASERRADA (COMERCIAL)`,
    );
    const [corrida] = reservasVencidas(
      [reserva({ paqueteCodigo: null, volumenM3: null })],
      MIERCOLES,
    );
    expect(detalleReservaVencida(corrida!)).toBe("Corrida entera · MADERA ASERRADA (COMERCIAL)");
  });

  it("el resumen cuenta en singular y plural", () => {
    expect(resumenReservasVencidas(1)).toBe("1 reserva vencida");
    expect(resumenReservasVencidas(3)).toBe("3 reservas vencidas");
  });
});

describe("plazoPropuesto — «Extender» propone una semana desde HOY en Lima", () => {
  it("hoy + 7, no el plazo viejo + 7 (que podría seguir vencido)", () => {
    expect(DIAS_EXTENSION).toBe(7);
    expect(plazoPropuesto(MIERCOLES)).toBe("2026-09-30");
  });

  it("a las 20:00 de Pucallpa sigue contando desde el día de Lima, no del UTC", () => {
    const noche = new Date("2026-09-23T20:00:00-05:00");
    expect(noche.toISOString().slice(0, 10)).toBe("2026-09-24");
    expect(plazoPropuesto(noche)).toBe("2026-09-30");
  });
});
