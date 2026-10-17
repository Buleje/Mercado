/**
 * Campos personalizados × Documentos del plan (ADR-467): el tipo `archivo`, el
 * tipo `carpeta` y los permisos por PREFIJO.
 *
 * Tres huecos que existían antes de ADR-467 y que la sección habría heredado:
 *  1. un tipo desconocido se leía como «texto» → un casillero `archivo` se
 *     pintaba como caja de texto y lo tipeado se guardaba como si fuera el papel;
 *  2. un formulario sin entrada en el mapa de roles quedaba ABIERTO a todo rol
 *     → las carpetas del plan (`forestal.plan.documentos.<clave>`) no están una
 *     por una en el mapa;
 *  3. la ruta genérica aceptaba cualquier tipo del enum en cualquier formulario.
 *
 * La base está simulada con una tabla en memoria que APLICA el WHERE.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => {
  type Fila = Record<string, unknown>;
  const campos: Fila[] = [];
  const upserts: Fila[] = [];
  let seq = 0;
  function coincide(fila: Fila, where: Record<string, unknown>): boolean {
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (k === "OR") {
        if (!(v as Fila[]).some((r) => coincide(fila, r))) return false;
        continue;
      }
      if (v === null) {
        if (fila[k] != null) return false;
        continue;
      }
      if (typeof v === "object" && v !== null && "in" in (v as Fila)) {
        if (!(v as { in: unknown[] }).in.includes(fila[k])) return false;
        continue;
      }
      if (fila[k] !== v) return false;
    }
    return true;
  }
  const filtrar = (where: Record<string, unknown>) => campos.filter((f) => coincide(f, where));
  return { campos, upserts, filtrar, nuevoId: () => `id-${++seq}`, auth: null as unknown };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    campoPersonalizado: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => H.filtrar(where),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => H.filtrar(where)[0] ?? null,
      count: async ({ where }: { where: Record<string, unknown> }) => H.filtrar(where).length,
      aggregate: async () => ({ _max: { orden: null } }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const fila = { id: H.nuevoId(), deletedAt: null, activo: true, ...data };
        H.campos.push(fila);
        return fila;
      },
    },
    campoPersonalizadoValor: {
      upsert: (args: Record<string, unknown>) => {
        H.upserts.push(args);
        return Promise.resolve(args);
      },
      deleteMany: () => Promise.resolve({ count: 0 }),
    },
    forestPlan: { count: async ({ where }: { where: { id: string } }) => (where.id === "plan-1" ? 1 : 0) },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));
vi.mock("@/lib/cache", () => ({
  getOrSet: async (_k: string, _t: number, fn: () => Promise<unknown>) => fn(),
  invalidateByPrefix: () => {},
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: async () => {} }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => H.auth }));

import {
  motivoTipoFueraDeLugar,
  nombreDelFormulario,
  puedeEscribirFormulario,
  puedeLeerFormulario,
} from "@/lib/campos-personalizados";
import { CamposPersonalizadosDB } from "@/lib/db/campos-personalizados.db";
import { POST } from "@/app/api/admin/campos-personalizados/route";

const T = "t1";
const JEFE = "forestal.plan.documentos.jefe";

function fila(p: Partial<Record<string, unknown>> & { id: string; formulario: string; tipo: string; clave: string }) {
  return {
    tenantId: T,
    nombre: p.clave,
    descripcion: null,
    opciones: [],
    soloParaRegistroId: null,
    orden: 1,
    activo: true,
    deletedAt: null,
    createdBy: "qa",
    ...p,
  };
}

beforeEach(() => {
  H.campos.length = 0;
  H.upserts.length = 0;
  H.auth = { tenantId: T, username: "qa-admin", role: "admin" };
  H.campos.push(
    fila({ id: "carpeta-jefe", formulario: "forestal.plan.documentos", tipo: "carpeta", clave: "jefe" }),
    fila({ id: "dni", formulario: JEFE, tipo: "archivo", clave: "dni-del-jefe" }),
    fila({ id: "cargo", formulario: JEFE, tipo: "texto", clave: "cargo", orden: 2 }),
    fila({ id: "raro", formulario: JEFE, tipo: "firma_digital", clave: "raro", orden: 3 }),
    fila({ id: "color", formulario: "forestal.ingreso", tipo: "texto", clave: "color" }),
  );
});

const pedir = (body: unknown) =>
  new NextRequest("http://localhost/api/admin/campos-personalizados", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("dónde va cada tipo", () => {
  it("`archivo` sólo dentro de una carpeta del plan; `carpeta` nunca como campo", () => {
    expect(motivoTipoFueraDeLugar("archivo", JEFE)).toBeNull();
    expect(motivoTipoFueraDeLugar("archivo", "forestal.ingreso")).toMatch(/carpeta/);
    expect(motivoTipoFueraDeLugar("carpeta", "forestal.plan.documentos")).toMatch(/Documentos del plan/);
    expect(motivoTipoFueraDeLugar("texto", "forestal.plan.documentos")).toMatch(/lista de carpetas/);
    expect(motivoTipoFueraDeLugar("texto", JEFE)).toBeNull();
  });

  it("el nombre de una carpeta del plan se lee, no se muestra el id", () => {
    expect(nombreDelFormulario(JEFE)).toBe("Documentos del plan (carpeta «jefe»)");
  });
});

describe("permisos por prefijo (antes: formulario sin mapa = abierto a todos)", () => {
  it("cajero no lee ni escribe una carpeta del plan; almacenero lee pero no escribe", () => {
    expect(puedeLeerFormulario("cajero", JEFE)).toBe(false);
    expect(puedeEscribirFormulario("cajero", JEFE)).toBe(false);
    expect(puedeLeerFormulario("cajero", "forestal.plan.documentos")).toBe(false);
    expect(puedeLeerFormulario("almacenero", JEFE)).toBe(true);
    expect(puedeEscribirFormulario("almacenero", JEFE)).toBe(false);
    expect(puedeEscribirFormulario("owner", JEFE)).toBe(true);
  });

  it("un formulario cualquiera sin mapa sigue abierto (el default no cambió)", () => {
    expect(puedeLeerFormulario("cajero", "bodega.algo-nuevo")).toBe(true);
  });
});

describe("lectura: `archivo` sale con su tipo, nunca como texto", () => {
  it("listar devuelve el casillero como `archivo` y deja afuera el tipo desconocido", async () => {
    const campos = await CamposPersonalizadosDB.listar(T, JEFE, "plan-1");
    expect(campos.map((c) => [c.id, c.tipo])).toEqual([
      ["dni", "archivo"],
      ["cargo", "texto"],
    ]);
  });

  it("el catálogo de reutilizables no ofrece ni carpetas ni casilleros de archivo", async () => {
    const campos = await CamposPersonalizadosDB.reutilizables(T, "forestal.ingreso");
    expect(campos.map((c) => c.id)).toEqual(["cargo"]);
  });
});

describe("escritura: un `archivo` NUNCA deja fila de valor", () => {
  it("guardarValores ignora el casillero de archivo y el tipo desconocido; guarda el texto", async () => {
    const r = await CamposPersonalizadosDB.guardarValores(
      T,
      "plan-1",
      [
        { campoId: "dni", valor: "41234567" },
        { campoId: "raro", valor: "x" },
        { campoId: "cargo", valor: "Apu" },
      ],
      "qa",
    );
    expect(r).toEqual({ guardados: 1, borrados: 0, ignorados: 2, rechazados: 0 });
    expect(H.upserts).toHaveLength(1);
    expect(JSON.stringify(H.upserts[0])).toContain("cargo");
  });
});

describe("POST /api/admin/campos-personalizados con tipos nuevos", () => {
  it("`archivo` en una carpeta del plan → 201 con tipo archivo", async () => {
    const res = await POST(pedir({ formulario: JEFE, nombre: "Vigencia de poder", tipo: "archivo", soloParaRegistroId: "plan-1" }));
    expect(res.status).toBe(201);
    expect(((await res.json()) as { campo: { tipo: string } }).campo.tipo).toBe("archivo");
  });

  it("`archivo` fuera de una carpeta del plan → 400; `carpeta` → 400; campo en la lista de carpetas → 400", async () => {
    for (const body of [
      { formulario: "forestal.ingreso", nombre: "Foto", tipo: "archivo" },
      { formulario: "forestal.plan.documentos", nombre: "Mis papeles", tipo: "carpeta" },
      { formulario: "forestal.plan.documentos", nombre: "Nota", tipo: "texto" },
    ]) {
      const res = await POST(pedir(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(H.campos.filter((c) => c.nombre === "Foto" || c.nombre === "Mis papeles" || c.nombre === "Nota")).toHaveLength(0);
  });

  it("una carpeta que no existe en la plantilla → 404 (no 409: ese dice «ya existe»)", async () => {
    const res = await POST(pedir({ formulario: "forestal.plan.documentos.inventada", nombre: "DNI", tipo: "archivo" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "carpeta_desconocida" });
  });

  it("un rol sin escritura en el plan no inventa campos en sus carpetas", async () => {
    /* Hoy la puerta de la ruta (ROLES_DEFINICION) ya es sólo gestión; el
       `requireAdmin` está simulado para que un almacenero pase esa puerta y
       se vea el chequeo por formulario — el día que se abra, éste frena. */
    H.auth = { tenantId: T, username: "qa-almacen", role: "almacenero" };
    const res = await POST(pedir({ formulario: JEFE, nombre: "Otro", tipo: "archivo" }));
    expect(res.status).toBe(403);
    expect(H.campos.some((c) => c.nombre === "Otro")).toBe(false);
    // …y en un formulario sin módulo (abierto) el mismo rol sí crea.
    const abierto = await POST(pedir({ formulario: "bodega.algo-nuevo", nombre: "Otro", tipo: "texto" }));
    expect(abierto.status).toBe(201);
  });
});
