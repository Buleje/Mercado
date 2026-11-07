import { describe, expect, it } from "vitest";
import { semaforoDePlanta, type EntradaSemaforo } from "@/lib/superadmin/plantas-forestales/semaforo";
import type { FuenteLectura } from "@/lib/superadmin/plantas-forestales/tipos";

const TODAS_OK: Record<FuenteLectura, "ok"> = {
  saldos: "ok",
  conciliacion: "ok",
  disponibles: "ok",
  patio: "ok",
  lotes: "ok",
  pendientes: "ok",
  rendimiento: "ok",
  cumplimiento: "ok",
};
const MP_LIMPIA = {
  pendienteM3: 0,
  consumoSinOrigenM3: 0,
  consumoSinOrigenCount: 0,
  consumoSinDeclararM3: 0,
  consumoSinDeclararCount: 0,
};
const entrada = (o: Partial<EntradaSemaforo> = {}): EntradaSemaforo => ({
  lecturas: TODAS_OK,
  especiesNegativas: [],
  materiaPrima: MP_LIMPIA,
  incoherencias: { error: 0, warning: 0, info: 0 },
  ...o,
});
const neg = (especie: string, m3: number) => ({ especie, existenciaFinalM3: m3, movimientoM3: m3 });

describe("semáforo de una planta (por existencia final)", () => {
  it("verde: existencia al día y sin incoherencias (lo informativo no cuenta)", () => {
    const r = semaforoDePlanta(entrada({ incoherencias: { error: 0, warning: 0, info: 3 } }));
    expect(r.semaforo).toBe("verde");
  });

  it("rojo: existencia final negativa que nada explica", () => {
    const r = semaforoDePlanta(entrada({ especiesNegativas: [neg("Cumala", -5)] }));
    expect(r.semaforo).toBe("rojo");
    expect(r.motivo).toContain("1 especie");
  });

  it("amarillo: el negativo lo explica el consumo sin guía (no es faltante)", () => {
    const r = semaforoDePlanta(
      entrada({
        especiesNegativas: [neg("Cumala", -5)],
        materiaPrima: { ...MP_LIMPIA, consumoSinOrigenM3: 6, consumoSinOrigenCount: 2 },
      }),
    );
    expect(r.semaforo).toBe("amarillo");
    expect(r.motivo).toContain("consumo sin guía");
  });

  it("amarillo: lo explican guías por recepcionar", () => {
    const r = semaforoDePlanta(
      entrada({ especiesNegativas: [neg("Tornillo", -2)], materiaPrima: { ...MP_LIMPIA, pendienteM3: 2 } }),
    );
    expect(r.semaforo).toBe("amarillo");
    expect(r.motivo).toContain("guías por recepcionar");
  });

  it("rojo aunque otra lectura falle: lo que se vio ya es grave", () => {
    const r = semaforoDePlanta(
      entrada({ lecturas: { ...TODAS_OK, patio: "error" }, especiesNegativas: [neg("Cumala", -5)] }),
    );
    expect(r.semaforo).toBe("rojo");
  });

  it("gris: sin el saldo no se afirma rojo ni verde", () => {
    const r = semaforoDePlanta(
      entrada({ lecturas: { ...TODAS_OK, saldos: "error" }, materiaPrima: null, especiesNegativas: [neg("Cumala", -5)] }),
    );
    expect(r.semaforo).toBe("gris");
    expect(r.motivo).toContain("el saldo");
  });

  it("menos de 1 dm³ bajo cero no es madera", () => {
    expect(semaforoDePlanta(entrada({ especiesNegativas: [neg("Cumala", -0.0005)] })).semaforo).toBe("verde");
  });

  it("amarillo: corridas abiertas sin declarar e incoherencias graves", () => {
    const abiertas = semaforoDePlanta(
      entrada({ materiaPrima: { ...MP_LIMPIA, consumoSinDeclararM3: 3, consumoSinDeclararCount: 1 } }),
    );
    expect(abiertas.semaforo).toBe("amarillo");
    expect(abiertas.motivo).toContain("1 corrida abierta");
    const graves = semaforoDePlanta(entrada({ incoherencias: { error: 1, warning: 1, info: 0 } }));
    expect(graves.semaforo).toBe("amarillo");
    expect(graves.motivo).toContain("2 incoherencias");
  });
});
