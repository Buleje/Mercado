/**
 * arqueo-veredicto — qué se puede afirmar de un cuadre. Puro, sin DB.
 *
 * Los dos casos que motivan este archivo salieron del tenant real: un cuadre
 * con esperado −S/630 marcado «Conforme», y un tablero que decía «100%
 * conformes» sobre cierres que hizo el cron.
 */
import { describe, it, expect } from "vitest";
import {
  esCierreAutomatico,
  montoImposible,
  resumirArqueos,
  veredictoArqueo,
  type ArqueoEstado,
} from "@/lib/caja/arqueo-veredicto";

const CERRADO = "2026-08-03T20:00:00.000Z";

describe("veredictoArqueo", () => {
  it("cuadra cuando una persona contó y coincide", () => {
    expect(veredictoArqueo({ expectedAmount: 500, countedAmount: 500, closedAt: CERRADO, notes: "Cierre de turno lucia" })).toBe("conforme");
  });

  it("distingue faltante de sobrante", () => {
    expect(veredictoArqueo({ expectedAmount: 500, countedAmount: 480, closedAt: CERRADO, notes: "lucia" })).toBe("faltante");
    expect(veredictoArqueo({ expectedAmount: 500, countedAmount: 520, closedAt: CERRADO, notes: "lucia" })).toBe("sobrante");
  });

  it("el cierre automático NO es conforme aunque la diferencia sea cero", () => {
    // El cron copia el esperado al contado: el cero lo puso el sistema, no un conteo.
    const e = { expectedAmount: 129.9, countedAmount: 129.9, closedAt: CERRADO, notes: "Cierre automático del sistema" };
    expect(veredictoArqueo(e)).toBe("sin_conteo");
  });

  it("un esperado negativo es imposible, aunque el contado lo copie", () => {
    // Caso real: −S/630 esperado y contado, diferencia 0 → figuraba «Conforme».
    const e = { expectedAmount: -630, countedAmount: -630, closedAt: CERRADO, notes: "Cierre automático del sistema" };
    expect(veredictoArqueo(e)).toBe("imposible");
  });

  it("lo imposible gana sobre todo lo demás", () => {
    expect(veredictoArqueo({ expectedAmount: -1, countedAmount: 100, closedAt: CERRADO, notes: "lucia" })).toBe("imposible");
  });

  it("sin cerrar todavía queda pendiente", () => {
    expect(veredictoArqueo({ expectedAmount: 500, countedAmount: null, closedAt: null })).toBe("pendiente");
    expect(veredictoArqueo({ expectedAmount: 500, countedAmount: 500, closedAt: null })).toBe("pendiente");
  });

  it("reconoce la marca del cron con o sin tilde", () => {
    expect(esCierreAutomatico("Cierre automático del sistema")).toBe(true);
    expect(esCierreAutomatico("cierre automatico por inactividad")).toBe(true);
    expect(esCierreAutomatico("Cierre de turno 074kkl")).toBe(false);
    expect(esCierreAutomatico(null)).toBe(false);
  });

  it("montoImposible sólo mira el esperado", () => {
    expect(montoImposible(-0.01)).toBe(true);
    expect(montoImposible(0)).toBe(false);
    expect(montoImposible(null)).toBe(false);
  });
});

describe("resumirArqueos", () => {
  const fila = (estado: ArqueoEstado, difference = 0) => ({ estado, difference });

  it("el % se calcula sobre lo verificable, no sobre el total", () => {
    // 1 conforme real + 2 cierres del sistema: el tablero decía 100%.
    const r = resumirArqueos([fila("conforme"), fila("sin_conteo"), fila("sin_conteo")]);
    expect(r.total).toBe(3);
    expect(r.sinConteo).toBe(2);
    expect(r.conformesPct).toBe(100); // sobre 1 verificable, y el resto se ve aparte
    expect(r.conformes).toBe(1);
  });

  it("con faltantes el porcentaje baja de verdad", () => {
    const r = resumirArqueos([fila("conforme"), fila("faltante", -20), fila("sin_conteo")]);
    expect(r.conformesPct).toBe(50);
    expect(r.totalFaltanteS).toBe(20);
  });

  /**
   * El Cuadre mostraba «Total faltantes» con su propia cuenta —todo lo que
   * tuviera `difference < 0`, sin mirar el estado—, así que un cierre
   * automático que nadie contó sumaba plata que jamás faltó. El % de conformes,
   * dos líneas más abajo, sí los excluía: dos números del mismo tablero
   * contando cosas distintas.
   */
  it("un cierre sin conteo NO suma al total de faltantes", () => {
    const r = resumirArqueos([
      fila("faltante", -20),
      fila("sin_conteo", -500),   // nadie contó: ese −500 no significa nada
      fila("imposible", -630),    // esperado negativo (bug conocido de la caja)
    ]);
    expect(r.totalFaltanteS).toBe(20);
    // La cuenta vieja daba 1150 y mandaba a buscar plata que nunca se perdió.
    expect(r.totalFaltanteS).not.toBe(1150);
  });

  it("un sobrante sin conteo tampoco infla el total", () => {
    const r = resumirArqueos([fila("sobrante", 15), fila("sin_conteo", 900)]);
    expect(r.totalSobranteS).toBe(15);
  });

  it("sin ningún arqueo verificable el porcentaje es null, no 100", () => {
    const r = resumirArqueos([fila("sin_conteo"), fila("imposible")]);
    expect(r.conformesPct).toBeNull();
    expect(r.imposibles).toBe(1);
  });

  it("suma faltantes y sobrantes por separado", () => {
    const r = resumirArqueos([fila("faltante", -15.5), fila("faltante", -4.5), fila("sobrante", 10)]);
    expect(r.totalFaltanteS).toBe(20);
    expect(r.totalSobranteS).toBe(10);
  });
});
