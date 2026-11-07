import { describe, expect, it, vi } from "vitest";

// avisos-asistente importa la DB class: acá sólo se prueba la parte pura.
vi.mock("@/lib/db/agenda.db", () => ({ AgendaDB: {} }));

import { armarAvisosAgenda } from "@/lib/agenda/avisos-asistente";
import { avisosDelCanal, hayNuevosParaMandar, type Aviso } from "@/lib/asistente/avisos";
import { hrefDeActividad } from "@/lib/agenda/motor";
import type { CanalAgenda, OcurrenciaDTO } from "@/lib/agenda/tipos";

const HOY = "2026-10-18";
const AYER = "2026-10-17";

function ocurrencia(actividadId: string, fecha: string, estado: OcurrenciaDTO["estado"] = "pendiente"): OcurrenciaDTO {
  return {
    actividadId,
    nombre: `Act ${actividadId}`,
    regla: "manual",
    fecha,
    hora: "08:00",
    estado,
    origen: "sin_fuente",
    detalle: null,
    avance: null,
    href: "/admin?tab=administracion&vista=hoy",
    nota: null,
    marcadoPor: null,
    posponerA: null,
  };
}
const act = (id: string, canales: CanalAgenda[], activo = true) => ({ id, activo, canales });

describe("armarAvisosAgenda — cada aviso lleva los canales de SU actividad", () => {
  it("la atrasada de ayer sale sólo por los canales elegidos", () => {
    const avisos = armarAvisosAgenda({ fecha: HOY, hoy: [], atrasadas: [ocurrencia("t", AYER)] }, [act("t", ["telegram", "google"])]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ clave: `agenda-atrasada:t:${AYER}`, canales: ["telegram"] });
    expect(avisosDelCanal(avisos, "campana")).toHaveLength(0);
    expect(avisosDelCanal(avisos, "n8n")).toHaveLength(0);
    expect(avisosDelCanal(avisos, "telegram")).toHaveLength(1);
  });

  it("«hoy» se arma por canal: la campana no recibe lo que sólo va a Telegram", () => {
    const avisos = armarAvisosAgenda(
      { fecha: HOY, hoy: [ocurrencia("c", HOY), ocurrencia("t", HOY)], atrasadas: [] },
      [act("c", ["campana"]), act("t", ["campana", "telegram"])],
    );
    const campana = avisosDelCanal(avisos, "campana");
    const telegram = avisosDelCanal(avisos, "telegram");
    expect(campana).toHaveLength(1);
    expect(campana[0].titulo).toBe("Hoy te tocan 2 actividades");
    expect(telegram).toHaveLength(1);
    expect(telegram[0]).toMatchObject({ titulo: "Hoy te toca 1 actividad", cuerpo: "08:00 Act t" });
    expect(avisosDelCanal(avisos, "n8n")).toHaveLength(0);
  });

  it("con la misma lista en los tres canales hay un solo aviso y la clave de siempre", () => {
    const avisos = armarAvisosAgenda({ fecha: HOY, hoy: [ocurrencia("a", HOY)], atrasadas: [] }, [act("a", ["campana", "telegram", "n8n"])]);
    expect(avisos).toEqual([expect.objectContaining({ clave: `agenda-hoy:${HOY}`, canales: ["campana", "telegram", "n8n"] })]);
  });

  it("sólo google / reporte_diario, apagada o ya hecha: no avisa nada", () => {
    expect(armarAvisosAgenda({ fecha: HOY, hoy: [ocurrencia("g", HOY)], atrasadas: [] }, [act("g", ["google", "reporte_diario"])])).toEqual([]);
    expect(armarAvisosAgenda({ fecha: HOY, hoy: [ocurrencia("x", HOY)], atrasadas: [] }, [act("x", ["campana"], false)])).toEqual([]);
    expect(armarAvisosAgenda({ fecha: HOY, hoy: [ocurrencia("h", HOY, "hecha")], atrasadas: [] }, [act("h", ["campana"])])).toEqual([]);
  });
});

describe("reparto del cron", () => {
  const base = { severidad: "LOW" as const, titulo: "t", cuerpo: "c", pantalla: "p", url: "/u" };
  const comun: Aviso = { ...base, clave: "fletes:1" };
  const soloTelegram: Aviso = { ...base, clave: "agenda-hoy:x:telegram", canales: ["telegram"] };
  const soloCampana: Aviso = { ...base, clave: "agenda-hoy:x:campana", canales: ["campana"] };

  it("un aviso sin canales sale por los tres (lo de siempre)", () => {
    for (const canal of ["campana", "telegram", "n8n"] as const) {
      expect(avisosDelCanal([comun, soloTelegram, soloCampana], canal).map((a) => a.clave)).toContain("fletes:1");
    }
    expect(avisosDelCanal([comun, soloTelegram, soloCampana], "telegram").map((a) => a.clave)).toEqual(["fletes:1", "agenda-hoy:x:telegram"]);
  });

  it("al celular va si hay algo nuevo en la campana o algo que no pasa por ella", () => {
    expect(hayNuevosParaMandar([comun], new Set())).toBe(false);
    expect(hayNuevosParaMandar([comun], new Set(["fletes:1"]))).toBe(true);
    expect(hayNuevosParaMandar([soloTelegram], new Set())).toBe(true);
    expect(hayNuevosParaMandar([], new Set(["fletes:1"]))).toBe(false);
  });
});

describe("hrefDeActividad — cuenta de tercero", () => {
  it("con la parte, abre SU cuenta en Plata › Adelantos", () => {
    const href = hrefDeActividad({ regla: "cuenta_tercero", parametros: {}, objetivo: { tipo: "parte", id: "p1", nombre: "X" } });
    expect(href).toBe("/admin?tab=plata&vista=adelantos&accion=liquidar&persona=parte%3Ap1");
  });
  it("sin parte, la lista de cuentas por persona", () => {
    expect(hrefDeActividad({ regla: "cuenta_tercero", parametros: {}, objetivo: null })).toBe("/admin?tab=plata&vista=adelantos");
  });
});
