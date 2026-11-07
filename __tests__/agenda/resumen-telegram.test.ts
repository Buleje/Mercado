/**
 * Resumen de la agenda por Telegram — cuándo sale, que no repita en el día y el
 * texto (HTML de Telegram escapado). Lima = UTC−5 fijo.
 */
import { describe, expect, it } from "vitest";
import {
  RESUMEN_TELEGRAM_POR_DEFECTO,
  ResumenTelegramSchema,
  escaparHtml,
  momentoDePrueba,
  momentosEnHora,
  momentosPorMandar,
  normalizarConfigTelegram,
  textoResumen,
} from "@/lib/agenda/resumen-telegram";
import type { OcurrenciaDTO, ResumenAgendaHoy } from "@/lib/agenda/tipos";

const lima = (iso: string) => Date.parse(`${iso}:00.000-05:00`);
const DEF = RESUMEN_TELEGRAM_POR_DEFECTO;
const URL_HTTPS = "https://blas.buleje.pe/admin?tab=administracion&vista=hoy";

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

const resumen = (hoy: OcurrenciaDTO[], atrasadas: OcurrenciaDTO[] = []): ResumenAgendaHoy => ({
  fecha: "2026-10-20",
  hoy,
  atrasadas,
  cuenta: { total: hoy.length, hechas: 0, pendientes: hoy.length, atrasadas: atrasadas.length },
  alertas: [],
});

describe("config", () => {
  it("sin nada guardado = 07:00 y 19:30", () => {
    expect(normalizarConfigTelegram(undefined)).toEqual({ manana: "07:00", noche: "19:30" });
  });
  it("null apaga ese momento; lo roto toma el valor por defecto", () => {
    expect(normalizarConfigTelegram({ manana: null, noche: "25:00" })).toEqual({ manana: null, noche: "19:30" });
  });
  it("el schema rechaza horas mal escritas y claves de más", () => {
    expect(ResumenTelegramSchema.safeParse({ manana: "7:00", noche: null }).success).toBe(false);
    expect(ResumenTelegramSchema.safeParse({ manana: "07:00", noche: null, otro: 1 }).success).toBe(false);
    expect(ResumenTelegramSchema.safeParse({ manana: "06:45", noche: null }).success).toBe(true);
  });
});

describe("ventana horaria", () => {
  it("sale desde la hora y durante 30 min", () => {
    expect(momentosEnHora(DEF, lima("2026-10-20T06:59"))).toEqual([]);
    expect(momentosEnHora(DEF, lima("2026-10-20T07:00"))).toEqual(["manana"]);
    expect(momentosEnHora(DEF, lima("2026-10-20T07:29"))).toEqual(["manana"]);
    expect(momentosEnHora(DEF, lima("2026-10-20T19:45"))).toEqual(["noche"]);
  });
  it("PC apagada a las 7:00: a las 7:30 o a las 11:00 ya no se manda", () => {
    expect(momentosEnHora(DEF, lima("2026-10-20T07:30"))).toEqual([]);
    expect(momentosEnHora(DEF, lima("2026-10-20T11:00"))).toEqual([]);
  });
  it("apagado (null) no sale nunca", () => {
    expect(momentosEnHora({ manana: null, noche: "19:30" }, lima("2026-10-20T07:05"))).toEqual([]);
  });
  it("la hora es la de Lima, no la UTC del servidor", () => {
    // 12:05 UTC = 07:05 en Lima.
    expect(momentosEnHora(DEF, Date.parse("2026-10-20T12:05:00.000Z"))).toEqual(["manana"]);
  });
});

describe("una vez por día y momento", () => {
  const ahora = lima("2026-10-20T07:10");
  it("ya salió hoy → no repite", () => {
    expect(momentosPorMandar(DEF, { manana: "2026-10-20", noche: null }, ahora)).toEqual([]);
  });
  it("salió ayer → hoy sí", () => {
    expect(momentosPorMandar(DEF, { manana: "2026-10-19", noche: null }, ahora)).toEqual(["manana"]);
  });
  it("a las 20:00 de Lima (01:00 UTC del día siguiente) la fecha sigue siendo la de Lima", () => {
    const noche = lima("2026-10-20T19:40");
    expect(momentosPorMandar(DEF, { manana: null, noche: "2026-10-20" }, noche)).toEqual([]);
    expect(momentosPorMandar(DEF, { manana: null, noche: "2026-10-19" }, noche)).toEqual(["noche"]);
  });
  it("la prueba elige el de la mañana antes de las 14:00 y el de la noche después", () => {
    expect(momentoDePrueba(lima("2026-10-20T13:59"))).toBe("manana");
    expect(momentoDePrueba(lima("2026-10-20T14:00"))).toBe("noche");
  });
});

describe("texto del mensaje", () => {
  const asistencia = oc({ nombre: "Asistencia", estado: "pendiente", hora: "07:30", detalle: "0 de 8 marcados" });
  const gastos = oc({ nombre: "Gastos", estado: "hecha", detalle: "3 anotados" });
  const omitida = oc({ nombre: "Facturas", estado: "omitida" });
  const atrasada = oc({ nombre: "Aserrío", estado: "atrasada", fecha: "2026-10-18" });

  it("mañana: lo de hoy con hora y detalle, las atrasadas y el enlace", () => {
    const t = textoResumen("manana", resumen([asistencia, gastos, omitida], [atrasada]), { url: URL_HTTPS });
    expect(t).toContain("☀️ <b>Buenos días</b> — hoy toca:");
    expect(t).toContain("• 07:30 <b>Asistencia</b> — 0 de 8 marcados");
    expect(t).toContain("✅ <b>Gastos</b> — 3 anotados");
    expect(t).not.toContain("Facturas");
    expect(t).toContain("⏰ <b>Atrasadas: 1</b> (Aserrío 18/10)");
    expect(t).toContain(`<a href="${URL_HTTPS.replace(/&/g, "&amp;")}">Abrir Administración › Hoy</a>`);
  });
  it("noche: hiciste X de Y (lo omitido no cuenta) y lo que falta", () => {
    const t = textoResumen("noche", resumen([asistencia, gastos, omitida]), { url: URL_HTTPS });
    expect(t).toContain("🌙 <b>Cierre del día</b>: hiciste 1 de 2");
    expect(t).toContain("Falta:\n• 07:30 <b>Asistencia</b>");
    expect(t).not.toContain("Gastos");
  });
  it("noche sin nada pendiente: una línea corta", () => {
    expect(textoResumen("noche", resumen([gastos]), { url: URL_HTTPS })).toBe("🌙 <b>Cierre del día</b>: todo hecho hoy ✅");
  });
  it("escapa lo que escribe el usuario (nombres, detalle) y marca la prueba", () => {
    const rara = oc({ nombre: "Pagar <b>luz</b> & agua", estado: "pendiente", detalle: 'factura "A<1>"' });
    const t = textoResumen("manana", resumen([rara]), { url: URL_HTTPS, prueba: true });
    expect(t.startsWith("[prueba] ☀️")).toBe(true);
    expect(t).toContain("<b>Pagar &lt;b&gt;luz&lt;/b&gt; &amp; agua</b> — factura &quot;A&lt;1&gt;&quot;");
    expect(escaparHtml("<a>&\"")).toBe("&lt;a&gt;&amp;&quot;");
  });
  it("con la PC (http://localhost) no arma un enlace que no abre desde el celular", () => {
    const t = textoResumen("manana", resumen([]), { url: "http://localhost:3000/admin?tab=administracion&vista=hoy" });
    expect(t).toContain("hoy no te toca nada de la agenda");
    expect(t).not.toContain("<a ");
    expect(t).toContain("<i>Panel › Administración › Hoy</i>");
  });
  it("la misma actividad atrasada varios días sale una vez, con sus días en orden", () => {
    const gastos18 = oc({ nombre: "Gastos", estado: "atrasada", fecha: "2026-10-18" });
    const gastos19 = oc({ nombre: "Gastos", estado: "atrasada", fecha: "2026-10-19" });
    const asist19 = oc({ nombre: "Asistencia", estado: "parcial", fecha: "2026-10-19" });
    const t = textoResumen("manana", resumen([], [gastos19, asist19, gastos18]), { url: URL_HTTPS });
    expect(t).toContain("⏰ <b>Atrasadas: 3</b> (Gastos 18/10 y 19/10, Asistencia 19/10)");
  });
  it("muchas atrasadas: nombra 5 y cuenta el resto", () => {
    const muchas = Array.from({ length: 7 }, (_, i) => oc({ nombre: `A${i}`, estado: "atrasada", fecha: "2026-10-19" }));
    expect(textoResumen("manana", resumen([], muchas), { url: URL_HTTPS })).toContain("Atrasadas: 7</b> (A0 19/10, A1 19/10, A2 19/10, A3 19/10, A4 19/10 y 2 más)");
  });
});
