/**
 * lib/agenda/ics.ts — RFC 5545 del feed de la agenda (ADR-501 §5a): plegado a 75 octetos,
 * escape de TEXT, RRULE de cada frecuencia, zona America/Lima fija y sin montos.
 */
import { describe, expect, it } from "vitest";
import {
  armarIcs,
  escaparTexto,
  plegarLinea,
  primeraFecha,
  reglaDeRepeticion,
  sinMontos,
  type ActividadIcs,
} from "@/lib/agenda/ics";
import type { Recurrencia } from "@/lib/agenda/tipos";

const ahora = new Date("2026-10-18T15:00:00Z");
const octetos = (s: string) => new TextEncoder().encode(s).length;

function rec(parcial: Partial<Recurrencia>): Recurrencia {
  return { frecuencia: "diaria", desde: "2026-10-19", hasta: null, diasSemana: [], diaMes: null, cadaN: null, ...parcial };
}

function actividad(parcial: Partial<ActividadIcs> = {}): ActividadIcs {
  return {
    id: "act1",
    nombre: "Revisar la asistencia",
    regla: "asistencia",
    objetivoNombre: null,
    recurrencia: rec({ diasSemana: [1, 2, 3, 4, 5, 6] }),
    hora: "08:30",
    nota: null,
    actualizado: new Date("2026-10-17T10:00:00Z"),
    ...parcial,
  };
}

/** Deshace el plegado (RFC 5545 §3.1) y parte en líneas lógicas. */
function lineasLogicas(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, "").split("\r\n").filter(Boolean);
}

describe("plegarLinea — 75 octetos", () => {
  it("no toca una línea corta", () => {
    expect(plegarLinea("SUMMARY:Hola")).toBe("SUMMARY:Hola");
  });

  it("parte una línea larga en trozos de ≤75 octetos con CRLF + espacio", () => {
    const larga = `DESCRIPTION:${"x".repeat(200)}`;
    const plegada = plegarLinea(larga);
    const fisicas = plegada.split("\r\n");
    expect(fisicas.length).toBeGreaterThan(2);
    for (const f of fisicas) expect(octetos(f)).toBeLessThanOrEqual(75);
    expect(fisicas.slice(1).every((f) => f.startsWith(" "))).toBe(true);
    expect(plegada.replace(/\r\n /g, "")).toBe(larga);
  });

  it("cuenta octetos, no caracteres, y nunca parte una ñ ni un acento", () => {
    const larga = `SUMMARY:${"ñá·".repeat(40)}`;
    const fisicas = plegarLinea(larga).split("\r\n");
    for (const f of fisicas) {
      expect(octetos(f)).toBeLessThanOrEqual(75);
      // cada trozo es UTF-8 válido por sí solo (no hay U+FFFD al recodificar)
      expect(new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(f))).toBe(f);
    }
    expect(plegarLinea(larga).replace(/\r\n /g, "")).toBe(larga);
  });
});

describe("escaparTexto — TEXT de RFC 5545 §3.3.11", () => {
  it("escapa barra invertida, punto y coma, coma y saltos de línea", () => {
    expect(escaparTexto("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });

  it("la barra se escapa primero (no se duplica el escape de la coma)", () => {
    expect(escaparTexto("\\,")).toBe("\\\\\\,");
  });
});

describe("sinMontos", () => {
  it.each([
    ["Pagar S/ 1,250.00 a Juan", "Pagar [monto] a Juan"],
    ["adelanto s/.500", "adelanto [monto]"],
    ["flete $ 30", "flete [monto]"],
    ["USD 12.5 de flete", "[monto] de flete"],
    ["le debo 300 soles", "le debo [monto]"],
  ])("%s", (entrada, salida) => {
    expect(sinMontos(entrada)).toBe(salida);
  });

  it("deja los nombres y las cantidades que no son plata", () => {
    expect(sinMontos("Revisar la cuenta de Juan · 3 trozas")).toBe("Revisar la cuenta de Juan · 3 trozas");
    expect(sinMontos("3 solicitudes")).toBe("3 solicitudes");
  });
});

describe("reglaDeRepeticion — RRULE por frecuencia", () => {
  it("una_vez: sin RRULE, en su día", () => {
    expect(reglaDeRepeticion(rec({ frecuencia: "una_vez", desde: "2026-10-20" }), null)).toEqual({
      inicio: "2026-10-20",
      rrule: null,
      extras: [],
    });
  });

  it("diaria los 7 días → FREQ=DAILY", () => {
    expect(reglaDeRepeticion(rec({ diasSemana: [0, 1, 2, 3, 4, 5, 6] }), null)?.rrule).toBe("FREQ=DAILY");
  });

  it("diaria de lunes a sábado → semanal con BYDAY (lunes primero)", () => {
    expect(reglaDeRepeticion(rec({ diasSemana: [6, 1, 2, 3, 4, 5] }), null)?.rrule).toBe(
      "FREQ=WEEKLY;WKST=MO;BYDAY=MO,TU,WE,TH,FR,SA",
    );
  });

  it("semanal: DTSTART en el primer día de la regla, no en `desde`", () => {
    // 2026-10-19 es lunes; la regla es los viernes
    const r = reglaDeRepeticion(rec({ frecuencia: "semanal", diasSemana: [5] }), null);
    expect(r).toEqual({ inicio: "2026-10-23", rrule: "FREQ=WEEKLY;WKST=MO;BYDAY=FR", extras: [] });
  });

  it("quincenal: INTERVAL=2 y arranca en una semana par contando desde la de `desde`", () => {
    // desde = viernes 23; lunes de esa semana ya pasó → el lunes que toca es el de la semana 2 (02-11)
    const r = reglaDeRepeticion(rec({ frecuencia: "quincenal", desde: "2026-10-23", diasSemana: [1] }), null);
    expect(r).toEqual({ inicio: "2026-11-02", rrule: "FREQ=WEEKLY;INTERVAL=2;WKST=MO;BYDAY=MO", extras: [] });
    expect(primeraFecha(rec({ frecuencia: "quincenal", desde: "2026-10-19", diasSemana: [1, 4] }))).toBe("2026-10-19");
  });

  it("mensual: día fijo, 31 = último y 30 baja al último del mes corto (RDATE de febrero)", () => {
    expect(reglaDeRepeticion(rec({ frecuencia: "mensual", diaMes: 5 }), null)).toEqual({
      inicio: "2026-11-05",
      rrule: "FREQ=MONTHLY;BYMONTHDAY=5",
      extras: [],
    });
    expect(reglaDeRepeticion(rec({ frecuencia: "mensual", diaMes: 31 }), null)).toEqual({
      inicio: "2026-10-31",
      rrule: "FREQ=MONTHLY;BYMONTHDAY=-1",
      extras: [],
    });
    const treinta = reglaDeRepeticion(rec({ frecuencia: "mensual", desde: "2027-02-01", diaMes: 30, hasta: "2029-12-31" }), null);
    expect(treinta).toEqual({
      inicio: "2027-02-28",
      rrule: "FREQ=MONTHLY;BYMONTHDAY=30;UNTIL=20291231",
      extras: ["2027-02-28", "2028-02-29", "2029-02-28"],
    });
    // el 29 sólo falta en febreros de 28 días
    const veintinueve = reglaDeRepeticion(rec({ frecuencia: "mensual", desde: "2027-10-01", diaMes: 29, hasta: "2029-12-31" }), null);
    expect(veintinueve?.extras).toEqual(["2029-02-28"]);
  });

  it("RDATE de febrero en el feed, con la hora de Lima si la tiene", () => {
    const ics = armarIcs(
      {
        actividades: [actividad({ recurrencia: rec({ frecuencia: "mensual", desde: "2027-01-01", diaMes: 30, hasta: "2028-06-30" }), hora: "07:00" })],
        notas: [],
        tareas: [],
      },
      { nombreCalendario: "x", ahora },
    );
    expect(lineasLogicas(ics)).toContain("RDATE;TZID=America/Lima:20270228T070000,20280229T070000");
  });

  it("cada_n_dias → FREQ=DAILY;INTERVAL=n", () => {
    expect(reglaDeRepeticion(rec({ frecuencia: "cada_n_dias", cadaN: 3 }), null)?.rrule).toBe("FREQ=DAILY;INTERVAL=3");
    expect(reglaDeRepeticion(rec({ frecuencia: "cada_n_dias", cadaN: 1 }), null)?.rrule).toBe("FREQ=DAILY");
  });

  it("UNTIL: fecha si es de todo el día; 23:59:59 de Lima en UTC si tiene hora", () => {
    const r = rec({ frecuencia: "semanal", diasSemana: [1], hasta: "2026-12-31" });
    expect(reglaDeRepeticion(r, null)?.rrule).toBe("FREQ=WEEKLY;WKST=MO;BYDAY=MO;UNTIL=20261231");
    expect(reglaDeRepeticion(r, "09:00")?.rrule).toBe("FREQ=WEEKLY;WKST=MO;BYDAY=MO;UNTIL=20270101T045959Z");
  });

  it("null si `hasta` cae antes del primer día", () => {
    expect(reglaDeRepeticion(rec({ frecuencia: "semanal", diasSemana: [5], hasta: "2026-10-20" }), null)).toBeNull();
  });
});

describe("armarIcs", () => {
  const ics = armarIcs(
    {
      actividades: [
        actividad(),
        actividad({
          id: "act2",
          nombre: "Revisar la cuenta de Juan, el de Yarinacocha; sin falta",
          regla: "cuenta_tercero",
          objetivoNombre: "Juan Pérez",
          recurrencia: rec({ frecuencia: "mensual", diaMes: 31 }),
          hora: null,
          nota: "Le debe S/ 2,400.50 desde marzo",
        }),
      ],
      notas: [{ id: "n1", titulo: "Pagar luz", contenido: "Son 180 soles", fecha: "2026-10-20", actualizado: ahora }],
      tareas: [{ id: "t1", titulo: "Llamar al contador", estado: "pendiente", fecha: "2026-10-21", actualizado: ahora }],
    },
    { nombreCalendario: "Agenda del negocio", urlPanel: "https://x.test/admin?tab=administracion", ahora },
  );
  const lineas = lineasLogicas(ics);

  it("CRLF en todas las líneas y ninguna física pasa de 75 octetos", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false);
    for (const f of ics.split("\r\n")) expect(octetos(f)).toBeLessThanOrEqual(75);
  });

  it("estructura: VCALENDAR 2.0, VTIMEZONE de Lima fijo −05:00 y un VEVENT por cosa", () => {
    expect(lineas[0]).toBe("BEGIN:VCALENDAR");
    expect(lineas).toContain("VERSION:2.0");
    expect(lineas).toContain("TZID:America/Lima");
    expect(lineas).toContain("TZOFFSETFROM:-0500");
    expect(lineas).toContain("TZOFFSETTO:-0500");
    expect(lineas.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(4);
    expect(lineas.at(-1)).toBe("END:VCALENDAR");
  });

  it("con hora: DTSTART/DTEND con TZID=America/Lima; sin hora: VALUE=DATE", () => {
    expect(lineas).toContain("DTSTART;TZID=America/Lima:20261019T083000");
    expect(lineas).toContain("DTEND;TZID=America/Lima:20261019T090000");
    expect(lineas).toContain("RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=MO,TU,WE,TH,FR,SA");
    expect(lineas).toContain("DTSTART;VALUE=DATE:20261031");
    expect(lineas).toContain("DTEND;VALUE=DATE:20261101");
    expect(lineas).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=-1");
    expect(lineas).toContain("DTSTAMP:20261018T150000Z");
  });

  it("escapa comas y punto y coma del nombre", () => {
    expect(lineas).toContain("SUMMARY:Revisar la cuenta de Juan\\, el de Yarinacocha\\; sin falta");
  });

  it("sin montos en ninguna parte del feed", () => {
    expect(ics).not.toMatch(/2,400|2\\,400|180 soles|S\/ \d/);
    expect(lineasLogicas(ics).join("\n")).toContain("[monto]");
  });

  it("notas y tareas con fecha como eventos de todo el día", () => {
    expect(lineas).toContain("SUMMARY:Nota: Pagar luz");
    expect(lineas).toContain("DTSTART;VALUE=DATE:20261020");
    expect(lineas).toContain("SUMMARY:Tarea: Llamar al contador");
    expect(lineas).toContain("DTSTART;VALUE=DATE:20261021");
  });

  it("actividad cuya regla no da días no sale", () => {
    const vacio = armarIcs(
      { actividades: [actividad({ recurrencia: rec({ frecuencia: "semanal", diasSemana: [5], hasta: "2026-10-20" }) })], notas: [], tareas: [] },
      { nombreCalendario: "x", ahora },
    );
    expect(vacio).not.toContain("BEGIN:VEVENT");
  });

  it("vencimientos del sistema como eventos de todo el día, sin monto", () => {
    const conVenc = armarIcs(
      {
        actividades: [],
        notas: [],
        tareas: [],
        vencimientos: [{ id: "adelanto:abc", titulo: "Vence el adelanto de Rosa (S/ 1.500)", fecha: "2026-10-25" }],
      },
      { nombreCalendario: "x", ahora },
    );
    const l = lineasLogicas(conVenc);
    expect(l).toContain("UID:venc-adelanto:abc@agenda.buleje");
    expect(l).toContain("DTSTART;VALUE=DATE:20261025");
    expect(l).toContain("SUMMARY:Vence el adelanto de Rosa ([monto])");
    expect(conVenc).not.toMatch(/1\.500|1,500/);
  });
});
