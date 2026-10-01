/**
 * Campos personalizados (ADR-427) — la capa de datos y su API.
 *
 * Lo que se prueba acá es lo que un campo inventado por el negocio rompería si
 * la consulta estuviera mal armada:
 *
 *  1. que el WHERE lleve SIEMPRE `tenantId` — un campo (o un valor) de otro
 *     negocio no se lee ni se pisa, y no por un `if` posterior;
 *  2. que el campo **temporal de otro registro** no se cuele en este: es la
 *     excepción de una fila, no una pregunta del formulario;
 *  3. que la clave se derive del nombre con la función pura y que repetirla en
 *     el mismo formulario devuelva **409**, con el nombre del que ya está;
 *  4. que guardar dos veces **actualice** (upsert por el unique
 *     `tenantId+campoId+registroId`) y no deje dos respuestas a la misma
 *     pregunta;
 *  5. que la baja sea **lógica**: los valores guardados son lo que alguien
 *     escribió y no se borran con la definición.
 *
 * La base está mockeada con una tabla en memoria que **aplica el WHERE**: si
 * la consulta se olvidara del tenant, el test devolvería la fila ajena.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

interface FilaCampo {
  id: string;
  tenantId: string;
  formulario: string;
  clave: string;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  opciones: string[];
  soloParaRegistroId: string | null;
  orden: number;
  activo: boolean;
  deletedAt: Date | null;
  createdBy: string;
}

const H = vi.hoisted(() => {
  type Fila = Record<string, unknown>;
  const campos: Fila[] = [];
  const valores: Fila[] = [];
  /** Todo WHERE que tocó la base, para poder afirmar sobre el aislamiento. */
  const wheres: { modelo: string; where: Record<string, unknown> }[] = [];
  const audits: { action: string; detail: string; tenantId?: string; user?: string }[] = [];
  const invalidados: string[] = [];
  const upserts: { where: Record<string, unknown>; create: Fila; update: Fila }[] = [];
  const borrados: Record<string, unknown>[] = [];
  let seq = 0;
  const nuevoId = () => `id-${++seq}`;

  function coincide(fila: Fila, where: Record<string, unknown>): boolean {
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (k === "OR") {
        const ramas = v as Record<string, unknown>[];
        if (!ramas.some((r) => coincide(fila, r))) return false;
        continue;
      }
      if (v === null) {
        if (fila[k] !== null && fila[k] !== undefined) return false;
        continue;
      }
      if (typeof v === "object" && v !== null && "in" in (v as Record<string, unknown>)) {
        const lista = (v as { in: unknown[] }).in;
        if (!lista.includes(fila[k])) return false;
        continue;
      }
      if (fila[k] !== v) return false;
    }
    return true;
  }

  const filtrar = (tabla: Fila[], modelo: string, where: Record<string, unknown>) => {
    wheres.push({ modelo, where });
    return tabla.filter((f) => coincide(f, where));
  };

  return { campos, valores, wheres, audits, invalidados, upserts, borrados, coincide, filtrar, nuevoId };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    campoPersonalizado: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        H.filtrar(H.campos, "campoPersonalizado.findMany", where),
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        H.filtrar(H.campos, "campoPersonalizado.findFirst", where)[0] ?? null,
      /* El tope de campos por formulario cuenta los permanentes vivos (ADR-427,
         hallazgo de la auditoría: 96 campos creados en 17 s). */
      count: async ({ where }: { where: Record<string, unknown> }) =>
        H.filtrar(H.campos, "campoPersonalizado.count", where).length,
      aggregate: async ({ where }: { where: Record<string, unknown> }) => {
        const rows = H.filtrar(H.campos, "campoPersonalizado.aggregate", where);
        const max = rows.reduce((m, r) => Math.max(m, Number(r.orden ?? 0)), 0);
        return { _max: { orden: rows.length ? max : null } };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const fila = { id: H.nuevoId(), deletedAt: null, activo: true, ...data };
        H.campos.push(fila);
        return fila;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const rows = H.filtrar(H.campos, "campoPersonalizado.updateMany", where);
        for (const r of rows) Object.assign(r, data);
        return { count: rows.length };
      },
      delete: async () => {
        throw new Error("borrado fisico prohibido");
      },
      deleteMany: async () => {
        throw new Error("borrado fisico prohibido");
      },
    },
    campoPersonalizadoValor: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        H.filtrar(H.valores, "campoPersonalizadoValor.findMany", where),
      upsert: async (args: {
        where: Record<string, unknown>;
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        H.upserts.push(args);
        const clave = args.where.tenantId_campoId_registroId as {
          tenantId: string;
          campoId: string;
          registroId: string;
        };
        const existe = H.valores.find((v) => H.coincide(v, { ...clave }));
        if (existe) {
          Object.assign(existe, args.update);
          return existe;
        }
        const fila = { id: H.nuevoId(), ...args.create };
        H.valores.push(fila);
        return fila;
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        H.borrados.push(where);
        const quedan = H.valores.filter((v) => !H.coincide(v, where));
        const count = H.valores.length - quedan.length;
        H.valores.length = 0;
        H.valores.push(...quedan);
        return { count };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

vi.mock("@/lib/cache", () => ({
  getOrSet: async <T,>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
  invalidateByPrefix: (p: string) => {
    H.invalidados.push(p);
  },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: async (
    action: string,
    _entity: string,
    detail: string,
    _entityId?: string,
    user?: string,
    _requestId?: string,
    tenantId?: string,
  ) => {
    H.audits.push({ action, detail, user, tenantId });
  },
}));

const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: () => null,
  applyRateLimitWithTenant: () => null,
  getClientIp: () => "127.0.0.1",
}));

const { CamposPersonalizadosDB, ClaveDuplicadaError, DemasiadosCamposError } = await import("@/lib/db/campos-personalizados.db");
const ruta = await import("@/app/api/admin/campos-personalizados/route");
const rutaValores = await import("@/app/api/admin/campos-personalizados/valores/route");

const TENANT = "t-main";
const AJENO = "t-otro";
const FORM = "qa.demo";

function campo(p: Partial<FilaCampo> & { id: string; clave: string; nombre: string }): FilaCampo {
  return {
    tenantId: TENANT,
    formulario: FORM,
    descripcion: null,
    tipo: "texto",
    opciones: [],
    soloParaRegistroId: null,
    orden: 0,
    activo: true,
    deletedAt: null,
    createdBy: "qaadmin",
    ...p,
  };
}

const PERMANENTE = campo({ id: "c1", clave: "color-de-la-cinta", nombre: "Color de la cinta", orden: 1 });
const TEMPORAL_A = campo({
  id: "c2",
  clave: "nota-del-transportista",
  nombre: "Nota del transportista",
  soloParaRegistroId: "reg-A",
  orden: 2,
});
const TEMPORAL_B = campo({
  id: "c3",
  clave: "lo-de-la-otra-fila",
  nombre: "Lo de la otra fila",
  soloParaRegistroId: "reg-B",
  orden: 3,
});
const DE_OTRO_FORM = campo({
  id: "c4",
  formulario: "forestal.plan",
  clave: "apuntador",
  nombre: "Apuntador",
  orden: 1,
});
const DE_OTRO_TENANT = campo({ id: "c5", tenantId: AJENO, clave: "campo-ajeno", nombre: "Campo ajeno", orden: 1 });
const DADO_DE_BAJA = campo({
  id: "c6",
  clave: "ya-no-se-usa",
  nombre: "Ya no se usa",
  activo: false,
  deletedAt: new Date("2026-09-01T00:00:00Z"),
});
const NUMERICO = campo({ id: "c7", clave: "piezas", nombre: "Piezas", tipo: "numero", orden: 4 });
/** Apagado, pero NO dado de baja: la pantalla ofrece volver a mostrarlo. */
const APAGADO = campo({
  id: "c8",
  clave: "apagado-recuperable",
  nombre: "Apagado pero recuperable",
  activo: false,
  orden: 5,
});

beforeEach(() => {
  H.campos.length = 0;
  H.campos.push(
    { ...PERMANENTE },
    { ...TEMPORAL_A },
    { ...TEMPORAL_B },
    { ...DE_OTRO_FORM },
    { ...DE_OTRO_TENANT },
    { ...DADO_DE_BAJA },
    { ...NUMERICO },
    { ...APAGADO },
  );
  H.valores.length = 0;
  H.wheres.length = 0;
  H.audits.length = 0;
  H.invalidados.length = 0;
  H.upserts.length = 0;
  H.borrados.length = 0;
  mockRequireAdmin.mockResolvedValue({ tenantId: TENANT, username: "qaadmin", role: "admin" });
});

const todosLosWheresLlevanTenant = (tenantId: string) => {
  expect(H.wheres.length).toBeGreaterThan(0);
  for (const w of H.wheres) expect(w.where.tenantId).toBe(tenantId);
};

describe("listar — qué campos ve un registro", () => {
  it("trae los permanentes del formulario y SOLO los temporales de este registro", async () => {
    const campos = await CamposPersonalizadosDB.listar(TENANT, FORM, "reg-A");
    // Los que se pintan, y al final el apagado (la pantalla lo esconde con
    // `camposDelRegistro`, pero necesita tenerlo para poder reactivarlo).
    expect(campos.map((c) => c.id)).toEqual(["c1", "c7", "c2", "c8"]);
    expect(campos.at(-1)?.activo).toBe(false);
    // El temporal de reg-B es la excepción de OTRA fila: no se pregunta acá.
    expect(campos.some((c) => c.id === "c3")).toBe(false);
    // Ni el campo dado de baja ni el de otro negocio.
    expect(campos.some((c) => c.id === "c6")).toBe(false);
    expect(campos.some((c) => c.id === "c5")).toBe(false);
  });

  it("sin registroId sólo hay permanentes (formulario en blanco, todavía sin fila)", async () => {
    const campos = await CamposPersonalizadosDB.listar(TENANT, FORM, null);
    expect(campos.map((c) => c.id)).toEqual(["c1", "c7", "c8"]);
  });

  it("consulta SIEMPRE acotada al tenant y a lo no borrado", async () => {
    await CamposPersonalizadosDB.listar(TENANT, FORM, "reg-A");
    todosLosWheresLlevanTenant(TENANT);
    for (const w of H.wheres) expect(w.where.deletedAt).toBeNull();
  });

  it("otro tenant no ve nada de éste, aunque el formulario se llame igual", async () => {
    const campos = await CamposPersonalizadosDB.listar(AJENO, FORM, "reg-A");
    expect(campos.map((c) => c.id)).toEqual(["c5"]);
  });

  it("exige tenantId", async () => {
    await expect(CamposPersonalizadosDB.listar("", FORM, null)).rejects.toThrow("tenantId is required");
  });
});

describe("reutilizables — copiar la pregunta de otro formulario", () => {
  it("no ofrece un campo apagado: reutilizar una pregunta que nadie usa no tiene sentido", async () => {
    const campos = await CamposPersonalizadosDB.reutilizables(TENANT, "otro.form");
    expect(campos.some((c) => c.clave === "apagado-recuperable")).toBe(false);
  });

  it("ofrece los permanentes de OTROS formularios del mismo negocio", async () => {
    const campos = await CamposPersonalizadosDB.reutilizables(TENANT, FORM);
    expect(campos.map((c) => c.clave)).toEqual(["apuntador"]);
  });

  it("nunca ofrece los de otro negocio", async () => {
    const campos = await CamposPersonalizadosDB.reutilizables(TENANT, "forestal.plan");
    expect(campos.every((c) => c.clave !== "campo-ajeno")).toBe(true);
    todosLosWheresLlevanTenant(TENANT);
  });
});

describe("crear — la clave sale del nombre, y no se repite", () => {
  it("deriva la clave con la función pura y lo pone al final del formulario", async () => {
    const campo = await CamposPersonalizadosDB.crear(
      TENANT,
      { formulario: FORM, nombre: "Número de orden interna", tipo: "texto" },
      "qaadmin",
    );
    expect(campo.clave).toBe("numero-de-orden-interna");
    expect(campo.orden).toBe(6); // max(1,2,3,4,5) + 1
    expect(campo.soloParaRegistroId).toBeNull();
    expect(H.invalidados).toContain(`campos-personalizados:${TENANT}`);
    expect(H.audits[0]).toMatchObject({ action: "campo_personalizado_crear", tenantId: TENANT, user: "qaadmin" });
  });

  it("guarda el temporal atado a su registro", async () => {
    const campo = await CamposPersonalizadosDB.crear(
      TENANT,
      { formulario: FORM, nombre: "Observación del chofer", tipo: "nota", soloParaRegistroId: "reg-A" },
      "qaadmin",
    );
    expect(campo.soloParaRegistroId).toBe("reg-A");
    const enOtroRegistro = await CamposPersonalizadosDB.listar(TENANT, FORM, "reg-B");
    expect(enOtroRegistro.some((c) => c.id === campo.id)).toBe(false);
  });

  /**
   * Tope de preguntas por formulario. Sale de la auditoría de seguridad: con
   * 120 POST entraron **96 campos permanentes** en `forestal.plan` en 17
   * segundos, y cada uno lo ve todo el tenant en todos los registros.
   */
  it("al llegar al tope, el permanente siguiente rebota (y los temporales no cuentan)", async () => {
    for (let i = 0; i < 60; i += 1) {
      H.campos.push({
        id: `relleno-${i}`,
        tenantId: TENANT,
        formulario: "forestal.tope",
        clave: `relleno-${i}`,
        nombre: `Relleno ${i}`,
        tipo: "texto",
        opciones: [],
        soloParaRegistroId: i < 45 ? null : `reg-${i}`, // 45 permanentes + 15 temporales
        orden: i,
        activo: true,
        deletedAt: null,
      });
    }
    // 45 permanentes: todavía entran cinco más.
    await expect(
      CamposPersonalizadosDB.crear(TENANT, { formulario: "forestal.tope", nombre: "Uno más", tipo: "texto" }, "qaadmin"),
    ).resolves.toMatchObject({ nombre: "Uno más" });

    for (let i = 0; i < 4; i += 1) {
      await CamposPersonalizadosDB.crear(TENANT, { formulario: "forestal.tope", nombre: `Extra ${i}`, tipo: "texto" }, "qaadmin");
    }
    // Con 50 permanentes, el 51 rebota…
    await expect(
      CamposPersonalizadosDB.crear(TENANT, { formulario: "forestal.tope", nombre: "El que sobra", tipo: "texto" }, "qaadmin"),
    ).rejects.toBeInstanceOf(DemasiadosCamposError);
    // …pero un temporal sigue entrando: vive en un registro y no le llena la pantalla a nadie.
    await expect(
      CamposPersonalizadosDB.crear(
        TENANT,
        { formulario: "forestal.tope", nombre: "Nota de este viaje", tipo: "nota", soloParaRegistroId: "reg-x" },
        "qaadmin",
      ),
    ).resolves.toMatchObject({ soloParaRegistroId: "reg-x" });
  });

  it("la misma pregunta dos veces revienta con el nombre del que ya está", async () => {
    await expect(
      CamposPersonalizadosDB.crear(TENANT, { formulario: FORM, nombre: "Color de la cinta", tipo: "texto" }, "qaadmin"),
    ).rejects.toBeInstanceOf(ClaveDuplicadaError);
    expect(H.audits).toHaveLength(0);
  });

  it("un temporal tampoco puede repetir la clave de un permanente del formulario", async () => {
    await expect(
      CamposPersonalizadosDB.crear(
        TENANT,
        { formulario: FORM, nombre: "color de la CINTA", tipo: "texto", soloParaRegistroId: "reg-A" },
        "qaadmin",
      ),
    ).rejects.toBeInstanceOf(ClaveDuplicadaError);
  });

  it("la misma clave en OTRO negocio es un campo distinto y se deja crear", async () => {
    const campo = await CamposPersonalizadosDB.crear(
      AJENO,
      { formulario: FORM, nombre: "Color de la cinta", tipo: "texto" },
      "qaadmin",
    );
    expect(campo.clave).toBe("color-de-la-cinta");
  });
});

describe("actualizar y eliminar", () => {
  it("edita la etiqueta pero NO la clave (lo guardado se sigue encontrando)", async () => {
    const campo = await CamposPersonalizadosDB.actualizar(TENANT, "c1", { nombre: "Color de cinta (nuevo)" }, "qaadmin");
    expect(campo?.nombre).toBe("Color de cinta (nuevo)");
    expect(campo?.clave).toBe("color-de-la-cinta");
    const escrituras = H.wheres.filter((w) => w.modelo === "campoPersonalizado.updateMany");
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].where).toMatchObject({ id: "c1", tenantId: TENANT, deletedAt: null });
  });

  it("un id de otro negocio devuelve null y no escribe nada (404, no update a ciegas)", async () => {
    const r = await CamposPersonalizadosDB.actualizar(AJENO, "c1", { nombre: "Pisado" }, "qaadmin");
    expect(r).toBeNull();
    expect(H.campos.find((c) => c.id === "c1")?.nombre).toBe("Color de la cinta");
    expect(H.audits).toHaveLength(0);
  });

  it("la baja es lógica: deletedAt + activo:false, nunca un delete físico", async () => {
    const ok = await CamposPersonalizadosDB.eliminar(TENANT, "c1", "qaadmin");
    expect(ok).toBe(true);
    const fila = H.campos.find((c) => c.id === "c1");
    expect(fila?.activo).toBe(false);
    expect(fila?.deletedAt).toBeInstanceOf(Date);
    expect(H.invalidados).toContain(`campos-personalizados:${TENANT}`);
    expect(H.audits[0]).toMatchObject({ action: "campo_personalizado_baja", tenantId: TENANT });
  });

  it("dar de baja un campo de otro negocio no hace nada", async () => {
    const ok = await CamposPersonalizadosDB.eliminar(AJENO, "c1", "qaadmin");
    expect(ok).toBe(false);
    expect(H.campos.find((c) => c.id === "c1")?.activo).toBe(true);
  });
});

describe("guardarValores — una tanda, un upsert por campo", () => {
  it("guarda dos veces y ACTUALIZA: una respuesta por campo y por registro", async () => {
    const primera = await CamposPersonalizadosDB.guardarValores(
      TENANT,
      "reg-A",
      [{ campoId: "c1", valor: "Roja" }],
      "qaadmin",
    );
    expect(primera.guardados).toBe(1);
    const segunda = await CamposPersonalizadosDB.guardarValores(
      TENANT,
      "reg-A",
      [{ campoId: "c1", valor: "Azul" }],
      "qaadmin",
    );
    expect(segunda.guardados).toBe(1);
    expect(H.valores).toHaveLength(1);
    expect(H.valores[0]).toMatchObject({ campoId: "c1", registroId: "reg-A", valor: "Azul" });
    // El unique compuesto lleva el tenant: es lo que evita el duplicado.
    expect(H.upserts[0].where.tenantId_campoId_registroId).toEqual({
      tenantId: TENANT,
      campoId: "c1",
      registroId: "reg-A",
    });
  });

  it("parte el número en su columna tipada, con la función pura", async () => {
    await CamposPersonalizadosDB.guardarValores(TENANT, "reg-A", [{ campoId: "c7", valor: "12,5" }], "qaadmin");
    expect(H.valores[0].valor).toBe("12,5");
    expect(Number(H.valores[0].valorNum)).toBe(12.5);
    expect(H.valores[0].valorFecha).toBeNull();
  });

  it("un campoId de otro negocio no se escribe: vuelve como ignorado", async () => {
    const r = await CamposPersonalizadosDB.guardarValores(
      TENANT,
      "reg-A",
      [{ campoId: "c5", valor: "colado" }],
      "qaadmin",
    );
    expect(r).toMatchObject({ guardados: 0, ignorados: 1 });
    expect(H.valores).toHaveLength(0);
    expect(H.upserts).toHaveLength(0);
  });

  it("un campo temporal de OTRO registro tampoco entra", async () => {
    const r = await CamposPersonalizadosDB.guardarValores(
      TENANT,
      "reg-A",
      [{ campoId: "c3", valor: "de la otra fila" }],
      "qaadmin",
    );
    expect(r).toMatchObject({ guardados: 0, ignorados: 1 });
  });

  it("vaciar borra la respuesta, acotado al tenant", async () => {
    await CamposPersonalizadosDB.guardarValores(TENANT, "reg-A", [{ campoId: "c1", valor: "Roja" }], "qaadmin");
    const r = await CamposPersonalizadosDB.guardarValores(TENANT, "reg-A", [{ campoId: "c1", valor: "  " }], "qaadmin");
    expect(r).toMatchObject({ guardados: 0, borrados: 1 });
    expect(H.valores).toHaveLength(0);
    expect(H.borrados[0]).toMatchObject({ tenantId: TENANT, campoId: "c1", registroId: "reg-A" });
  });

  it("leer lo contestado va acotado al tenant y al registro", async () => {
    await CamposPersonalizadosDB.guardarValores(TENANT, "reg-A", [{ campoId: "c1", valor: "Roja" }], "qaadmin");
    H.wheres.length = 0;
    const propios = await CamposPersonalizadosDB.valores(TENANT, "reg-A", ["c1"]);
    expect(propios).toEqual([{ campoId: "c1", valor: "Roja", valorNum: null, valorFecha: null }]);
    const ajenos = await CamposPersonalizadosDB.valores(AJENO, "reg-A", ["c1"]);
    expect(ajenos).toEqual([]);
    expect(H.wheres[0].where).toMatchObject({ tenantId: TENANT, registroId: "reg-A" });
  });

  it("exige tenantId y registroId", async () => {
    await expect(CamposPersonalizadosDB.guardarValores("", "reg-A", [], "qaadmin")).rejects.toThrow(
      "tenantId is required",
    );
    await expect(CamposPersonalizadosDB.guardarValores(TENANT, "", [{ campoId: "c1", valor: "x" }], "qaadmin")).rejects.toThrow(
      "registroId is required",
    );
  });
});

// ── La API, por el camino que usa la pantalla ───────────────────────────────

const pedir = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init));
const JSON_INIT = (body: unknown, method: string) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("API", () => {
  it("GET devuelve campos + valores del registro", async () => {
    await CamposPersonalizadosDB.guardarValores(TENANT, "reg-A", [{ campoId: "c1", valor: "Roja" }], "qaadmin");
    const res = await ruta.GET(
      pedir(`http://localhost/api/admin/campos-personalizados?formulario=${FORM}&registroId=reg-A`),
    );
    const body = (await res.json()) as { campos: { id: string }[]; valores: { campoId: string }[] };
    expect(res.status).toBe(200);
    expect(body.campos.map((c) => c.id)).toEqual(["c1", "c7", "c2", "c8"]);
    expect(body.valores).toEqual([{ campoId: "c1", valor: "Roja", valorNum: null, valorFecha: null }]);
  });

  it("GET ?reutilizables= devuelve los permanentes de otros formularios", async () => {
    const res = await ruta.GET(
      pedir(`http://localhost/api/admin/campos-personalizados?reutilizables=${FORM}`),
    );
    const body = (await res.json()) as { campos: { clave: string }[] };
    expect(body.campos.map((c) => c.clave)).toEqual(["apuntador"]);
  });

  it("sin sesión responde 401 (nunca 404: un 404 saca del panel)", async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const res = await ruta.GET(pedir(`http://localhost/api/admin/campos-personalizados?formulario=${FORM}`));
    expect(res.status).toBe(401);
  });

  it("POST con la clave repetida responde 409 y dice cuál es", async () => {
    const res = await ruta.POST(
      pedir(
        "http://localhost/api/admin/campos-personalizados",
        JSON_INIT({ formulario: FORM, nombre: "Color de la cinta", tipo: "texto" }, "POST"),
      ),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("clave_duplicada");
    expect(body.message).toContain("Color de la cinta");
  });

  it("POST con un tipo que no existe es 400, no un campo roto en la base", async () => {
    const res = await ruta.POST(
      pedir(
        "http://localhost/api/admin/campos-personalizados",
        JSON_INIT({ formulario: FORM, nombre: "Algo", tipo: "planilla" }, "POST"),
      ),
    );
    expect(res.status).toBe(400);
    expect(H.campos.some((c) => c.nombre === "Algo")).toBe(false);
  });

  it("PATCH sobre un id de otro negocio es 404 y no pisa nada", async () => {
    mockRequireAdmin.mockResolvedValue({ tenantId: AJENO, username: "intruso", role: "admin" });
    const res = await ruta.PATCH(
      pedir("http://localhost/api/admin/campos-personalizados", JSON_INIT({ id: "c1", nombre: "Pisado" }, "PATCH")),
    );
    expect(res.status).toBe(404);
    expect(H.campos.find((c) => c.id === "c1")?.nombre).toBe("Color de la cinta");
  });

  it("DELETE da de baja lógica y responde ok", async () => {
    const res = await ruta.DELETE(pedir("http://localhost/api/admin/campos-personalizados?id=c1", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(H.campos.find((c) => c.id === "c1")?.deletedAt).toBeInstanceOf(Date);
  });

  it("PUT valores guarda la tanda y devuelve cuántos", async () => {
    const res = await rutaValores.PUT(
      pedir(
        "http://localhost/api/admin/campos-personalizados/valores",
        JSON_INIT(
          {
            registroId: "reg-A",
            valores: [
              { campoId: "c1", valor: "Roja" },
              { campoId: "c7", valor: "8" },
            ],
          },
          "PUT",
        ),
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ guardados: 2 });
    expect(H.valores).toHaveLength(2);
  });
});
