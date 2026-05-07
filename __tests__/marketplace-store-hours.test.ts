/**
 * Tests para lib/marketplace-store-hours — helpers puros del horario de tienda.
 *
 * Cubre:
 *  - isOpenNow casos borde (sin hours, día closed, antes/durante/después,
 *    cierres después de medianoche, hora inválida).
 *  - nextOpening (hoy más tarde, mañana, salto de varios días, todo cerrado).
 *  - nextOpeningLabel (hoy / mañana / día con nombre).
 *  - storeStatus prioridad construction > vacation > closed > open.
 *  - sortStoresByStatus orden estable.
 *  - isValidReservationSlot validación.
 */

import { describe, it, expect } from "vitest";
import {
  isOpenNow,
  nextOpening,
  nextOpeningLabel,
  storeStatus,
  sortStoresByStatus,
  isValidReservationSlot,
  type StoreHours,
} from "@/lib/marketplace-store-hours";

const STANDARD: StoreHours = {
  mon: { open: "08:00", close: "20:00", closed: false },
  tue: { open: "08:00", close: "20:00", closed: false },
  wed: { open: "08:00", close: "20:00", closed: false },
  thu: { open: "08:00", close: "20:00", closed: false },
  fri: { open: "08:00", close: "20:00", closed: false },
  sat: { open: "08:00", close: "20:00", closed: false },
  sun: { open: "09:00", close: "14:00", closed: true },
};

const LATE_NIGHT: StoreHours = {
  // bar/discoteca: abre a las 19:00, cierra a las 02:00 (madrugada del día siguiente)
  fri: { open: "19:00", close: "02:00", closed: false },
  sat: { open: "19:00", close: "02:00", closed: false },
  sun: { closed: true },
  mon: { closed: true },
  tue: { closed: true },
  wed: { closed: true },
  thu: { closed: true },
};

// 2026-05-04 es lunes
const MON_10AM = new Date(2026, 4, 4, 10, 0);   // 10:00 AM lunes
const MON_7AM  = new Date(2026, 4, 4, 7, 0);    // 07:00 AM lunes (antes de abrir)
const MON_9PM  = new Date(2026, 4, 4, 21, 0);   // 21:00 lunes (después de cerrar)
const SUN_11AM = new Date(2026, 4, 3, 11, 0);   // 11:00 AM domingo (closed=true)
const FRI_8PM  = new Date(2026, 4, 1, 20, 0);   // 20:00 viernes (LATE_NIGHT abierto)
const SAT_1AM  = new Date(2026, 4, 2, 1, 0);    // 01:00 sábado madrugada (LATE_NIGHT viernes aún)
const SAT_3AM  = new Date(2026, 4, 2, 3, 0);    // 03:00 sábado (cerrado, LATE_NIGHT)

describe("isOpenNow", () => {
  it("retorna false sin hours", () => {
    expect(isOpenNow(null, MON_10AM)).toBe(false);
    expect(isOpenNow(undefined, MON_10AM)).toBe(false);
  });

  it("retorna false si el día está closed: true", () => {
    expect(isOpenNow(STANDARD, SUN_11AM)).toBe(false);
  });

  it("retorna true durante el horario", () => {
    expect(isOpenNow(STANDARD, MON_10AM)).toBe(true);
  });

  it("retorna false antes de la apertura", () => {
    expect(isOpenNow(STANDARD, MON_7AM)).toBe(false);
  });

  it("retorna false después del cierre", () => {
    expect(isOpenNow(STANDARD, MON_9PM)).toBe(false);
  });

  it("LATE_NIGHT — abierto a las 20:00 viernes", () => {
    expect(isOpenNow(LATE_NIGHT, FRI_8PM)).toBe(true);
  });

  it("LATE_NIGHT — abierto a las 01:00 sábado (cierre madrugada del viernes)", () => {
    // 01:00 sábado el día configurado es 'sat' (open 19:00 close 02:00)
    // Por la lógica close<open: cur(60) <= close(120) → true
    expect(isOpenNow(LATE_NIGHT, SAT_1AM)).toBe(true);
  });

  it("LATE_NIGHT — cerrado a las 03:00 sábado (después del cierre 02:00)", () => {
    expect(isOpenNow(LATE_NIGHT, SAT_3AM)).toBe(false);
  });

  it("retorna false si la hora es inválida", () => {
    expect(isOpenNow({ mon: { open: "abc", close: "20:00" } }, MON_10AM)).toBe(false);
  });
});

describe("nextOpening", () => {
  it("hoy si la apertura es más tarde", () => {
    const next = nextOpening(STANDARD, MON_7AM);
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(8);
    expect(next!.getDate()).toBe(MON_7AM.getDate());
  });

  it("mañana si ya cerró hoy", () => {
    const next = nextOpening(STANDARD, MON_9PM);
    expect(next!.getDate()).toBe(MON_9PM.getDate() + 1);
    expect(next!.getHours()).toBe(8);
  });

  it("salta domingo (closed:true) y va al lunes", () => {
    // Sábado 10pm → siguiente apertura es lunes 8am (porque domingo closed)
    const SAT_10PM = new Date(2026, 4, 2, 22, 0);
    const next = nextOpening(STANDARD, SAT_10PM);
    expect(next!.getDay()).toBe(1); // lunes
    expect(next!.getHours()).toBe(8);
  });

  it("retorna null si todos los días son closed", () => {
    const ALL_CLOSED: StoreHours = {
      mon: { closed: true }, tue: { closed: true }, wed: { closed: true },
      thu: { closed: true }, fri: { closed: true }, sat: { closed: true }, sun: { closed: true },
    };
    expect(nextOpening(ALL_CLOSED, MON_10AM)).toBeNull();
  });

  it("retorna null sin hours", () => {
    expect(nextOpening(null, MON_10AM)).toBeNull();
  });
});

describe("nextOpeningLabel", () => {
  it("usa 'Abre hoy' si la apertura es hoy", () => {
    expect(nextOpeningLabel(STANDARD, MON_7AM)).toMatch(/^Abre hoy/);
  });

  it("usa 'Abre mañana' si abre el día siguiente", () => {
    expect(nextOpeningLabel(STANDARD, MON_9PM)).toMatch(/^Abre mañana/);
  });

  it("retorna mensaje neutro sin hours", () => {
    expect(nextOpeningLabel(null, MON_10AM)).toMatch(/Sin horario/);
  });
});

describe("storeStatus", () => {
  it("construction tiene prioridad sobre todo", () => {
    expect(
      storeStatus(
        { underConstruction: true, vacationMode: true, hours: STANDARD },
        MON_10AM,
      ),
    ).toBe("construction");
  });

  it("vacation tiene prioridad sobre closed/open", () => {
    expect(storeStatus({ vacationMode: true, hours: STANDARD }, MON_10AM)).toBe("vacation");
    expect(storeStatus({ vacationMode: true, hours: STANDARD }, MON_7AM)).toBe("vacation");
  });

  it("closed cuando isOpenNow es false", () => {
    expect(storeStatus({ hours: STANDARD }, MON_7AM)).toBe("closed");
  });

  it("open cuando isOpenNow es true", () => {
    expect(storeStatus({ hours: STANDARD }, MON_10AM)).toBe("open");
  });

  it("closed sin hours configurados", () => {
    expect(storeStatus({}, MON_10AM)).toBe("closed");
  });
});

describe("sortStoresByStatus", () => {
  it("ordena open > vacation > closed > construction", () => {
    const stores = [
      { id: "constr", underConstruction: true, hours: STANDARD },
      { id: "open", hours: STANDARD },
      { id: "closed", hours: STANDARD }, // se evalúa contra MON_7AM
      { id: "vacation", vacationMode: true, hours: STANDARD },
    ];
    const sorted = sortStoresByStatus(stores, MON_7AM);
    // En MON_7AM, "open" está cerrado (hours 8-20), entonces:
    // open: closed (cur 7am < open 8am) → status closed
    // vacation: vacation
    // closed: closed
    // constr: construction
    // resultado esperado: vacation > closed (los 2) > construction
    expect(sorted[0].id).toBe("vacation");
    expect(sorted[3].id).toBe("constr");
  });

  it("preserva input original (no muta)", () => {
    const stores = [
      { id: "a", hours: STANDARD },
      { id: "b", underConstruction: true, hours: STANDARD },
    ];
    const before = stores.map((s) => s.id).join(",");
    sortStoresByStatus(stores, MON_10AM);
    expect(stores.map((s) => s.id).join(",")).toBe(before);
  });
});

describe("isValidReservationSlot", () => {
  it("rechaza fecha pasada", () => {
    const r = isValidReservationSlot(STANDARD, MON_7AM, MON_10AM);
    expect(r.ok).toBe(false);
  });

  it("rechaza más de maxDaysAhead", () => {
    const future = new Date(MON_10AM);
    future.setDate(future.getDate() + 10);
    const r = isValidReservationSlot(STANDARD, future, MON_10AM, 7);
    expect(r.ok).toBe(false);
  });

  it("rechaza día closed", () => {
    // Domingo es closed en STANDARD
    const SUN_NEXT = new Date(2026, 4, 10, 11, 0); // próximo domingo
    const r = isValidReservationSlot(STANDARD, SUN_NEXT, MON_10AM);
    expect(r.ok).toBe(false);
  });

  it("rechaza hora fuera del rango", () => {
    const TUE_3AM = new Date(2026, 4, 5, 3, 0);
    const r = isValidReservationSlot(STANDARD, TUE_3AM, MON_10AM);
    expect(r.ok).toBe(false);
  });

  it("acepta hora dentro del rango y dentro del límite", () => {
    const TUE_10AM = new Date(2026, 4, 5, 10, 0);
    const r = isValidReservationSlot(STANDARD, TUE_10AM, MON_10AM);
    expect(r.ok).toBe(true);
  });
});
