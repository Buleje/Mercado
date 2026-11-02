import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  pendiente: null as any,
  quitados: [] as string[],
  ejecutado: [] as any[],
  hechos: [] as any[],
  resultado: { success: true, data: {} } as any,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/agents", () => ({
  ensureAgentsRegistered: async () => {},
  orchestrator: { executeSync: async (a: any) => (H.ejecutado.push(a), H.resultado) },
}));
vi.mock("@/lib/agents/pending-approvals", () => ({
  getPendingApproval: () => H.pendiente,
  removePendingApproval: (id: string) => (H.quitados.push(id), H.pendiente),
}));
vi.mock("@/lib/asistente/memoria", () => ({ anotarHecho: (...a: any[]) => H.hechos.push(a) }));
vi.mock("@/lib/db/ia-conversaciones.db", () => ({}));

import { resolverAprobacion, papelesDeDatos } from "@/lib/asistente/confirmar-app";

const args = { tenantId: "T1", username: "ana", role: "admin", conversacionId: "c1", aprobacionId: "a1" };
const pend = (tenantId: string) => ({ id: "a1", tenantId, domain: "plata", action: "registrar_gasto", payload: { monto: 200 }, toolName: "registrar_gasto", requestedBy: "ana" });

beforeEach(() => {
  H.quitados.length = H.ejecutado.length = H.hechos.length = 0;
  H.resultado = { success: true, data: {} };
});

describe("resolverAprobacion", () => {
  it("pendiente de OTRO negocio = 403 y no se ejecuta ni se borra", async () => {
    H.pendiente = pend("T2");
    const r = await resolverAprobacion({ ...args, decision: "aprobar" });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(H.ejecutado).toHaveLength(0);
    expect(H.quitados).toHaveLength(0);
  });
  it("pendiente inexistente = 404", async () => {
    H.pendiente = null;
    expect(await resolverAprobacion({ ...args, decision: "aprobar" })).toMatchObject({ ok: false, status: 404 });
  });
  it("rechazar quita el pendiente sin ejecutar", async () => {
    H.pendiente = pend("T1");
    const r = await resolverAprobacion({ ...args, decision: "rechazar" });
    expect(r).toMatchObject({ ok: true });
    expect(H.quitados).toEqual(["a1"]);
    expect(H.ejecutado).toHaveLength(0);
  });
  it("aprobar ejecuta con el tenant y el rol de la sesión, anota el hecho y trae papeles", async () => {
    H.pendiente = pend("T1");
    H.resultado = {
      success: true,
      data: {
        confirmacion: "Gasto S/ 200 anotado",
        dondeVerlo: { pantalla: "Gastos" },
        papel: { tipo: "comprobante", titulo: "Recibo", url: "/api/x" },
      },
    };
    const r = await resolverAprobacion({ ...args, decision: "aprobar" });
    expect(H.ejecutado[0]).toMatchObject({ tenantId: "T1", actorRole: "admin", actorId: "ana" });
    expect(H.hechos[0]).toEqual(["app:c1", "T1", "Gasto S/ 200 anotado"]);
    expect(r).toMatchObject({ ok: true, texto: "✅ Gasto S/ 200 anotado" });
    if (r.ok) {
      expect(r.extra?.registradas?.[0]).toEqual({ resumen: "Gasto S/ 200 anotado", pantalla: "Gastos" });
      expect(r.extra?.papeles).toHaveLength(1);
    }
  });
  it("si la herramienta falla, lo dice", async () => {
    H.pendiente = pend("T1");
    H.resultado = { success: false, error: "sin saldo" };
    const r = await resolverAprobacion({ ...args, decision: "aprobar" });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.texto).toContain("sin saldo");
  });
});

describe("papelesDeDatos", () => {
  it("junta papel y papeles, ignora basura", () => {
    const p = { tipo: "reporte", titulo: "R", url: "/u" };
    expect(papelesDeDatos({ papel: p, papeles: [p, { x: 1 }] })).toHaveLength(2);
    expect(papelesDeDatos({})).toEqual([]);
  });
});
