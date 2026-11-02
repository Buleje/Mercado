import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => {
  const calls: Array<{ op: string; args: any }> = [];
  const rec = (op: string, ret: unknown) => (args: any) => {
    calls.push({ op, args });
    return Promise.resolve(typeof ret === "function" ? (ret as any)(args) : ret);
  };
  const tx: any = {
    aIMessage: { create: rec("msg.create", (a: any) => ({ id: "m" + calls.length, role: a.data.role, content: a.data.content, extra: a.data.extra ?? null, createdAt: a.data.createdAt })) },
    aIConversation: { updateMany: rec("conv.updateMany", { count: 1 }) },
  };
  const prisma: any = {
    aIConversation: {
      findMany: rec("conv.findMany", []),
      findFirst: rec("conv.findFirst", null),
      count: rec("conv.count", 0),
      create: rec("conv.create", { id: "c1" }),
      updateMany: rec("conv.updateMany", { count: 1 }),
      deleteMany: rec("conv.deleteMany", { count: 0 }),
    },
    aIMessage: { findMany: rec("msg.findMany", []), updateMany: rec("msg.updateMany", { count: 1 }) },
    $transaction: (fn: any) => fn(tx),
  };
  return { calls, prisma };
});
vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("server-only", () => ({}));

import { IaConversacionesDB, mensajeAppDesdeFila, tituloDesdeTexto } from "@/lib/db/ia-conversaciones.db";

beforeEach(() => {
  H.calls.length = 0;
});

describe("IaConversacionesDB: aislamiento por negocio y por usuario", () => {
  it("listar filtra por tenant, usuario y canal app", async () => {
    await IaConversacionesDB.listar("T1", "ana");
    expect(H.calls[0].args.where).toEqual({ tenantId: "T1", user: "ana", channel: "app" });
  });

  it("obtener / renombrar / borrar llevan tenant+user+id en el WHERE", async () => {
    await IaConversacionesDB.obtener("T1", "ana", "c9");
    await IaConversacionesDB.renombrar("T1", "ana", "c9", "x");
    await IaConversacionesDB.borrar("T1", "ana", "c9");
    for (const c of H.calls) expect(c.args.where).toEqual({ id: "c9", tenantId: "T1", user: "ana", channel: "app" });
  });

  it("borrar/renombrar de una conversación ajena devuelve false", async () => {
    H.prisma.aIConversation.updateMany = async () => ({ count: 0 });
    expect(await IaConversacionesDB.renombrar("T2", "ana", "c9", "x")).toBe(false);
    expect(await IaConversacionesDB.borrar("T2", "ana", "c9")).toBe(false);
  });

  it("agregarMensajes sobre una conversación ajena no escribe nada", async () => {
    H.prisma.aIConversation.count = async () => 0;
    const r = await IaConversacionesDB.agregarMensajes("T1", "otro", "c9", [{ role: "user", content: "hola" }]);
    expect(r).toBeNull();
    expect(H.calls.some((c) => c.op === "msg.create")).toBe(false);
  });

  it("agregarMensajes propia: guarda extra y toca updatedAt con el doble filtro", async () => {
    H.prisma.aIConversation.count = async () => 1;
    const r = await IaConversacionesDB.agregarMensajes("T1", "ana", "c9", [
      { role: "user", content: "tanqueé", extra: { adjuntos: [{ documentoId: "d1", nombre: "f.jpg" }] } },
      { role: "assistant", content: "ok" },
    ]);
    expect(r).toHaveLength(2);
    expect(r![0].adjuntos?.[0].url).toBe("/api/admin/documents/d1/raw");
    const upd = H.calls.find((c) => c.op === "conv.updateMany")!;
    expect(upd.args.where).toEqual({ id: "c9", tenantId: "T1", user: "ana", channel: "app" });
  });
});

describe("mensajeAppDesdeFila", () => {
  const base = { id: "m1", role: "assistant", content: "hola", createdAt: new Date("2026-11-01T10:00:00Z") };
  it("extra nulo o basura no rompe", () => {
    expect(mensajeAppDesdeFila({ ...base, extra: null })).toEqual({ id: "m1", rol: "assistant", texto: "hola", creadoEl: "2026-11-01T10:00:00.000Z" });
    expect(mensajeAppDesdeFila({ ...base, extra: "x" }).pendientes).toBeUndefined();
    expect(mensajeAppDesdeFila({ ...base, extra: { adjuntos: [{ nombre: "sin id" }] } }).adjuntos).toBeUndefined();
  });
  it("arma pendientes, papeles, registradas y modelo", () => {
    const m = mensajeAppDesdeFila({
      ...base,
      role: "user",
      extra: {
        pendientes: [{ id: "a1", resumen: "Gasto S/ 200", tool: "registrar_gasto" }],
        papeles: [{ tipo: "cotizacion", titulo: "Cot 1", url: "/api/x" }],
        registradas: [{ resumen: "ok", pantalla: "Gastos" }],
        modelo: { proveedor: "anthropic", modelo: "claude", deLaPlataforma: false },
      },
    });
    expect(m.rol).toBe("user");
    expect(m.pendientes?.[0].id).toBe("a1");
    expect(m.papeles).toHaveLength(1);
    expect(m.registradas?.[0].pantalla).toBe("Gastos");
    expect(m.modelo?.proveedor).toBe("anthropic");
  });
});

describe("tituloDesdeTexto", () => {
  it("corta en palabra y pone puntos", () => {
    const t = tituloDesdeTexto("anótame que tanqueé 12 galones de petróleo para mi camión blanco N12 y me costó 200");
    expect(t.length).toBeLessThanOrEqual(49);
    expect(t.endsWith("…")).toBe(true);
    expect(tituloDesdeTexto("   ")).toBe("Conversación nueva");
  });
});
