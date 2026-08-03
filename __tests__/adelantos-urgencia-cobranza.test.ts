import { describe, expect, it } from "vitest";
import {
  bucketDe,
  deudoresDeCobranza,
  explicarAtraso,
  ordenarPorUrgencia,
  type AdelantoParaCobranza,
} from "@/lib/adelantos/urgencia-cobranza";

/**
 * Esto decide a quién se le reclama plata. El bug que corrige era silencioso:
 * la pantalla decía «Vencido» mirando la ANTIGÜEDAD del adelanto, no la fecha
 * que se había pactado — así que señalaba a la persona equivocada sin que nada
 * fallara.
 */

const HOY = new Date("2026-08-03T12:00:00.000Z").getTime();
const diasAtras = (n: number) => new Date(HOY - n * 86_400_000).toISOString();
const enDias = (n: number) => new Date(HOY + n * 86_400_000).toISOString();

const adelanto = (o: Partial<AdelantoParaCobranza> = {}): AdelantoParaCobranza => ({
  beneficiarioId: "p1",
  saldoPendiente: 100,
  fechaAdelanto: diasAtras(10),
  status: "ABIERTO",
  beneficiario: { nombre: "Juana", telefono: "999" },
  entregasPactadas: [],
  ...o,
});

describe("a quién hay que cobrarle", () => {
  it("sin fecha pactada cae a la antigüedad, y lo dice", () => {
    const [d] = deudoresDeCobranza([adelanto({ fechaAdelanto: diasAtras(45) })], HOY);
    expect(d.base).toBe("antiguedad");
    expect(d.dias).toBe(45);
    expect(explicarAtraso(d)).toMatch(/Sin fecha pactada/);
  });

  /**
   * EL CASO DEL BUG. 45 días de antigüedad decían «Vencido (31-60)», pero la
   * entrega está pactada para dentro de un mes: no debe nada todavía.
   */
  it("un adelanto viejo con la entrega pactada a futuro NO está vencido", () => {
    const [d] = deudoresDeCobranza(
      [adelanto({ fechaAdelanto: diasAtras(45), entregasPactadas: [{ fechaEsperada: enDias(30) }] })],
      HOY,
    );
    expect(d.pactadasVencidas).toBe(0);
    // Cae a antigüedad porque no hay NADA incumplido; lo que no puede es
    // contar como compromiso roto.
    expect(d.base).toBe("antiguedad");
  });

  /** El espejo: reciente pero con un compromiso roto. */
  it("un adelanto reciente con una pactada incumplida SÍ está vencido", () => {
    const [d] = deudoresDeCobranza(
      [adelanto({ fechaAdelanto: diasAtras(5), entregasPactadas: [{ fechaEsperada: diasAtras(12) }] })],
      HOY,
    );
    expect(d.base).toBe("pactada");
    expect(d.dias).toBe(12);
    expect(d.pactadasVencidas).toBe(1);
  });

  it("una entrega ya cumplida no debe nada, por tarde que se haya cumplido", () => {
    const [d] = deudoresDeCobranza(
      [
        adelanto({
          fechaAdelanto: diasAtras(5),
          entregasPactadas: [{ fechaEsperada: diasAtras(40), cumplidaEn: diasAtras(2) }],
        }),
      ],
      HOY,
    );
    expect(d.pactadasVencidas).toBe(0);
    expect(d.base).toBe("antiguedad");
  });

  it("mide contra la pactada incumplida MÁS VIEJA, no la última", () => {
    const [d] = deudoresDeCobranza(
      [
        adelanto({
          entregasPactadas: [{ fechaEsperada: diasAtras(3) }, { fechaEsperada: diasAtras(50) }],
        }),
      ],
      HOY,
    );
    expect(d.dias).toBe(50);
    expect(d.pactadasVencidas).toBe(2);
    expect(explicarAtraso(d)).toMatch(/2 entregas pactadas sin cumplir/);
  });

  it("suma los adelantos de la misma persona en una sola fila", () => {
    const d = deudoresDeCobranza(
      [adelanto({ saldoPendiente: 100 }), adelanto({ saldoPendiente: 250, fechaAdelanto: diasAtras(80) })],
      HOY,
    );
    expect(d).toHaveLength(1);
    expect(d[0].saldo).toBe(350);
    expect(d[0].dias).toBe(80); // el más viejo manda
  });

  it("ignora lo saldado y lo que no está abierto", () => {
    expect(deudoresDeCobranza([adelanto({ saldoPendiente: 0 })], HOY)).toHaveLength(0);
    expect(deudoresDeCobranza([adelanto({ status: "CERRADO" })], HOY)).toHaveLength(0);
  });
});

describe("el orden de la lista", () => {
  /**
   * Un compromiso roto va antes que una deuda vieja sin fecha: tiene fecha y
   * nombre, y es el reclamo más fácil de sostener.
   */
  it("primero quien rompió un compromiso, aunque deba hace menos tiempo", () => {
    const deudores = deudoresDeCobranza(
      [
        adelanto({ beneficiarioId: "viejo", fechaAdelanto: diasAtras(200) }),
        adelanto({ beneficiarioId: "roto", fechaAdelanto: diasAtras(5), entregasPactadas: [{ fechaEsperada: diasAtras(2) }] }),
      ],
      HOY,
    );
    expect(ordenarPorUrgencia(deudores).map((d) => d.id)).toEqual(["roto", "viejo"]);
  });

  it("dentro del mismo grupo, el más atrasado primero", () => {
    const deudores = deudoresDeCobranza(
      [
        adelanto({ beneficiarioId: "a", fechaAdelanto: diasAtras(10) }),
        adelanto({ beneficiarioId: "b", fechaAdelanto: diasAtras(90) }),
      ],
      HOY,
    );
    expect(ordenarPorUrgencia(deudores).map((d) => d.id)).toEqual(["b", "a"]);
  });
});

describe("los buckets de siempre", () => {
  it("mantiene los tres tramos", () => {
    expect(bucketDe(0)).toBe("d0");
    expect(bucketDe(30)).toBe("d0");
    expect(bucketDe(31)).toBe("d30");
    expect(bucketDe(61)).toBe("d60");
  });

  /** Un atraso negativo (todavía no vence) no puede caer en «vencido». */
  it("lo que todavía no vence es «al día»", () => {
    expect(bucketDe(-15)).toBe("d0");
  });
});
