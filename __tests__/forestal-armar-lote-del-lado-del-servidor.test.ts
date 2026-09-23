/**
 * Armar el lote de la propuesta, mirado desde el lado que ESCRIBE.
 *
 * `CtpVincularMateriaPrimaModal` arma el lote con dos llamadas de siempre
 * (`POST lotes-aserrio` + `PATCH accion:"agregar"`) y después confirma con
 * `sumar-corrida`. Todo lo que decide qué troza entra vivía en la pantalla:
 * `planearLoteDesdePropuesta` y `proponerVinculacion` filtran la madera que no
 * llegó y la mezcla de permisos, pero el endpoint las aceptaba igual. Una regla
 * que vive sólo en la pantalla la saltea cualquier POST.
 *
 * Los números de acá salen de `inversiones-agroforestales-blas-sociedad-anonima`
 * medido el 2026-09-19 (sólo lectura):
 *
 * | Lo medido                                        | Valor            |
 * |--------------------------------------------------|------------------|
 * | trozas libres en el patio                         | 156              |
 * | …de guías todavía `pendiente`                     | 119 · 160,406 m³ |
 * | …de una guía `rechazado`                          | 34 · 20,687 m³   |
 * | …de una guía `validado` (las únicas usables)      | 3 · 6,183 m³     |
 * | Tornillo libre repartido en DOS títulos           | 65 + 49 trozas   |
 *
 * Contra la base simulada y no contra una función pura: lo que importa es qué
 * quedó escrito y qué se devolvió como rechazado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  /** Una troza del patio de Blas: guía recibida, Tornillo, con su permiso. */
  const troza = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    codificacion: id,
    codigoPlanta: null,
    especieComun: "Tornillo",
    volumenM3: 1.5,
    consumidaEnId: null,
    noRecepcionada: false,
    descarte: false,
    fechaRecepcion: null,
    loteAserrioId: null,
    _count: { retrozos: 0 },
    despachadaEn: null,
    entry: {
      status: "validado",
      deletedAt: null,
      fechaRecepcion: null,
      gtfNumber: "010-001-0000013",
      originCode: "19-SEC/REG-PLT-2021-017",
    },
    ...over,
  });

  const estado = {
    lote: {
      id: "L1",
      code: "LA-2026-004",
      status: "abierto",
      speciesCommon: "Tornillo",
      permiso: "19-SEC/REG-PLT-2021-017" as string | null,
    },
    pedidas: [] as ReturnType<typeof troza>[],
    escritas: [] as string[],
    /** Lo que quedó escrito en las trozas: se afirma sobre esto, no sobre el retorno. */
    datos: [] as Record<string, unknown>[],
  };

  const tx = {
    forestLoteAserrio: { findFirst: async () => estado.lote },
    woodEntryTroza: {
      findMany: async () => estado.pedidas,
      updateMany: async (args: {
        where: { id: { in: string[] } };
        data: Record<string, unknown>;
      }) => {
        estado.escritas.push(...args.where.id.in);
        estado.datos.push(args.data);
        return { count: args.where.id.in.length };
      },
    },
  };
  return { estado, tx, troza };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(H.tx) },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {} }));

const { ForestLoteAserrioDB } = await import("@/lib/db/forest-lote-aserrio.db");

const motivoDe = (r: { rechazadas: { id: string; motivo: string }[] }, id: string) =>
  r.rechazadas.find((x) => x.id === id)?.motivo ?? null;

beforeEach(() => {
  H.estado.lote = {
    id: "L1",
    code: "LA-2026-004",
    status: "abierto",
    speciesCommon: "Tornillo",
    permiso: "19-SEC/REG-PLT-2021-017",
  };
  H.estado.pedidas = [];
  H.estado.escritas = [];
  H.estado.datos = [];
});

describe("agregarTrozas — la madera que NO puede entrar al lote", () => {
  it("la guía todavía no se recibió: no entra, y el motivo dice dónde recibirla", async () => {
    /* El caso que manda en Blas: 119 de las 156 trozas libres cuelgan de guías
       `pendiente`. La pantalla nunca las ofrece; el POST las aceptaba. */
    H.estado.pedidas = [
      H.troza("sin-recibir", {
        entry: {
          status: "pendiente",
          deletedAt: null,
          fechaRecepcion: null,
          gtfNumber: "010-001-0000099",
          originCode: "19-SEC/REG-PLT-2021-017",
        },
      }),
    ];

    const r = await ForestLoteAserrioDB.agregarTrozas("t-blas", "L1", ["sin-recibir"], "qa");

    expect(r.agregadas).toBe(0);
    expect(H.estado.escritas).toEqual([]);
    expect(motivoDe(r, "sin-recibir")).toContain("010-001-0000099");
    expect(motivoDe(r, "sin-recibir")).toContain("Ingresos");
  });

  it("la guía se recibió por fecha aunque siga `pendiente`: entra", async () => {
    /* Una guía de sesenta trozas se descarga en dos viajes (ADR-336): la marca
       de la PIEZA alcanza. Filtrar de más dejaría afuera madera que sí llegó. */
    H.estado.pedidas = [
      H.troza("llego-hoy", {
        fechaRecepcion: new Date("2026-09-18T12:00:00Z"),
        entry: {
          status: "pendiente",
          deletedAt: null,
          fechaRecepcion: null,
          gtfNumber: "010-001-0000099",
          originCode: "19-SEC/REG-PLT-2021-017",
        },
      }),
    ];

    const r = await ForestLoteAserrioDB.agregarTrozas("t-blas", "L1", ["llego-hoy"], "qa");

    expect(r.rechazadas).toEqual([]);
    expect(H.estado.escritas).toEqual(["llego-hoy"]);
  });

  it("de otro título habilitante: no entra (ADR-393), y se nombran los dos permisos", async () => {
    H.estado.pedidas = [
      H.troza("otro-permiso", {
        entry: {
          status: "validado",
          deletedAt: null,
          fechaRecepcion: null,
          gtfNumber: "010-001-0000020",
          originCode: "19-SEC/REG-PLT-2018-020",
        },
      }),
    ];

    const r = await ForestLoteAserrioDB.agregarTrozas("t-blas", "L1", ["otro-permiso"], "qa");

    expect(r.agregadas).toBe(0);
    expect(motivoDe(r, "otro-permiso")).toContain("19-SEC/REG-PLT-2018-020");
    expect(motivoDe(r, "otro-permiso")).toContain("19-SEC/REG-PLT-2021-017");
  });

  it("un lote sin permiso declarado sigue aceptando cualquier título: no rompe lo viejo", async () => {
    H.estado.lote.permiso = null;
    H.estado.pedidas = [
      H.troza("vieja", {
        entry: {
          status: "validado",
          deletedAt: null,
          fechaRecepcion: null,
          gtfNumber: "010-001-0000020",
          originCode: "19-SEC/REG-PLT-2018-020",
        },
      }),
    ];

    const r = await ForestLoteAserrioDB.agregarTrozas("t-blas", "L1", ["vieja"], "qa");

    expect(r.rechazadas).toEqual([]);
    expect(H.estado.escritas).toEqual(["vieja"]);
  });

  it("ya consumida, descarte, madre retrozada y sin volumen: ninguna entra (T1/ADR-326)", async () => {
    H.estado.pedidas = [
      H.troza("consumida", { consumidaEnId: "corrida-9" }),
      H.troza("descarte", { descarte: true }),
      H.troza("madre", { _count: { retrozos: 2 } }),
      H.troza("sin-volumen", { volumenM3: 0 }),
      H.troza("guia-anulada", {
        entry: {
          status: "rechazado",
          deletedAt: null,
          fechaRecepcion: null,
          gtfNumber: "010-001-0000077",
          originCode: "19-SEC/REG-PLT-2021-017",
        },
      }),
      H.troza("buena"),
    ];

    const r = await ForestLoteAserrioDB.agregarTrozas(
      "t-blas",
      "L1",
      ["consumida", "descarte", "madre", "sin-volumen", "guia-anulada", "buena"],
      "qa",
    );

    /* Que cinco no entren NO obliga a rehacer la selección: la que sirve entra
       y cada rechazo sale con su motivo. */
    expect(H.estado.escritas).toEqual(["buena"]);
    expect(r.agregadas).toBe(1);
    expect(r.rechazadas.map((x) => x.id).sort()).toEqual(
      ["consumida", "descarte", "guia-anulada", "madre", "sin-volumen"].sort(),
    );
    expect(motivoDe(r, "consumida")).toContain("ya entró a una corrida");
    expect(motivoDe(r, "madre")).toContain("pedazos");
  });

  it("armar el lote APARTA la madera: no la consume ni le atribuye una corrida", async () => {
    /* Vincular sigue siendo un acto explícito. Acá sólo se escribe el lote de
       la pieza; el consumo (`consumidaEnId`) y la atribución por guía los
       escribe `sumar-corrida` cuando quien registra confirma. Si esto tocara
       `consumidaEnId`, armar el lote estaría declarando un consumo que nadie
       firmó — y el tope del 56 % y el `≤` se evalúan del otro lado
       (`forestal-rendimiento-al-vincular.test.ts`). */
    H.estado.pedidas = [H.troza("a"), H.troza("b")];

    await ForestLoteAserrioDB.agregarTrozas("t-blas", "L1", ["a", "b"], "qa");

    expect(H.estado.datos).toEqual([{ loteAserrioId: "L1" }]);
  });

  it("una troza de OTRO centro no desaparece en silencio: sale rechazada", async () => {
    /* `findMany` filtra por `tenantId`: el id ajeno no vuelve del query. Antes
       la respuesta decía «0 rechazadas» y quien mandó tres ids creía que
       entraron tres. Verificado además contra el endpoint real con la sesión
       de `main` y una troza de Blas (2026-09-19). */
    H.estado.pedidas = [H.troza("propia")];

    const r = await ForestLoteAserrioDB.agregarTrozas(
      "t-blas",
      "L1",
      ["propia", "de-otro-tenant", "de-otro-tenant"],
      "qa",
    );

    expect(H.estado.escritas).toEqual(["propia"]);
    expect(r.rechazadas).toEqual([
      { id: "de-otro-tenant", codigo: null, motivo: "no existe en este centro" },
    ]);
  });

  it("tenantId es obligatorio: sin él no se escribe nada", async () => {
    await expect(ForestLoteAserrioDB.agregarTrozas("", "L1", ["x"], "qa")).rejects.toThrow(
      "tenantId is required",
    );
    expect(H.estado.escritas).toEqual([]);
  });
});
