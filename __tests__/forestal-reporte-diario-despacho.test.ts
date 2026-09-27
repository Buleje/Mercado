/**
 * Reportes diarios (ADR-439) — el despachador del cron y su idempotencia.
 *
 * La base se simula con un `updateMany` que se comporta como Postgres: sólo
 * cuenta 1 si TODA la condición del WHERE se cumple (compare-and-swap sobre
 * `ultimaFechaEnviada`). Dos disparos el mismo día → un solo envío; cada
 * intento queda en NotificationLog.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const estado = {
    filas: [] as Record<string, unknown>[],
    updates: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[],
    findManyArgs: [] as Record<string, unknown>[],
    logs: [] as { type: string; recipient: string; status: string; message: string; tenantId: string }[],
    /** Mensajes ya registrados hoy antes de la corrida (para el tope diario). */
    previosHoy: 0,
    correos: [] as string[],
    whatsapps: [] as string[],
    correoOk: false,
    whatsappOk: false,
    tenantsInactivos: new Set<string>(),
    sinModulo: new Set<string>(),
  };
  return { estado };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestReporteDiario: {
      findMany: async (args: Record<string, unknown>) => {
        H.estado.findManyArgs.push(args);
        return H.estado.filas;
      },
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        H.estado.updates.push(args);
        const f = H.estado.filas.find((x) =>
          Object.entries(args.where).every(([k, v]) => (v === null ? x[k] == null : x[k] === v)),
        );
        if (!f) return { count: 0 };
        Object.assign(f, args.data);
        return { count: 1 };
      },
    },
    tenant: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in.filter((id) => !H.estado.tenantsInactivos.has(id)).map((id) => ({ id })),
    },
    tenantFeatureFlag: {
      findMany: async (args: { where: { tenantId: { in: string[] } } }) =>
        args.where.tenantId.in.filter((id) => !H.estado.sinModulo.has(id)).map((tenantId) => ({ tenantId })),
    },
  },
}));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {} }));
vi.mock("@/lib/db/notifications.db", () => ({
  NotificationLogsDB: {
    add: async (d: { type: string; recipient: string; status: string; message: string }, tenantId: string) => {
      H.estado.logs.push({ ...d, tenantId });
      return d;
    },
    recientesPorPrefijo: async () => [],
    contarDesde: async (tenantId: string, prefijo: string) =>
      (prefijo === "reporte_diario:" ? H.estado.previosHoy : 0) +
      H.estado.logs.filter((l) => l.tenantId === tenantId && l.type.startsWith(prefijo)).length,
  },
}));
vi.mock("@/lib/db/forest-reporte-diario-datos.db", () => ({
  juntarDatosReporte: async (_t: string, o: { fecha: string; nombreReporte: string; panelUrl: string }) => ({
    negocio: "BLAS",
    nombreReporte: o.nombreReporte,
    fecha: o.fecha,
    rango: "hoy",
    desde: o.fecha,
    hasta: o.fecha,
    panelUrl: o.panelUrl,
    tala: { lineas: 0, taladoM3: 0, trozadoM3: 0 },
    fallidas: [],
  }),
}));
vi.mock("@/lib/email/resend", () => ({
  sendReporteDiario: async (to: string) => {
    H.estado.correos.push(to);
    return H.estado.correoOk ? { data: { id: "x" } } : { error: { message: "The buleje.pe domain is not verified." } };
  },
}));
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppText: async (to: string) => {
    H.estado.whatsapps.push(to);
    if (H.estado.whatsappOk) return true;
    throw new Error("WhatsApp API error: 401 Invalid OAuth access token");
  },
}));

import { despacharReportesDiarios, enviarReporteDiario, reservarEnvioManual } from "@/lib/forestal/reporte-diario-envio";
import { ForestReporteDiarioDB } from "@/lib/db/forest-reporte-diario.db";
import { TOPE_ENVIAR_AHORA_DIA, TOPE_INTENTOS_DIA, TOPE_MENSAJES_DIA } from "@/lib/forestal/reporte-diario";

const fila = (extra: Record<string, unknown> = {}) => ({
  id: "rep1",
  tenantId: "t-blas",
  nombre: "Cierre del día",
  activo: true,
  hora: "18:00",
  dias: [1, 2, 3, 4, 5, 6],
  porCorreo: true,
  porWhatsapp: true,
  correos: ["qa.demo.backend@ejemplo.pe"],
  telefonos: ["51900000000"],
  secciones: ["tala"],
  rango: "hoy",
  ultimaFechaEnviada: null,
  creadoPor: "qa",
  createdAt: new Date("2026-09-20T00:00:00Z"),
  updatedAt: new Date("2026-09-20T00:00:00Z"),
  ...extra,
});

const a18 = new Date("2026-09-26T18:20:00-05:00");
const a21 = new Date("2026-09-26T21:05:00-05:00");

beforeEach(() => {
  Object.assign(H.estado, {
    filas: [],
    updates: [],
    findManyArgs: [],
    logs: [],
    previosHoy: 0,
    correos: [],
    whatsapps: [],
    correoOk: false,
    whatsappOk: false,
    tenantsInactivos: new Set(),
    sinModulo: new Set(),
  });
});

describe("despacharReportesDiarios — idempotencia", () => {
  it("dos disparos el mismo día con un canal que SALIÓ → UN solo envío (reclamo con tenantId y el valor leído)", async () => {
    H.estado.correoOk = true;
    H.estado.filas = [fila()];
    const r1 = await despacharReportesDiarios(a18);
    const r2 = await despacharReportesDiarios(a21);
    expect(r1).toMatchObject({ revisados: 1, tocaban: 1, enviados: 1, enviosOk: 1, enviosFallidos: 1, reintentos: 0 });
    expect(r2).toMatchObject({ tocaban: 0, enviados: 0 });
    expect(H.estado.correos).toEqual(["qa.demo.backend@ejemplo.pe"]);
    expect(H.estado.updates[0].where).toEqual({ id: "rep1", tenantId: "t-blas", activo: true, ultimaFechaEnviada: null });
    expect(H.estado.filas[0].ultimaFechaEnviada).toBe("2026-09-26");
  });

  it("dos disparos SIMULTÁNEOS: el reclamo atómico deja pasar a uno solo", async () => {
    H.estado.correoOk = true;
    H.estado.filas = [fila()];
    const [a, b] = await Promise.all([despacharReportesDiarios(a18), despacharReportesDiarios(new Date("2026-09-26T18:20:01-05:00"))]);
    expect(a.enviados + b.enviados).toBe(1);
    expect(a.yaReclamados + b.yaReclamados).toBe(1);
    expect(H.estado.correos).toHaveLength(1);
  });

  it("antes de la hora no manda; un día que no es suyo tampoco", async () => {
    H.estado.filas = [fila()];
    expect((await despacharReportesDiarios(new Date("2026-09-26T17:40:00-05:00"))).enviados).toBe(0);
    expect((await despacharReportesDiarios(new Date("2026-09-27T19:00:00-05:00"))).enviados).toBe(0); // domingo
    expect(H.estado.updates).toHaveLength(0);
  });

  it("cada intento queda en NotificationLog con el error crudo, por canal y destinatario", async () => {
    H.estado.filas = [fila()];
    await despacharReportesDiarios(a18);
    expect(H.estado.logs).toEqual([
      expect.objectContaining({ type: "reporte_diario:rep1:email", recipient: "qa.demo.backend@ejemplo.pe", status: "failed", tenantId: "t-blas", message: expect.stringContaining("not verified") }),
      expect.objectContaining({ type: "reporte_diario:rep1:whatsapp", recipient: "51900000000", status: "failed", tenantId: "t-blas", message: expect.stringContaining("401") }),
    ]);
  });

  it("un canal apagado no se usa aunque tenga destinatarios", async () => {
    H.estado.filas = [fila({ porWhatsapp: false })];
    await despacharReportesDiarios(a18);
    expect(H.estado.whatsapps).toHaveLength(0);
    expect(H.estado.correos).toHaveLength(1);
  });

  it("orden determinista: por hora, alta e id", async () => {
    await despacharReportesDiarios(a18);
    expect(H.estado.findManyArgs[0]).toMatchObject({ orderBy: [{ hora: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
  });
});

describe("si fallaron TODOS los canales, se reintenta en el próximo disparo del día (con tope)", () => {
  it("todo falla → libera el día con la marca del intento; el disparo siguiente lo vuelve a mandar", async () => {
    H.estado.filas = [fila()];
    const r1 = await despacharReportesDiarios(a18);
    expect(r1.reintentos).toBe(1);
    expect(H.estado.filas[0].ultimaFechaEnviada).toBe("2026-09-26#1");
    const r2 = await despacharReportesDiarios(a21);
    expect(r2.enviados).toBe(1);
    expect(H.estado.correos).toHaveLength(2);
  });

  it(`a los ${TOPE_INTENTOS_DIA} intentos fallidos el día se cierra`, async () => {
    H.estado.filas = [fila()];
    for (let i = 0; i < TOPE_INTENTOS_DIA + 2; i++) await despacharReportesDiarios(new Date(a18.getTime() + i * 30 * 60_000));
    expect(H.estado.correos).toHaveLength(TOPE_INTENTOS_DIA);
    expect(H.estado.filas[0].ultimaFechaEnviada).toBe("2026-09-26");
  });

  it("hora exacta (tics cada 30 min): uno de las 18:30 sale en el tic de las 18:30, una vez; caído, 3 intentos y cierra", async () => {
    // pg_cron `*/30` llega ~2 s después de cada tic: 18:00, 18:30, 19:00 … 20:30 de Lima.
    const tics = Array.from({ length: 6 }, (_, i) => new Date(Date.parse("2026-09-26T18:00:02-05:00") + i * 30 * 60_000));
    H.estado.correoOk = true;
    H.estado.filas = [fila({ hora: "18:30" })];
    const enviadosOk = [];
    for (const t of tics) enviadosOk.push((await despacharReportesDiarios(t)).enviados);
    expect(enviadosOk).toEqual([0, 1, 0, 0, 0, 0]);

    // Con los dos canales caídos: 18:30, 19:00 y 19:30; después, el día queda cerrado.
    H.estado.correoOk = false;
    H.estado.correos = [];
    H.estado.filas = [fila({ id: "rep2", hora: "18:30" })];
    const intentos = [];
    for (const t of tics) intentos.push((await despacharReportesDiarios(t)).enviados);
    expect(intentos).toEqual([0, 1, 1, 1, 0, 0]);
    expect(H.estado.correos).toHaveLength(TOPE_INTENTOS_DIA);
    expect(H.estado.filas[0].ultimaFechaEnviada).toBe("2026-09-26");
  });

  it("al día siguiente, la marca de reintento de ayer no le impide salir", async () => {
    H.estado.correoOk = true;
    H.estado.filas = [fila({ ultimaFechaEnviada: "2026-09-25#2" })];
    expect((await despacharReportesDiarios(a18)).enviados).toBe(1);
    expect(H.estado.filas[0].ultimaFechaEnviada).toBe("2026-09-26");
  });
});

describe("topes contra el relé de mensajes", () => {
  it(`tope diario por negocio: con ${TOPE_MENSAJES_DIA} mensajes hoy no manda nada y deja constancia`, async () => {
    H.estado.previosHoy = TOPE_MENSAJES_DIA - 1; // 1 libre, el reporte necesita 2
    H.estado.filas = [fila()];
    const r = await despacharReportesDiarios(a18);
    expect(H.estado.correos).toHaveLength(0);
    expect(H.estado.whatsapps).toHaveLength(0);
    expect(r).toMatchObject({ enviados: 0, topeDiario: 1 });
    expect(H.estado.logs.at(-1)).toMatchObject({ status: "failed", message: expect.stringMatching(/Tope diario/) });
    // No se reintenta: el tope es del día.
    expect(H.estado.filas[0].ultimaFechaEnviada).toBe("2026-09-26");
  });

  it("«Enviar ahora» también respeta el tope diario (tira, la ruta lo vuelve 429)", async () => {
    H.estado.previosHoy = TOPE_MENSAJES_DIA;
    const rep = { ...fila(), createdAt: "", updatedAt: "" } as unknown as Parameters<typeof enviarReporteDiario>[1];
    await expect(enviarReporteDiario("t-blas", rep, { ahora: a18, motivo: "manual", usuario: "qa" })).rejects.toThrow(/Tope diario/);
    expect(H.estado.correos).toHaveLength(0);
  });

  it(`«Enviar ahora»: ${TOPE_ENVIAR_AHORA_DIA} por día y por reporte`, async () => {
    const res: boolean[] = [];
    for (let i = 0; i < TOPE_ENVIAR_AHORA_DIA + 1; i++) res.push(await reservarEnvioManual("t-blas", "rep1", a18, "qa"));
    expect(res.filter(Boolean)).toHaveLength(TOPE_ENVIAR_AHORA_DIA);
    expect(res.at(-1)).toBe(false);
    // Otro reporte tiene su propia cuenta.
    expect(await reservarEnvioManual("t-blas", "rep2", a18, "qa")).toBe(true);
  });
});

describe("a quién se despacha", () => {
  it("un negocio inactivo o sin el módulo CTP no recibe su reporte", async () => {
    H.estado.correoOk = true;
    H.estado.filas = [fila({ id: "r-a", tenantId: "t-a" }), fila({ id: "r-b", tenantId: "t-b" }), fila({ id: "r-c", tenantId: "t-c" })];
    H.estado.tenantsInactivos.add("t-b");
    H.estado.sinModulo.add("t-c");
    const lista = await ForestReporteDiarioDB.paraDespachar();
    expect(lista.map((r) => r.tenantId)).toEqual(["t-a"]);
  });

  it("presupuesto de tiempo: corta antes del tope y NO reclama los que no alcanzó", async () => {
    H.estado.correoOk = true;
    H.estado.filas = [fila({ id: "r1" }), fila({ id: "r2" }), fila({ id: "r3" })];
    let t = 0;
    // Cada lectura del reloj avanza 100 s: el segundo reporte ya no entra en 250 s.
    const r = await despacharReportesDiarios(a18, { presupuestoMs: 250_000, reloj: () => (t += 100_000) });
    expect(r.cortadoPorTiempo).toBe(true);
    expect(r.enviados).toBeLessThan(3);
    const sinTocar = H.estado.filas.filter((f) => f.ultimaFechaEnviada == null).map((f) => f.id);
    expect(sinTocar.length).toBe(3 - r.enviados);
  });
});
