/**
 * Cron `loth-chequeo-correo`: el aviso del chequeo del Libro TH sale por la
 * campana, el WhatsApp y el correo del negocio, como `loth-plan-vencimiento`, y
 * un caso se sella sólo si llegó por algún lado. Todo mockeado: ningún envío
 * real. El chequeo es el de verdad armado con `armarChequeos` (sin base).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LothCheck } from "@/lib/forestal/loth-compliance";

const H = vi.hoisted(() => ({
  checks: [] as LothCheck[],
  hoy: "2026-10-26",
  notificaciones: [] as Record<string, unknown>[],
  whatsapps: [] as { tenantId: string; telefono: string; texto: string; contexto?: string }[],
  correos: [] as { to: string; asunto: string; html: string }[],
  correosReg: [] as { ok: boolean; detalle: string }[],
  logs: [] as { type: string; status: string; message: string }[],
  registro: null as unknown,
  tenant: null as Record<string, unknown> | null,
  waOk: true,
  /** El negocio no tiene WhatsApp configurado (`via: null`). */
  waNoConfig: false,
  correoActivo: true,
  correoFalla: false,
  /** Campanas vivas por `entityId` (cuándo se crearon): emula el dedup de `createOrReuse`. */
  campanas: {} as Record<string, number>,
}));

vi.mock("@/lib/cron-auth", () => ({ withCronAuth: (_n: string, h: (req: Request) => Promise<Response>) => h }));
vi.mock("@/lib/db/forest-loth.db", () => ({ ForestLothDB: { tenantsConLibroTh: async () => ["cuid-blas"] } }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/forestal/loth-chequeo-server", () => ({
  chequeoAvanzado: async () => ({ checks: H.checks, sinLeer: [], planes: 1, hoy: H.hoy }),
}));
vi.mock("@/lib/db/forest-loth-chequeo.db", async () => {
  const { leerRegistroAvisados } = await import("@/lib/forestal/loth-chequeo-correo");
  return {
    ForestLothChequeoDB: {
      avisadosPorCorreo: async () => leerRegistroAvisados(H.registro),
      guardarAvisadosPorCorreo: async (_t: string, cambio: (a: unknown) => unknown) => {
        const v = cambio(leerRegistroAvisados(H.registro));
        if (v) H.registro = v;
        return v != null;
      },
    },
  };
});
vi.mock("@/lib/db/tenants.db", () => ({ TenantsDB: { contactoDelDueno: async () => H.tenant } }));
vi.mock("@/lib/db/notification-center.db", () => ({
  NotificationCenterDB: {
    createOrReuse: async (d: Record<string, unknown>) => {
      // Sin leer y dentro de la ventana → se reusa, como la de verdad.
      const k = String(d.entityId);
      const antes = H.campanas[k];
      if (antes != null && Date.now() - antes < Number(d.dedupWindowHours ?? 0) * 3_600_000) {
        return { id: `n-${k}`, created: false, refreshed: false };
      }
      H.campanas[k] = Date.now();
      H.notificaciones.push(d);
      return { id: `n${H.notificaciones.length}`, created: true, refreshed: false };
    },
  },
}));
vi.mock("@/lib/db/notifications.db", () => ({
  NotificationLogsDB: {
    add: async (d: { type: string; status: string; message: string }) => {
      H.logs.push(d);
    },
  },
}));
vi.mock("@/lib/whatsapp-tenant", () => ({
  viaDelWhatsAppDelNegocio: async () => (H.waNoConfig ? null : "negocio"),
  enviarWhatsAppDelNegocio: async (tenantId: string, telefono: string, texto: string, o: { contexto?: string }) => {
    H.whatsapps.push({ tenantId, telefono, texto, contexto: o?.contexto });
    if (H.waNoConfig) {
      return { ok: false, via: null, modo: "texto", plantilla: null, wamid: null, puedeNoLlegar: false, error: "WhatsApp no configurado", nota: null };
    }
    return H.waOk
      ? { ok: true, via: "negocio", modo: "texto", plantilla: null, wamid: "wamid.1", puedeNoLlegar: false }
      : { ok: false, via: "negocio", modo: "texto", plantilla: null, wamid: null, puedeNoLlegar: false, error: "401 token vencido" };
  },
}));
vi.mock("@/lib/email/resend", () => ({
  sendReporteDiario: async (to: string, asunto: string, html: string) => {
    H.correos.push({ to, asunto, html });
    return H.correoFalla ? { error: { message: "Resend caído" } } : { data: { id: "c1" } };
  },
}));
vi.mock("@/lib/avisos-correo", () => ({
  avisoCorreoActivo: async () => H.correoActivo,
  registrarEnvioCorreo: async (_t: string, _tipo: string, _d: string, ok: boolean, detalle: string) => {
    H.correosReg.push({ ok, detalle });
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } }));

import { GET } from "@/app/api/cron/loth-chequeo-correo/route";
import { armarChequeos } from "@/lib/forestal/loth-chequeo-catalogo";
import { preliminaresViejas } from "@/lib/forestal/loth-chequeo-guias";
import { AJUSTES_CHEQUEO_DEFECTO } from "@/lib/forestal/loth-chequeo-tipos";
import { URL_CHEQUEO_TH } from "@/lib/forestal/loth-chequeo-correo";

type Resp = Record<string, unknown> & { ensayo: Record<string, unknown>[] };
const correr = async (q = "") => (await GET(new Request(`http://localhost/api/cron/loth-chequeo-correo${q}`) as never)).json() as Promise<Resp>;

/** La preliminar de la GTF 19-000003 con `quedan` días de plazo (15 corridos). */
function conQuedan(quedan: number): LothCheck[] {
  const d = new Date(`${H.hoy}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - (15 - quedan));
  const p = preliminaresViejas([{ numeroGtf: "19-000003", fecha: d.toISOString().slice(0, 10), anotadaEl: H.hoy, plan: "PO1" }], H.hoy, 10);
  return armarChequeos({ preliminar_vieja: p.porVencer }, AJUSTES_CHEQUEO_DEFECTO);
}

const avisados = () => Object.keys((H.registro as { avisados?: Record<string, string> } | null)?.avisados ?? {});

beforeEach(() => {
  H.checks = conQuedan(5);
  H.notificaciones = [];
  H.whatsapps = [];
  H.correos = [];
  H.correosReg = [];
  H.logs = [];
  H.registro = null;
  H.waOk = true;
  H.waNoConfig = false;
  H.correoActivo = true;
  H.correoFalla = false;
  H.campanas = {};
  H.tenant = { id: "cuid-blas", name: "Blas", ownerPhone: "+51 987 654 675", ownerEmail: "dueno@ejemplo.pe" };
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
});

describe("cron loth-chequeo-correo — canales", () => {
  it("avisa por los tres canales y sella; la segunda corrida no repite", async () => {
    const r = await correr();
    expect(r).toMatchObject({ conAviso: 1, campanas: 1, whatsappEnviados: 1, correosEnviados: 1, sellados: 1 });
    expect(H.notificaciones).toEqual([
      expect.objectContaining({
        tenantId: "cuid-blas",
        type: "LOTH_PLAZO_SERFOR",
        severity: "MEDIUM",
        title: "Libro TH: 1 cosa que puede multarte — GTF 19-000003 a 5 días del plazo",
        actionUrl: URL_CHEQUEO_TH,
        actionLabel: "Abrir el chequeo",
      }),
    ]);
    expect(H.whatsapps).toEqual([
      expect.objectContaining({ tenantId: "cuid-blas", telefono: "51987654675", contexto: "loth_chequeo", texto: expect.stringMatching(/^Libro TH: 1 cosa que puede multarte — GTF 19-000003 a 5 días del plazo\. Ábrelo: https?:\/\/.+tab=loth-libro-operaciones/) }),
    ]);
    expect(H.logs).toEqual([expect.objectContaining({ type: "loth_chequeo_whatsapp", status: "sent" })]);
    expect(H.correos).toHaveLength(1);
    expect(avisados()).toHaveLength(1);

    const r2 = await correr();
    expect(r2).toMatchObject({ sinNovedad: 1, campanas: 0, whatsappEnviados: 0, correosEnviados: 0 });
  });

  it("la campana sale aunque el negocio no tenga correo, y el WhatsApp que llega sella", async () => {
    H.tenant = { id: "cuid-blas", name: "Blas", ownerPhone: "+51 987 654 675", ownerEmail: null };
    const r = await correr();
    expect(r).toMatchObject({ campanas: 1, whatsappEnviados: 1, sinCorreo: 1, correosEnviados: 0, sellados: 1 });
    expect(H.correos).toEqual([]);
    expect(avisados()).toHaveLength(1);
  });

  it("sin correo ni celular: sólo la campana, queda dicho en el registro y se sella (no hay canal vivo)", async () => {
    H.tenant = { id: "cuid-blas", name: "Blas", ownerPhone: null, ownerEmail: null };
    const r = await correr();
    expect(r).toMatchObject({ campanas: 1, whatsappEnviados: 0, correosEnviados: 0, sinCanal: 1, sellados: 1 });
    expect(H.logs).toEqual([expect.objectContaining({ status: "failed", message: expect.stringContaining("quedó en la campana") })]);
    expect((await correr()).campanas).toBe(0);
  });

  it("el interruptor «forestal» apaga sólo el correo: el WhatsApp sale y sella", async () => {
    H.correoActivo = false;
    const r = await correr();
    expect(r).toMatchObject({ campanas: 1, whatsappEnviados: 1, correosOmitidos: 1, correosEnviados: 0, sellados: 1 });
    expect(H.correos).toEqual([]);
  });

  it("si los canales vivos fallan no se sella nada; mañana se reintenta y la campana se reusa", async () => {
    H.waOk = false;
    H.correoFalla = true;
    const r = await correr();
    expect(r).toMatchObject({ campanas: 1, whatsappFallidos: 1, correosFallidos: 1, sellados: 0 });
    expect(avisados()).toEqual([]);
    expect(H.logs).toEqual([expect.objectContaining({ status: "failed", message: expect.stringContaining("401 token vencido") })]);

    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    H.waOk = true;
    const r2 = await correr();
    expect(r2).toMatchObject({ campanas: 0, whatsappEnviados: 1, sellados: 1 });
    expect(H.notificaciones).toHaveLength(1);
    expect(avisados()).toHaveLength(1);
  });

  it("WhatsApp sin configurar + correo apagado = ningún canal vivo: la campana sella", async () => {
    H.waNoConfig = true;
    H.correoActivo = false;
    const r = await correr();
    expect(r).toMatchObject({ whatsappSinConfigurar: 1, correosOmitidos: 1, sinCanal: 1, sellados: 1 });
    expect(H.logs.at(-1)?.message).toContain("el WhatsApp del negocio no está configurado; los avisos por correo están apagados");
  });

  it("el último día sale otra vez, por los tres canales y con su asunto", async () => {
    await correr();
    H.checks = conQuedan(0);
    H.whatsapps = [];
    const r = await correr();
    expect(r).toMatchObject({ campanas: 1, whatsappEnviados: 1, correosEnviados: 1, sellados: 1 });
    expect(H.correos.at(-1)?.asunto).toBe("Hoy es el último día para pasar la GTF 19-000003 al libro");
    expect(H.whatsapps[0]?.texto).toMatch(/^Hoy es el último día para pasar la GTF 19-000003 al libro\. Ábrelo: /);
    expect(H.notificaciones.at(-1)).toMatchObject({ severity: "HIGH" });
    expect((await correr()).sinNovedad).toBe(1);
  });
});

describe("cron loth-chequeo-correo — ?probar=1", () => {
  it("no manda nada ni sella, y dice qué saldría por cada canal", async () => {
    const r = await correr("?probar=1");
    expect(H.notificaciones).toEqual([]);
    expect(H.whatsapps).toEqual([]);
    expect(H.correos).toEqual([]);
    expect(H.logs).toEqual([]);
    expect(H.registro).toBeNull();
    const e = r.ensayo[0];
    expect(e).toMatchObject({
      tenantId: "cuid-blas",
      nuevos: 1,
      motivo: null,
      campana: { titulo: "Libro TH: 1 cosa que puede multarte — GTF 19-000003 a 5 días del plazo", boton: "Abrir el chequeo" },
      whatsapp: { sale: true, destino: "+51 9•• ••• 675", via: "negocio", motivo: null },
      correo: { sale: true, destino: "d•••@ejemplo.pe", motivo: null },
    });
  });

  it("sin correo: dice que el correo no sale pero la campana y el WhatsApp sí", async () => {
    H.tenant = { id: "cuid-blas", name: "Blas", ownerPhone: "+51 987 654 675", ownerEmail: null };
    const e = (await correr("?probar=1")).ensayo[0];
    expect(e).toMatchObject({ whatsapp: { sale: true }, correo: { sale: false, motivo: "falta el correo del negocio" } });
    expect(e.campana).not.toBeNull();
  });
});
