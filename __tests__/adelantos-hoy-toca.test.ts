/**
 * «Hoy toca» del Resumen de Adelantos y el aviso de los lunes (25-10):
 * `queHacerHoy`, `avisoSemanal`, `lunesDeLaSemana`, `inicioDelMesLima`.
 *
 * El caso que lo pidió: en Blas, Quispe con S/ 17,000 dados el 03/08 y ni una
 * entrega en 83 días; ninguno con fecha, ninguno firmado, nadie con celular.
 */

import { describe, it, expect } from "vitest";
import {
  avisoSemanal,
  DESTINOS_HOY_TOCA,
  inicioDelMesLima,
  lunesDeLaSemana,
  montoPorCobrar,
  queHacerHoy,
  TOPE_AVISO,
  type AdelantoHoyToca,
  type PersonaHoyToca,
  type TareaHoy,
} from "@/lib/adelantos/hoy-toca";

/** Domingo 25-10-2026, mediodía de Lima (17:00 UTC). */
const AHORA = new Date("2026-10-25T17:00:00.000Z");

const adelanto = (p: Partial<AdelantoHoyToca> & Pick<AdelantoHoyToca, "id" | "beneficiarioId">): AdelantoHoyToca => ({
  saldoPendiente: 100,
  moneda: "PEN",
  fechaAdelanto: "2026-10-20T15:00:00.000Z",
  firmado: true,
  fechaVencimiento: "2026-12-01T05:00:00.000Z",
  ...p,
});
const persona = (id: string, nombre: string, p: Partial<PersonaHoyToca> = {}): PersonaHoyToca => ({ id, nombre, telefono: "987654321", ...p });
const tipos = (t: readonly TareaHoy[]) => t.map((x) => x.tipo);

describe("queHacerHoy — cobrar", () => {
  it("Quispe: S/ 17,000 dados el 03/08 sin entregas → «sin moverse hace 83 días», con la ficha de su adelanto", () => {
    const t = queHacerHoy(
      {
        adelantos: [adelanto({ id: "a1", codigoOperacion: "ADL-0007", beneficiarioId: "q", saldoPendiente: 17000, fechaAdelanto: "2026-08-03T17:00:00.000Z" })],
        personas: [persona("q", "Quispe")],
      },
      AHORA,
    );
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({
      id: "cobrar:q",
      tipo: "cobrar",
      titulo: "Cobrar a Quispe",
      detalle: "S/ 17,000.00 sin moverse hace 83 días",
      monto: { PEN: 17000 },
      boton: "Cobrar",
      adelantoId: "a1",
      href: DESTINOS_HOY_TOCA.adelanto("ADL-0007"),
    });
  });

  it("el nombre con espacios de más se lee de corrido («Quispe Galindo  Victor» de Blas)", () => {
    const t = queHacerHoy(
      { adelantos: [adelanto({ id: "a1", beneficiarioId: "q", fechaAdelanto: "2026-08-03T17:00:00.000Z" })], personas: [persona("q", " Quispe Galindo  Victor ")] },
      AHORA,
    );
    expect(t[0].titulo).toBe("Cobrar a Quispe Galindo Victor");
  });

  it("29 días todavía no; 30 sí (el umbral del aviso de antes)", () => {
    const de = (fecha: string) =>
      queHacerHoy({ adelantos: [adelanto({ id: "a", beneficiarioId: "p", fechaAdelanto: fecha })], personas: [persona("p", "Ana")] }, AHORA);
    expect(tipos(de("2026-09-26T17:00:00.000Z"))).toEqual([]);
    expect(de("2026-09-25T17:00:00.000Z")[0]?.detalle).toBe("S/ 100.00 sin moverse hace 30 días");
  });

  it("una gestión de cobranza reciente a la persona lo saca", () => {
    const t = queHacerHoy(
      {
        adelantos: [adelanto({ id: "a1", beneficiarioId: "q", saldoPendiente: 17000, fechaAdelanto: "2026-08-03T17:00:00.000Z" })],
        personas: [persona("q", "Quispe", { ultimaGestion: "2026-10-20T15:00:00.000Z" })],
      },
      AHORA,
    );
    expect(tipos(t)).not.toContain("cobrar");
  });

  it("una entrega reciente en ESE adelanto lo saca; una anulada no llega (la base la filtra)", () => {
    const t = queHacerHoy(
      {
        adelantos: [adelanto({ id: "a1", beneficiarioId: "q", fechaAdelanto: "2026-08-03T17:00:00.000Z", ultimaEntrega: "2026-10-10T15:00:00.000Z" })],
        personas: [persona("q", "Quispe")],
      },
      AHORA,
    );
    expect(tipos(t)).not.toContain("cobrar");
  });

  it("vencido sin gestión → cobrar aunque se haya dado hace poco; dice cuándo venció", () => {
    const t = queHacerHoy(
      {
        adelantos: [adelanto({ id: "a1", beneficiarioId: "p", fechaAdelanto: "2026-10-10T15:00:00.000Z", fechaVencimiento: "2026-10-20T05:00:00.000Z" })],
        personas: [persona("p", "Pedro")],
      },
      AHORA,
    );
    expect(t[0]).toMatchObject({ tipo: "cobrar", detalle: "S/ 100.00 venció hace 5 días (el 20/10/2026)" });
  });

  it("vencido con una gestión DESPUÉS del vencimiento → ya está en manos de alguien, no sale", () => {
    const t = queHacerHoy(
      {
        adelantos: [adelanto({ id: "a1", beneficiarioId: "p", fechaAdelanto: "2026-10-10T15:00:00.000Z", fechaVencimiento: "2026-10-20T05:00:00.000Z" })],
        personas: [persona("p", "Pedro", { ultimaGestion: "2026-10-22T15:00:00.000Z" })],
      },
      AHORA,
    );
    expect(tipos(t)).toEqual([]);
  });

  it("vence HOY no es vencido", () => {
    const t = queHacerHoy(
      {
        adelantos: [adelanto({ id: "a1", beneficiarioId: "p", fechaVencimiento: "2026-10-25T05:00:00.000Z" })],
        personas: [persona("p", "Pedro")],
      },
      AHORA,
    );
    expect(tipos(t)).toEqual([]);
  });

  it("una cuota pactada vencida también cuenta como compromiso vencido", () => {
    const t = queHacerHoy(
      {
        adelantos: [adelanto({ id: "a1", beneficiarioId: "p", fechaVencimiento: null, cuotasPendientes: ["2026-10-18T05:00:00.000Z", "2026-11-18T05:00:00.000Z"] })],
        personas: [persona("p", "Pedro")],
      },
      AHORA,
    );
    expect(t.map((x) => x.detalle)).toEqual(["S/ 100.00 venció hace 7 días (el 18/10/2026)"]);
  });

  it("varios adelantos de la misma persona: una tarea, la suma por moneda y la ficha del de MÁS saldo", () => {
    const t = queHacerHoy(
      {
        adelantos: [
          adelanto({ id: "chico", beneficiarioId: "w", saldoPendiente: 200, fechaAdelanto: "2026-08-01T15:00:00.000Z" }),
          adelanto({ id: "grande", beneficiarioId: "w", saldoPendiente: 900, fechaAdelanto: "2026-09-01T15:00:00.000Z" }),
          adelanto({ id: "dolar", beneficiarioId: "w", saldoPendiente: 50, moneda: "USD", fechaAdelanto: "2026-09-01T15:00:00.000Z" }),
        ],
        personas: [persona("w", "Wasaco")],
      },
      AHORA,
    );
    expect(t).toHaveLength(1);
    expect(t[0].monto).toEqual({ PEN: 1100, USD: 50 });
    expect(t[0].detalle).toBe("S/ 1,100.00 · $ 50.00 en 3 adelantos sin moverse hace 85 días");
    expect(t[0].adelantoId).toBe("grande");
    expect(t[0].href).toBe(DESTINOS_HOY_TOCA.adelanto("grande"));
  });

  it("de la persona con más plata quieta a la de menos", () => {
    const viejo = "2026-07-01T15:00:00.000Z";
    const t = queHacerHoy(
      {
        adelantos: [
          adelanto({ id: "1", beneficiarioId: "a", saldoPendiente: 300, fechaAdelanto: viejo }),
          adelanto({ id: "2", beneficiarioId: "b", saldoPendiente: 17000, fechaAdelanto: viejo }),
          adelanto({ id: "3", beneficiarioId: "c", saldoPendiente: 1200, fechaAdelanto: viejo }),
        ],
        personas: [persona("a", "Ana"), persona("b", "Beto"), persona("c", "Carla")],
      },
      AHORA,
    );
    expect(t.map((x) => x.titulo)).toEqual(["Cobrar a Beto", "Cobrar a Carla", "Cobrar a Ana"]);
    expect(montoPorCobrar(t)).toEqual({ monto: { PEN: 18500 }, personas: 3 });
  });

  it("saldo 0 (o negativo) no es tarea de nada", () => {
    const t = queHacerHoy(
      {
        adelantos: [adelanto({ id: "a", beneficiarioId: "p", saldoPendiente: 0, fechaAdelanto: "2026-07-01T15:00:00.000Z", firmado: false, fechaVencimiento: null })],
        personas: [persona("p", "Pedro", { telefono: null })],
      },
      AHORA,
    );
    expect(t).toEqual([]);
  });
});

describe("queHacerHoy — fecha, firma y celular", () => {
  const blas = {
    adelantos: [
      adelanto({ id: "w1", beneficiarioId: "w", fechaVencimiento: null, firmado: false, saldoPendiente: 1000 }),
      adelanto({ id: "w2", beneficiarioId: "w", fechaVencimiento: null, firmado: false, saldoPendiente: 2000 }),
      adelanto({ id: "w3", beneficiarioId: "w", fechaVencimiento: null, firmado: false, saldoPendiente: 3000 }),
      adelanto({ id: "q1", beneficiarioId: "q", fechaVencimiento: null, firmado: false, saldoPendiente: 500 }),
      adelanto({ id: "m1", beneficiarioId: "m", firmado: true, saldoPendiente: 400 }),
    ],
    personas: [persona("w", "Wasaco", { telefono: "" }), persona("q", "Quispe", { telefono: null }), persona("m", "Mama de Alex")],
  };

  it("sin fecha de cobro: cuántos, de quién (con su número) y cuánto", () => {
    const t = queHacerHoy(blas, AHORA).find((x) => x.tipo === "poner-fecha");
    expect(t).toMatchObject({
      titulo: "Poner fecha de cobro a 4 adelantos",
      detalle: "Sin fecha: Wasaco 3 y Quispe 1 · S/ 6,500.00",
      cantidad: 4,
      boton: "Poner fechas",
      href: DESTINOS_HOY_TOCA.ponerFecha,
    });
  });

  it("sin firma ni huella", () => {
    const t = queHacerHoy(blas, AHORA).find((x) => x.tipo === "firmar");
    expect(t).toMatchObject({ titulo: "Firmar 4 recibos", detalle: "Sin firma ni huella: Wasaco 3 y Quispe 1 · S/ 6,500.00", href: DESTINOS_HOY_TOCA.firmar });
  });

  it("sin celular: sólo quien te debe y tiene la ficha sin teléfono (vacío o con espacios cuenta como sin)", () => {
    const t = queHacerHoy(blas, AHORA).find((x) => x.tipo === "telefono");
    expect(t).toMatchObject({ titulo: "Anotar el celular de 2 personas", detalle: "Te deben y no tienen celular: Quispe y Wasaco", cantidad: 2, href: DESTINOS_HOY_TOCA.telefono });
  });

  it("orden: cobrar, poner fecha, firmar, celular", () => {
    const conCobro = { ...blas, adelantos: [...blas.adelantos, adelanto({ id: "v", beneficiarioId: "m", fechaAdelanto: "2026-07-01T15:00:00.000Z" })] };
    expect(tipos(queHacerHoy(conCobro, AHORA))).toEqual(["cobrar", "poner-fecha", "firmar", "telefono"]);
  });

  it("más de tres personas: «y N más»", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const t = queHacerHoy(
      {
        adelantos: ids.map((id) => adelanto({ id, beneficiarioId: id, firmado: false })),
        personas: ids.map((id) => persona(id, id.toUpperCase())),
      },
      AHORA,
    ).find((x) => x.tipo === "firmar");
    expect(t?.detalle).toBe("Sin firma ni huella: A 1, B 1, C 1 y 2 más · S/ 500.00");
  });

  it("todo en regla → ninguna tarea", () => {
    expect(queHacerHoy({ adelantos: [adelanto({ id: "a", beneficiarioId: "p" })], personas: [persona("p", "Pedro")] }, AHORA)).toEqual([]);
  });
});

describe("avisoSemanal", () => {
  const tareas = queHacerHoy(
    {
      adelantos: [adelanto({ id: "a1", beneficiarioId: "q", saldoPendiente: 17000, fechaAdelanto: "2026-08-03T17:00:00.000Z", fechaVencimiento: null, firmado: false })],
      personas: [persona("q", "Quispe", { telefono: null })],
    },
    AHORA,
  );

  it("titular con cantidades (sin nombres ni montos: va a la campana) y una línea con su enlace por tarea", () => {
    const a = avisoSemanal(tareas, { negocio: "Blas", base: "https://buleje.pe/" });
    expect(a.titulo).toBe("Adelantos, esta semana toca: cobrar a 1 persona, 1 sin fecha, 1 sin firmar, 1 sin celular");
    expect(a.titulo).not.toMatch(/Quispe|S\//);
    expect(a.texto.startsWith(`Blas · ${a.titulo}\n\n`)).toBe(true);
    expect(a.texto).toContain("• Cobrar a Quispe: S/ 17,000.00 sin moverse hace 83 días\n  https://buleje.pe/admin?tab=plata&vista=adelantos&sub=lista&adelanto=a1");
    expect(a.texto).toContain(`https://buleje.pe${DESTINOS_HOY_TOCA.firmar}`);
    expect(a.resto).toBe(0);
  });

  it("más de TOPE_AVISO tareas: corta y manda el resto al Resumen", () => {
    const muchas = queHacerHoy(
      {
        adelantos: Array.from({ length: TOPE_AVISO + 2 }, (_, i) =>
          adelanto({ id: `a${i}`, beneficiarioId: `p${i}`, saldoPendiente: 100 + i, fechaAdelanto: "2026-07-01T15:00:00.000Z" }),
        ),
        personas: Array.from({ length: TOPE_AVISO + 2 }, (_, i) => persona(`p${i}`, `P${i}`)),
      },
      AHORA,
    );
    const a = avisoSemanal(muchas);
    expect(a.tareas).toHaveLength(TOPE_AVISO);
    expect(a.resto).toBe(2);
    expect(a.texto).toContain(`Y 2 cosas más en el Resumen: ${DESTINOS_HOY_TOCA.resumen}`);
  });

  it("sin tareas: «todo bajo control»", () => {
    expect(avisoSemanal([])).toEqual({ titulo: "Adelantos: todo bajo control", texto: "Adelantos: todo bajo control.", tareas: [], resto: 0 });
  });
});

describe("fechas de Lima", () => {
  it("lunesDeLaSemana: el domingo es de la semana que empezó el lunes anterior", () => {
    expect(lunesDeLaSemana(AHORA)).toBe("2026-10-19");
    expect(lunesDeLaSemana(new Date("2026-10-26T12:00:00.000Z"))).toBe("2026-10-26"); // lunes 07:00 de Lima
    expect(lunesDeLaSemana(new Date("2026-10-26T03:00:00.000Z"))).toBe("2026-10-19"); // todavía domingo en Lima
  });

  it("inicioDelMesLima: el 1.º a las 00:00 de Lima (05:00 UTC)", () => {
    expect(inicioDelMesLima(AHORA).toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(inicioDelMesLima(new Date("2026-11-01T03:00:00.000Z")).toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });
});
