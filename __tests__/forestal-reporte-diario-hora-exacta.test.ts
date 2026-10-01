/**
 * Reportes diarios (ADR-439) — el disparador de la HORA EXACTA: un job externo
 * (Supabase pg_cron + pg_net) llama al cron a las :00 y :30 de cada hora.
 *
 * 1. Con tics cada 30 min, cada hora del editor sale UNA vez por día y en su
 *    tic exacto, también el de las 21:00 (02:00 UTC del día siguiente).
 * 2. La pantalla promete la hora exacta sólo si el disparador está vivo (su
 *    latido tiene < 65 min); si no, la ventana de Vercel. Antes de esto el
 *    editor decía «18:30 · llega 21:00–21:59» con el disparador andando.
 * 3. Sólo la ruta `/hora-exacta` deja latido; los `/HHMM` de vercel.json y una
 *    llamada a mano a la raíz, no.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ latidos: [] as string[], despachos: 0, latidoFalla: false }));

vi.mock("@/lib/forestal/reporte-diario-envio", () => ({
  despacharReportesDiarios: async () => {
    H.despachos += 1;
    return { revisados: 0, tocaban: 0, enviados: 0 };
  },
}));
vi.mock("@/lib/db/forest-reporte-diario.db", () => ({
  ForestReporteDiarioDB: {
    marcarLatidoHoraExacta: async (ahora: Date) => {
      if (H.latidoFalla) throw new Error("db caída");
      H.latidos.push(ahora.toISOString());
    },
  },
}));

import { cronReportesDiarios } from "@/lib/forestal/reporte-diario-cron";
import {
  HORAS_DEL_EDITOR,
  VIGENCIA_LATIDO_MIN,
  cuandoSale,
  esDisparoHoraExacta,
  horaExactaViva,
  leTocaAhora,
  relojLima,
} from "@/lib/forestal/reporte-diario";

const TIC_MS = 30 * 60_000;
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Corre los tics de pg_cron (`*\/30 * * * *`, en UTC) llegando `retrasoMs` tarde, y anota cuándo salió. */
function simular(hora: string, desdeUtc: string, dias: number, retrasoMs: number): string[] {
  const r = { activo: true, hora, dias: [0, 1, 2, 3, 4, 5, 6], ultimaFechaEnviada: null as string | null };
  const salidas: string[] = [];
  const t0 = Date.parse(desdeUtc);
  for (let t = t0; t < t0 + dias * 24 * 60 * 60_000; t += TIC_MS) {
    const l = relojLima(new Date(t + retrasoMs));
    if (leTocaAhora(r, l)) {
      r.ultimaFechaEnviada = l.fecha; // el reclamo del despachador
      salidas.push(`${l.fecha} ${hhmm(l.minutos)}`);
    }
  }
  return salidas;
}

describe("tics cada 30 min: cada hora del editor sale una vez por día, en su tic", () => {
  it.each(HORAS_DEL_EDITOR.map((h) => [h]))("%s", (hora) => {
    // 3 días desde la medianoche de Lima del sábado 26 (05:00 UTC); pg_net llega ~2 s después del tic.
    expect(simular(hora, "2026-09-26T05:00:00Z", 3, 2_000)).toEqual([
      `2026-09-26 ${hora}`,
      `2026-09-27 ${hora}`,
      `2026-09-28 ${hora}`,
    ]);
  });

  it("el de las 21:00 cae a las 02:00 UTC del día siguiente y se cuenta en el día de Lima", () => {
    expect(simular("21:00", "2026-09-26T05:00:00Z", 2, 2_000)).toEqual(["2026-09-26 21:00", "2026-09-27 21:00"]);
    // El tic de las 02:00 UTC del 27 es el sábado 26 en Lima, no el domingo 27.
    expect(relojLima(new Date("2026-09-27T02:00:02Z"))).toMatchObject({ fecha: "2026-09-26", diaSemana: 6 });
  });

  it("si el disparador arranca tarde, lo de HOY sale en el primer tic; lo de ayer no se arrastra", () => {
    // Arranca a las 19:00 Lima del 26: el de las 18:30 de hoy sale a las 19:00, y el 27 a su hora.
    expect(simular("18:30", "2026-09-27T00:00:00Z", 1.5, 2_000)).toEqual(["2026-09-26 19:00", "2026-09-27 18:30"]);
    // Arranca a las 00:00 del 27: el de las 18:30 del 26 ya no sale.
    expect(simular("18:30", "2026-09-27T05:00:00Z", 1, 2_000)).toEqual(["2026-09-27 18:30"]);
  });
});

describe("horaExactaViva — el latido del disparador", () => {
  const ahora = new Date("2026-09-26T18:31:00-05:00");
  it("sin latido o ilegible: no se promete la hora exacta", () => {
    expect(horaExactaViva(null, ahora)).toBe(false);
    expect(horaExactaViva(undefined, ahora)).toBe(false);
    expect(horaExactaViva("ayer", ahora)).toBe(false);
  });
  it("un tic perdido no apaga la promesa; dos seguidos, sí", () => {
    const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString();
    expect(horaExactaViva(hace(1), ahora)).toBe(true);
    expect(horaExactaViva(hace(61), ahora)).toBe(true); // se perdió el tic de las 18:00
    expect(horaExactaViva(hace(VIGENCIA_LATIDO_MIN), ahora)).toBe(false);
    expect(horaExactaViva(hace(91), ahora)).toBe(false);
  });
  it("un latido apenas «del futuro» (relojes de dos servidores) cuenta; uno muy adelantado, no", () => {
    expect(horaExactaViva(new Date(ahora.getTime() + 30_000).toISOString(), ahora)).toBe(true);
    expect(horaExactaViva(new Date(ahora.getTime() + 60 * 60_000).toISOString(), ahora)).toBe(false);
  });
});

describe("cuandoSale — lo que promete el editor", () => {
  it("con el disparador vivo promete la hora; sin él, la ventana de Vercel", () => {
    expect(cuandoSale("18:30", true)).toBe("Llega a las 18:30.");
    expect(cuandoSale("18:30")).toBe("Llega a más tardar entre las 21:00 y las 21:59.");
    // Después del último disparo no sale con ninguno de los dos.
    expect(cuandoSale("22:00", true)).toMatch(/no hay envío automático/);
  });
});

describe("el cron: sólo /hora-exacta deja latido", () => {
  beforeEach(() => {
    H.latidos = [];
    H.despachos = 0;
    H.latidoFalla = false;
    vi.stubEnv("CRON_SECRET", "secreto-de-prueba");
  });
  const pedir = (ruta: string, token = "secreto-de-prueba") =>
    cronReportesDiarios(new NextRequest(`https://ejemplo.pe${ruta}`, { headers: { authorization: `Bearer ${token}` } }));

  it("esDisparoHoraExacta reconoce la etiqueta y nada más", () => {
    expect(esDisparoHoraExacta("/api/cron/reportes-diarios/hora-exacta")).toBe(true);
    expect(esDisparoHoraExacta("/api/cron/reportes-diarios/hora-exacta/")).toBe(true);
    expect(esDisparoHoraExacta("/api/cron/reportes-diarios")).toBe(false);
    expect(esDisparoHoraExacta("/api/cron/reportes-diarios/1800")).toBe(false);
  });

  it("/hora-exacta: latido + despacho", async () => {
    const r = await pedir("/api/cron/reportes-diarios/hora-exacta");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, disparo: "hora-exacta" });
    expect(H.latidos).toHaveLength(1);
    expect(H.despachos).toBe(1);
  });

  it("los disparos de vercel.json y la raíz despachan sin latido", async () => {
    await pedir("/api/cron/reportes-diarios/1800");
    await pedir("/api/cron/reportes-diarios");
    expect(H.despachos).toBe(2);
    expect(H.latidos).toHaveLength(0);
  });

  it("sin el secreto: 401, ni latido ni despacho", async () => {
    const r = await pedir("/api/cron/reportes-diarios/hora-exacta", "otro");
    expect(r.status).toBe(401);
    expect(H.latidos).toHaveLength(0);
    expect(H.despachos).toBe(0);
  });

  it("si el latido no se puede guardar, igual despacha", async () => {
    H.latidoFalla = true;
    const r = await pedir("/api/cron/reportes-diarios/hora-exacta");
    expect(r.status).toBe(200);
    expect(H.despachos).toBe(1);
  });
});
