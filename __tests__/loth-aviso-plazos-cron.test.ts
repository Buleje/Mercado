/**
 * Cron `forestal-plazos` → el aviso del Libro TH sale por el MISMO canal que el
 * del CTP: campana del panel (una notificación por bloque, cada una con su
 * clic) y WhatsApp del negocio, buscado con el cuid aunque la fila traiga el slug.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  notificaciones: [] as Record<string, unknown>[],
  whatsapps: [] as { tenantId: string; telefono: string; texto: string; contexto?: string }[],
  logs: [] as { type: string; status: string }[],
  datos: null as unknown,
  tenants: ["blas-slug"] as string[],
}));

vi.mock("@/lib/cron-auth", () => ({ withCronAuth: (_n: string, h: () => Promise<Response>) => h }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestGtf: { findMany: async () => [] },
    forestCtpEntry: { findMany: async () => [] },
    tenant: { findFirst: async () => ({ id: "cuid-blas", ownerPhone: "+51 987 654 675", ownerEmail: null, name: "Blas" }) },
  },
}));
vi.mock("@/lib/db/forest-gtf.db", () => ({ ForestGtfDB: {} }));
vi.mock("@/lib/db/forest-ctp.db", () => ({ ForestCtpDB: {} }));
vi.mock("@/lib/db/forest-ctp-ficha.db", () => ({ ForestCtpFichaDB: {} }));
vi.mock("@/lib/db/forest-lote-aserrio.db", () => ({ ForestLoteAserrioDB: {} }));
vi.mock("@/lib/email/resend", () => ({ sendAvisoPlazosCtp: async () => ({}) }));
vi.mock("@/lib/db/forest-loth.db", () => ({
  ForestLothDB: {
    tenantsConLibroTh: async () => H.tenants,
    datosAvisoPlazos: async () => H.datos,
  },
}));
vi.mock("@/lib/db/notification-center.db", () => ({
  NotificationCenterDB: {
    createOrReuse: async (d: Record<string, unknown>) => {
      H.notificaciones.push(d);
      return { id: `n${H.notificaciones.length}`, created: true };
    },
  },
}));
vi.mock("@/lib/db/notifications.db", () => ({
  NotificationLogsDB: {
    add: async (d: { type: string; status: string }) => {
      H.logs.push(d);
    },
  },
}));
vi.mock("@/lib/whatsapp-tenant", () => ({
  enviarWhatsAppDelNegocio: async (tenantId: string, telefono: string, texto: string, o: { contexto?: string }) => {
    H.whatsapps.push({ tenantId, telefono, texto, contexto: o?.contexto });
    return { ok: true, via: "negocio", modo: "texto", plantilla: null, wamid: "wamid.1", puedeNoLlegar: false };
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } }));

import { GET } from "@/app/api/cron/forestal-plazos/route";

const correr = async () => (await GET({} as never)).json() as Promise<{ libroTh: Record<string, number> }>;

beforeEach(() => {
  H.notificaciones = [];
  H.whatsapps = [];
  H.logs = [];
  H.tenants = ["blas-slug"];
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T15:00:00Z"));
  H.datos = {
    lineas: [
      {
        id: "l1", section: "despacho_troza", lineNo: 1, entryDate: "2026-09-01T00:00:00.000Z", trozaCode: "113-1",
        gtfNumber: "001-0045678", status: "registrado", createdAt: "2026-09-02T00:00:00.000Z",
      },
    ],
    gtfs: [],
    planes: [{ id: "cmuamvvnu0000", isActive: true, alias: null, planType: "PO", planNumber: "PO-01", estado: "vigente" }],
  };
});

describe("cron forestal-plazos — Libro TH", () => {
  it("una notificación por bloque, cada una con su propio clic, y un WhatsApp por el número del negocio", async () => {
    const r = await correr();
    vi.useRealTimers();

    expect(H.notificaciones.map((x) => [x.type, x.entityId, x.actionUrl, x.actionLabel])).toEqual([
      ["LOTH_PLAZO_SERFOR", "loth-planes", "/admin?tab=loth-libro-operaciones&vista=plan", "Abrir el plan"],
      ["LOTH_PLAZO_SERFOR", "loth-guias", "/admin?tab=loth-libro-operaciones&vista=gtf", "Registrar la guía"],
    ]);
    expect(H.notificaciones.every((x) => x.tenantId === "blas-slug" && x.dedupWindowHours === 20)).toBe(true);

    expect(H.whatsapps).toHaveLength(1);
    expect(H.whatsapps[0]).toMatchObject({ tenantId: "cuid-blas", telefono: "51987654675", contexto: "loth_plazos" });
    expect(H.whatsapps[0].texto).toContain("GTF 001-0045678");
    expect(H.logs).toEqual([expect.objectContaining({ type: "loth_plazos_whatsapp", status: "sent" })]);
    expect(r.libroTh).toMatchObject({ revisados: 1, conAviso: 1, notificaciones: 2, whatsappEnviados: 1 });
  });

  it("libro al día: ni campana ni WhatsApp", async () => {
    H.datos = { lineas: [], gtfs: [], planes: [] };
    const r = await correr();
    vi.useRealTimers();
    expect(H.notificaciones).toEqual([]);
    expect(H.whatsapps).toEqual([]);
    expect(r.libroTh).toMatchObject({ revisados: 1, conAviso: 0 });
  });
});
