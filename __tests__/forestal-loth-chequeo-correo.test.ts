/**
 * El correo del chequeo del Libro TH (26-10): qué se avisa, qué es nuevo, la
 * caducidad y cómo se escribe. Las frases con días salen de las funciones
 * REALES que las arman (preliminares, despachos, vigencia): si alguien cambia
 * una frase, este test avisa antes de que el correo deje de contar los días.
 */
import { describe, expect, it } from "vitest";
import {
  armarCorreoChequeo,
  AVISA_OTRO_CRON,
  asuntoDelCorreo,
  avisosDelChequeo,
  campanaDelChequeo,
  claveDelCaso,
  diasQueQuedan,
  leerRegistroAvisados,
  mensajeWhatsAppChequeo,
  planearCorreoChequeo,
  registroCambia,
  REGISTRO_VACIO,
  SUFIJO_ULTIMO_DIA,
  TOPE_REGISTRO_AVISADOS,
  URL_CHEQUEO_TH,
  type RegistroAvisados,
} from "@/lib/forestal/loth-chequeo-correo";
import { armarChequeos, type CasosDelChequeo } from "@/lib/forestal/loth-chequeo-catalogo";
import { preliminaresViejas } from "@/lib/forestal/loth-chequeo-guias";
import { razonesDelPlan } from "@/lib/forestal/loth-chequeo-arboles";
import { fraseDespacho, type DespachoSinAsentar } from "@/lib/forestal/loth-aviso-plazos";
import { semaforoDelPlan } from "@/lib/forestal/loth-plan-semaforo";
import { AJUSTES_CHEQUEO_DEFECTO } from "@/lib/forestal/loth-chequeo-tipos";

const HOY = "2026-10-26";

/** La frase del plan como la arma el chequeo (`semaforoDelPlan` → `razonesDelPlan`). */
function casoDelPlan(nombre: string, vigenciaHasta: string): { vencido: string[]; porVencer: string[] } {
  const s = semaforoDelPlan({ planType: "PO", estado: "vigente", vigenciaHasta, hoy: new Date(`${HOY}T17:00:00.000Z`) });
  const r = razonesDelPlan([{ nombre, razones: s.razones }]);
  return { vencido: r.vencido, porVencer: r.porVencer };
}

/** La preliminar anotada con la guía de hace `dias` días (vieja desde `desde` días: 10 de fábrica). */
function preliminar(numero: string, dias: number, desde = 10) {
  const d = new Date(`${HOY}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return preliminaresViejas([{ numeroGtf: numero, fecha: d.toISOString().slice(0, 10), anotadaEl: HOY, plan: "PO1" }], HOY, desde);
}

function despacho(quedan: number, numero = "771"): string {
  const d: DespachoSinAsentar = { gtfNumber: numero, fecha: "20/10/2026", dias: 15 - quedan, quedan, estado: quedan < 0 ? "vencido" : "por_vencer", volumenM3: null, piezas: null };
  return `GTF ${numero} (martes 20/10): ${fraseDespacho(d)}`;
}

const checks = (casos: CasosDelChequeo) => armarChequeos(casos, AJUSTES_CHEQUEO_DEFECTO);

describe("diasQueQuedan — amarrado a las frases reales", () => {
  it("preliminares: 5, 1 y el último día", () => {
    expect(diasQueQuedan(preliminar("19-000003", 10).porVencer[0])).toBe(5);
    expect(diasQueQuedan(preliminar("19-000003", 14).porVencer[0])).toBe(1);
    expect(diasQueQuedan(preliminar("19-000003", 15).porVencer[0])).toBe(0);
  });

  it("despachos por asentar", () => {
    expect(diasQueQuedan(despacho(3))).toBe(3);
    expect(diasQueQuedan(despacho(1))).toBe(1);
    expect(diasQueQuedan(despacho(0))).toBe(0);
  });

  it("el vencimiento del plan no se cuenta acá (lo avisa loth-plan-vencimiento)", () => {
    expect(casoDelPlan("PO1", "2026-11-02").porVencer[0]).toBe("PO1: Vence en 7 días");
    expect(diasQueQuedan(casoDelPlan("PO1", "2026-11-02").porVencer[0])).toBeNull();
    expect(diasQueQuedan("GTF 772 (lunes 05/10): falta la placa")).toBeNull();
  });
});

describe("avisosDelChequeo — qué amerita correo", () => {
  it("multas siempre; advertencias con plazo sólo a 7 días o menos; el resto no", () => {
    const a = avisosDelChequeo(
      checks({
        guia_repetida: ["GTF 019-001-0000771 (lunes 05/10) y GTF 019-001-0000771 (martes 06/10)"],
        plan_por_vencer: casoDelPlan("PO1", "2026-11-02").porVencer,
        preliminar_vieja: preliminar("19-000003", 10).porVencer,
        despacho_por_asentar: [despacho(7, "880"), despacho(8, "881"), despacho(3)],
        ficha_incompleta: ["PO1: Ficha al 80 %: falta el regente"],
        guia_sin_transporte: ["GTF 772 (lunes 05/10): falta la placa"],
      }),
    );
    expect(a.map((x) => [x.chequeo, x.quedan])).toEqual([
      ["guia_repetida", null],
      ["despacho_por_asentar", 3],
      ["preliminar_vieja", 5],
      ["despacho_por_asentar", 7],
    ]);
    expect(a[0].multa).toBe(true);
    expect(a[3].multa).toBe(false);
  });

  it("el plan por vencer a 7 días y nada más → no hay correo; el plan vencido sí va", () => {
    const soloPlan = checks({ plan_por_vencer: casoDelPlan("PO1", "2026-11-02").porVencer });
    expect(AVISA_OTRO_CRON.has("plan_por_vencer")).toBe(true);
    expect(avisosDelChequeo(soloPlan)).toEqual([]);
    const p = planearCorreoChequeo({ checks: soloPlan, sinLeer: [], registro: REGISTRO_VACIO, hoy: HOY });
    expect(p.nuevos).toEqual([]);
    expect(registroCambia(REGISTRO_VACIO, p.registroSiSale)).toBe(false);
    const vencido = avisosDelChequeo(checks({ plan_vencido: casoDelPlan("PO 7", "2026-10-20").vencido }));
    expect(vencido.map((x) => [x.chequeo, x.multa])).toEqual([["plan_vencido", true]]);
  });

  it("la clave no cambia con la cuenta regresiva, ni con los m³", () => {
    expect(claveDelCaso("preliminar_vieja", preliminar("19-000003", 10).porVencer[0])).toBe(
      claveDelCaso("preliminar_vieja", preliminar("19-000003", 12).porVencer[0]),
    );
    expect(claveDelCaso("despacho_por_asentar", despacho(3))).toBe(claveDelCaso("despacho_por_asentar", despacho(2)));
    expect(claveDelCaso("bloque_excedido", "Bloque 3 · Cumala (PO1): 12,0 de 10,0 m³, se pasa por 2,0 m³")).toBe(
      claveDelCaso("bloque_excedido", "Bloque 3 · Cumala (PO1): 13,0 de 10,0 m³, se pasa por 3,0 m³"),
    );
    // Sin cifras que cambien, el caso entero: dos guías sin placa son dos casos.
    expect(claveDelCaso("guia_sin_transporte", "GTF 1: falta la placa")).not.toBe(claveDelCaso("guia_sin_transporte", "GTF 2: falta la placa"));
  });
});

describe("planearCorreoChequeo — dedupe y caducidad", () => {
  const base = () => checks({ despacho_por_asentar: [despacho(3)], preliminar_vieja: preliminar("19-000003", 10).porVencer });

  it("la primera vez todo es nuevo; sellado, al día siguiente nada lo es", () => {
    const p1 = planearCorreoChequeo({ checks: base(), sinLeer: [], registro: REGISTRO_VACIO, hoy: HOY });
    expect(p1.nuevos).toHaveLength(2);
    expect(Object.values(p1.registroSiSale.avisados)).toEqual([HOY, HOY]);
    expect(p1.registroSiNoSale.avisados).toEqual({});

    const manana = checks({ despacho_por_asentar: [despacho(2)], preliminar_vieja: preliminar("19-000003", 11).porVencer });
    const p2 = planearCorreoChequeo({ checks: manana, sinLeer: [], registro: p1.registroSiSale, hoy: "2026-10-27" });
    expect(p2.avisos).toHaveLength(2);
    expect(p2.nuevos).toHaveLength(0);
    expect(registroCambia(p1.registroSiSale, p2.registroSiNoSale)).toBe(false);
  });

  it("la advertencia que se vuelve multa se avisa de nuevo (otro chequeo)", () => {
    const p1 = planearCorreoChequeo({ checks: base(), sinLeer: [], registro: REGISTRO_VACIO, hoy: HOY });
    const vencida = preliminar("19-000003", 16);
    const p2 = planearCorreoChequeo({
      checks: checks({ despacho_por_asentar: [despacho(3)], preliminar_vencida: vencida.vencidas, preliminar_vieja: [] }),
      sinLeer: [],
      registro: p1.registroSiSale,
      hoy: "2026-11-01",
    });
    expect(p2.nuevos.map((a) => a.chequeo)).toEqual(["preliminar_vencida"]);
    // La de «por vencer» desapareció de un chequeo leído: sale del registro.
    expect(Object.keys(p2.registroSiSale.avisados).some((k) => k.startsWith("preliminar_vieja|"))).toBe(false);
  });

  it("caduca: si desaparece y vuelve, se avisa otra vez", () => {
    const p1 = planearCorreoChequeo({ checks: base(), sinLeer: [], registro: REGISTRO_VACIO, hoy: HOY });
    const sinDespacho = checks({ despacho_por_asentar: [], preliminar_vieja: preliminar("19-000003", 10).porVencer });
    const p2 = planearCorreoChequeo({ checks: sinDespacho, sinLeer: [], registro: p1.registroSiSale, hoy: "2026-10-27" });
    expect(Object.keys(p2.registroSiNoSale.avisados)).toHaveLength(1);
    const p3 = planearCorreoChequeo({ checks: base(), sinLeer: [], registro: p2.registroSiNoSale, hoy: "2026-10-28" });
    expect(p3.nuevos.map((a) => a.chequeo)).toEqual(["despacho_por_asentar"]);
  });

  it("también caduca lo que sigue pero ya no aprieta (a más de 7 días)", () => {
    const p1 = planearCorreoChequeo({ checks: base(), sinLeer: [], registro: REGISTRO_VACIO, hoy: HOY });
    const holgado = checks({ despacho_por_asentar: [despacho(10)], preliminar_vieja: preliminar("19-000003", 10).porVencer });
    const p2 = planearCorreoChequeo({ checks: holgado, sinLeer: [], registro: p1.registroSiSale, hoy: HOY });
    expect(Object.keys(p2.registroSiNoSale.avisados).some((k) => k.startsWith("despacho_por_asentar|"))).toBe(false);
  });

  it("lo que avisa otro cron sale del registro aunque su chequeo no se haya leído", () => {
    const viejo: RegistroAvisados = { v: 1, avisados: { "plan_por_vencer|PO1": "2026-10-20", "guia_repetida|GTF 1": "2026-10-20" } };
    const p = planearCorreoChequeo({ checks: [], sinLeer: ["la vigencia de PO1"], registro: viejo, hoy: HOY });
    expect(p.registroSiNoSale.avisados).toEqual({ "guia_repetida|GTF 1": "2026-10-20" });
  });

  it("lo no leído no caduca: chequeo ausente, lista cortada o plan sin leer", () => {
    const p1 = planearCorreoChequeo({ checks: base(), sinLeer: [], registro: REGISTRO_VACIO, hoy: HOY });
    // 1) Ni el plan ni las preliminares se leyeron (los chequeos no vienen).
    expect(planearCorreoChequeo({ checks: [], sinLeer: ["las guías emitidas"], registro: p1.registroSiSale, hoy: HOY }).registroSiNoSale).toEqual(p1.registroSiSale);
    // 2) Vienen vacíos, pero un plan quedó sin leer: las preliminares se arman plan por plan
    //    (se quedan); los despachos son del libro entero (vacío = resuelto, caducan).
    const vacios = checks({ despacho_por_asentar: [], preliminar_vieja: [] });
    const p2 = planearCorreoChequeo({ checks: vacios, sinLeer: ["la vigencia y la ficha de PO 12"], registro: p1.registroSiSale, hoy: HOY });
    expect(Object.keys(p2.registroSiNoSale.avisados).map((k) => k.split("|")[0])).toEqual(["preliminar_vieja"]);
    // 3) Lista cortada al tope: el caso puede estar más allá.
    const cortado = vacios.map((c) => (c.key === "despacho_por_asentar" ? { ...c, count: 60, casos: [] } : c));
    const p3 = planearCorreoChequeo({ checks: cortado, sinLeer: [], registro: p1.registroSiSale, hoy: HOY });
    expect(Object.keys(p3.registroSiNoSale.avisados).some((k) => k.startsWith("despacho_por_asentar|"))).toBe(true);
  });

  it("el registro tiene tope y guarda los más recientes", () => {
    const avisados: Record<string, string> = {};
    for (let i = 0; i < TOPE_REGISTRO_AVISADOS + 20; i++) avisados[`guia_repetida|GTF ${i}`] = i < 20 ? "2026-01-01" : "2026-10-01";
    const p = planearCorreoChequeo({ checks: [], sinLeer: [], registro: { v: 1, avisados }, hoy: HOY });
    expect(Object.keys(p.registroSiNoSale.avisados)).toHaveLength(TOPE_REGISTRO_AVISADOS);
    expect(Object.values(p.registroSiNoSale.avisados)).not.toContain("2026-01-01");
  });

  it("leerRegistroAvisados descarta lo que no entiende", () => {
    expect(leerRegistroAvisados(null)).toEqual(REGISTRO_VACIO);
    expect(leerRegistroAvisados({ avisados: { "a|b": HOY, sinBarra: HOY, "c|d": 3, "e|f": "ayer" } })).toEqual({ v: 1, avisados: { "a|b": HOY } } satisfies RegistroAvisados);
  });
});

describe("el último día — un segundo aviso, nunca dos el mismo día", () => {
  /** La preliminar de la GTF 19-000003 con `quedan` días de plazo (15 corridos); vieja desde los 7 días para verla a 7 del plazo. */
  const conQuedan = (quedan: number) => checks({ preliminar_vieja: preliminar("19-000003", 15 - quedan, 7).porVencer });
  /** Un día del cron: planea y, si hay algo nuevo, lo «manda» y sella. */
  const dia = (registro: RegistroAvisados, quedan: number, hoy: string) => {
    const p = planearCorreoChequeo({ checks: conQuedan(quedan), sinLeer: [], registro, hoy });
    return { p, registro: p.nuevos.length > 0 ? p.registroSiSale : p.registroSiNoSale };
  };

  it("la preliminar que va de 7 a 3 y a 0 días = 2 avisos: a los 7 y el último día", () => {
    const d7 = dia(REGISTRO_VACIO, 7, "2026-10-19");
    const d3 = dia(d7.registro, 3, "2026-10-23");
    const d0 = dia(d3.registro, 0, "2026-10-26");
    expect([d7.p.nuevos.length, d3.p.nuevos.length, d0.p.nuevos.length]).toEqual([1, 0, 1]);
    expect(d7.p.nuevos[0]).toMatchObject({ quedan: 7, ultimoDia: false });
    expect(d0.p.nuevos[0]).toMatchObject({ quedan: 0, ultimoDia: true });
    expect(d0.p.nuevos[0].clave).toBe(`${d7.p.nuevos[0].clave}${SUFIJO_ULTIMO_DIA}`);
    // El asunto lo dice; la segunda corrida del mismo día no repite.
    expect(asuntoDelCorreo(d0.p.nuevos)).toBe("Hoy es el último día para pasar la GTF 19-000003 al libro");
    expect(dia(d0.registro, 0, "2026-10-26").p.nuevos).toHaveLength(0);
    // Lo de siempre conserva la fecha del primer aviso.
    expect(Object.values(d0.registro.avisados).sort()).toEqual(["2026-10-19", "2026-10-26"]);
  });

  it("el caso que aparece ya en su último día = 1 aviso (se sellan las dos claves)", () => {
    const d0 = dia(REGISTRO_VACIO, 0, HOY);
    expect(d0.p.nuevos).toHaveLength(1);
    expect(d0.p.nuevos[0].ultimoDia).toBe(true);
    expect(Object.keys(d0.registro.avisados)).toEqual([d0.p.nuevos[0].clave, d0.p.nuevos[0].claveBase]);
    expect(dia(d0.registro, 0, HOY).p.nuevos).toHaveLength(0);
  });

  it("el de 2 días que no salió (canal caído) no se suma al del último día: sale uno", () => {
    const d2 = dia(REGISTRO_VACIO, 2, "2026-10-24");
    expect(d2.p.nuevos).toHaveLength(1);
    const sinSellar = d2.p.registroSiNoSale;
    const d0 = planearCorreoChequeo({ checks: conQuedan(0), sinLeer: [], registro: sinSellar, hoy: HOY });
    expect(d0.nuevos.map((a) => a.ultimoDia)).toEqual([true]);
  });

  it("al vencer pasa a multa (otro chequeo) y las dos claves caducan", () => {
    const d0 = dia(REGISTRO_VACIO, 0, HOY);
    const vencida = preliminar("19-000003", 16);
    const p = planearCorreoChequeo({ checks: checks({ preliminar_vieja: [], preliminar_vencida: vencida.vencidas }), sinLeer: [], registro: d0.registro, hoy: "2026-10-27" });
    expect(p.nuevos.map((a) => a.chequeo)).toEqual(["preliminar_vencida"]);
    expect(Object.keys(p.registroSiSale.avisados).some((k) => k.startsWith("preliminar_vieja|"))).toBe(false);
  });

  it("lo que vence hoy va primero; el despacho lo dice a su modo; el cuerpo lo marca", () => {
    const cs = checks({
      despacho_sin_asentar: [despacho(-2, "700")],
      despacho_por_asentar: [despacho(0)],
      preliminar_vieja: preliminar("19-000003", 10).porVencer,
    });
    const a = avisosDelChequeo(cs);
    expect(a.map((x) => [x.chequeo, x.ultimoDia])).toEqual([
      ["despacho_por_asentar", true],
      ["despacho_sin_asentar", false],
      ["preliminar_vieja", false],
    ]);
    expect(asuntoDelCorreo(a)).toBe("Hoy es el último día para asentar el despacho de la GTF 771 en el libro (y 2 más que pueden multarte)");
    const { html } = armarCorreoChequeo({ negocio: "Blas", avisos: a, checks: cs, sinLeer: [], base: "https://buleje.pe" });
    expect(html).toContain("Último día:");
    expect(html).toContain("Hoy es el último día de plazo para una");
  });
});

describe("la campana y el WhatsApp", () => {
  const cs = checks({ preliminar_vieja: preliminar("19-000003", 10).porVencer });

  it("el WhatsApp es el asunto y el enlace al chequeo, en texto plano", () => {
    expect(mensajeWhatsAppChequeo(avisosDelChequeo(cs), "https://buleje.pe/")).toBe(
      `Libro TH: 1 cosa que puede multarte — GTF 19-000003 a 5 días del plazo. Ábrelo: https://buleje.pe${URL_CHEQUEO_TH}`,
    );
  });

  it("la campana: mismo id para el mismo aviso; grave si multa o vence hoy", () => {
    const a = avisosDelChequeo(cs);
    const c = campanaDelChequeo(a);
    expect(c).toMatchObject({ severidad: "MEDIUM", titulo: "Libro TH: 1 cosa que puede multarte — GTF 19-000003 a 5 días del plazo" });
    expect(c.cuerpo).toBe("GTF 19-000003 a 5 días del plazo. Corrígelo en el chequeo del Libro TH.");
    expect(campanaDelChequeo(avisosDelChequeo(cs)).entityId).toBe(c.entityId);
    const otro = avisosDelChequeo(checks({ preliminar_vieja: preliminar("19-000004", 10).porVencer }));
    expect(campanaDelChequeo(otro).entityId).not.toBe(c.entityId);
    expect(campanaDelChequeo(avisosDelChequeo(checks({ preliminar_vieja: preliminar("19-000003", 15).porVencer }))).severidad).toBe("HIGH");
    expect(campanaDelChequeo(avisosDelChequeo(checks({ despacho_sin_asentar: [despacho(-2)] }))).severidad).toBe("HIGH");
  });
});

describe("armarCorreoChequeo — asunto y cuerpo", () => {
  const cs = checks({
    plan_por_vencer: casoDelPlan("PO1", "2026-11-02").porVencer,
    despacho_por_asentar: [despacho(3)],
    preliminar_vieja: preliminar("19-000003", 10).porVencer,
    guia_sin_transporte: ["GTF 772 (lunes 05/10): falta la placa"],
  });
  const avisos = avisosDelChequeo(cs);

  it("el asunto dice cuántas y las más urgentes", () => {
    expect(asuntoDelCorreo(avisos)).toBe("Libro TH: 2 cosas que pueden multarte — despacho GTF 771 a 3 días del plazo y GTF 19-000003 a 5 días del plazo");
    expect(asuntoDelCorreo(avisos.slice(1))).toBe("Libro TH: 1 cosa que puede multarte — GTF 19-000003 a 5 días del plazo");
    const tres = avisosDelChequeo(checks({ despacho_sin_asentar: [despacho(-2)], preliminar_vencida: preliminar("19-000009", 17).vencidas, plan_vencido: casoDelPlan("PO 7", "2026-10-20").vencido }));
    expect(asuntoDelCorreo(tres)).toBe("Libro TH: 3 cosas que pueden multarte — PO 7 vencido, despacho GTF 771 fuera de plazo y 1 más");
    expect(asuntoDelCorreo([])).toBe("Libro TH: nada nuevo que pueda multarte");
    // Varios casos del mismo chequeo: uno con nombre y la cuenta; el caso largo, corto.
    const arboles = avisosDelChequeo(
      checks({
        talado_sin_censo: ["Árbol 977 (PO 12, tala #38 del lunes 05/10): no está en el censo", "Árbol 978 (PO 12, tala #40 del martes 06/10): no está en el censo"],
        papeles_vencidos: ["PO 12: Papel vencido: Resolución que aprueba el plan"],
      }),
    );
    expect(asuntoDelCorreo(arboles)).toBe("Libro TH: 3 cosas que pueden multarte — Árbol 977: no está en el censo, PO 12: Papel vencido: Resolución que aprueba el plan y 1 más");
    expect(asuntoDelCorreo(arboles.slice(0, 2))).toBe("Libro TH: 2 cosas que pueden multarte — Árbol 977: no está en el censo y 1 más");
  });

  it("el cuerpo trae el caso, la norma, qué hacer y el enlace absoluto; escapa el HTML", () => {
    const { html } = armarCorreoChequeo({ negocio: "Blas <S.A.>", avisos, checks: cs, sinLeer: [], base: "https://buleje.pe/" });
    expect(html).toContain("Blas &lt;S.A.&gt;");
    expect(html).toContain("te quedan 3 días");
    expect(html).toContain("te quedan 5 días");
    // El plan por vencer lo avisa su propio cron: ni el caso ni su título, y el pie lo dice.
    expect(html).not.toContain("Vence en 7 días");
    expect(html).toContain("El vencimiento de tus planes te llega en su propio aviso.");
    expect(html).toContain("RDE 264-2019");
    expect(html).toContain("Qué hacer:");
    expect(html).toContain(`href="https:&#x2F;&#x2F;buleje.pe${URL_CHEQUEO_TH.replace(/\//g, "&#x2F;").replace(/&(?!#)/g, "&amp;")}"`);
    // La advertencia sin plazo no entra al correo.
    expect(html).not.toContain("falta la placa");
    expect(html).not.toMatch(/todo (está )?en orden/i);
  });

  it("lo no leído se dice; sin nada nuevo tampoco afirma «en orden»", () => {
    const { html } = armarCorreoChequeo({ negocio: null, avisos: [], checks: [], sinLeer: ["los papeles de PO 12"], base: "https://buleje.pe" });
    expect(html).toContain("No pude revisar:");
    expect(html).toContain("los papeles de PO 12");
    expect(html).toContain("entre lo que pude revisar");
    expect(html).not.toMatch(/todo (está )?en orden/i);
  });
});
