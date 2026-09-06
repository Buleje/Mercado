import { describe, it, expect } from "vitest";
import {
  DIAS_RETENCION_PAPELERA,
  DIAS_AVISO_RETENCION,
  corteRetencion,
  diasEnPapelera,
  diasRestantes,
  textoRetencion,
} from "@/lib/documents/papelera-retencion";

/**
 * El número que muestra la pantalla y el que usa el cron para borrar tienen que
 * ser EL MISMO. Si estos tests se van, la papelera promete un plazo y el cron
 * cumple otro — y el usuario pierde archivos antes de lo que le dijimos.
 */

const AHORA = new Date("2026-07-30T12:00:00.000Z");
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000);

describe("papelera · corte de retención", () => {
  it("el corte cae exactamente DIAS_RETENCION_PAPELERA atrás", () => {
    const corte = corteRetencion(AHORA);
    expect(AHORA.getTime() - corte.getTime()).toBe(DIAS_RETENCION_PAPELERA * 86_400_000);
  });

  it("lo borrado justo en el límite todavía NO está vencido", () => {
    const corte = corteRetencion(AHORA);
    // El cron usa `deletedAt < corte`: el del día 30 exacto se salva por un pelo
    // y cae en la corrida siguiente. Mejor un día de más que uno de menos.
    expect(haceDias(DIAS_RETENCION_PAPELERA).getTime() < corte.getTime()).toBe(false);
    expect(haceDias(DIAS_RETENCION_PAPELERA + 1).getTime() < corte.getTime()).toBe(true);
  });
});

describe("papelera · días", () => {
  it("cuenta días completos y no negativos", () => {
    expect(diasEnPapelera(AHORA, AHORA)).toBe(0);
    expect(diasEnPapelera(haceDias(1), AHORA)).toBe(1);
    expect(diasEnPapelera(haceDias(29.9), AHORA)).toBe(29);
    // Una fecha futura (reloj desfasado) no puede dar días negativos.
    expect(diasEnPapelera(new Date(AHORA.getTime() + 86_400_000), AHORA)).toBe(0);
  });

  it("los días restantes se agotan en 0, nunca en negativo", () => {
    expect(diasRestantes(AHORA, AHORA)).toBe(DIAS_RETENCION_PAPELERA);
    expect(diasRestantes(haceDias(DIAS_RETENCION_PAPELERA), AHORA)).toBe(0);
    expect(diasRestantes(haceDias(DIAS_RETENCION_PAPELERA + 40), AHORA)).toBe(0);
  });

  it("una fecha inválida no rompe el cálculo", () => {
    expect(diasEnPapelera("no-es-fecha", AHORA)).toBe(0);
    expect(diasRestantes("no-es-fecha", AHORA)).toBe(DIAS_RETENCION_PAPELERA);
  });
});

describe("papelera · texto del plazo", () => {
  it("sin fecha de borrado no promete ningún plazo", () => {
    expect(textoRetencion(null, AHORA)).toBeNull();
  });

  it("dice hoy / mañana y marca urgente dentro del aviso", () => {
    expect(textoRetencion(haceDias(DIAS_RETENCION_PAPELERA), AHORA)).toEqual({
      texto: "se borra solo hoy",
      urgente: true,
    });
    expect(textoRetencion(haceDias(DIAS_RETENCION_PAPELERA - 1), AHORA)).toEqual({
      texto: "se borra solo mañana",
      urgente: true,
    });
    const alLimite = textoRetencion(haceDias(DIAS_RETENCION_PAPELERA - DIAS_AVISO_RETENCION), AHORA);
    expect(alLimite).toEqual({ texto: `se borra solo en ${DIAS_AVISO_RETENCION} días`, urgente: true });
    const tranquilo = textoRetencion(haceDias(DIAS_RETENCION_PAPELERA - DIAS_AVISO_RETENCION - 1), AHORA);
    expect(tranquilo?.urgente).toBe(false);
  });

  it("recién borrado avisa el plazo completo", () => {
    expect(textoRetencion(AHORA, AHORA)).toEqual({
      texto: `se borra solo en ${DIAS_RETENCION_PAPELERA} días`,
      urgente: false,
    });
  });
});
