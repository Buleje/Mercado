/**
 * Cron `loth-plan-vencimiento`: el aviso antes de que venza el plan sale UNA
 * vez por escalón, por la campana, el WhatsApp y el correo del negocio. Todo
 * mockeado: ningún envío real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  notificaciones: [] as Record<string, unknown>[],
  whatsapps: [] as { tenantId: string; telefono: string; texto: string; contexto?: string }[],
  correos: [] as { to: string; asunto: string; html: string }[],
  correosReg: [] as { ok: boolean; detalle: string }[],
  logs: [] as { type: string; status: string; message: string }[],
  kv: {} as Record<string, unknown>,
  planes: [] as Record<string, unknown>[],
  tenant: { id: "cuid-blas", name: "Blas", ownerPhone: "+51 987 654 675", ownerEmail: "dueno@ejemplo.pe" } as Record<string, unknown> | null,
  waOk: true,
  /** El negocio no tiene WhatsApp configurado (`via: null`). */
  waNoConfig: false,
  correoActivo: true,
  /** Campanas vivas por `entityId` (cuándo se crearon): emula el dedup de `createOrReuse`. */
  campanas: {} as Record<string, number>,
}));

vi.mock("@/lib/cron-auth", () => ({ withCronAuth: (_n: string, h: (req: Request) => Promise<Response>) => h }));
vi.mock("@/lib/db/forest-loth.db", () => ({ ForestLothDB: { tenantsConLibroTh: async () => ["blas-slug"] } }));
vi.mock("@/lib/db/forest-plan.db", () => ({ ForestPlanDB: { listPlans: async () => H.planes } }));
vi.mock("@/lib/db/tenants.db", () => ({ TenantsDB: { contactoDelDueno: async () => H.tenant } }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    getFresco: async (k: string) => H.kv[k] ?? null,
    actualizar: async (k: string, cambio: (a: unknown) => { valor?: unknown; resultado: unknown }) => {
      const r = cambio(H.kv[k] ?? null);
      if (r.valor !== undefined) H.kv[k] = r.valor;
      return r.resultado;
    },
  },
}));
vi.mock("@/lib/db/notification-center.db", () => ({
  NotificationCenterDB: {
    createOrReuse: async (d: Record<string, unknown>) => {
      // Sin leer y dentro de la ventana → se reusa, como la de verdad.
      const k = String(d.entityId);
      const antes = H.campanas[k];
      if (antes != null && Date.now() - antes < Number(d.dedupWindowHours ?? 0) * 3_600_000) {
        return { id: `n-${k}`, created: false, refreshed: true };
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
    return { data: { id: "c1" } };
  },
}));
vi.mock("@/lib/avisos-correo", () => ({
  avisoCorreoActivo: async () => H.correoActivo,
  registrarEnvioCorreo: async (_t: string, _tipo: string, _d: string, ok: boolean, detalle: string) => {
    H.correosReg.push({ ok, detalle });
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } }));

import { GET } from "@/app/api/cron/loth-plan-vencimiento/route";

type Resp = Record<string, number | boolean | unknown[]>;
const correr = async (q = "") => (await GET(new Request(`http://localhost/api/cron/loth-plan-vencimiento${q}`) as never)).json() as Promise<Resp>;

const plan = (p: Record<string, unknown>) => ({
  isActive: true,
  alias: null,
  planType: "PO",
  estado: "vigente",
  vigenciaDesde: new Date("2026-01-14T00:00:00Z"),
  ...p,
});

beforeEach(() => {
  H.notificaciones = [];
  H.whatsapps = [];
  H.correos = [];
  H.correosReg = [];
  H.logs = [];
  H.kv = {};
  H.waOk = true;
  H.waNoConfig = false;
  H.correoActivo = true;
  H.campanas = {};
  H.tenant = { id: "cuid-blas", name: "Blas", ownerPhone: "+51 987 654 675", ownerEmail: "dueno@ejemplo.pe" };
  // Fechas como Date: así las devuelve Prisma; la ruta las pasa por JSON igual que la API.
  H.planes = [
    plan({ id: "po12", planNumber: "12", vigenciaHasta: new Date("2026-11-23T00:00:00Z") }),
    plan({ id: "lejos", planNumber: "13", vigenciaHasta: new Date("2027-08-01T00:00:00Z") }),
  ];
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T13:22:00Z"));
});

describe("cron loth-plan-vencimiento", () => {
  it("avisa el de 30 días por los tres canales y lo sella; la segunda corrida no repite", async () => {
    const r = await correr();
    expect(r).toMatchObject({ revisados: 1, conAviso: 1, avisos: 1, whatsappEnviados: 1, correosEnviados: 1, sellados: 1 });
    expect(H.notificaciones).toEqual([
      expect.objectContaining({
        tenantId: "blas-slug",
        type: "LOTH_PLAZO_SERFOR",
        entityId: "loth-plan-vigencia-po12-30",
        actionUrl: "/admin?tab=loth-libro-operaciones&vista=plan",
      }),
    ]);
    expect(H.whatsapps).toHaveLength(1);
    expect(H.whatsapps[0]).toMatchObject({ tenantId: "cuid-blas", telefono: "51987654675", contexto: "loth_plan_vencimiento" });
    expect(H.whatsapps[0]?.texto).toContain("PO 12 vence en 30 días (lunes 23/11/2026)");
    expect(H.correos[0]).toMatchObject({ to: "dueno@ejemplo.pe", asunto: "Plan PO 12 vence en 30 días (lunes 23/11/2026)" });
    expect(H.kv["loth-plan-aviso-vigencia:blas-slug"]).toEqual({ po12: { hasta: "2026-11-23", enviados: [90, 30] } });

    const otra = await correr();
    vi.useRealTimers();
    expect(otra).toMatchObject({ conAviso: 0, avisos: 0 });
    expect(H.whatsapps).toHaveLength(1);
  });

  it("?ensayo=1 dice lo que mandaría sin mandar ni sellar", async () => {
    const r = await correr("?ensayo=1");
    vi.useRealTimers();
    expect(r.ensayo).toBe(true);
    expect(r.plan).toEqual([expect.objectContaining({ planId: "po12", umbral: "30" })]);
    expect(H.notificaciones).toEqual([]);
    expect(H.whatsapps).toEqual([]);
    expect(H.correos).toEqual([]);
    expect(H.kv).toEqual({});
  });

  it("si el WhatsApp FALLA (token vencido) y el correo está apagado, no se sella: mañana reintenta, sin otra campana", async () => {
    H.waOk = false;
    H.correoActivo = false;
    const r = await correr();
    expect(r).toMatchObject({ whatsappFallidos: 1, correosOmitidos: 1, sellados: 0, notificaciones: 1 });
    expect(H.logs).toEqual([expect.objectContaining({ type: "loth_plan_vencimiento_whatsapp", status: "failed" })]);
    expect(H.kv).toEqual({});

    // Al día siguiente: el WhatsApp se reintenta, la campana del escalón se reusa.
    vi.setSystemTime(new Date("2026-10-25T13:22:00Z"));
    const manana = await correr();
    vi.useRealTimers();
    expect(manana).toMatchObject({ avisos: 1, whatsappFallidos: 1, notificaciones: 0, sellados: 0 });
    expect(H.whatsapps).toHaveLength(2);
    expect(H.notificaciones).toHaveLength(1);
  });

  it("M1: WhatsApp NO configurado y correo apagado = sin canal: se sella con la campana y no se repite", async () => {
    H.waNoConfig = true;
    H.correoActivo = false;
    const r = await correr();
    expect(r).toMatchObject({ whatsappSinConfigurar: 1, whatsappFallidos: 0, correosOmitidos: 1, sinCanal: 1, notificaciones: 1 });
    expect(Number(r.sellados)).toBeGreaterThan(0);
    expect(H.logs.at(-1)?.message).toMatch(/^Sin canal para avisar \(el WhatsApp del negocio no está configurado; los avisos por correo están apagados\)/);

    vi.setSystemTime(new Date("2026-10-25T13:22:00Z"));
    const otra = await correr();
    vi.useRealTimers();
    expect(otra).toMatchObject({ avisos: 0, notificaciones: 0, sinCanal: 0 });
    expect(H.notificaciones).toHaveLength(1);
    expect(H.whatsapps).toHaveLength(1);
  });

  it("M3: un plan DECLARADO vencido con fecha futura no manda escalón", async () => {
    H.planes = [plan({ id: "po12", planNumber: "12", estado: "vencido", vigenciaHasta: new Date("2026-11-23T00:00:00Z") })];
    const r = await correr();
    vi.useRealTimers();
    expect(r).toMatchObject({ conAviso: 0, avisos: 0 });
    expect(H.notificaciones).toEqual([]);
    expect(H.whatsapps).toEqual([]);
  });

  it("sin teléfono ni correo: queda en la campana, se registra y se sella (no hay otro canal)", async () => {
    H.tenant = { id: "cuid-blas", name: "Blas", ownerPhone: null, ownerEmail: null };
    const r = await correr();
    vi.useRealTimers();
    expect(r).toMatchObject({ sinCanal: 1, sellados: 1, notificaciones: 1 });
    expect(H.whatsapps).toEqual([]);
    expect(H.logs[0]?.message).toMatch(/no tiene WhatsApp ni correo/);
  });

  it("plan cerrado, dado de baja o vencido: nada", async () => {
    H.planes = [
      plan({ id: "c", estado: "cerrado", vigenciaHasta: new Date("2026-11-01T00:00:00Z") }),
      plan({ id: "b", isActive: false, vigenciaHasta: new Date("2026-11-01T00:00:00Z") }),
      plan({ id: "v", vigenciaHasta: new Date("2026-10-01T00:00:00Z") }),
    ];
    const r = await correr();
    vi.useRealTimers();
    expect(r).toMatchObject({ conAviso: 0 });
    expect(H.notificaciones).toEqual([]);
  });
});
