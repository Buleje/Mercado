/**
 * __tests__/metas-tareas-fechas.test.ts
 *
 * Fechas de metas y tareas en el día de Lima. Medido el 2026-09-14 con
 * TZ=America/Lima: la plantilla «Meta diaria» creada el 14 a la noche vencía
 * el 15 (toISOString da el día UTC), y una tarea que vence el 14 salía vencida
 * a las 09:00 de ese día y fechada «13/9» (`new Date("2026-09-14")` es
 * medianoche UTC = 19:00 del 13 en Lima).
 */
import { describe, expect, it } from "vitest";
import { limaDateKey } from "@/lib/utils";
import { diasEntreFechas, fechaParaMostrar, sumarDiasAFecha, sumarMesesAFecha, vencimientoDePlantilla } from "@/lib/admin/metas-tareas";

/** El 14/09/2026 a las 20:30 en Lima: en UTC ya es el 15. */
const NOCHE_DEL_14 = new Date("2026-09-15T01:30:00Z");
/** El 14/09/2026 a las 09:00 en Lima. */
const MANANA_DEL_14 = new Date("2026-09-14T14:00:00Z");

describe("metas y tareas — fechas sin hora en el día de Lima", () => {
  it("de noche en Lima sigue siendo el 14, aunque en UTC ya sea el 15", () => {
    expect(limaDateKey(NOCHE_DEL_14)).toBe("2026-09-14");
    expect(NOCHE_DEL_14.toISOString().slice(0, 10)).toBe("2026-09-15"); // la cuenta vieja
  });

  it("la «Meta diaria» creada de noche vence hoy, no mañana", () => {
    const hoy = limaDateKey(NOCHE_DEL_14);
    expect(vencimientoDePlantilla("diario", hoy)).toBe("2026-09-14");
    expect(vencimientoDePlantilla("semanal", hoy)).toBe("2026-09-21");
    expect(vencimientoDePlantilla("mensual", hoy)).toBe("2026-10-14");
  });

  it("una tarea que vence hoy no está vencida a las 09:00 de ese día", () => {
    const hoy = limaDateKey(MANANA_DEL_14);
    expect("2026-09-14" < hoy).toBe(false);
    expect("2026-09-13" < hoy).toBe(true);
  });

  it("la fecha límite se muestra tal cual, sin correrse un día", () => {
    expect(fechaParaMostrar("2026-09-14")).toBe("14/09/2026");
  });

  it("días entre fechas: hacia adelante, hacia atrás y cruzando de año", () => {
    expect(diasEntreFechas("2026-09-14", "2026-09-30")).toBe(16);
    expect(diasEntreFechas("2026-09-14", "2026-09-14")).toBe(0);
    expect(diasEntreFechas("2026-09-14", "2026-09-13")).toBe(-1);
    expect(diasEntreFechas("2026-12-30", "2027-01-02")).toBe(3);
  });

  it("sumar días y meses respeta el fin de mes", () => {
    expect(sumarDiasAFecha("2026-12-29", 7)).toBe("2027-01-05");
    expect(sumarMesesAFecha("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMesesAFecha("2026-12-15", 1)).toBe("2027-01-15");
  });
});
