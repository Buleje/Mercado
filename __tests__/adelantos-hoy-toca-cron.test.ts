/**
 * Cron `adelantos-hoy-toca`: el aviso de los lunes al dueño sale UNA vez por
 * semana y negocio, cada negocio con lo suyo. Todo mockeado: ningún envío real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  notificaciones: [] as Record<string, unknown>[],
  whatsapps: [] as { tenantId: string; telefono: string; texto: string }[],
  correos: [] as { to: string; asunto: string; html: string }[],
  kv: {} as Record<string, unknown>,
  conAbiertos: ["t-blas", "t-main", "t-inactivo"],
  activos: ["t-blas", "t-main"],
  hoyToca: {} as Record<string, { tareas: { tipo: string; titulo: string; detalle: string; href: string; boton: string; cantidad: number }[] }>,
  falla: null as string | null,
  waNoConfig: false,
}));

vi.mock("@/lib/cron-auth", () => ({ withCronAuth: (_n: string, h: (req: Request) => Promise<Response>) => h }));
vi.mock("@/lib/db/adelantos-hoy-toca.db", () => ({
  AdelantosHoyTocaDB: {
    tenantsConAbiertos: async () => H.conAbiertos,
    tareas: async (tenantId: string) => {
      if (tenantId === H.falla) throw new Error("timeout");
      return H.hoyToca[tenantId]?.tareas ?? [];
    },
  },
}));
vi.mock("@/lib/db/tenants.db", () => ({
  TenantsDB: {
    listActiveIds: async () => H.activos,
    contactoDelDueno: async (id: string) => ({ id, name: id === "t-blas" ? "Blas" : "Bodega", ownerPhone: "+51 987 654 675", ownerEmail: `${id}@ejemplo.pe` }),
  },
}));
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
      H.notificaciones.push(d);
      return { id: "n1", created: true, refreshed: false };
    },
  },
}));
vi.mock("@/lib/db/notifications.db", () => ({ NotificationLogsDB: { add: async () => {} } }));
vi.mock("@/lib/whatsapp-tenant", () => ({
  enviarWhatsAppDelNegocio: async (tenantId: string, telefono: string, texto: string) => {
    H.whatsapps.push({ tenantId, telefono, texto });
    return H.waNoConfig
      ? { ok: false, via: null, modo: "texto", plantilla: null, wamid: null, puedeNoLlegar: false, error: "no configurado" }
      : { ok: true, via: "negocio", modo: "texto", plantilla: null, wamid: "w1", puedeNoLlegar: false };
  },
}));
vi.mock("@/lib/email/resend", () => ({
  sendReporteDiario: async (to: string, asunto: string, html: string) => {
    H.correos.push({ to, asunto, html });
    return { data: { id: "c1" } };
  },
}));
vi.mock("@/lib/avisos-correo", () => ({ avisoCorreoActivo: async () => true, registrarEnvioCorreo: async () => {} }));
vi.mock("@/lib/logger", () => ({ logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } }));

import { GET } from "@/app/api/cron/adelantos-hoy-toca/route";

type Resp = Record<string, unknown> & { plan: { tenantId: string; texto: string }[] };
const correr = async (q = "") => (await GET(new Request(`http://localhost/api/cron/adelantos-hoy-toca${q}`) as never)).json() as Promise<Resp>;

const cobrar = (nombre: string, monto: string) => ({
  tipo: "cobrar",
  titulo: `Cobrar a ${nombre}`,
  detalle: `${monto} sin moverse hace 83 días`,
  href: "/admin?tab=plata&vista=adelantos&sub=lista&adelanto=a1",
  boton: "Cobrar",
  cantidad: 1,
});

beforeEach(() => {
  H.notificaciones = [];
  H.whatsapps = [];
  H.correos = [];
  H.kv = {};
  H.falla = null;
  H.waNoConfig = false;
  H.conAbiertos = ["t-blas", "t-main", "t-inactivo"];
  H.hoyToca = {
    "t-blas": { tareas: [cobrar("Quispe", "S/ 17,000.00")] },
    "t-main": { tareas: [cobrar("Ana", "S/ 300.00")] },
    "t-inactivo": { tareas: [cobrar("Nadie", "S/ 1.00")] },
  };
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-26T12:00:00Z")); // lunes 07:00 de Lima
});

describe("cron adelantos-hoy-toca", () => {
  it("?ensayo=1 dice qué mandaría y no manda ni sella nada", async () => {
    const r = await correr("?ensayo=1");
    expect(r.semana).toBe("2026-10-26");
    expect(r.plan.map((p) => p.tenantId)).toEqual(["t-blas", "t-main"]);
    expect(r.plan[0].texto).toContain("Cobrar a Quispe: S/ 17,000.00 sin moverse hace 83 días");
    expect(r.plan[0].texto).toContain("https://buleje.pe/admin?tab=plata&vista=adelantos&sub=lista&adelanto=a1");
    expect(H.whatsapps).toEqual([]);
    expect(H.correos).toEqual([]);
    expect(H.notificaciones).toEqual([]);
    expect(H.kv).toEqual({});
  });

  it("cada negocio recibe SÓLO lo suyo; el inactivo no recibe nada", async () => {
    await correr();
    expect(H.whatsapps.map((w) => w.tenantId)).toEqual(["t-blas", "t-main"]);
    const deBlas = H.whatsapps.find((w) => w.tenantId === "t-blas")?.texto ?? "";
    expect(deBlas).toContain("Quispe");
    expect(deBlas).not.toContain("Ana");
    expect(H.correos.map((c) => c.to)).toEqual(["t-blas@ejemplo.pe", "t-main@ejemplo.pe"]);
    expect(H.notificaciones.map((n) => n.tenantId)).toEqual(["t-blas", "t-main"]);
  });

  it("la campana lleva sólo cantidades: los nombres y montos van por WhatsApp y correo", async () => {
    await correr();
    const n = H.notificaciones[0];
    expect(n).toMatchObject({ type: "ADELANTOS_SEMANA", entityId: "adelantos-hoy-toca-2026-10-26", actionUrl: "/admin?tab=plata&vista=adelantos&sub=resumen" });
    expect(String(n.title)).toBe("Adelantos, esta semana toca: cobrar a 1 persona");
    expect(JSON.stringify(n)).not.toMatch(/Quispe|17,000/);
  });

  it("una vez por semana: la segunda corrida del mismo lunes no repite", async () => {
    await correr();
    expect(H.kv["adelantos-hoy-toca:t-blas"]).toEqual({ semana: "2026-10-26" });
    H.whatsapps = [];
    const r = await correr();
    expect(H.whatsapps).toEqual([]);
    expect(r.yaAvisados).toBe(2);
    // El lunes siguiente, de nuevo.
    vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
    await correr();
    expect(H.whatsapps).toHaveLength(2);
  });

  it("sin tareas no se avisa nada", async () => {
    H.hoyToca["t-main"] = { tareas: [] };
    await correr();
    expect(H.whatsapps.map((w) => w.tenantId)).toEqual(["t-blas"]);
  });

  it("un negocio que falla no deja sin aviso a los demás", async () => {
    H.falla = "t-blas";
    await correr();
    expect(H.whatsapps.map((w) => w.tenantId)).toEqual(["t-main"]);
    expect(H.kv["adelantos-hoy-toca:t-blas"]).toBeUndefined();
  });
});
