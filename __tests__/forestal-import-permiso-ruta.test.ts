// @vitest-environment node
/**
 * ADR-503 — el permiso del archivo por la RUTA del import del libro.
 *
 *  · asignar el origen legal es de admin/dueño: el almacenero (o el encargado,
 *    que `requireAdmin` deja pasar) con `asignacion` → 403; sin ella importa
 *    como siempre;
 *  · el permiso tiene que ser del catálogo de ESTE negocio y vivo → 422;
 *  · ingreso vacío → se escribe; con otro código → se respeta el suyo;
 *  · corrida sin consumo → se escribe; con consumo → hereda;
 *  · guía que ya estaba → `TituloGuiaDB.declarar` (sólo lo vacío).
 *
 * Sin base: las clases de lib/db simuladas; la regla pura es la real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => {
  const contrato = {
    id: "c1",
    codigo: "PER-FMP-2024-0012",
    resolucionNumero: "R.D. 045-2024",
    titularNombre: "Comunidad Nativa Santa Rosa",
    titularDoc: "20601234567",
    titularDocTipo: "RUC",
    isActive: true,
  };
  return {
    contrato,
    auth: { tenantId: "t1", role: "admin", username: "qa" } as { tenantId: string; role: string; username: string },
    /** Lo que devuelve `comparablesPorGuia`: los ingresos con ese N° de CUALQUIER permiso (ADR-504). */
    existentes: new Map<string, Record<string, unknown>[]>(),
    /** Lo que devuelve `guiasDeConsumos` por N° (sin entrada = «ninguna»). */
    guiaConsumo: new Map<string, Record<string, unknown>>(),
    idPorCodigo: vi.fn(),
    requireAdmin: vi.fn(),
    getContrato: vi.fn(),
    createIngreso: vi.fn(),
    createCorrida: vi.fn(),
    planear: vi.fn(),
    declarar: vi.fn(),
    completar: vi.fn(),
    agregarTrozas: vi.fn(),
    buscarTroza: vi.fn(),
    marcarConsumidas: vi.fn(),
    audit: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: H.audit }));
vi.mock("@/lib/forestal/acomodar-trozas", () => ({ fraseDeColocacion: () => "" }));
vi.mock("@/lib/db/activity-log.db", () => ({ ActivityLogDB: { list: vi.fn(async () => []) } }));
vi.mock("@/lib/db/forest-contrato.db", () => ({ ForestContratoDB: { get: H.getContrato, idPorCodigo: H.idPorCodigo } }));
vi.mock("@/lib/db/forest-titulo-guia.db", () => ({ TituloGuiaDB: { planear: H.planear, declarar: H.declarar, completarProveedorDeRelleno: H.completar } }));
vi.mock("@/lib/db/wood-entries.db", () => ({
  WoodEntriesDB: {
    comparablesPorGuia: vi.fn(async () => H.existentes),
    guiasDeConsumos: vi.fn(async (_t: string, gtfs: string[]) => new Map(gtfs.map((g) => [g, H.guiaConsumo.get(g) ?? { estado: "ninguna" }]))),
    create: H.createIngreso,
    validate: vi.fn(),
    agregarTrozas: H.agregarTrozas,
    buscarTrozaPorCodigo: H.buscarTroza,
    marcarTrozasConsumidas: H.marcarConsumidas,
  },
}));
vi.mock("@/lib/db/forest-ctp.db", async () => {
  const claves = await vi.importActual<typeof import("@/lib/forestal/ctp-claves-import")>("@/lib/forestal/ctp-claves-import");
  return {
    ForestCtpDB: {
      existingProduccionKeys: vi.fn(async () => new Map()),
      codigosDePaqueteEnUso: vi.fn(async () => new Set()),
      create: H.createCorrida,
      existingDespachoKeys: vi.fn(async () => new Set()),
      despachoComparableByGtf: vi.fn(async () => new Map()),
    },
    produccionKey: claves.produccionKey,
    produccionKeyBase: claves.produccionKeyBase,
    despachoKey: () => "k",
  };
});

import { POST } from "@/app/api/admin/forestal/wood-entries/import/route";

const llamar = (body: Record<string, unknown>) =>
  POST(
    new NextRequest("http://localhost/api/admin/forestal/wood-entries/import", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({}) },
  );

const ingreso = (p: Record<string, unknown> = {}) => ({
  gtfNumber: "019-0000101",
  providerName: "Origen X · 019-0000101",
  speciesCommonName: "Tornillo",
  volumeM3: 3.2,
  ...p,
});

beforeEach(() => {
  vi.clearAllMocks();
  H.auth = { tenantId: "t1", role: "admin", username: "qa" };
  H.existentes.clear();
  H.guiaConsumo.clear();
  H.idPorCodigo.mockResolvedValue(null);
  H.requireAdmin.mockImplementation(async () => H.auth);
  H.getContrato.mockImplementation(async (t: string, id: string) => (t === "t1" && id === "c1" ? H.contrato : null));
  H.createIngreso.mockImplementation(async (_t: string, input: { speciesCommonName: string }) => ({
    id: "w-nuevo",
    speciesCommonName: input.speciesCommonName,
    acomodo: { aOtrasFilas: [], fueraDeSuFila: [], yaEstabanEnSuFila: [], avisos: [] },
  }));
  H.createCorrida.mockImplementation(async () => ({ id: "p-nueva" }));
  H.completar.mockResolvedValue([]);
  H.agregarTrozas.mockResolvedValue({ agregadas: 0, repetidas: [] });
  H.buscarTroza.mockImplementation(async () => ({ estado: "una", troza: { id: "tz1" } }));
});

/** El ingreso que ya está en la base, como lo devuelve `comparablesPorGuia`. */
const enLaBase = (gtf: string, p: Record<string, unknown> = {}) => {
  const lista = H.existentes.get(gtf) ?? [];
  const i = { id: "w1", gtfNumber: gtf, contratoId: null, originCode: null, volumeM3: 3.2, speciesCommonName: "Tornillo", productType: "rolliza", providerName: "x", ...p };
  // El relleno «Origen X · GTF» no es un titular (como `comparablesPorGuia`).
  const titular = /^Origen .+ · .+$/.test(String(i.providerName)) ? null : i.providerName;
  lista.push({ titular, especies: [i.speciesCommonName], libroNro: null, ...i });
  H.existentes.set(gtf, lista);
};
const planDe = (escribir: Record<string, string> | null) => ({
  gtf: "019-0000101",
  originCode: "PER-FMP-2024-0012",
  originSourceNumber: null,
  contratoId: "c1",
  ingresos: [{ id: "w1", especie: "Tornillo", status: "validado", anulado: false, originCode: null, originSourceNumber: null, contratoId: null, periodoCerrado: null }],
  planes: [{ id: "w1", especie: "Tornillo", escribir, motivo: escribir ? null : "ya tenía ese título", razon: escribir ? null : "igual" }],
});

describe("quién puede asignar y qué permiso", () => {
  it("almacenero con asignación → 403, sin leer el catálogo ni escribir", async () => {
    H.auth = { tenantId: "t1", role: "almacenero", username: "alm" };
    const r = await llamar({ mode: "commit", ingresos: [ingreso()], asignacion: { contratoId: "c1" } });
    expect(r.status).toBe(403);
    expect(H.getContrato).not.toHaveBeenCalled();
    expect(H.createIngreso).not.toHaveBeenCalled();
  });

  it("el encargado (manager) tampoco: requireAdmin lo deja pasar, soloAdminODueno no", async () => {
    H.auth = { tenantId: "t1", role: "manager", username: "enc" };
    expect((await llamar({ mode: "preview", ingresos: [ingreso()], asignacion: { contratoId: "c1" } })).status).toBe(403);
  });

  it("sin asignación el almacenero importa como hoy, sin permiso en la respuesta", async () => {
    H.auth = { tenantId: "t1", role: "almacenero", username: "alm" };
    const r = await llamar({ mode: "commit", ingresos: [ingreso({ originCode: null })] });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.resumen.permiso).toBeUndefined();
    expect(j.detalle[0].permiso).toBeUndefined();
    const input = H.createIngreso.mock.calls[0][1];
    expect(input.originCode).toBeNull();
    expect(input).not.toHaveProperty("contratoId");
    expect(input.providerName).toBe("Origen X · 019-0000101");
  });

  it("permiso de OTRO negocio → 422 (el get filtra por tenant) y no se escribe", async () => {
    H.auth = { tenantId: "t2", role: "owner", username: "dueno" };
    const r = await llamar({ mode: "commit", ingresos: [ingreso()], asignacion: { contratoId: "c1" } });
    expect(r.status).toBe(422);
    expect(H.getContrato).toHaveBeenCalledWith("t2", "c1");
    expect(H.createIngreso).not.toHaveBeenCalled();
  });

  it("permiso dado de baja → 422", async () => {
    H.getContrato.mockResolvedValueOnce({ ...H.contrato, isActive: false });
    expect((await llamar({ mode: "preview", ingresos: [ingreso()], asignacion: { contratoId: "c1" } })).status).toBe(422);
  });
});

describe("ingresos (Sección 1 / patio)", () => {
  it("vacío → asignado: código, resolución, vínculo y titular+RUC en lugar del relleno", async () => {
    const r = await llamar({ mode: "commit", fileName: "s1.xlsx", ingresos: [ingreso()], asignacion: { contratoId: "c1" } });
    const j = await r.json();
    const input = H.createIngreso.mock.calls[0][1];
    expect(input).toMatchObject({
      originCode: "PER-FMP-2024-0012",
      originSourceNumber: "R.D. 045-2024",
      contratoId: "c1",
      providerName: "Comunidad Nativa Santa Rosa",
      providerDocument: "20601234567",
      providerDocumentType: "RUC",
      /* La X del relleno no cabe en la resolución (ya es la del permiso): a las notas. */
      notes: "Fuente de origen: X",
    });
    expect(j.detalle[0].permiso).toEqual({ estado: "asignado" });
    expect(j.resumen.permiso).toEqual({ codigo: "PER-FMP-2024-0012", asignadas: 1, yaTenian: 0, conflictos: 0, heredan: 0 });
    expect(H.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", action: "ctp_import_permiso", entityId: "c1" }));
  });

  it("la marca del inventario de patio se queda como proveedor", async () => {
    await llamar({ mode: "commit", ingresos: [ingreso({ providerName: "Existencia de apertura (inventario)" })], asignacion: { contratoId: "c1" } });
    const input = H.createIngreso.mock.calls[0][1];
    expect(input.providerName).toBe("Existencia de apertura (inventario)");
    expect(input).not.toHaveProperty("providerDocument");
    expect(input.contratoId).toBe("c1");
  });

  it("con OTRO código → conflicto: queda el suyo y no se vincula al del archivo", async () => {
    const r = await llamar({ mode: "commit", ingresos: [ingreso({ originCode: "CON-25-UCA-0207" })], asignacion: { contratoId: "c1" } });
    const j = await r.json();
    const input = H.createIngreso.mock.calls[0][1];
    expect(input.originCode).toBe("CON-25-UCA-0207");
    expect(input).not.toHaveProperty("contratoId");
    expect(input.providerName).toBe("Origen X · 019-0000101");
    expect(j.detalle[0].permiso).toEqual({ estado: "conflicto", delArchivo: "CON-25-UCA-0207" });
    expect(j.resumen.permiso.conflictos).toBe(1);
  });

  it("preview: los mismos conteos, sin escribir ni declarar ni auditar", async () => {
    const r = await llamar({
      mode: "preview",
      ingresos: [ingreso(), ingreso({ row: 2 }), ingreso({ gtfNumber: "019-0000102", providerName: "019-0000102", originCode: "otro" })],
      asignacion: { contratoId: "c1" },
    });
    const j = await r.json();
    expect(j.resumen.permiso).toMatchObject({ asignadas: 2, conflictos: 1 });
    expect(H.createIngreso).not.toHaveBeenCalled();
    expect(H.declarar).not.toHaveBeenCalled();
    expect(H.audit).not.toHaveBeenCalled();
  });

  it("2 filas de la MISMA guía de 0,8 m³ (una por troza) → 1 ingreso de 1,6 m³ con las 2 trozas", async () => {
    const r = await llamar({
      mode: "commit",
      ingresos: [ingreso({ row: 1, volumeM3: 0.8, codigoCtp: "QA1" }), ingreso({ row: 2, volumeM3: 0.8, codigoCtp: "QA2" })],
      asignacion: { contratoId: "c1" },
    });
    const j = await r.json();
    expect(H.createIngreso).toHaveBeenCalledTimes(1);
    const input = H.createIngreso.mock.calls[0][1];
    expect(input.volumeM3).toBe(1.6);
    expect(input.trozas.map((t: { codificacion: string; orden: number; volumenM3: number }) => [t.codificacion, t.orden, t.volumenM3])).toEqual([
      ["QA1", 1, 0.8],
      ["QA2", 2, 0.8],
    ]);
    expect(H.planear).not.toHaveBeenCalled();
    expect(j.detalle.map((d: { row: number; action: string }) => [d.row, d.action])).toEqual([[1, "creado"], [2, "creado"]]);
    expect(j.detalle[0].message).toContain("2 filas del archivo juntas (1.6 m³)");
    expect(j.detalle[1].message).toContain("mismo ingreso que la fila 1");
    expect(j.detalle.map((d: { permiso: unknown }) => d.permiso)).toEqual([{ estado: "asignado" }, { estado: "asignado" }]);
    expect(j.resumen).toMatchObject({ total: 2, creados: 1, agrupadas: 1, saltados: 0 });
  });

  it("los m³ se suman en diezmilésimas: 3 × 0,1 da 0,3, no 0,30000000000000004", async () => {
    await llamar({
      mode: "commit",
      ingresos: [1, 2, 3].map((n) => ingreso({ row: n, volumeM3: 0.1, codigoCtp: `T${n}` })),
    });
    expect(H.createIngreso.mock.calls[0][1].volumeM3).toBe(0.3);
  });

  it("ADR-504: la misma troza dos veces en el archivo → entran las dos (el aviso lo da el alta con sus filas)", async () => {
    const j = await (
      await llamar({ mode: "commit", ingresos: [ingreso({ row: 1, volumeM3: 0.8, codigoCtp: "QA1" }), ingreso({ row: 2, volumeM3: 0.8, codigoCtp: "QA1" })] })
    ).json();
    const input = H.createIngreso.mock.calls[0][1];
    expect(input.volumeM3).toBe(1.6);
    expect(input.trozas).toHaveLength(2);
    expect(input.importacion).toEqual({ filas: [1, 2] });
    expect(j.detalle[1]).toMatchObject({ row: 2, action: "creado" });
    expect(j.detalle[1].message).toContain("mismo ingreso que la fila 1");
  });

  it("la misma guía con 2 especies → 2 ingresos (ADR-312/435)", async () => {
    await llamar({
      mode: "commit",
      ingresos: [
        ingreso({ row: 1, volumeM3: 0.8, codigoCtp: "QA1" }),
        ingreso({ row: 2, volumeM3: 1.1, codigoCtp: "QA2", speciesCommonName: "Cedrorana" }),
        ingreso({ row: 3, volumeM3: 0.8, codigoCtp: "QA3" }),
      ],
    });
    expect(H.createIngreso).toHaveBeenCalledTimes(2);
    const porEspecie = Object.fromEntries(
      H.createIngreso.mock.calls.map(([, i]) => [i.speciesCommonName, [i.volumeM3, i.trozas.length]]),
    );
    expect(porEspecie).toEqual({ Tornillo: [1.6, 2], Cedrorana: [1.1, 1] });
  });

  it("guía en la base con Tornillo + archivo con Tornillo y Cedrorana → sólo se crea Cedrorana", async () => {
    enLaBase("019-0000101");
    const j = await (
      await llamar({ mode: "commit", ingresos: [ingreso({ row: 1 }), ingreso({ row: 2, speciesCommonName: "Cedrorana", volumeM3: 1 })] })
    ).json();
    expect(H.createIngreso).toHaveBeenCalledTimes(1);
    expect(H.createIngreso.mock.calls[0][1].speciesCommonName).toBe("Cedrorana");
    expect(j.detalle.map((d: { action: string }) => d.action)).toEqual(["existe", "creado"]);
  });

  it("guía en la base con Tornillo + archivo SÓLO con otra especie → no se duplica: difiere con aviso", async () => {
    enLaBase("019-0000101");
    const j = await (await llamar({ mode: "commit", ingresos: [ingreso({ speciesCommonName: "Cedrorana" })] })).json();
    expect(H.createIngreso).not.toHaveBeenCalled();
    expect(j.detalle[0].action).toBe("difiere");
    expect(j.detalle[0].message).toContain("AVISO: la guía ya está con Tornillo");
  });

  it("guía que YA estaba con trozas en 2 filas → se le completan las 2 de una vez", async () => {
    enLaBase("019-0000101", { volumeM3: 1.6 });
    H.agregarTrozas.mockResolvedValue({ agregadas: 2, repetidas: [] });
    const j = await (
      await llamar({ mode: "commit", ingresos: [ingreso({ row: 1, volumeM3: 0.8, codigoCtp: "QA1" }), ingreso({ row: 2, volumeM3: 0.8, codigoCtp: "QA2" })] })
    ).json();
    expect(H.agregarTrozas).toHaveBeenCalledTimes(1);
    expect(H.agregarTrozas.mock.calls[0][1]).toBe("w1");
    expect(H.agregarTrozas.mock.calls[0][2].map((t: { codificacion: string }) => t.codificacion)).toEqual(["QA1", "QA2"]);
    expect(j.detalle[0]).toMatchObject({ action: "existe" });
    expect(j.detalle[0].message).toContain("se completaron 2 trozas");
  });

  it("guía que YA estaba → declarar con el plan ya leído (una vez por guía) y el relleno pasa al titular", async () => {
    enLaBase("019-0000101", { volumeM3: 6.4, providerName: "Origen X · 019-0000101" });
    const plan = planDe({ originCode: "PER-FMP-2024-0012", contratoId: "c1" });
    H.planear.mockResolvedValue(plan);
    H.declarar.mockResolvedValue({ actualizados: [{ id: "w1" }] });
    H.completar.mockResolvedValue([{ id: "w1", especie: "Tornillo", fuente: "X" }]);
    const r = await llamar({ mode: "commit", fileName: "patio.xlsx", ingresos: [ingreso(), ingreso({ row: 2 })], asignacion: { contratoId: "c1" } });
    const j = await r.json();
    expect(H.planear).toHaveBeenCalledTimes(1);
    expect(H.declarar).toHaveBeenCalledTimes(1);
    expect(H.declarar).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ gtfNumber: "019-0000101", contratoId: "c1", origen: "la importación del libro («patio.xlsx»)" }),
      "qa",
      plan,
    );
    expect(H.completar).toHaveBeenCalledWith(
      "t1",
      "019-0000101",
      ["w1"],
      { nombre: "Comunidad Nativa Santa Rosa", ruc: "20601234567", codigo: "PER-FMP-2024-0012" },
      "qa",
    );
    expect(H.createIngreso).not.toHaveBeenCalled();
    expect(j.detalle[0].message).toContain("proveedor: Comunidad Nativa Santa Rosa (titular del permiso) en 1 ingreso");
    expect(j.detalle[0].message).toContain("la fuente «X» quedó guardada");
    expect(j.resumen.permiso.asignadas).toBe(2);
  });

  it("guía que YA tenía el permiso → no se declara, pero el relleno igual pasa al titular", async () => {
    enLaBase("019-0000101", { contratoId: "c1", originCode: "PER-FMP-2024-0012", providerName: "Origen X · 019-0000101" });
    H.planear.mockResolvedValue(planDe(null));
    await llamar({ mode: "commit", ingresos: [ingreso()], asignacion: { contratoId: "c1" } });
    expect(H.declarar).not.toHaveBeenCalled();
    expect(H.completar).toHaveBeenCalledWith("t1", "019-0000101", ["w1"], expect.objectContaining({ nombre: "Comunidad Nativa Santa Rosa" }), "qa");
  });

  it("preview de una guía guardada: ni declara ni cambia el proveedor, pero avisa lo que hará", async () => {
    enLaBase("019-0000101", { providerName: "Origen R.A N° D000485-2024 · 019-0000101" });
    H.planear.mockResolvedValue(planDe({ originCode: "PER-FMP-2024-0012" }));
    const j = await (await llamar({ mode: "preview", ingresos: [ingreso()], asignacion: { contratoId: "c1" } })).json();
    expect(H.declarar).not.toHaveBeenCalled();
    expect(H.completar).not.toHaveBeenCalled();
    expect(j.detalle[0].message).toContain("proveedor pasará a ser: Comunidad Nativa Santa Rosa (titular del permiso) en 1 ingreso");
    expect(j.detalle[0].message).toContain("la fuente «R.A N° D000485-2024» quedará guardada");
  });

  it("preview de un alta: dice el proveedor y dónde quedará la fuente del relleno", async () => {
    const j = await (await llamar({ mode: "preview", ingresos: [ingreso()], asignacion: { contratoId: "c1" } })).json();
    expect(j.detalle[0].message).toContain("proveedor: Comunidad Nativa Santa Rosa · la fuente «X» quedará en las notas");
    expect(H.createIngreso).not.toHaveBeenCalled();
  });

  it("la fuente del relleno va a la resolución cuando el permiso no tiene (y se dice)", async () => {
    H.getContrato.mockResolvedValueOnce({ ...H.contrato, resolucionNumero: null });
    const j = await (
      await llamar({ mode: "commit", ingresos: [ingreso({ providerName: "Origen R.A N° D000485-2024 · 019-0000101" })], asignacion: { contratoId: "c1" } })
    ).json();
    const input = H.createIngreso.mock.calls[0][1];
    expect(input).toMatchObject({ providerName: "Comunidad Nativa Santa Rosa", originSourceNumber: "R.A N° D000485-2024", originCode: "PER-FMP-2024-0012" });
    expect(j.detalle[0].message).toContain("la fuente «R.A N° D000485-2024» quedó como N° de fuente de origen");
  });

  it("la fila con OTRA resolución → conflicto: queda la suya y el relleno no se toca", async () => {
    const j = await (
      await llamar({ mode: "commit", ingresos: [ingreso({ originSourceNumber: "R.D. 999-2023" })], asignacion: { contratoId: "c1" } })
    ).json();
    const input = H.createIngreso.mock.calls[0][1];
    expect(input).toMatchObject({ originCode: null, originSourceNumber: "R.D. 999-2023", providerName: "Origen X · 019-0000101" });
    expect(input).not.toHaveProperty("contratoId");
    expect(j.detalle[0].permiso).toEqual({ estado: "conflicto", delArchivo: "R.D. 999-2023", motivo: "la fila trae otra resolución" });
  });

  it("guía guardada con mes cerrado → conflicto con motivo, sin declarar", async () => {
    enLaBase("019-0000101", { providerName: "Origen X · 019-0000101" });
    H.planear.mockResolvedValue({
      gtf: "019-0000101", originCode: "PER-FMP-2024-0012", originSourceNumber: null, contratoId: "c1",
      ingresos: [{ id: "w1", especie: "Tornillo", status: "validado", anulado: false, originCode: null, originSourceNumber: null, contratoId: null, periodoCerrado: "setiembre 2026" }],
      planes: [{ id: "w1", especie: "Tornillo", escribir: null, motivo: "mes cerrado (setiembre 2026)", razon: "mes_cerrado" }],
    });
    const j = await (await llamar({ mode: "commit", ingresos: [ingreso()], asignacion: { contratoId: "c1" } })).json();
    expect(H.declarar).not.toHaveBeenCalled();
    expect(j.detalle[0].permiso).toMatchObject({ estado: "conflicto", motivo: "mes cerrado (setiembre 2026)" });
  });
});

describe("producción / aserrada (Sección 3 e inventario de depósito)", () => {
  const corrida = (p: Record<string, unknown> = {}) => ({ productType: "aserrada", speciesCommon: "Tornillo", quantity: 1.5, ...p });

  it("sin consumo → asignado: originCode y contratoId en la corrida", async () => {
    const j = await (await llamar({ mode: "commit", registro: "produccion", produccion: [corrida()], asignacion: { contratoId: "c1" } })).json();
    expect(H.createCorrida.mock.calls[0][1]).toMatchObject({ originCode: "PER-FMP-2024-0012", contratoId: "c1" });
    expect(j.detalle[0].permiso).toEqual({ estado: "asignado" });
    expect(j.resumen.permiso).toMatchObject({ asignadas: 1, heredan: 0 });
  });

  it("con consumo de guía o de trozas → hereda: no se le escribe el permiso", async () => {
    H.guiaConsumo.set("019-0000101", { estado: "una", guia: { clave: "0000101|∅", gtfNumber: "019-0000101", contratoId: null, permiso: null, titular: null, ingresoIds: ["w1"], libroNros: [1], especies: ["Tornillo"], tienePlata: false } });
    const j = await (
      await llamar({
        mode: "commit",
        registro: "produccion",
        produccion: [
          corrida({ consumos: [{ gtfIngreso: "019-0000101", volumeM3: 2 }] }),
          corrida({ quantity: 2.5, trozasConsumidas: ["3012264"] }),
        ],
        asignacion: { contratoId: "c1" },
      })
    ).json();
    for (const [, input] of H.createCorrida.mock.calls) {
      expect(input).not.toHaveProperty("originCode");
      expect(input).not.toHaveProperty("contratoId");
    }
    expect(j.resumen.permiso).toMatchObject({ asignadas: 0, heredan: 2 });
  });

  it("el código de troza que no está en el patio se dice en la fila (antes se saltaba en silencio)", async () => {
    H.buscarTroza.mockImplementation(async (_t: string, c: string) =>
      c === "3012264" ? { estado: "una", troza: { id: "tz1" } } : { estado: "ninguna" },
    );
    const j = await (
      await llamar({ mode: "commit", registro: "produccion", produccion: [corrida({ trozasConsumidas: ["3012264", "NO-EXISTE"] })] })
    ).json();
    expect(j.detalle[0].message).toContain("1 troza");
    expect(j.detalle[0].message).toContain(" · AVISO: 1 troza no se encontró en el patio: NO-EXISTE");
  });

  it("ADR-504: un código que está en dos trozas no marca «la primera»: avisa y no la consume", async () => {
    H.buscarTroza.mockImplementation(async (_t: string, c: string) =>
      c === "12" ? { estado: "varias", trozas: [{ id: "tzA" }, { id: "tzB" }] } : { estado: "una", troza: { id: "tz1" } },
    );
    const j = await (
      await llamar({ mode: "commit", registro: "produccion", produccion: [corrida({ trozasConsumidas: ["3012264", "12"] })] })
    ).json();
    expect(j.detalle[0].message).toContain("el código 12 está en más de una troza del patio");
    const marcadas = H.marcarConsumidas.mock.calls.flatMap((call: unknown[]) => call[2] as string[]);
    expect(marcadas).toEqual(["tz1"]);
  });
});

describe("ADR-504 · la guía = N° + permiso al importar («que se importe todo»)", () => {
  const c2 = { ...H.contrato, id: "c2", codigo: "PER-017", titularNombre: "Forestal Dos" };
  const delPermiso1 = { contratoId: "c1", originCode: "PER-FMP-2024-0012", providerName: "Comunidad Nativa Santa Rosa" };
  beforeEach(() => {
    H.getContrato.mockImplementation(async (t: string, id: string) => (t !== "t1" ? null : id === "c1" ? H.contrato : id === "c2" ? c2 : null));
  });

  it("GTF 4 ya guardada en el permiso 1 + archivo del permiso 2 con la troza 12 → OTRA guía: se crea con su permiso", async () => {
    enLaBase("019-0000004", delPermiso1);
    const j = await (
      await llamar({ mode: "commit", ingresos: [ingreso({ gtfNumber: "019-0000004", codigoCtp: "12", row: 3 })], asignacion: { contratoId: "c2" } })
    ).json();
    expect(H.agregarTrozas).not.toHaveBeenCalled();
    expect(H.createIngreso).toHaveBeenCalledTimes(1);
    expect(H.createIngreso.mock.calls[0][1]).toMatchObject({ gtfNumber: "019-0000004", contratoId: "c2", importacion: { filas: [3] } });
    expect(j.detalle[0].action).toBe("creado");
  });

  it("re-subida del mismo archivo y permiso → la MISMA guía: no se crea; las trozas van con sus filas", async () => {
    enLaBase("019-0000004", delPermiso1);
    H.agregarTrozas.mockResolvedValue({ agregadas: 0, repetidas: ["12"], avisos: [] });
    const j = await (
      await llamar({ mode: "commit", ingresos: [ingreso({ gtfNumber: "019-0000004", codigoCtp: "12", row: 3 })], asignacion: { contratoId: "c1" } })
    ).json();
    expect(H.createIngreso).not.toHaveBeenCalled();
    expect(H.agregarTrozas).toHaveBeenCalledWith("t1", "w1", expect.any(Array), "qa", { desdeImportacion: true, filas: [3] });
    expect(j.detalle[0]).toMatchObject({ action: "existe" });
    expect(j.detalle[0].message).toContain("sus piezas ya estaban");
  });

  it("archivo SIN permiso y el N° en 2 permisos → ambigua: no escribe nada y pide elegir el permiso", async () => {
    enLaBase("019-0000004", delPermiso1);
    enLaBase("019-0000004", { id: "w2", contratoId: "c2", originCode: "PER-017", providerName: "Forestal Dos" });
    const j = await (await llamar({ mode: "commit", ingresos: [ingreso({ gtfNumber: "019-0000004", codigoCtp: "12" })] })).json();
    expect(H.createIngreso).not.toHaveBeenCalled();
    expect(H.agregarTrozas).not.toHaveBeenCalled();
    expect(j.detalle[0].action).toBe("error");
    expect(j.detalle[0].message).toContain("Elige el permiso del archivo para saber cuál es. Esta guía no se cargó.");
  });

  it("guía SIN permiso de OTRO titular con ese N° → se crea aparte y la fila lo avisa", async () => {
    enLaBase("019-0000004", { providerName: "Juan Pérez" });
    const j = await (await llamar({ mode: "commit", ingresos: [ingreso({ gtfNumber: "019-0000004" })], asignacion: { contratoId: "c1" } })).json();
    expect(H.createIngreso).toHaveBeenCalledTimes(1);
    expect(j.detalle[0].message).toContain("AVISO: Ya hay una guía N° 019-0000004 sin permiso");
  });

  it("el aviso por troza del alta (código en otro permiso con el índice viejo) llega a la fila, sin error", async () => {
    const aviso = "El código 12 ya existe en el permiso 017; se habilita al terminar ADR-504.";
    H.createIngreso.mockImplementation(async (_t: string, input: { speciesCommonName: string }) => ({
      id: "w-nuevo",
      speciesCommonName: input.speciesCommonName,
      acomodo: { aOtrasFilas: [], fueraDeSuFila: [], yaEstabanEnSuFila: [], avisos: [aviso] },
    }));
    const j = await (
      await llamar({ mode: "commit", ingresos: [ingreso({ gtfNumber: "019-0000004", codigoCtp: "12" })], asignacion: { contratoId: "c1" } })
    ).json();
    expect(j.detalle[0].action).toBe("creado");
    expect(j.detalle[0].message).toContain(`AVISO: ${aviso}`);
  });
});
