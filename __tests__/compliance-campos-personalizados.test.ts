/**
 * Ley 29733 × campos personalizados (ADR-427).
 *
 * El export de datos y el derecho de supresión enumeran los modelos **a mano**.
 * Los campos personalizados son nuevos y nadie los había sumado: un DNI o un
 * teléfono tipeado en una pregunta inventada por el negocio no salía en el
 * export ni se borraba.
 *
 * El problema difícil es que `CampoPersonalizadoValor.registroId` es un id
 * **libre**: no dice de qué tabla es. Lo que se prueba acá es el cruce que lo
 * resuelve sin adivinar:
 *
 *  1. una respuesta entra al export sólo si su id está entre los de esta
 *     persona **y** su formulario declara esa misma tabla;
 *  2. la respuesta de OTRA persona del mismo formulario no entra;
 *  3. la de OTRO negocio no entra **aunque el `registroId` sea idéntico** —
 *     el aislamiento está en el WHERE, no en un `if`;
 *  4. un formulario que declara otra tabla no entra aunque el id coincida de
 *     casualidad (el id de un `Customer` es su teléfono: es corto y se puede
 *     repetir como código en otra tabla);
 *  5. lo que no se puede atribuir **se declara** en `fueraDeAlcance` en vez de
 *     desaparecer en silencio;
 *  6. el borrado alcanza sólo los registros de esa persona.
 *
 * La base está mockeada con tablas en memoria que **aplican el WHERE**: si una
 * consulta se olvidara del `tenantId`, el test devolvería la fila ajena.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Fila = Record<string, unknown>;
type Where = Record<string, unknown>;

const H = vi.hoisted(() => {
  const tablas: Record<string, Fila[]> = {};
  const wheres: Array<{ modelo: string; where: Where }> = [];
  let seq = 0;

  const tabla = (nombre: string): Fila[] => (tablas[nombre] ??= []);

  function coincide(fila: Fila, where: Where): boolean {
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (k === "OR") {
        const ramas = v as Where[];
        if (!ramas.some((r) => coincide(fila, r))) return false;
        continue;
      }
      if (v === null) {
        if (fila[k] !== null && fila[k] !== undefined) return false;
        continue;
      }
      if (typeof v === "object" && v !== null && "in" in (v as Where)) {
        if (!(v as { in: unknown[] }).in.includes(fila[k])) return false;
        continue;
      }
      if (fila[k] !== v) return false;
    }
    return true;
  }

  function modelo(nombre: string) {
    return {
      findMany: async (args?: { where?: Where; distinct?: string[]; take?: number }) => {
        const where = args?.where ?? {};
        wheres.push({ modelo: `${nombre}.findMany`, where });
        let rows = tabla(nombre).filter((f) => coincide(f, where));
        if (args?.distinct) {
          const vistos = new Set<string>();
          rows = rows.filter((r) => {
            const clave = args.distinct!.map((d) => String(r[d])).join("|");
            if (vistos.has(clave)) return false;
            vistos.add(clave);
            return true;
          });
        }
        if (typeof args?.take === "number") rows = rows.slice(0, args.take);
        return rows.map((r) => ({ ...r }));
      },
      findFirst: async (args?: { where?: Where }) => {
        const where = args?.where ?? {};
        wheres.push({ modelo: `${nombre}.findFirst`, where });
        const row = tabla(nombre).find((f) => coincide(f, where));
        return row ? { ...row } : null;
      },
      count: async (args?: { where?: Where }) => {
        const where = args?.where ?? {};
        wheres.push({ modelo: `${nombre}.count`, where });
        return tabla(nombre).filter((f) => coincide(f, where)).length;
      },
      create: async ({ data }: { data: Fila }) => {
        const fila = { id: `gen-${++seq}`, ...data };
        tabla(nombre).push(fila);
        return { ...fila };
      },
      update: async ({ where, data }: { where: Where; data: Fila }) => {
        wheres.push({ modelo: `${nombre}.update`, where });
        const row = tabla(nombre).find((f) => coincide(f, where));
        if (!row) throw new Error(`${nombre}.update sin fila`);
        Object.assign(row, data);
        return { ...row };
      },
      updateMany: async ({ where, data }: { where: Where; data: Fila }) => {
        wheres.push({ modelo: `${nombre}.updateMany`, where });
        const rows = tabla(nombre).filter((f) => coincide(f, where));
        for (const r of rows) Object.assign(r, data);
        return { count: rows.length };
      },
      deleteMany: async ({ where }: { where: Where }) => {
        wheres.push({ modelo: `${nombre}.deleteMany`, where });
        const quedan = tabla(nombre).filter((f) => !coincide(f, where));
        const count = tabla(nombre).length - quedan.length;
        tablas[nombre] = quedan;
        return { count };
      },
    };
  }

  return { tablas, wheres, tabla, modelo, coincide };
});

vi.mock("server-only", () => ({}));

/** El `tx` que reciben los métodos de compliance: un Pick del cliente de Prisma. */
type TxFalso = Parameters<typeof CamposPersonalizadosDB.borrarValoresDeUnaPersonaEnTx>[0];

const clienteFalso = {
  customer: H.modelo("customer"),
  order: H.modelo("order"),
  sale: H.modelo("sale"),
  fiado: H.modelo("fiado"),
  prestamo: H.modelo("prestamo"),
  sunatInvoice: H.modelo("sunatInvoice"),
  savedLocation: H.modelo("savedLocation"),
  customerNotification: H.modelo("customerNotification"),
  forestParty: H.modelo("forestParty"),
  campoPersonalizado: H.modelo("campoPersonalizado"),
  campoPersonalizadoValor: H.modelo("campoPersonalizadoValor"),
  activityLog: H.modelo("activityLog"),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ...clienteFalso,
    $transaction: async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: typeof clienteFalso) => Promise<unknown>)(clienteFalso)
        : Promise.all(arg as Promise<unknown>[]),
  },
}));

vi.mock("@/lib/cache", () => ({
  getOrSet: async <T,>(_k: string, _t: number, fn: () => Promise<T>) => fn(),
  invalidateByPrefix: () => {},
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: async () => {} }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: () => null,
  applyRateLimitWithTenant: () => null,
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/errores/sin-dato", () => ({
  leerJson: async (req: Request) => {
    try {
      return await req.json();
    } catch {
      return null; // body inválido → la ruta responde 400, igual que el real
    }
  },
}));
vi.mock("@/lib/audit/audit-context", () => ({
  runWithAuditContext: async (_req: unknown, _actor: string, fn: () => Promise<unknown>) => fn(),
}));

const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

const { CamposPersonalizadosDB, ORIGEN_DEL_FORMULARIO } = await import(
  "@/lib/db/campos-personalizados.db"
);
const exportRoute = await import("@/app/api/compliance/data-export/route");
const deleteRoute = await import("@/app/api/compliance/data-delete/route");

const TENANT = "t-qa";
const AJENO = "t-otro";
const DNI_A = "44444444";
const DNI_B = "55555555";
const TEL_A = "51900000001";
const TEL_B = "51900000002";

function campo(p: Fila): Fila {
  return {
    tenantId: TENANT,
    formulario: "directorio.parte",
    clave: "dni-del-contacto",
    nombre: "DNI del contacto",
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

function valor(p: Fila): Fila {
  return {
    tenantId: TENANT,
    valor: "algo",
    valorNum: null,
    valorFecha: null,
    createdBy: "qaadmin",
    createdAt: new Date("2026-09-21T12:00:00.000Z"),
    ...p,
  };
}

function sembrar(): void {
  for (const k of Object.keys(H.tablas)) delete H.tablas[k];
  H.wheres.length = 0;

  H.tabla("customer").push(
    { phone: TEL_A, tenantId: TENANT, documento: DNI_A, name: "Persona A", tipoDocumento: "DNI" },
    { phone: TEL_B, tenantId: TENANT, documento: DNI_B, name: "Persona B", tipoDocumento: "DNI" },
  );
  H.tabla("order").push(
    { id: "ord-A1", tenantId: TENANT, customerPhone: TEL_A, items: [], total: 10 },
    { id: "ord-B1", tenantId: TENANT, customerPhone: TEL_B, items: [], total: 20 },
  );
  H.tabla("forestParty").push(
    { id: "parte-A", tenantId: TENANT, docNumero: DNI_A, nombre: "Persona A" },
    { id: "parte-B", tenantId: TENANT, docNumero: DNI_B, nombre: "Persona B" },
  );

  H.tabla("campoPersonalizado").push(
    campo({ id: "c-parte" }),
    campo({ id: "c-parte-baja", clave: "telefono-viejo", nombre: "Teléfono viejo", deletedAt: new Date(), activo: false }),
    campo({ id: "c-plan", formulario: "forestal.plan", clave: "apuntador", nombre: "Apuntador" }),
    campo({ id: "c-pedido", formulario: "pedidos.pedido", clave: "dni-de-quien-recibe", nombre: "DNI de quien recibe" }),
    campo({ id: "c-ajeno", tenantId: AJENO }),
  );

  H.tabla("campoPersonalizadoValor").push(
    // De la persona A, en su ficha del Directorio: TIENE que salir.
    valor({ id: "v-suyo", campoId: "c-parte", registroId: "parte-A", valor: DNI_A }),
    // Pregunta dada de baja: la definición se apagó, lo que escribió sigue siendo suyo.
    valor({ id: "v-suyo-baja", campoId: "c-parte-baja", registroId: "parte-A", valor: "987654321" }),
    // De OTRA persona, mismo formulario.
    valor({ id: "v-ajeno-persona", campoId: "c-parte", registroId: "parte-B", valor: DNI_B }),
    // De OTRO negocio, con el MISMO registroId: el tenant tiene que filtrarlo.
    valor({ id: "v-ajeno-tenant", tenantId: AJENO, campoId: "c-ajeno", registroId: "parte-A", valor: "secreto ajeno" }),
    // Colisión de id: el mismo "parte-A" pero de un formulario que declara OTRA
    // tabla (`forestPlan`). No es el mismo registro: no puede salir.
    valor({ id: "v-colision", campoId: "c-plan", registroId: "parte-A", valor: "de otro plan" }),
    // Registro que SÍ es de la persona (su pedido), pero cuyo formulario no
    // declara de qué tabla es: no se exporta y se declara.
    valor({ id: "v-sin-mapear", campoId: "c-pedido", registroId: "ord-A1", valor: "12345678" }),
  );
}

function pedido(url: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  sembrar();
  mockRequireAdmin.mockResolvedValue({ tenantId: TENANT, username: "qaadmin", role: "admin" });
});

describe("el mapa formulario → tabla", () => {
  it("declara la tabla de los formularios ya cableados", () => {
    expect(ORIGEN_DEL_FORMULARIO["directorio.parte"]).toBe("forestParty");
    expect(ORIGEN_DEL_FORMULARIO["forestal.plan"]).toBe("forestPlan");
  });

  it("un formulario sin declarar no se cruza contra ninguna tabla", () => {
    expect(ORIGEN_DEL_FORMULARIO["pedidos.pedido"]).toBeUndefined();
  });
});

describe("POST /api/compliance/data-export — derecho de acceso", () => {
  it("incluye lo escrito en un campo personalizado de esta persona", async () => {
    const res = await exportRoute.POST(pedido("/api/compliance/data-export", { dni: DNI_A, tenantId: TENANT }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.camposPersonalizados.valores.map((v: { valor: string }) => v.valor);
    expect(ids).toContain(DNI_A);
    const suyo = body.camposPersonalizados.valores.find((v: { clave: string }) => v.clave === "dni-del-contacto");
    expect(suyo).toMatchObject({
      formulario: "directorio.parte",
      origen: "forestParty",
      registroId: "parte-A",
      nombre: "DNI del contacto",
      preguntaDadaDeBaja: false,
    });
  });

  it("incluye lo contestado en una pregunta dada de baja (la definición se apagó, el dato es suyo)", async () => {
    const res = await exportRoute.POST(pedido("/api/compliance/data-export", { dni: DNI_A, tenantId: TENANT }));
    const body = await res.json();
    const baja = body.camposPersonalizados.valores.find((v: { clave: string }) => v.clave === "telefono-viejo");
    expect(baja).toBeDefined();
    expect(baja.preguntaDadaDeBaja).toBe(true);
  });

  it("NO incluye el valor de otra persona ni el de otro negocio con el mismo registroId", async () => {
    const res = await exportRoute.POST(pedido("/api/compliance/data-export", { dni: DNI_A, tenantId: TENANT }));
    const body = await res.json();
    const valores = body.camposPersonalizados.valores.map((v: { valor: string }) => v.valor);
    expect(valores).not.toContain(DNI_B);
    expect(valores).not.toContain("secreto ajeno");
  });

  it("NO incluye un valor cuyo formulario declara otra tabla, aunque el id coincida", async () => {
    const res = await exportRoute.POST(pedido("/api/compliance/data-export", { dni: DNI_A, tenantId: TENANT }));
    const body = await res.json();
    const valores = body.camposPersonalizados.valores.map((v: { valor: string }) => v.valor);
    expect(valores).not.toContain("de otro plan");
    const declarado = body.camposPersonalizados.fueraDeAlcance.find(
      (f: { formulario: string }) => f.formulario === "forestal.plan",
    );
    expect(declarado).toBeDefined();
    expect(declarado.valores).toBe(1); // cayó en un id suyo y NO se atribuyó
  });

  it("declara el formulario sin mapear en vez de exportarlo o callarlo", async () => {
    const res = await exportRoute.POST(pedido("/api/compliance/data-export", { dni: DNI_A, tenantId: TENANT }));
    const body = await res.json();
    const valores = body.camposPersonalizados.valores.map((v: { valor: string }) => v.valor);
    expect(valores).not.toContain("12345678");
    const declarado = body.camposPersonalizados.fueraDeAlcance.find(
      (f: { formulario: string }) => f.formulario === "pedidos.pedido",
    );
    expect(declarado).toBeDefined();
    expect(declarado.motivo).toContain("No está declarado");
  });

  it("toda consulta a los campos personalizados lleva el tenant en el WHERE", async () => {
    await exportRoute.POST(pedido("/api/compliance/data-export", { dni: DNI_A, tenantId: TENANT }));
    const tocadas = H.wheres.filter((w) => w.modelo.startsWith("campoPersonalizado"));
    expect(tocadas.length).toBeGreaterThan(0);
    for (const w of tocadas) expect(w.where.tenantId).toBe(TENANT);
  });

  it("un admin de otro tenant no puede pedir el export de este", async () => {
    mockRequireAdmin.mockResolvedValue({ tenantId: AJENO, username: "intruso", role: "admin" });
    const res = await exportRoute.POST(pedido("/api/compliance/data-export", { dni: DNI_A, tenantId: TENANT }));
    expect(res.status).toBe(403);
  });
});

describe("borrado — sólo los registros de esa persona", () => {
  it("borra los valores de sus registros y deja los de otra persona y los de otro negocio", async () => {
    const r = await CamposPersonalizadosDB.borrarValoresDeUnaPersonaEnTx(
      clienteFalso as unknown as TxFalso,
      TENANT,
      { forestParty: ["parte-A"] },
    );
    expect(r.borrados).toBe(2); // v-suyo y v-suyo-baja
    expect(r.porFormulario).toEqual([
      { formulario: "directorio.parte", formularioNombre: "Ficha del Directorio", valores: 2 },
    ]);
    const quedan = H.tabla("campoPersonalizadoValor").map((v) => v.id);
    expect(quedan).not.toContain("v-suyo");
    expect(quedan).not.toContain("v-suyo-baja");
    expect(quedan).toEqual(expect.arrayContaining(["v-ajeno-persona", "v-ajeno-tenant", "v-colision", "v-sin-mapear"]));
  });

  it("un tenant no puede borrar por un registroId del otro", async () => {
    const r = await CamposPersonalizadosDB.borrarValoresDeUnaPersonaEnTx(
      clienteFalso as unknown as TxFalso,
      AJENO,
      { forestParty: ["parte-A"] },
    );
    expect(r.borrados).toBe(1); // sólo el valor DEL tenant ajeno
    expect(H.tabla("campoPersonalizadoValor").map((v) => v.id)).toContain("v-suyo");
  });
});

describe("POST /api/compliance/data-delete — derecho de supresión", () => {
  it("no toca respuestas de formularios que no cuelgan de un registro de la bodega, y lo declara", async () => {
    const res = await deleteRoute.POST(
      pedido("/api/compliance/data-delete", { dni: DNI_A, tenantId: TENANT, reason: "pedido del titular" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Hoy ningún formulario cableado cuelga de un pedido/venta/fiado: la ruta
    // no borra ninguna respuesta — y en vez de callarlo, lo dice.
    const declarado = body.retainedData.find(
      (r: { table: string }) => r.table === "CampoPersonalizadoValor",
    );
    expect(declarado).toBeDefined();
    expect(declarado.reason).toContain("Ficha del Directorio");
    expect(H.tabla("campoPersonalizadoValor")).toHaveLength(6);
  });

  it("nunca borra valores de otro negocio", async () => {
    await deleteRoute.POST(
      pedido("/api/compliance/data-delete", { dni: DNI_A, tenantId: TENANT, reason: "pedido del titular" }),
    );
    const borrados = H.wheres.filter((w) => w.modelo === "campoPersonalizadoValor.deleteMany");
    for (const w of borrados) expect(w.where.tenantId).toBe(TENANT);
    expect(H.tabla("campoPersonalizadoValor").map((v) => v.id)).toContain("v-ajeno-tenant");
  });
});
