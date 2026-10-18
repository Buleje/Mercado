/**
 * Agenda (ADR-501 §3-4) — motor puro: el estado de cada día sale de la marca manual,
 * de la fuente del sistema o del calendario, en ese orden; y lo que la campana avisa.
 */
import { describe, expect, it } from "vitest";
import { calcularOcurrencias, esDiaDeLaActividad, horaDeLima, resumirHoy, type MarcaManual } from "@/lib/agenda/motor";
import { alertasDeAgenda } from "@/lib/agenda/alertas-campana";
import { actividadDePlantilla, PLANTILLAS_AGENDA, plantillaPorId } from "@/lib/agenda/plantillas";
import { ActividadCrearSchema } from "@/lib/agenda/schemas";
import type { ActividadDTO } from "@/lib/agenda/tipos";

const HOY = "2026-10-19"; // lunes

const act = (a: Partial<ActividadDTO> & Pick<ActividadDTO, "id" | "regla">): ActividadDTO => ({
  nombre: a.id,
  objetivo: null,
  recurrencia: {
    frecuencia: "diaria",
    desde: "2026-10-01",
    hasta: null,
    diasSemana: [0, 1, 2, 3, 4, 5, 6],
    diaMes: null,
    cadaN: null,
  },
  hora: null,
  canales: ["campana"],
  responsableRol: null,
  parametros: {},
  color: "info",
  nota: null,
  activo: true,
  version: "2026-10-18T00:00:00.000Z",
  ...a,
});

const marca = (m: Partial<MarcaManual> & Pick<MarcaManual, "actividadId" | "fecha" | "estado">): MarcaManual => ({
  posponerA: null,
  nota: null,
  marcadoPor: "qaadmin",
  ...m,
});

describe("calcularOcurrencias", () => {
  it("asistencia: hecha con todos, parcial con algunos, atrasada sin marcas y futura sin mirar la fuente", () => {
    const a = act({ id: "asis", regla: "asistencia", parametros: { minimo: "todos" } });
    const os = calcularOcurrencias({
      actividades: [a],
      desde: "2026-10-16",
      hasta: "2026-10-20",
      hoy: HOY,
      marcas: [],
      fuentes: {
        asistencia: {
          "2026-10-16": { marcados: 4, total: 4 },
          "2026-10-17": { marcados: 2, total: 4 },
          "2026-10-20": { marcados: 4, total: 4 },
        },
      },
    });
    expect(os.map((o) => [o.fecha, o.estado, o.origen])).toEqual([
      ["2026-10-16", "hecha", "fuente"],
      ["2026-10-17", "parcial", "fuente"],
      ["2026-10-18", "atrasada", "fuente"],
      ["2026-10-19", "pendiente", "fuente"],
      ["2026-10-20", "futura", "fuente"],
    ]);
    expect(os[1].detalle).toBe("2 de 4 marcados");
    expect(os[1].avance).toEqual({ hecho: 2, total: 4 });
  });

  it("asistencia sin colaboradores activos no se da por hecha", () => {
    const a = act({ id: "asis", regla: "asistencia", parametros: { minimo: "todos" } });
    const [o] = calcularOcurrencias({
      actividades: [a],
      desde: HOY,
      hasta: HOY,
      hoy: HOY,
      marcas: [],
      fuentes: { asistencia: { [HOY]: { marcados: 0, total: 0 } } },
    });
    expect(o.estado).toBe("pendiente");
    expect(o.detalle).toBe("No hay colaboradores activos ese día");
  });

  it("la marca manual manda sobre la fuente", () => {
    const a = act({ id: "aserrio", regla: "servicio_aserrio", parametros: { soloTerceros: false } });
    const [o] = calcularOcurrencias({
      actividades: [a],
      desde: HOY,
      hasta: HOY,
      hoy: HOY,
      marcas: [marca({ actividadId: "aserrio", fecha: HOY, estado: "omitida", nota: "Sin luz" })],
      fuentes: { corridas: { [HOY]: { total: 2, terceros: 1 } } },
    });
    expect(o.estado).toBe("omitida");
    expect(o.origen).toBe("manual");
    expect(o.nota).toBe("Sin luz");
    expect(o.detalle).toBe("2 corridas · 1 de tercero");
  });

  it("servicio de aserrío sólo de terceros: las propias no cuentan", () => {
    const a = act({ id: "aserrio", regla: "servicio_aserrio", parametros: { soloTerceros: true } });
    const [o] = calcularOcurrencias({
      actividades: [a],
      desde: HOY,
      hasta: HOY,
      hoy: HOY,
      marcas: [],
      fuentes: { corridas: { [HOY]: { total: 3, terceros: 0 } } },
    });
    expect(o.estado).toBe("pendiente");
  });

  it("gastos e ingresos: parcial con uno de dos y avance 1/2", () => {
    const a = act({ id: "plata", regla: "gastos_ingresos", parametros: { que: ["gastos", "ingresos"] } });
    const [o] = calcularOcurrencias({
      actividades: [a],
      desde: HOY,
      hasta: HOY,
      hoy: HOY,
      marcas: [],
      fuentes: { plata: { [HOY]: { gastos: 2, ingresos: 0, cajaCerrada: 0, cuentaForestal: 0 } } },
    });
    expect(o.estado).toBe("parcial");
    expect(o.avance).toEqual({ hecho: 1, total: 2 });
    expect(o.detalle).toBe("2 gastos · 0 ingresos");
    expect(o.href).toBe("/admin?tab=plata&vista=gastos");
  });

  it("adelantos con beneficiario: sólo cuentan sus gestiones", () => {
    const a = act({
      id: "adel",
      regla: "adelantos",
      objetivo: { tipo: "beneficiario", id: "b1", nombre: "Juan" },
    });
    const [o] = calcularOcurrencias({
      actividades: [a],
      desde: HOY,
      hasta: HOY,
      hoy: HOY,
      marcas: [],
      fuentes: { gestionesAdelanto: { [HOY]: { "*": 3, b2: 3 } }, apoyoHoy: { adel: "2 con saldo · 1 vencidos" } },
    });
    expect(o.estado).toBe("pendiente");
    expect(o.detalle).toBe("Sin gestiones anotadas · 2 con saldo · 1 vencidos");
  });

  it("manual sin marca: pendiente hoy, atrasada ayer, origen sin_fuente", () => {
    const a = act({ id: "man", regla: "manual" });
    const os = calcularOcurrencias({ actividades: [a], desde: "2026-10-18", hasta: HOY, hoy: HOY, marcas: [], fuentes: {} });
    expect(os.map((o) => [o.estado, o.origen])).toEqual([
      ["atrasada", "sin_fuente"],
      ["pendiente", "sin_fuente"],
    ]);
  });

  it("una pospuesta reaparece en su día nuevo y el original queda resuelto", () => {
    const a = act({
      id: "fact",
      regla: "facturas",
      parametros: { modo: "contador" },
      recurrencia: { frecuencia: "mensual", desde: "2026-01-01", hasta: null, diasSemana: [], diaMes: 5, cadaN: null },
    });
    const marcas = [marca({ actividadId: "fact", fecha: "2026-10-05", estado: "pospuesta", posponerA: "2026-10-08" })];
    const os = calcularOcurrencias({ actividades: [a], desde: "2026-10-01", hasta: "2026-10-31", hoy: HOY, marcas, fuentes: {} });
    expect(os.map((o) => [o.fecha, o.estado])).toEqual([
      ["2026-10-05", "pospuesta"],
      ["2026-10-08", "atrasada"],
    ]);
    expect(os[1].detalle).toBe("Pospuesta del 05/10");
    expect(esDiaDeLaActividad(a, "2026-10-08", marcas)).toBe(true);
    expect(esDiaDeLaActividad(a, "2026-10-09", marcas)).toBe(false);
  });

  it("ordena por día, hora (sin hora al final) y nombre", () => {
    const os = calcularOcurrencias({
      actividades: [
        act({ id: "b", nombre: "B", regla: "manual" }),
        act({ id: "c", nombre: "C", regla: "manual", hora: "09:00" }),
        act({ id: "a", nombre: "A", regla: "manual" }),
      ],
      desde: HOY,
      hasta: HOY,
      hoy: HOY,
      marcas: [],
      fuentes: {},
    });
    expect(os.map((o) => o.nombre)).toEqual(["C", "A", "B"]);
  });
});

describe("resumirHoy y la campana", () => {
  const actividades = [
    act({ id: "temprano", nombre: "Asistencia", regla: "manual", hora: "09:00" }),
    act({ id: "tarde", nombre: "Gastos", regla: "manual", hora: "19:00" }),
    act({ id: "hecha", nombre: "Hecha", regla: "manual" }),
  ];
  const os = calcularOcurrencias({
    actividades,
    desde: "2026-10-12",
    hasta: HOY,
    hoy: HOY,
    marcas: [
      ...["temprano", "tarde", "hecha"].flatMap((id) =>
        ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"].map((fecha) =>
          marca({ actividadId: id, fecha, estado: "hecha" }),
        ),
      ),
      marca({ actividadId: "hecha", fecha: HOY, estado: "hecha" }),
    ],
    fuentes: {},
  });

  it("cuenta lo de hoy y arrastra sólo las atrasadas", () => {
    const r = resumirHoy(os, HOY, "10:30");
    expect(r.cuenta).toEqual({ total: 3, hechas: 1, pendientes: 2, atrasadas: 3 });
    expect(r.atrasadas.every((o) => o.fecha === "2026-10-18")).toBe(true);
  });

  it("alerta crítica por la que ya pasó su hora, agrupadas las demás", () => {
    const r = resumirHoy(os, HOY, "10:30");
    expect(r.alertas.map((a) => [a.id, a.severity])).toEqual([
      [`agenda-vencida:temprano:${HOY}`, "critical"],
      [`agenda-hoy:${HOY}`, "warning"],
      [`agenda-atrasadas:${HOY}`, "warning"],
    ]);
    expect(r.alertas[0].title).toBe("Asistencia: era a las 09:00");
    expect(r.alertas[1].description).toBe("Gastos");
    expect(alertasDeAgenda(JSON.parse(JSON.stringify(r)))).toEqual(r.alertas);
  });

  it("alertasDeAgenda nunca lanza con basura", () => {
    expect(alertasDeAgenda(null)).toEqual([]);
    expect(alertasDeAgenda({ alertas: [{ id: 1 }, "x"] })).toEqual([]);
    expect(alertasDeAgenda("<html>")).toEqual([]);
  });

  it("horaDeLima resta 5 horas fijas", () => {
    expect(horaDeLima(new Date("2026-10-19T03:15:00Z"))).toBe("22:15");
    expect(horaDeLima(new Date("2026-10-19T14:00:00Z"))).toBe("09:00");
  });
});

describe("plantillas", () => {
  it("las 6 nacen apagadas y pasan el schema del alta", () => {
    expect(PLANTILLAS_AGENDA).toHaveLength(6);
    const parte = { tipo: "parte" as const, id: "p1", nombre: "Maderera X" };
    for (const p of PLANTILLAS_AGENDA) {
      const cuerpo = actividadDePlantilla(p, { hoy: HOY, objetivo: p.pideObjetivo ? parte : null });
      expect(cuerpo?.activo).toBe(false);
      const r = ActividadCrearSchema.safeParse(cuerpo);
      expect(r.success, `${p.id}: ${r.success ? "" : r.error.issues[0]?.message}`).toBe(true);
    }
  });

  it("cuenta de tercero sin parte no arma nada y con parte pone su nombre", () => {
    const p = plantillaPorId("cuenta_tercero");
    expect(p).not.toBeNull();
    if (!p) return;
    expect(actividadDePlantilla(p, { hoy: HOY })).toBeNull();
    expect(actividadDePlantilla(p, { hoy: HOY, objetivo: { tipo: "parte", id: "p1", nombre: "Maderera X" } })?.nombre).toBe(
      "Revisar la cuenta de Maderera X",
    );
  });
});
