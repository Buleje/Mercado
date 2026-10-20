/**
 * Aviso en pantalla de la agenda — cuándo sale, cuándo espera y qué muestra.
 * Lima = UTC−5 fijo: «2026-10-20T15:00-05:00» son las 15:00 del martes 20.
 */
import { describe, expect, it } from "vitest";
import {
  AVISO_POR_DEFECTO,
  cuandoVuelve,
  dentroDelHorario,
  loQueFalta,
  normalizarAviso,
  normalizarReloj,
  anchoPanel,
  proximoAviso,
  textoNotificacion,
  tocaMirar,
  type AvisoPantalla,
} from "@/lib/agenda/aviso-pantalla";
import type { OcurrenciaDTO, ResumenAgendaHoy } from "@/lib/agenda/tipos";

const lima = (iso: string) => Date.parse(`${iso}:00.000-05:00`);
const MARTES_15 = lima("2026-10-20T15:00");
const c = (x: Partial<AvisoPantalla> = {}): AvisoPantalla => ({ ...AVISO_POR_DEFECTO, ...x });

const oc = (o: Partial<OcurrenciaDTO> & Pick<OcurrenciaDTO, "nombre" | "estado">): OcurrenciaDTO => ({
  actividadId: o.nombre,
  regla: "manual",
  fecha: "2026-10-20",
  hora: null,
  origen: "fuente",
  detalle: null,
  avance: null,
  href: "/admin?tab=administracion",
  nota: null,
  marcadoPor: null,
  posponerA: null,
  ...o,
});

describe("cuándo sale", () => {
  it("la primera vez (reloj en 0) sale ya, si está dentro del horario", () => {
    expect(tocaMirar(c(), { proximo: 0, silencioDia: null }, MARTES_15)).toBe(true);
  });

  it("espera a su próximo, se calla con «no más por hoy» y apagado no sale", () => {
    expect(tocaMirar(c(), { proximo: MARTES_15 + 60_000, silencioDia: null }, MARTES_15)).toBe(false);
    expect(tocaMirar(c(), { proximo: 0, silencioDia: "2026-10-20" }, MARTES_15)).toBe(false);
    expect(tocaMirar(c(), { proximo: 0, silencioDia: "2026-10-19" }, MARTES_15)).toBe(true);
    expect(tocaMirar(c({ activo: false }), { proximo: 0, silencioDia: null }, MARTES_15)).toBe(false);
  });

  it("fuera del horario o en un día no elegido no sale", () => {
    const reloj = { proximo: 0, silencioDia: null };
    expect(tocaMirar(c(), reloj, lima("2026-10-20T21:30"))).toBe(false);
    expect(tocaMirar(c(), reloj, lima("2026-10-20T06:59"))).toBe(false);
    expect(tocaMirar(c(), reloj, lima("2026-10-18T10:00"))).toBe(false); // domingo
    expect(tocaMirar(c({ dias: [0] }), reloj, lima("2026-10-18T10:00"))).toBe(true);
  });

  it("de noche el próximo pasa a la mañana del siguiente día elegido (sábado → lunes)", () => {
    expect(dentroDelHorario(c(), lima("2026-10-20T22:00"))).toBe(lima("2026-10-21T07:00"));
    expect(dentroDelHorario(c(), lima("2026-10-24T20:30"))).toBe(lima("2026-10-26T07:00"));
    expect(dentroDelHorario(c({ dias: [] }), MARTES_15)).toBeNull();
  });
});

describe("el próximo aviso", () => {
  it("cada 1 hora por defecto", () => {
    expect(proximoAviso(c(), MARTES_15, [])).toBe(lima("2026-10-20T16:00"));
  });

  it("antes, si a una actividad pendiente de hoy le llega su hora", () => {
    const aserrio = oc({ nombre: "Aserrío", estado: "pendiente", hora: "15:30" });
    expect(proximoAviso(c(), MARTES_15, [aserrio])).toBe(lima("2026-10-20T15:30"));
    expect(proximoAviso(c({ aSuHora: false }), MARTES_15, [aserrio])).toBe(lima("2026-10-20T16:00"));
    // la hora que ya pasó no adelanta nada
    expect(proximoAviso(c(), MARTES_15, [oc({ nombre: "Asistencia", estado: "pendiente", hora: "09:00" })])).toBe(lima("2026-10-20T16:00"));
  });

  it("el de las 19:30 cada 1 h no sale a las 20:30: espera a la mañana", () => {
    expect(proximoAviso(c(), lima("2026-10-20T19:30"), [])).toBe(lima("2026-10-21T07:00"));
  });
});

describe("qué muestra", () => {
  const resumen: ResumenAgendaHoy = {
    fecha: "2026-10-20",
    hoy: [oc({ nombre: "Asistencia", estado: "pendiente" }), oc({ nombre: "Gastos", estado: "parcial" }), oc({ nombre: "Caja", estado: "hecha" })],
    atrasadas: [oc({ nombre: "Asistencia", estado: "atrasada", fecha: "2026-10-19" }), oc({ nombre: "Aserrío", estado: "pospuesta", fecha: "2026-10-19" })],
    cuenta: { total: 3, hechas: 1, pendientes: 2, atrasadas: 1 },
    alertas: [],
  };

  it("lo que falta: ni lo hecho ni lo pospuesto; lo atrasado sólo si se pidió", () => {
    const f = loQueFalta(resumen, c());
    expect(f.hoy.map((o) => o.nombre)).toEqual(["Asistencia", "Gastos"]);
    expect(f.atrasadas.map((o) => o.nombre)).toEqual(["Asistencia"]);
    expect(loQueFalta(resumen, c({ atrasadas: false })).atrasadas).toEqual([]);
  });

  it("el aviso del sistema cuenta todo y nombra cada actividad una vez", () => {
    expect(textoNotificacion(loQueFalta(resumen, c()))).toEqual({
      titulo: "Te faltan 3 cosas de administración",
      cuerpo: "Asistencia · Gastos",
    });
  });

  it("dice cuándo vuelve en palabras", () => {
    expect(cuandoVuelve(lima("2026-10-20T16:00"), MARTES_15)).toBe("hoy 16:00");
    expect(cuandoVuelve(lima("2026-10-21T07:00"), MARTES_15)).toBe("mañana 07:00");
    expect(cuandoVuelve(lima("2026-10-26T07:00"), MARTES_15)).toBe("el lunes 07:00");
  });
});

describe("ancho del panel del costado", () => {
  it("de fábrica 416; se arrastra entre 320 y 900 dejando ~600 px a la página", () => {
    expect(anchoPanel(null, 1920)).toBe(416);
    expect(anchoPanel(200, 1920)).toBe(320);
    expect(anchoPanel(1500, 1920)).toBe(900);
    expect(anchoPanel(800, 1280)).toBe(420);
    expect(anchoPanel(800, 1440)).toBe(580);
    expect(anchoPanel(null, 1024)).toBe(320);
    expect(anchoPanel(500, 400)).toBe(320);
  });
});

describe("lo guardado", () => {
  it("lo roto o viejo cae a lo de fábrica; lo parcial se completa", () => {
    expect(normalizarAviso(null)).toEqual(AVISO_POR_DEFECTO);
    expect(normalizarAviso({ cadaMin: 7 })).toEqual(AVISO_POR_DEFECTO);
    expect(normalizarAviso({ desde: "20:00", hasta: "08:00" })).toEqual(AVISO_POR_DEFECTO);
    expect(normalizarAviso({ cadaMin: 30 })).toEqual({ ...AVISO_POR_DEFECTO, cadaMin: 30 });
    expect(normalizarAviso({ modo: "costado" }).modo).toBe("ventana");
    expect(normalizarAviso({ modo: "fija" }).modo).toBe("fija");
  });

  it("el reloj viejo (sin panel fijo) se lee con el panel cerrado", () => {
    expect(normalizarReloj({ proximo: 5, silencioDia: null })).toEqual({ proximo: 5, silencioDia: null, fijaAbierta: false, minimizado: false, ancho: null });
    expect(normalizarReloj({ proximo: 5, fijaAbierta: true, minimizado: "si" })).toMatchObject({ fijaAbierta: true, minimizado: false });
  });
});
