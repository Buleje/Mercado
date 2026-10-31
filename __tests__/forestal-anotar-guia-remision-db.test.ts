/**
 * Anotar la GRE (guía de remisión SUNAT) en la GTF de un despacho — revisión
 * del 30-10 sobre 8c324a38b. Lo que se prueba es lo que queda en la base:
 *
 * - Dos pestañas a la vez con números distintos: una anota, la otra recibe
 *   `ya_tiene` (compare-and-set sobre `updatedAt`, no «el último gana»).
 * - La misma GRE en OTRO viaje = `duplicado` con el motivo; las líneas de la
 *   misma GTF la comparten; otra GTF sólo con la misma placa o si el dueño la
 *   confirmó en la lista del viaje (sin placa no hay cómo saberlo: Blas, 28-10).
 *   Una línea sin GTF también cuenta (Prisma `not` deja afuera los NULL: el
 *   fake lo imita).
 * - El viaje es la lista CONFIRMADA y el servidor valida TODOS los pares (A
 *   placa ABC, B sin placa, C placa XYZ: abriendo B, A y C no van juntas) y que
 *   no haya dos GRE distintas: ni la GRE ni el precio se ponen sobre eso.
 * - `ponerPrecioViaje`: reparto al céntimo, null nunca 0, no pisa sin
 *   reemplazar, todo o nada; la factura va a `ventaViaje` y la GTF impresa no
 *   cambia (ADR-374: reimprimir da los mismos casilleros).
 * - `anotarPlacaViaje`: la placa del viaje fuera de la casilla impresa.
 * - Guardar el formulario de la guía con la casilla (25) vacía no borra la
 *   GRE ya anotada.
 * - Cada escritura invalida la caché del libro.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const T = "t-blas";

const H = vi.hoisted(() => {
  type Fila = {
    id: string;
    tenantId: string;
    section: string;
    status: string;
    lineNo: number;
    gtfNumber: string | null;
    gtfDatos: unknown;
    destino?: string | null;
    quantity?: unknown;
    unit?: string | null;
    observations?: string | null;
    valorVenta?: unknown;
    moneda?: string | null;
    entryDate: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  };
  type Where = Record<string, unknown>;
  const estado = {
    filas: [] as Fila[],
    escrituras: 0,
    invalidados: [] as string[],
    audit: [] as { action: string; detail: string; entityId?: string }[],
    /** Las primeras N lecturas por id esperan a que lleguen todas: así las dos pestañas leen lo mismo. */
    barrera: 0,
    /** Se llama después de cada `findMany`: simula a otro que escribe entre la lectura y la escritura. */
    trasLeer: null as null | (() => void),
  };
  let enEspera: (() => void)[] = [];

  const cumple = (r: Record<string, unknown>, w: Where): boolean =>
    Object.entries(w).every(([k, v]) => {
      if (k === "AND") return (v as Where[]).every((x) => cumple(r, x));
      if (k === "OR") return (v as Where[]).some((x) => cumple(r, x));
      const x = r[k];
      if (v instanceof Date) return x instanceof Date && x.getTime() === v.getTime();
      if (v && typeof v === "object") {
        const o = v as { not?: unknown; path?: string[]; equals?: unknown; gte?: Date; lt?: Date };
        // SQL `<>`: el NULL no es «distinto de X».
        if ("not" in o) return x !== null && x !== undefined && x !== o.not;
        if (Array.isArray((o as { in?: unknown[] }).in)) return ((o as { in: unknown[] }).in).includes(x);
        if (o.gte || o.lt) {
          const t = x instanceof Date ? x.getTime() : NaN;
          return (!o.gte || t >= o.gte.getTime()) && (!o.lt || t < o.lt.getTime());
        }
        if (o.path) {
          let cur: unknown = x;
          for (const p of o.path) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[p] : undefined;
          return cur === o.equals;
        }
      }
      return x === v;
    });

  const modelo = {
    findFirst: async ({ where }: { where: Where }) => {
      const f = estado.filas.find((r) => cumple(r, where));
      const copia = f ? structuredClone(f) : null;
      if (estado.barrera > 0 && !("AND" in where)) {
        estado.barrera--;
        await new Promise<void>((ok) => {
          enEspera.push(ok);
          if (estado.barrera === 0) {
            enEspera.forEach((s) => s());
            enEspera = [];
          }
        });
      }
      return copia;
    },
    findMany: async ({ where }: { where: Where }) => {
      const hits = estado.filas.filter((r) => cumple(r, where)).sort((a, b) => a.lineNo - b.lineNo).map((f) => structuredClone(f));
      estado.trasLeer?.();
      return hits;
    },
    updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      const hits = estado.filas.filter((r) => cumple(r, where));
      // Prisma.Decimal → number: structuredClone le borraría el prototipo.
      const plano = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v && typeof (v as { toNumber?: unknown }).toNumber === "function" ? (v as { toNumber: () => number }).toNumber() : v]),
      );
      for (const r of hits) {
        Object.assign(r, structuredClone(plano));
        r.updatedAt = new Date(r.updatedAt.getTime() + 1000);
        estado.escrituras++;
      }
      return { count: hits.length };
    },
  };
  return { estado, modelo };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { forestCtpEntry: H.modelo, $transaction: (fn: (tx: unknown) => unknown) => fn({ forestCtpEntry: H.modelo }) },
}));
vi.mock("@/lib/cache", () => ({
  invalidateByPrefix: (p: string) => { H.estado.invalidados.push(p); },
  invalidate: () => {},
  getOrSet: () => null,
}));
vi.mock("@/lib/forestal/ctp-audit", () => ({
  auditCtp: (a: { action: string; detail: string; entityId?: string }) => { H.estado.audit.push(a); },
  auditCtpEsperando: async () => {},
}));
vi.mock("@/lib/db/forest-ctp-ficha.db", () => ({ ForestCtpFichaDB: { getFresco: async () => ({}), get: async () => ({}) } }));
vi.mock("@/lib/db/platform-settings.db", () => ({ PlatformSettingsDB: { getFresco: async () => null, get: async () => null } }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { closedPeriodOf: async () => null } }));

import { ForestCtpDespachoDB, conservarDatosDelViaje, conservarGuiaRemision } from "@/lib/db/forest-ctp-despacho.db";
import { casillerosGtf } from "@/lib/forestal/ctp-gtf-formato";
import { leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { CtpFicha } from "@/lib/forestal/ctp-ficha-types";

const despacho = (id: string, lineNo: number, gtfNumber: string | null, gre = "", tenantId = T, dia = "2026-10-28") => ({
  id,
  tenantId,
  section: "despacho",
  status: "registrado",
  lineNo,
  gtfNumber,
  gtfDatos: { guia: { autoridad: "ARFFS Ucayali", guiaRemisionNro: gre }, destinatario: { nombre: "Maderas SAC" } } as unknown,
  destino: null as string | null,
  quantity: 1 as unknown,
  unit: "m3",
  observations: "100 PT" as string | null,
  valorVenta: null as unknown,
  moneda: "PEN",
  entryDate: new Date(`${dia}T00:00:00Z`),
  updatedAt: new Date("2026-10-28T15:00:00Z"),
  deletedAt: null,
});
const greDe = (id: string) =>
  ((H.estado.filas.find((f) => f.id === id)?.gtfDatos as { guia?: { guiaRemisionNro?: string } })?.guia?.guiaRemisionNro) ?? "";
const anotar = (id: string, numero: string, reemplazar = false) =>
  ForestCtpDespachoDB.anotarGuiaRemision(T, id, numero, { reemplazar, user: "blasadmin" });

beforeEach(() => {
  H.estado.filas = [despacho("d1", 1, "19-001-000064"), despacho("d2", 2, "19-001-000064"), despacho("d3", 3, "19-001-000065")];
  H.estado.escrituras = 0;
  H.estado.invalidados = [];
  H.estado.audit = [];
  H.estado.barrera = 0;
  H.estado.trasLeer = null;
});

describe("anotarGuiaRemision — dos pestañas a la vez", () => {
  it("con números distintos, una anota y la otra recibe ya_tiene con el de la primera", async () => {
    H.estado.barrera = 2;
    const [a, b] = await Promise.all([anotar("d1", "EG07-12"), anotar("d1", "EG07-13")]);
    const ganadora = a.ok ? a : b;
    const perdedora = a.ok ? b : a;
    expect(ganadora).toEqual({ ok: true, cambio: true, guiaRemisionNro: expect.stringMatching(/^EG07-1[23]$/) });
    expect(perdedora).toEqual({ ok: false, reason: "ya_tiene", actual: greDe("d1") });
    expect(H.estado.escrituras).toBe(1);
    expect(H.estado.audit).toHaveLength(1);
  });
  it("anota sin pisar el resto del cuerpo e invalida la caché del libro", async () => {
    expect(await anotar("d1", "EG07-12")).toEqual({ ok: true, cambio: true, guiaRemisionNro: "EG07-12" });
    const cuerpo = H.estado.filas[0].gtfDatos as { guia: Record<string, string>; destinatario: { nombre: string } };
    expect(cuerpo.guia).toEqual({ autoridad: "ARFFS Ucayali", guiaRemisionNro: "EG07-12" });
    expect(cuerpo.destinatario.nombre).toBe("Maderas SAC");
    expect(H.estado.invalidados).toEqual([`forest-ctp:${T}`]);
  });
});

describe("anotarGuiaRemision — la misma GRE en otro despacho", () => {
  it("en la GTF de OTRO viaje (salió otro día) = duplicado con el motivo, también con ceros; con reemplazar pasa", async () => {
    H.estado.filas[2] = despacho("d3", 3, "19-001-000065", "EG07-00000012", T, "2026-10-27");
    expect(await anotar("d1", "EG07-12")).toEqual({
      ok: false, reason: "duplicado", otroDespachoId: "d3", otraLinea: 3, otraGtf: "19-001-000065", motivo: "salió otro día (27-10)", sinPlaca: false,
    });
    expect(H.estado.escrituras).toBe(0);
    expect((await anotar("d1", "EG07-12", true)).ok).toBe(true);
  });
  it("en otra GTF del mismo día y cliente SIN placa: duplicado sinPlaca, salvo que la línea venga en la lista confirmada", async () => {
    H.estado.filas[2].gtfDatos = { guia: { guiaRemisionNro: "EG07-12" }, destinatario: { nombre: "Maderas SAC" } };
    expect(await anotar("d1", "EG07-12")).toMatchObject({
      ok: false, reason: "duplicado", otroDespachoId: "d3", motivo: "no tiene placa para saber si es el mismo camión", sinPlaca: true,
    });
    expect(H.estado.escrituras).toBe(0);
    const conLista = await ForestCtpDespachoDB.anotarGuiaRemision(T, "d1", "EG07-12", { reemplazar: false, user: "blasadmin", viaje: ["d3"] });
    expect(conLista).toEqual({ ok: true, cambio: true, guiaRemisionNro: "EG07-12" });
  });
  it("con la MISMA placa en las dos sí se comparte sin lista; otra placa = otro camión", async () => {
    H.estado.filas[0].gtfDatos = { vehiculo: { placa: "W2D-853" }, destinatario: { nombre: "Maderas SAC" } };
    H.estado.filas[2].gtfDatos = { guia: { guiaRemisionNro: "EG07-12" }, vehiculo: { placa: "w2d853" }, destinatario: { nombre: "Maderas SAC" } };
    expect(await anotar("d1", "EG07-12")).toEqual({ ok: true, cambio: true, guiaRemisionNro: "EG07-12" });
    H.estado.filas[1].gtfDatos = { vehiculo: { placa: "W2D-853" }, destinatario: { nombre: "Maderas SAC" } };
    H.estado.filas[2].gtfDatos = { guia: { guiaRemisionNro: "EG07-12" }, vehiculo: { placa: "V2H-901" }, destinatario: { nombre: "Maderas SAC" } };
    expect(await anotar("d2", "EG07-12")).toMatchObject({ ok: false, reason: "duplicado", otroDespachoId: "d3", motivo: "otro camión (placa V2H901)" });
  });
  it("otra línea de la MISMA GTF la comparte; una línea sin GTF de otro día cuenta como otra", async () => {
    H.estado.filas[1].gtfDatos = { guia: { guiaRemisionNro: "EG07-12" } };
    expect((await anotar("d1", "EG07-12")).ok).toBe(true);
    H.estado.filas.push(despacho("d4", 4, null, "EG07-20", T, "2026-10-20"));
    expect(await anotar("d3", "EG07-20")).toMatchObject({ ok: false, reason: "duplicado", otroDespachoId: "d4", motivo: "salió otro día (20-10)" });
  });
  it("la de otro negocio no cuenta", async () => {
    H.estado.filas.push(despacho("x1", 1, "19-001-000099", "EG07-12", "t-otro", "2026-10-01"));
    expect((await anotar("d1", "EG07-12")).ok).toBe(true);
  });
});

describe("anotarGuiaRemisionEnViaje — una GRE para todo el camión", () => {
  const enViaje = (id: string, numero: string, viaje: string[], reemplazar = false) =>
    ForestCtpDespachoDB.anotarGuiaRemisionEnViaje(T, id, numero, { reemplazar, user: "blasadmin", viaje });
  it("la anota en las 3 líneas confirmadas (2 GTF), no en la de otro día ni en la de otro negocio", async () => {
    H.estado.filas.push(despacho("d5", 5, "19-001-000066", "", T, "2026-10-27"), despacho("x1", 1, "19-001-000064", "", "t-otro"));
    const r = await enViaje("d1", "EG07-189", ["d2", "d3"]);
    expect(r).toMatchObject({ ok: true, cambio: true, guiaRemisionNro: "EG07-189" });
    expect(r.ok && r.lineas.map((l) => [l.id, l.estado])).toEqual([["d1", "anotada"], ["d2", "anotada"], ["d3", "anotada"]]);
    expect(["d1", "d2", "d3", "d5", "x1"].map(greDe)).toEqual(["EG07-189", "EG07-189", "EG07-189", "", ""]);
  });
  it("sólo van las marcadas: sin d3 en la lista, d3 queda sin GRE", async () => {
    const r = await enViaje("d1", "EG07-189", ["d2"]);
    expect(r.ok && r.lineas.map((l) => l.id)).toEqual(["d1", "d2"]);
    expect(["d1", "d2", "d3"].map(greDe)).toEqual(["EG07-189", "EG07-189", ""]);
  });
  it("A placa ABC, B sin placa, C placa XYZ: abriendo B con A y C marcadas se rechaza sin escribir", async () => {
    H.estado.filas[0].gtfDatos = { vehiculo: { placa: "ABC-123" }, destinatario: { nombre: "Maderas SAC" } };
    H.estado.filas[2].gtfDatos = { vehiculo: { placa: "XYZ-789" }, destinatario: { nombre: "Maderas SAC" } };
    expect(await enViaje("d2", "EG07-189", ["d1", "d3"])).toEqual({ ok: false, reason: "grupo_incompatible", motivo: "#3 y #1: otro camión (placa XYZ789)" });
    expect(H.estado.escrituras).toBe(0);
    expect((await enViaje("d2", "EG07-189", ["d1"])).ok).toBe(true);
    expect(["d1", "d2", "d3"].map(greDe)).toEqual(["EG07-189", "EG07-189", ""]);
  });
  it("dos GRE distintas ya anotadas en el grupo = no es un viaje, ni con reemplazar", async () => {
    H.estado.filas[0].gtfDatos = { guia: { guiaRemisionNro: "EG07-98" }, destinatario: { nombre: "Maderas SAC" } };
    H.estado.filas[2].gtfDatos = { guia: { guiaRemisionNro: "EG07-99" }, destinatario: { nombre: "Maderas SAC" } };
    expect(await enViaje("d2", "EG07-189", ["d1", "d3"], true)).toEqual({ ok: false, reason: "gres_distintas", gres: ["EG07-98", "EG07-99"] });
    expect(H.estado.escrituras).toBe(0);
  });
  it("una GRE ya anotada en el viaje sólo se cambia con reemplazar (y entonces queda en todas)", async () => {
    H.estado.filas[2].gtfDatos = { guia: { guiaRemisionNro: "EG07-99" }, destinatario: { nombre: "Maderas SAC" } };
    expect(await enViaje("d2", "EG07-189", ["d1", "d3"])).toEqual({ ok: false, reason: "ya_tiene", actual: "EG07-99", lineNo: 3 });
    expect(H.estado.escrituras).toBe(0);
    const r = await enViaje("d2", "EG07-189", ["d1", "d3"], true);
    expect(r.ok && r.lineas.map((l) => l.estado)).toEqual(["anotada", "anotada", "anotada"]);
    expect(greDe("d3")).toBe("EG07-189");
  });
  it("una línea que no es de este negocio (o anulada) en la lista = linea_no_esta, sin escribir", async () => {
    H.estado.filas.push(despacho("x1", 4, "19-001-000064", "", "t-otro"));
    expect(await enViaje("d1", "EG07-189", ["d2", "x1"])).toEqual({ ok: false, reason: "linea_no_esta" });
    H.estado.filas[1].status = "anulado";
    expect(await enViaje("d1", "EG07-189", ["d2"])).toEqual({ ok: false, reason: "linea_no_esta" });
    expect(H.estado.escrituras).toBe(0);
  });
  it("si la propia rebota (GRE de otro viaje), no toca ninguna; reemplazar no acepta la de otro camión", async () => {
    H.estado.filas.push(despacho("d5", 5, "19-001-000066", "EG07-189", T, "2026-10-27"));
    expect(await enViaje("d1", "EG07-189", ["d2"])).toMatchObject({ ok: false, reason: "duplicado", otroDespachoId: "d5" });
    expect(await enViaje("d1", "EG07-189", ["d2"], true)).toMatchObject({ ok: false, reason: "duplicado", otroDespachoId: "d5" });
    expect(H.estado.escrituras).toBe(0);
  });
});

describe("anotarPlacaViaje — la placa del viaje sin tocar la casilla impresa", () => {
  const placa = (id: string, p: string, viaje: string[]) => ForestCtpDespachoDB.anotarPlacaViaje(T, id, p, { viaje, user: "blasadmin" });
  it("la escribe en ventaViaje de las marcadas sin placa; vehiculo.placa (31) queda vacío", async () => {
    H.estado.filas[0].gtfDatos = { vehiculo: { placa: "W2D-853" }, destinatario: { nombre: "Maderas SAC" } };
    expect(await placa("d2", "w2d 853", ["d1", "d3"])).toEqual({ ok: true, placa: "W2D853", anotadas: 2 });
    const d2 = H.estado.filas[1].gtfDatos as { vehiculo?: unknown; ventaViaje: { placa: string } };
    expect(d2.ventaViaje).toEqual({ placa: "W2D853" });
    expect(d2.vehiculo).toBeUndefined();
    expect(leerGtfDatos(d2).vehiculo.placa).toBe("");
    expect(H.estado.invalidados).toContain(`forest-ctp:${T}`);
    // Con la placa, la misma GRE ya no pide la lista: es el mismo camión probado.
    H.estado.filas[2].gtfDatos = { ...(H.estado.filas[2].gtfDatos as object), guia: { guiaRemisionNro: "EG07-12" } };
    expect((await anotar("d2", "EG07-12")).ok).toBe(true);
  });
  it("otra placa en el grupo = otro camión; placa que no se lee = placa_invalida; nada escrito", async () => {
    H.estado.filas[2].gtfDatos = { vehiculo: { placa: "V2H-901" }, destinatario: { nombre: "Maderas SAC" } };
    expect(await placa("d1", "W2D-853", ["d2", "d3"])).toEqual({ ok: false, reason: "otra_placa", placa: "V2H901", lineNo: 3 });
    expect(await placa("d1", "", ["d2"])).toMatchObject({ ok: false, reason: "placa_invalida" });
    expect(H.estado.escrituras).toBe(0);
  });
  it("un grupo de otro día no se junta con la placa", async () => {
    H.estado.filas[2].entryDate = new Date("2026-10-27T00:00:00Z");
    expect(await placa("d1", "W2D-853", ["d3"])).toEqual({ ok: false, reason: "grupo_incompatible", motivo: "#3 y #1: salió otro día (27-10)" });
  });
});

describe("ponerPrecioViaje — el precio del viaje en el libro", () => {
  type Extra = Partial<{ comprobante: { tipo: "factura" | "boleta"; numero: string } | null; reemplazar: boolean; viaje: string[]; liquidacion: number | null }>;
  /** Por defecto las tres del 28-10 confirmadas como el viaje. */
  const precio = (id: string, total: number, extra: Extra = {}) =>
    ForestCtpDespachoDB.ponerPrecioViaje(T, id, {
      total, comprobante: null, liquidacion: null, reemplazar: false, user: "blasadmin",
      viaje: ["d1", "d2", "d3"].filter((x) => x !== id), ...extra,
    });
  const valorDe = (id: string) => H.estado.filas.find((f) => f.id === id)?.valorVenta ?? null;
  it("reparte por PT al céntimo con el residuo en la última, anota la factura sin pisar la guía y no toca otro día", async () => {
    H.estado.filas.push(despacho("d5", 5, "19-001-000066", "", T, "2026-10-27"));
    const r = await precio("d2", 100, { comprobante: { tipo: "factura", numero: "E001-318" } });
    expect(r).toMatchObject({ ok: true, dia: "2026-10-28", guias: ["19-001-000064", "19-001-000065"], previo: null });
    expect(["d1", "d2", "d3", "d5"].map(valorDe)).toEqual([33.33, 33.33, 33.34, null]);
    const cuerpo = H.estado.filas[0].gtfDatos as { guia: { autoridad: string }; comprobante?: unknown; ventaViaje: unknown };
    expect(cuerpo.ventaViaje).toEqual({ comprobante: { tipo: "factura", numero: "E001-318" } });
    expect(cuerpo.comprobante).toBeUndefined();
    expect(cuerpo.guia.autoridad).toBe("ARFFS Ucayali");
    expect(H.estado.audit.map((a) => [a.action, a.entityId])).toEqual([["ctp_venta_set", "d1"], ["ctp_venta_set", "d2"], ["ctp_venta_set", "d3"]]);
    expect(H.estado.invalidados).toEqual([`forest-ctp:${T}`, expect.stringMatching(new RegExp(`:${T}:$`))]);
  });
  it("una línea sin volumen queda en null (nunca 0) y las demás suman el total", async () => {
    H.estado.filas[1].quantity = null;
    H.estado.filas[1].observations = null;
    expect((await precio("d1", 1000)).ok).toBe(true);
    expect(["d1", "d2", "d3"].map(valorDe)).toEqual([500, null, 500]);
  });
  it("con precio ya puesto no se pisa sin reemplazar; otro comprobante tampoco", async () => {
    H.estado.filas[0].valorVenta = 40;
    expect(await precio("d1", 100)).toEqual({ ok: false, reason: "ya_tiene_precio", previo: 40, conPrecio: 1, lineas: 3 });
    expect(H.estado.escrituras).toBe(0);
    expect((await precio("d1", 90, { reemplazar: true })).ok).toBe(true);
    expect(["d1", "d2", "d3"].map(valorDe)).toEqual([30, 30, 30]);
    H.estado.filas.forEach((f) => { f.valorVenta = null; });
    H.estado.filas[2].gtfDatos = { ventaViaje: { comprobante: { tipo: "factura", numero: "E001-300" } }, destinatario: { nombre: "Maderas SAC" } };
    expect(await precio("d1", 100, { comprobante: { tipo: "factura", numero: "E001-318" } })).toEqual({ ok: false, reason: "otro_comprobante", actual: "E001-300", lineNo: 3 });
    // Sin comprobante nuevo (el campo borrado) no pide reemplazar y el de antes queda.
    expect((await precio("d1", 100)).ok).toBe(true);
    expect((H.estado.filas[2].gtfDatos as { ventaViaje: unknown }).ventaViaje).toEqual({ comprobante: { tipo: "factura", numero: "E001-300" } });
  });
  it("sin la lista (cliente viejo) el precio va sólo a la línea abierta", async () => {
    expect((await precio("d2", 100, { viaje: [] })).ok).toBe(true);
    expect(["d1", "d2", "d3"].map(valorDe)).toEqual([null, 100, null]);
  });
  it("A/B/C abriendo desde B: A + C juntas se rechazan; dos GRE distintas también; nada escrito", async () => {
    H.estado.filas[0].gtfDatos = { vehiculo: { placa: "ABC-123" }, destinatario: { nombre: "Maderas SAC" } };
    H.estado.filas[2].gtfDatos = { vehiculo: { placa: "XYZ-789" }, destinatario: { nombre: "Maderas SAC" } };
    expect(await precio("d2", 100)).toEqual({ ok: false, reason: "grupo_incompatible", motivo: "#3 y #1: otro camión (placa XYZ789)" });
    H.estado.filas[0].gtfDatos = { guia: { guiaRemisionNro: "EG07-98" }, destinatario: { nombre: "Maderas SAC" } };
    H.estado.filas[2].gtfDatos = { guia: { guiaRemisionNro: "EG07-99" }, destinatario: { nombre: "Maderas SAC" } };
    expect(await precio("d2", 100, { reemplazar: true })).toEqual({ ok: false, reason: "gres_distintas", gres: ["EG07-98", "EG07-99"] });
    expect(H.estado.escrituras).toBe(0);
  });
  it("nunca S/ 0,00: un céntimo entre tres líneas se rechaza", async () => {
    expect(await precio("d1", 0.01)).toEqual({ ok: false, reason: "monto_muy_chico" });
    expect(H.estado.escrituras).toBe(0);
  });
  it("la GTF emitida no cambia en el papel: reimprimir tras poner precio da los mismos casilleros (20, 21 y 29 incluidos)", async () => {
    H.estado.filas[0].gtfDatos = {
      guia: { autoridad: "ARFFS Ucayali", guiaRemisionNro: "" },
      comprobante: { tipo: "guia_remision", numero: "EG07-189" },
      vehiculo: { placa: "W2D-853" },
      destinatario: { nombre: "Maderas SAC" },
    };
    const ficha = { nombreCtp: "CTP QA", razonSocial: "Aserradero QA SAC", ruc: "20123456789", codigoCtp: "CTP-25-001" } as unknown as CtpFicha;
    const imprimir = () =>
      casillerosGtf({
        ficha, datos: leerGtfDatos(H.estado.filas[0].gtfDatos), lineas: [], numeroGtf: "19-001-000064",
        fechaExpedicion: "2026-10-28", listasTrozas: "", gtfOrigen: "",
      });
    const antes = imprimir();
    expect(antes["29"]).toBe("EG07-189");
    expect((await precio("d1", 100, { comprobante: { tipo: "factura", numero: "E001-318" }, liquidacion: 26234.67 })).ok).toBe(true);
    expect((await precio("d1", 120, { comprobante: { tipo: "factura", numero: "E001-319" }, reemplazar: true })).ok).toBe(true);
    expect(imprimir()).toEqual(antes);
    expect((H.estado.filas[0].gtfDatos as { ventaViaje: unknown }).ventaViaje).toEqual({
      comprobante: { tipo: "factura", numero: "E001-319" }, liquidacion: 26234.67,
    });
  });
  it("si otro cambió una línea entre la lectura y la escritura, responde cambio", async () => {
    H.estado.trasLeer = () => { H.estado.filas[2].updatedAt = new Date("2026-10-29T00:00:00Z"); };
    expect(await precio("d1", 100)).toEqual({ ok: false, reason: "cambio" });
    expect(H.estado.audit).toHaveLength(0);
  });
});

describe("guardarGtfDatos — no borra la GRE anotada", () => {
  it("la casilla (25) vacía conserva la anotada; una nueva tipeada la cambia; invalida caché", async () => {
    H.estado.filas.push(despacho("b1", 5, null, "EG07-30"));
    const r = await ForestCtpDespachoDB.guardarGtfDatos(T, "b1", { guia: { autoridad: "ARFFS", guiaRemisionNro: "" } }, "blasadmin");
    expect(r).toEqual({ ok: true, datos: { guia: { autoridad: "ARFFS", guiaRemisionNro: "EG07-30" } } });
    expect(greDe("b1")).toBe("EG07-30");
    expect(H.estado.invalidados).toContain(`forest-ctp:${T}`);
    await ForestCtpDespachoDB.guardarGtfDatos(T, "b1", { guia: { guiaRemisionNro: "EG07-31" } }, "blasadmin");
    expect(greDe("b1")).toBe("EG07-31");
  });
  it("guardar el formulario no borra la placa ni la factura del viaje (ventaViaje)", async () => {
    H.estado.filas.push(despacho("b2", 6, null));
    H.estado.filas[3].gtfDatos = { ventaViaje: { placa: "W2D853", comprobante: { tipo: "factura", numero: "E001-318" } } };
    await ForestCtpDespachoDB.guardarGtfDatos(T, "b2", { guia: { autoridad: "ARFFS" } }, "blasadmin");
    expect((H.estado.filas[3].gtfDatos as { ventaViaje: unknown }).ventaViaje).toEqual({ placa: "W2D853", comprobante: { tipo: "factura", numero: "E001-318" } });
    expect(conservarDatosDelViaje({ a: 1 }, null)).toEqual({ a: 1 });
  });
  it("conservarGuiaRemision: sin nada anotado devuelve lo que llegó tal cual", () => {
    const datos = { guia: { guiaRemisionNro: "" } };
    expect(conservarGuiaRemision(datos, null)).toBe(datos);
    expect(conservarGuiaRemision(datos, { guia: {} })).toBe(datos);
  });
});
