/**
 * POST /api/admin/forestal/distribuciones/recorrido — revisión de ADR-519.
 *
 * Lo que se prueba es la RECUPERACIÓN: un pedido que se cortó entre escribir
 * y anotar el bloque no traba el Recorrido. El segundo POST ADOPTA lo que
 * quedó (el lote creado, la corrida declarada) en vez de intentar crearlo de
 * nuevo o devolver `JORNADA_NO_REGISTRABLE`. Además: el corte de días sin
 * aserrada (`SIN_DIAS_LISTOS`), `usadoM3` en el cuerpo, `SIN_ROL` y un
 * negocio ajeno (404).
 *
 * Las DB classes van en memoria (estado `S`); el plan (`planLibroDeBloque`),
 * la derivación y la adopción (`jornadasHuerfanas`) son las de verdad.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Troza = { id: string; codigo: string; volumenM3: number; loteId: string | null; consumidaEnId: string | null };
type Corrida = { id: string; lineNo: number; viva: boolean; quantity: number | null; volumeInputM3: number; unit: string; entryDate: Date; observations: string | null };
type Lote = { id: string; code: string; status: string; corridas: Corrida[] };
type Bloque = Record<string, unknown> & { id: string; loteId?: string | null };

const PERMISO = "25-UCA/C-J-001-20";
const TENANT = "t-qa";

const S = vi.hoisted(() => ({
  trozas: new Map<string, Troza>(),
  lotes: new Map<string, Lote>(),
  dist: null as unknown as { id: string; bloques: Bloque[] },
  /** Las otras distribuciones guardadas del negocio (copias, rehechas). */
  otras: [] as { id: string; nombre: string; bloques: Bloque[] }[],
  /** Cuántas anotaciones sueltas fallan antes de andar (la red que se corta). */
  fallarAnotar: 0,
  /** Cuántas jornadas quedan escritas en el Libro SIN anotar el bloque (huérfanas). */
  huerfanaJornada: 0,
  rol: "admin",
  tenant: "t-qa",
  crearLote: vi.fn(),
  registrar: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async () => ({ tenantId: S.tenant, role: S.rol, username: "qaadmin" }),
}));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn() }));
vi.mock("@/lib/db/forest-anexos.db", () => ({ ForestAnexosDB: { list: async () => [], salidasPorRegistrar: async () => [] } }));
vi.mock("@/lib/db/forest-ctp.db", () => ({
  ForestCtpDB: { codigosDePaquete: async () => [], despachosConGuiaPorIds: async () => [] },
}));

const bloqueDe = () => S.dist.bloques[0];
const aplicar = (cambio: (b: Bloque) => Partial<Bloque>) => {
  const b = bloqueDe();
  S.dist.bloques[0] = { ...b, ...cambio(b) };
  return S.dist.bloques[0];
};
const trozasDelLote = (loteId: string) => [...S.trozas.values()].filter((t) => t.loteId === loteId);

vi.mock("@/lib/db/forest-distribuciones.db", () => ({
  ForestDistribucionesDB: {
    list: async (tenantId: string) => (tenantId === TENANT ? [structuredClone(S.dist), ...structuredClone(S.otras)] : []),
    anotarBloque: async (_t: string, _d: string, _b: string, cambio: (b: Bloque) => Partial<Bloque>) => {
      if (S.fallarAnotar > 0) {
        S.fallarAnotar--;
        throw new Error("se cortó la red al anotar");
      }
      return aplicar(cambio);
    },
  },
}));

vi.mock("@/lib/db/forest-lote-aserrio.db", () => ({
  ForestLoteAserrioDB: {
    list: async (_t: string, { ids }: { ids: string[] }) =>
      ids
        .map((id) => S.lotes.get(id))
        .filter(Boolean)
        .map((l) => ({ ...l, volumenM3: 0, trozas: trozasDelLote(l!.id).map((t) => ({ ...t })) })),
    elegiblesDe: async (_t: string, ids: string[]) => ({
      trozas: ids.map((id) => {
        const t = S.trozas.get(id)!;
        return { ...t, permiso: PERMISO, porRecepcionar: false, motivo: null };
      }),
      noEncontradas: [],
    }),
    /* La misma regla que la DB class: todas las que tienen lote, en UNO vivo sin piezas ajenas. */
    loteVivoDeTrozas: async (_t: string, ids: string[]) => {
      const lotes = [...new Set(ids.map((id) => S.trozas.get(id)?.loteId).filter(Boolean))] as string[];
      const l = lotes.length === 1 ? S.lotes.get(lotes[0]) : undefined;
      if (!l || l.status !== "abierto") return null;
      return trozasDelLote(l.id).every((t) => ids.includes(t.id)) ? { id: l.id, code: l.code } : null;
    },
  },
}));

vi.mock("@/lib/db/forest-lote-propuesta.db", () => ({
  ForestLotePropuestaDB: {
    crearPorBloques: async (_t: string, pedidos: { trozaIds: string[] }[]) => {
      S.crearLote();
      S.lotes.set("lote-1", { id: "lote-1", code: "LA-1", status: "abierto", corridas: [] });
      for (const id of pedidos[0].trozaIds) S.trozas.get(id)!.loteId = "lote-1";
      return { creados: [{ loteId: "lote-1", code: "LA-1" }], noCreados: [] };
    },
  },
}));

/* La jornada: escribe la corrida en el Libro y anota el bloque. Con
   `huerfanaJornada` deja el Libro escrito y el bloque sin saberlo — lo que un
   corte dejaba antes de la tx única, o la marca de otra pantalla que no llegó. */
vi.mock("@/lib/db/forest-jornada-bloque.db", () => ({
  ForestJornadaBloqueDB: {
    registrarJornada: async (
      _t: string,
      input: { loteId: string; trozaIds: string[]; fecha: Date; produccion: { quantity: number; observations: string } },
      anotarEn: { parche: (b: Bloque, c: { id: string; lineNo: number }) => Partial<Bloque> },
    ) => {
      S.registrar(input);
      const lote = S.lotes.get(input.loteId)!;
      const corrida = { id: `c-${lote.corridas.length + 31}`, lineNo: lote.corridas.length + 31 };
      lote.corridas.push({ ...corrida, viva: true, quantity: input.produccion.quantity, volumeInputM3: 2, unit: "m3", entryDate: input.fecha, observations: input.produccion.observations });
      for (const id of input.trozaIds) S.trozas.get(id)!.consumidaEnId = corrida.id;
      if (S.huerfanaJornada > 0) {
        S.huerfanaJornada--;
        throw new Error("se cortó la red después del Libro");
      }
      const bloque = aplicar((b) => anotarEn.parche(b, corrida));
      return { corrida, piezas: input.trozaIds.length, volumenM3: 2, yaEstaba: false, rechazadas: [], bloque };
    },
  },
}));

import { POST } from "@/app/api/admin/forestal/distribuciones/recorrido/route";

const medida = { clave: "m1", medida: '1" x 8" x 10\'', espesor: 1, ancho: 8, largo: 10, uEspesor: "in", uAncho: "in", uLargo: "ft", m3: 0.5, pieTablar: 212, piezas: 10 };
const DIA_1 = { dia: 1, piezas: 10, pieTablar: 212, m3: 0.5, grupos: [{ clave: "g1", label: "Tablas 1x8", m3: 0.5, pieTablar: 212, piezas: 10, medidas: [medida] }] };

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest("https://host/api/admin/forestal/distribuciones/recorrido", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ distribucionId: "d1", bloqueId: "b1", ...body }),
    }),
  );

type Respuesta = {
  estado: { siguiente: string | null; amparadoM3: number; pasos: { paso: string; estado: string; code?: string; motivo?: string }[] };
  ejecutados: { paso: string; detalle: string }[];
  continuar: boolean;
};
const leerJson = async (r: Response) => (await r.json()) as Respuesta;
const paso = (j: Respuesta, p: string) => j.estado.pasos.find((x) => x.paso === p);

beforeEach(() => {
  S.trozas.clear();
  S.lotes.clear();
  for (const id of ["t1", "t2"]) S.trozas.set(id, { id, codigo: id.toUpperCase(), volumenM3: 1, loteId: null, consumidaEnId: null });
  S.dist = {
    id: "d1",
    bloques: [
      {
        id: "b1",
        etiqueta: "B1",
        especie: "Cachimbo",
        m3: 2,
        origen: "trozas",
        trozaIds: ["t1", "t2"],
        trozasElegidas: ["t1", "t2"],
        dias: 1,
        aprovechablePct: 50,
        permiso: PERMISO,
        fecha: "2026-10-20",
      },
    ],
  };
  S.otras = [];
  S.fallarAnotar = 0;
  S.huerfanaJornada = 0;
  S.rol = "admin";
  S.tenant = TENANT;
  S.crearLote.mockClear();
  S.registrar.mockClear();
});

describe("Recorrido: un pedido cortado no traba el siguiente (A1)", () => {
  it("lote creado y no anotado → el segundo POST lo ADOPTA, no crea otro", async () => {
    S.fallarAnotar = 1;
    const r1 = await leerJson(await post({ hasta: "lote" }));
    expect(paso(r1, "lote")?.estado).not.toBe("hecho");
    expect(bloqueDe().loteId).toBeUndefined();

    const r2 = await leerJson(await post({ hasta: "lote" }));
    expect(S.crearLote).toHaveBeenCalledTimes(1);
    expect(bloqueDe().loteId).toBe("lote-1");
    expect(r2.ejecutados).toEqual([{ paso: "lote", detalle: "Lote LA-1 (ya estaba creado)" }]);
    expect(paso(r2, "lote")?.estado).toBe("hecho");
  });

  it("corrida en el Libro sin anotar → el segundo POST anota el día, sin JORNADA_NO_REGISTRABLE ni otra corrida", async () => {
    S.huerfanaJornada = 1;
    const r1 = await leerJson(await post({ porDia: [DIA_1] }));
    expect(S.registrar).toHaveBeenCalledTimes(1);
    expect(r1.ejecutados.map((e) => e.paso)).toEqual(["lote"]);
    expect(bloqueDe().jornadasLibro ?? []).toEqual([]);

    const r2 = await leerJson(await post({ porDia: [DIA_1] }));
    expect(S.registrar).toHaveBeenCalledTimes(1);
    expect(bloqueDe().jornadasLibro).toEqual([{ dia: 1, corridaId: "c-31", lineNo: 31, estado: "declarada", fecha: "2026-10-20" }]);
    expect(r2.ejecutados).toEqual([{ paso: "jornadas", detalle: "Día 1 · corrida N° 31 (ya estaba en el Libro)" }]);
    expect(paso(r2, "jornadas")).toMatchObject({ estado: "hecho" });
    expect(paso(r2, "jornadas")?.code).not.toBe("JORNADA_NO_REGISTRABLE");
  });

  it("el camino feliz: lote y día en un POST, la nota nombra el bloque (B5)", async () => {
    const r = await leerJson(await post({ porDia: [DIA_1] }));
    expect(r.ejecutados.map((e) => e.paso)).toEqual(["lote", "jornadas"]);
    expect(S.registrar.mock.calls[0][0]).toMatchObject({
      observaciones: "Jornada 1 de 1 · bloque B1 · recorrido del permiso",
      produccion: { observations: "Jornada 1 de 1 · bloque B1 · recorrido del permiso" },
    });
    expect(bloqueDe().corridaIds).toEqual(["c-31"]);
  });
});

describe("Recorrido: lo que antes cortaba en silencio", () => {
  it("días sin aserrada repartida → con_problema SIN_DIAS_LISTOS con su motivo", async () => {
    const r = await leerJson(await post({ porDia: [{ dia: 1, piezas: 0, pieTablar: 0, m3: 0, grupos: [] }] }));
    expect(S.registrar).not.toHaveBeenCalled();
    expect(paso(r, "jornadas")).toMatchObject({
      estado: "con_problema",
      code: "SIN_DIAS_LISTOS",
      motivo: "No hay aserrada repartida en este bloque: carga lo aserrado en el cubicador.",
    });
  });

  it("`porDia` vacío → también SIN_DIAS_LISTOS", async () => {
    const r = await leerJson(await post({ porDia: [] }));
    expect(paso(r, "jornadas")).toMatchObject({ estado: "con_problema", code: "SIN_DIAS_LISTOS" });
  });

  it("`usadoM3` del cuerpo manda en el estado que devuelve el POST", async () => {
    const r = await leerJson(await post({ hasta: "lote", usadoM3: 0 }));
    expect(r.estado.amparadoM3).toBe(0);
  });

  it("un almacenero no declara: SIN_ROL (SIN_PERMISO queda para el permiso forestal)", async () => {
    S.rol = "almacenero";
    const r = await leerJson(await post({ porDia: [DIA_1] }));
    expect(S.registrar).not.toHaveBeenCalled();
    expect(paso(r, "jornadas")).toMatchObject({ estado: "con_problema", code: "SIN_ROL" });
  });

  it("la distribución de otro negocio no existe para este: 404 y nada escrito", async () => {
    S.tenant = "t-ajeno";
    const r = await post({ porDia: [DIA_1] });
    expect(r.status).toBe(404);
    expect(S.crearLote).not.toHaveBeenCalled();
    expect(S.registrar).not.toHaveBeenCalled();
  });
});

describe("Recorrido: lo de otro bloque no se adopta (2.ª revisión)", () => {
  /* Una copia de la distribución con las mismas trozas: el bloque A original ya tiene el lote y su corrida. */
  const sembrarOriginal = (bloqueOriginal: Partial<Bloque>) => {
    S.lotes.set("lote-1", { id: "lote-1", code: "LA-1", status: "abierto", corridas: [] });
    for (const t of S.trozas.values()) t.loteId = "lote-1";
    S.otras = [{ id: "d0", nombre: "Octubre", bloques: [{ ...bloqueDe(), id: "bA", etiqueta: "A", ...bloqueOriginal }] }];
  };

  it("el lote de las mismas trozas ya es de otro bloque → no lo adopta ni crea otro, y dice de quién es", async () => {
    sembrarOriginal({ loteId: "lote-1" });
    const r = await leerJson(await post({ porDia: [DIA_1] }));
    expect(bloqueDe().loteId).toBeUndefined();
    expect(S.crearLote).not.toHaveBeenCalled();
    expect(S.registrar).not.toHaveBeenCalled();
    expect(r.ejecutados).toEqual([]);
    expect(paso(r, "lote")).toMatchObject({ estado: "con_problema", code: "LOTE_DE_OTRO_BLOQUE" });
    expect(paso(r, "lote")?.motivo).toContain("es del bloque A de la distribución Octubre");
  });

  it("la corrida del día ya es de otro bloque → no la adopta y lo dice", async () => {
    sembrarOriginal({ jornadasLibro: [{ dia: 1, corridaId: "c-31", lineNo: 31, estado: "declarada", fecha: "2026-10-20" }] });
    S.dist.bloques[0] = { ...bloqueDe(), loteId: "lote-1" };
    S.lotes.get("lote-1")!.corridas.push({
      id: "c-31", lineNo: 31, viva: true, quantity: 0.5, volumeInputM3: 2, unit: "m3",
      entryDate: new Date("2026-10-20T12:00:00Z"), observations: "Jornada 1 de 1 · bloque B1 · recorrido del permiso",
    });
    for (const t of S.trozas.values()) t.consumidaEnId = "c-31";
    const r = await leerJson(await post({ porDia: [DIA_1] }));
    expect(bloqueDe().jornadasLibro ?? []).toEqual([]);
    expect(S.registrar).not.toHaveBeenCalled();
    expect(paso(r, "jornadas")).toMatchObject({ estado: "con_problema", code: "CORRIDA_DE_OTRO_BLOQUE" });
    expect(paso(r, "jornadas")?.motivo).toContain("corrida N° 31 del día 1 ya es del bloque A de la distribución Octubre");
  });
});
