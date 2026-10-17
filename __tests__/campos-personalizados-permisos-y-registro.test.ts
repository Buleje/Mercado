/**
 * Campos personalizados — el registro tiene que existir, y el permiso sale del
 * formulario (auditoría de seguridad del 2026-09-21, ADR-427).
 *
 * Los dos agujeros que probó el pentest:
 *
 *  · **P2** — `qacajero` escribió cinco valores contra `registroId` inventados
 *    (`qasec-bomba-0..4`) y el servidor respondió 200 las cinco veces: filas
 *    colgando de registros que no existen, sin techo.
 *  · **P3** — los roles eran UNA lista global: `qacajero` leyó «DNI del
 *    titular» de `forestal.plan`, un formulario de un módulo que no puede
 *    abrir.
 *
 * Acá se prueba que los dos fallan ahora, y —tan importante como eso— que lo
 * que no está mapeado **sigue andando**: el motor se cablea modal por modal y
 * un guard que exige mapa rompería cada pantalla nueva.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  FORMULARIOS,
  MODULO_POR_FORMULARIO,
  puedeEscribirFormulario,
  puedeLeerFormulario,
} from "@/lib/campos-personalizados";

// ── La base, en memoria, aplicando el WHERE ─────────────────────────────────

type Fila = Record<string, unknown>;

const H = vi.hoisted(() => {
  const campos: Fila[] = [];
  const valores: Fila[] = [];
  /** Las filas reales de cada módulo, como `tenantId:id`. */
  const registros: Record<string, Set<string>> = {
    forestPlan: new Set(),
    forestParty: new Set(),
    woodEntry: new Set(),
    forestContrato: new Set(),
    forestLoteAserrio: new Set(),
  };
  /** Cada `count` que se hizo contra una tabla de módulo, con su WHERE. */
  const conteos: { modelo: string; where: Record<string, unknown> }[] = [];
  const upserts: Fila[] = [];
  let seq = 0;

  function coincide(fila: Fila, where: Record<string, unknown>): boolean {
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (k === "OR") {
        if (!(v as Record<string, unknown>[]).some((r) => coincide(fila, r))) return false;
        continue;
      }
      if (v === null) {
        if (fila[k] !== null && fila[k] !== undefined) return false;
        continue;
      }
      if (typeof v === "object" && v !== null && "in" in (v as Record<string, unknown>)) {
        if (!(v as { in: unknown[] }).in.includes(fila[k])) return false;
        continue;
      }
      if (fila[k] !== v) return false;
    }
    return true;
  }

  const contarModulo = (modelo: string) => async ({ where }: { where: Record<string, unknown> }) => {
    conteos.push({ modelo, where });
    return registros[modelo].has(`${String(where.tenantId)}:${String(where.id)}`) ? 1 : 0;
  };

  return { campos, valores, registros, conteos, upserts, coincide, contarModulo, nuevoId: () => `v-${++seq}` };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    campoPersonalizado: {
      findMany: async ({ where, distinct }: { where: Record<string, unknown>; distinct?: string[] }) => {
        const rows = H.campos.filter((f) => H.coincide(f, where));
        if (!distinct) return rows;
        const vistos = new Set<unknown>();
        return rows.filter((r) => (vistos.has(r[distinct[0]]) ? false : (vistos.add(r[distinct[0]]), true)));
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        H.campos.find((f) => H.coincide(f, where)) ?? null,
      count: async ({ where }: { where: Record<string, unknown> }) =>
        H.campos.filter((f) => H.coincide(f, where)).length,
      aggregate: async () => ({ _max: { orden: 0 } }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const fila = { id: H.nuevoId(), deletedAt: null, activo: true, ...data };
        H.campos.push(fila);
        return fila;
      },
      updateMany: async () => ({ count: 0 }),
    },
    campoPersonalizadoValor: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        H.valores.filter((f) => H.coincide(f, where)),
      upsert: async (args: { where: Record<string, unknown>; create: Fila; update: Fila }) => {
        H.upserts.push(args.create);
        H.valores.push({ id: H.nuevoId(), ...args.create });
        return args.create;
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const quedan = H.valores.filter((v) => !H.coincide(v, where));
        const count = H.valores.length - quedan.length;
        H.valores.length = 0;
        H.valores.push(...quedan);
        return { count };
      },
    },
    forestPlan: { count: H.contarModulo("forestPlan") },
    forestParty: { count: H.contarModulo("forestParty") },
    woodEntry: { count: H.contarModulo("woodEntry") },
    forestContrato: { count: H.contarModulo("forestContrato") },
    forestLoteAserrio: { count: H.contarModulo("forestLoteAserrio") },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

vi.mock("@/lib/cache", () => ({
  getOrSet: async <T,>(_k: string, _t: number, fn: () => Promise<T>) => fn(),
  invalidateByPrefix: () => {},
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: async () => {} }));

const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: () => null,
  applyRateLimitWithTenant: () => null,
  getClientIp: () => "127.0.0.1",
}));

const { CamposPersonalizadosDB, RegistroDesconocidoError } = await import("@/lib/db/campos-personalizados.db");
const ruta = await import("@/app/api/admin/campos-personalizados/route");
const rutaValores = await import("@/app/api/admin/campos-personalizados/valores/route");

const TENANT = "t-main";
const AJENO = "t-otro";
const PLAN = "plan-real-1";
const SIN_MAPA = "qa.demo";

function campo(p: Partial<Fila> & { id: string; formulario: string; clave: string }): Fila {
  return {
    tenantId: TENANT,
    nombre: p.clave,
    descripcion: null,
    tipo: "texto",
    opciones: [],
    soloParaRegistroId: null,
    orden: 1,
    activo: true,
    deletedAt: null,
    createdBy: "qaadmin",
    ...p,
  };
}

beforeEach(() => {
  H.campos.length = 0;
  H.campos.push(
    campo({ id: "cp-plan", formulario: "forestal.plan", clave: "dni-del-titular", nombre: "DNI del titular" }),
    campo({ id: "cp-parte", formulario: "directorio.parte", clave: "banco", nombre: "Banco" }),
    campo({ id: "cp-libre", formulario: SIN_MAPA, clave: "color-de-la-cinta", nombre: "Color de la cinta" }),
  );
  H.valores.length = 0;
  H.conteos.length = 0;
  H.upserts.length = 0;
  for (const s of Object.values(H.registros)) s.clear();
  H.registros.forestPlan.add(`${TENANT}:${PLAN}`);
  H.registros.forestParty.add(`${TENANT}:parte-real-1`);
  mockRequireAdmin.mockResolvedValue({ tenantId: TENANT, username: "qaadmin", role: "admin" });
});

const pedir = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init));
const PUT_JSON = (body: unknown) => ({
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// ── P3 · el permiso sale del formulario ─────────────────────────────────────

describe("quién puede ver y llenar cada formulario (puro)", () => {
  it("el cajero no entra al plan de manejo: ni lo lee ni lo llena", () => {
    expect(puedeLeerFormulario("cajero", "forestal.plan")).toBe(false);
    expect(puedeEscribirFormulario("cajero", "forestal.plan")).toBe(false);
  });

  it("el almacenero LEE el plan pero no lo escribe — espejo de su route.ts", () => {
    expect(puedeLeerFormulario("almacenero", "forestal.plan")).toBe(true);
    expect(puedeEscribirFormulario("almacenero", "forestal.plan")).toBe(false);
    // …y en el Directorio sí escribe, porque ahí la ruta lo deja.
    expect(puedeEscribirFormulario("almacenero", "directorio.parte")).toBe(true);
  });

  it("management tier pasa siempre (mismo bypass que requireAdmin)", () => {
    for (const rol of ["admin", "owner", "manager"] as const) {
      expect(puedeEscribirFormulario(rol, "forestal.plan")).toBe(true);
    }
  });

  it("un formulario sin mapear NO queda bloqueado: es el default elegido", () => {
    expect(puedeLeerFormulario("cajero", SIN_MAPA)).toBe(true);
    expect(puedeEscribirFormulario("cajero", SIN_MAPA)).toBe(true);
    // `adelantos.adelanto` queda abierto a propósito: su propia ruta llama
    // requireAdmin SIN roles, así que acotarlo acá sería más estricto que el
    // módulo del que cuelga.
    expect(MODULO_POR_FORMULARIO["adelantos.adelanto"]).toBeUndefined();
    expect(puedeEscribirFormulario("cajero", "adelantos.adelanto")).toBe(true);
  });

  it("sin rol resuelto no se decide que sí", () => {
    expect(puedeLeerFormulario(null, SIN_MAPA)).toBe(false);
    expect(puedeEscribirFormulario(undefined, "forestal.plan")).toBe(false);
  });

  it("todo formulario con permisos tiene nombre en pantalla (no divergen)", () => {
    for (const id of Object.keys(MODULO_POR_FORMULARIO)) {
      expect(FORMULARIOS[id], `falta el nombre de ${id}`).toBeTruthy();
    }
  });
});

describe("P3 · la API no deja cruzar de módulo", () => {
  it("GET del plan de manejo con sesión de cajero → 403 (antes: 200 con «DNI del titular»)", async () => {
    mockRequireAdmin.mockResolvedValue({ tenantId: TENANT, username: "qacajero", role: "cajero" });
    const res = await ruta.GET(pedir("http://localhost/api/admin/campos-personalizados?formulario=forestal.plan"));
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain("DNI del titular");
  });

  it("el mismo GET con almacenero sí contesta: el guard no bloquea a quien sí entra", async () => {
    mockRequireAdmin.mockResolvedValue({ tenantId: TENANT, username: "qaalmacen", role: "almacenero" });
    const res = await ruta.GET(pedir("http://localhost/api/admin/campos-personalizados?formulario=forestal.plan"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { campos: { id: string }[] };
    expect(body.campos.map((c) => c.id)).toEqual(["cp-plan"]);
  });

  it("el cajero sigue trabajando en un formulario que no es de otro módulo", async () => {
    mockRequireAdmin.mockResolvedValue({ tenantId: TENANT, username: "qacajero", role: "cajero" });
    const res = await ruta.GET(pedir(`http://localhost/api/admin/campos-personalizados?formulario=${SIN_MAPA}`));
    expect(res.status).toBe(200);
  });

  it("el catálogo de reutilizables tampoco filtra el nombre de una pregunta ajena", async () => {
    mockRequireAdmin.mockResolvedValue({ tenantId: TENANT, username: "qacajero", role: "cajero" });
    const res = await ruta.GET(pedir(`http://localhost/api/admin/campos-personalizados?reutilizables=${SIN_MAPA}`));
    const body = (await res.json()) as { campos: { formulario: string }[] };
    expect(body.campos.some((c) => c.formulario === "forestal.plan")).toBe(false);
    // El admin sí lo ve: el filtro es por rol, no un borrado del catálogo.
    mockRequireAdmin.mockResolvedValue({ tenantId: TENANT, username: "qaadmin", role: "admin" });
    const comoAdmin = (await (
      await ruta.GET(pedir(`http://localhost/api/admin/campos-personalizados?reutilizables=${SIN_MAPA}`))
    ).json()) as { campos: { formulario: string }[] };
    expect(comoAdmin.campos.some((c) => c.formulario === "forestal.plan")).toBe(true);
  });

  it("PUT de un valor del plan con sesión de cajero → 403 y no escribe nada", async () => {
    mockRequireAdmin.mockResolvedValue({ tenantId: TENANT, username: "qacajero", role: "cajero" });
    const res = await rutaValores.PUT(
      pedir(
        "http://localhost/api/admin/campos-personalizados/valores",
        PUT_JSON({ registroId: PLAN, valores: [{ campoId: "cp-plan", valor: "12345678" }] }),
      ),
    );
    expect(res.status).toBe(403);
    expect(H.valores).toHaveLength(0);
  });

  it("el cajero sí llena un formulario sin mapear (no se rompe lo que andaba)", async () => {
    mockRequireAdmin.mockResolvedValue({ tenantId: TENANT, username: "qacajero", role: "cajero" });
    const res = await rutaValores.PUT(
      pedir(
        "http://localhost/api/admin/campos-personalizados/valores",
        PUT_JSON({ registroId: "lo-que-sea", valores: [{ campoId: "cp-libre", valor: "Roja" }] }),
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ guardados: 1, rechazados: 0 });
  });
});

// ── P2 · el registro tiene que existir ──────────────────────────────────────

describe("P2 · un registroId inventado no se escribe", () => {
  it("la bomba del pentest (`qasec-bomba-0`) ahora no deja fila", async () => {
    const r = await CamposPersonalizadosDB.guardarValores(
      TENANT,
      "qasec-bomba-0",
      [{ campoId: "cp-plan", valor: "basura" }],
      "qacajero",
    );
    expect(r).toMatchObject({ guardados: 0, rechazados: 1 });
    expect(H.valores).toHaveLength(0);
    expect(H.upserts).toHaveLength(0);
  });

  it("contra un registro real del mismo negocio sí escribe", async () => {
    const r = await CamposPersonalizadosDB.guardarValores(
      TENANT,
      PLAN,
      [{ campoId: "cp-plan", valor: "44556677" }],
      "qaadmin",
    );
    expect(r).toMatchObject({ guardados: 1, rechazados: 0 });
    expect(H.valores).toHaveLength(1);
  });

  it("el mismo id en OTRO negocio no existe: el count lleva tenantId en el WHERE", async () => {
    const r = await CamposPersonalizadosDB.guardarValores(
      AJENO,
      PLAN,
      [{ campoId: "cp-plan", valor: "cruzado" }],
      "intruso",
    );
    // El campo ya no es de ese tenant (ignorado); y si lo fuera, el registro
    // tampoco: ningún WHERE de módulo sale sin tenantId.
    expect(r.guardados).toBe(0);
    for (const c of H.conteos) expect(c.where.tenantId).toBe(AJENO);
  });

  it("una consulta por REGISTRO, no una por valor", async () => {
    await CamposPersonalizadosDB.guardarValores(
      TENANT,
      PLAN,
      [
        { campoId: "cp-plan", valor: "a" },
        { campoId: "cp-plan", valor: "b" },
      ],
      "qaadmin",
    );
    expect(H.conteos.filter((c) => c.modelo === "forestPlan")).toHaveLength(1);
  });

  it("vaciar una respuesta huérfana SÍ se puede: es la única forma de limpiarla", async () => {
    H.valores.push({ id: "viejo", tenantId: TENANT, campoId: "cp-plan", registroId: "qasec-bomba-0", valor: "basura" });
    const r = await CamposPersonalizadosDB.guardarValores(
      TENANT,
      "qasec-bomba-0",
      [{ campoId: "cp-plan", valor: "" }],
      "qaadmin",
    );
    expect(r).toMatchObject({ borrados: 1, rechazados: 0 });
    expect(H.valores).toHaveLength(0);
  });

  it("un formulario sin verificación se guarda igual (default: permitir avisando)", async () => {
    const r = await CamposPersonalizadosDB.guardarValores(
      TENANT,
      "registro-de-una-pantalla-nueva",
      [{ campoId: "cp-libre", valor: "Roja" }],
      "qaadmin",
    );
    expect(r).toMatchObject({ guardados: 1, rechazados: 0 });
    expect(H.conteos).toHaveLength(0);
  });

  it("cada formulario se verifica contra SU tabla (el Directorio no pregunta por planes)", async () => {
    const r = await CamposPersonalizadosDB.guardarValores(
      TENANT,
      "parte-real-1",
      [{ campoId: "cp-parte", valor: "BCP" }],
      "qaadmin",
    );
    expect(r).toMatchObject({ guardados: 1 });
    expect(H.conteos.map((c) => c.modelo)).toEqual(["forestParty"]);
  });

  it("la ruta avisa con 409 cuando NO quedó nada escrito", async () => {
    const res = await rutaValores.PUT(
      pedir(
        "http://localhost/api/admin/campos-personalizados/valores",
        PUT_JSON({ registroId: "qasec-bomba-1", valores: [{ campoId: "cp-plan", valor: "basura" }] }),
      ),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "registro_desconocido", rechazados: 1 });
    expect(H.valores).toHaveLength(0);
  });

  it("un campo TEMPORAL contra un registro inventado tampoco se crea", async () => {
    await expect(
      CamposPersonalizadosDB.crear(
        TENANT,
        { formulario: "forestal.plan", nombre: "Nota de este plan", tipo: "nota", soloParaRegistroId: "qasec-bomba-2" },
        "qaadmin",
      ),
    ).rejects.toBeInstanceOf(RegistroDesconocidoError);
    expect(H.campos.some((c) => c.nombre === "Nota de este plan")).toBe(false);
  });

  it("…pero sobre el plan real entra", async () => {
    const campoNuevo = await CamposPersonalizadosDB.crear(
      TENANT,
      { formulario: "forestal.plan", nombre: "Nota de este plan", tipo: "nota", soloParaRegistroId: PLAN },
      "qaadmin",
    );
    expect(campoNuevo.soloParaRegistroId).toBe(PLAN);
  });
});
