/**
 * ADR-461 (02-10 noche) — «Guardar en el directorio» DESPUÉS de importar la
 * guía (`ForestLothImportarDirectorioDB.guardar`), con el directorio fingido:
 *
 *  - agregar: la parte nueva entra con sus datos de la guía y una nota de
 *    dónde salió; el permiso nuevo se ata al titular recién agregado y al plan
 *    del libro si está libre (y el plan, al permiso);
 *  - completar: sólo lo que falta, con el nombre del directorio (no renombra);
 *  - tu negocio no se toca; un documento corregido que ya está no se pisa;
 *  - un plan ocupado no frena el alta del permiso; una placa imposible vuelve
 *    con su motivo; si el directorio no responde, nada se escribe.
 *
 * Fichas anonimizadas de Blas + DNI/placas INVENTADOS (Ley 29733).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import type { PedidoDirectorio } from "@/lib/forestal/loth-importar-guia-tipos";

const H = vi.hoisted(() => ({
  buscarPorDocumento: vi.fn(),
  listarPartes: vi.fn(),
  listarVehiculos: vi.fn(),
  guardarParte: vi.fn(),
  guardarVehiculo: vi.fn(),
  listContratos: vi.fn(),
  crearContrato: vi.fn(),
  actualizarContrato: vi.fn(),
  getPlan: vi.fn(),
  updatePlan: vi.fn(),
  rucPropio: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/forest-directorio.db", () => ({
  PlacaInvalidaError: class PlacaInvalidaError extends Error {
    constructor(
      readonly campo: string,
      readonly motivo: string,
    ) {
      super(motivo);
    }
  },
  PlacaDuplicadaError: class PlacaDuplicadaError extends Error {},
  ForestDirectorioDB: {
    buscarPorDocumento: H.buscarPorDocumento,
    listarPartes: H.listarPartes,
    listarVehiculos: H.listarVehiculos,
    guardarParte: H.guardarParte,
    guardarVehiculo: H.guardarVehiculo,
  },
}));
vi.mock("@/lib/db/forest-contrato.db", () => ({
  PlanOcupadoError: class PlanOcupadoError extends Error {},
  PlanAjenoError: class PlanAjenoError extends Error {},
  ForestContratoDB: { list: H.listContratos, crear: H.crearContrato, actualizar: H.actualizarContrato },
}));
vi.mock("@/lib/db/forest-plan.db", () => ({ ForestPlanDB: { getPlan: H.getPlan, updatePlan: H.updatePlan } }));
vi.mock("@/lib/db/guia-th-al-ctp.db", () => ({ GuiaThAlCtpDB: { rucPropio: H.rucPropio } }));

import { ForestLothImportarDirectorioDB } from "@/lib/db/forest-loth-importar-directorio.db";
import { PlanOcupadoError } from "@/lib/db/forest-contrato.db";
import { PlacaInvalidaError } from "@/lib/db/forest-directorio.db";

const FICHAS = fichasJson as unknown as Record<string, GtfSerfor>;
const G14 = "1-10-0474633";
const G13PLT = "110-19-0472267";
const RUC_BLAS = "20605859438";
/* El anonimizador dejó RUC que no cierran el dígito verificador: uno inventado que sí. */
const RUC_TITULAR = "10111111117";
const ficha = (registro: string): GtfSerfor => ({
  ...structuredClone(FICHAS[registro]),
  propietarioDoc: RUC_TITULAR,
  transportistaDni: "11111111",
  licenciaConducir: "Q11111111",
});
const PLAN = { id: "plan-1", planType: "PMFI", planNumber: null, tituloHabilitante: "10-HUA-PUE/PER-FMP-2026-007", titularName: "PEREZ MUÑOZ JUAN CARLOS", contratoId: null };

/** Por defecto el plan lo creó la importación (el caso en que se ata el permiso). */
const guardar = (g: GtfSerfor, pedido: PedidoDirectorio, planId: string | null = PLAN.id, planCreado = true) =>
  ForestLothImportarDirectorioDB.guardar("t-main", { ficha: g, pedido, planId, planCreado, verificada: true, gtfNumber: String(g.gtfNumber), registro: g.numeroRegistro, createdBy: "qa" });

beforeEach(() => {
  for (const f of Object.values(H)) f.mockReset();
  H.buscarPorDocumento.mockResolvedValue(null);
  H.listarPartes.mockResolvedValue([]);
  H.listarVehiculos.mockResolvedValue([]);
  H.listContratos.mockResolvedValue([]);
  H.rucPropio.mockResolvedValue({ ruc: RUC_BLAS });
  H.getPlan.mockResolvedValue(PLAN);
  H.guardarParte.mockImplementation(async (_t: string, input: { nombre: string }) => ({ id: `parte-${input.nombre.slice(0, 5)}`, nombre: input.nombre, roles: [] }));
  H.guardarVehiculo.mockImplementation(async (_t: string, input: { placa: string }) => ({ id: "veh-1", placa: input.placa }));
  H.crearContrato.mockImplementation(async (_t: string, input: { codigo: string }) => ({ id: "ctr-1", codigo: input.codigo }));
});

describe("guardar en el directorio después de importar", () => {
  it("agrega titular, transportista, vehículo y permiso; tu negocio no; el permiso se ata al titular y al plan", async () => {
    const g = ficha(G14);
    const r = await guardar(g, {
      partes: [
        { clave: "titular", accion: "agregar" },
        { clave: "destinatario", accion: "agregar" },
        { clave: "transportista", accion: "agregar" },
      ],
      vehiculo: { accion: "agregar" },
      permiso: { accion: "agregar" },
    });
    expect(r.map((x) => [x.clave, x.estado])).toEqual([
      ["titular", "agregado"],
      ["destinatario", "omitido"],
      ["transportista", "agregado"],
      ["vehiculo", "agregado"],
      ["permiso", "agregado"],
    ]);
    const [, titular] = H.guardarParte.mock.calls[0];
    expect(titular).toMatchObject({
      roles: ["proveedor"],
      nombre: "PEREZ MUÑOZ JUAN CARLOS",
      docTipo: "RUC",
      docNumero: g.propietarioDoc,
      tituloHabilitante: g.numeroTitulo,
      resolucion: g.numeroResolucion,
      planManejo: "PMFI",
      arffs: g.instanciaRegistra,
    });
    expect(titular.notas).toContain(String(g.gtfNumber));
    expect(H.guardarParte.mock.calls[1][1]).toMatchObject({ roles: ["transportista", "conductor"], docTipo: "DNI", docNumero: "11111111", licencia: "Q11111111" });
    expect(H.guardarParte).toHaveBeenCalledTimes(2); // el destinatario es Blas: no se escribe
    expect(H.guardarVehiculo.mock.calls[0][1]).toMatchObject({ placa: "ABC-109" });
    expect(H.crearContrato.mock.calls[0][1]).toMatchObject({ codigo: g.numeroTitulo, titularId: "parte-PEREZ", planId: PLAN.id, titularDoc: g.propietarioDoc });
    expect(H.updatePlan).toHaveBeenCalledWith("t-main", PLAN.id, { contratoId: "ctr-1" });
    expect(r.at(-1)?.mensaje).toMatch(/atado al plan/);
  });

  it("completar: sólo lo que falta, con el nombre del directorio, y la nota en su bitácora", async () => {
    const g = ficha(G14);
    H.buscarPorDocumento.mockImplementation(async (_t: string, tipo: string, num: string) =>
      tipo === "RUC" && num === g.propietarioDoc
        ? { id: "p-ya", nombre: "Perez Muñoz Juan C.", roles: ["proveedor"], docTipo: "RUC", docNumero: num, direccion: null, resolucion: "ESCRITA", representante: null }
        : null,
    );
    const r = await guardar(g, { partes: [{ clave: "titular", accion: "completar" }] });
    expect(r[0].estado).toBe("completado");
    const [, input] = H.guardarParte.mock.calls[0];
    expect(input.nombre).toBe("Perez Muñoz Juan C.");
    /* Titular = propietario: el domicilio entero del propietario (16-19), no la dirección suelta con el ubigeo del origen. */
    expect(input.direccion).toBe(g.propietarioDireccion);
    expect(input.region).toBe(g.propietarioDepartamento);
    expect(input).not.toHaveProperty("resolucion");
    expect(input.nuevaNota).toMatch(/Completada con la GTF/);
  });

  it("un documento corregido que ya está en el directorio no se pisa", async () => {
    const g = ficha(G13PLT);
    H.buscarPorDocumento.mockImplementation(async (_t: string, tipo: string, num: string) =>
      num === "44444444" ? { id: "p-otro", nombre: String(g.titular), roles: ["proveedor"], docTipo: tipo, docNumero: num } : null,
    );
    const r = await guardar(g, { partes: [{ clave: "titular", accion: "agregar", docTipo: "DNI", docNumero: "44444444" }] });
    expect(r[0]).toMatchObject({ estado: "ya_existia", id: "p-otro" });
    expect(H.guardarParte).not.toHaveBeenCalled();
  });

  it("un documento mal escrito (el de la guía o el corregido) vuelve con su motivo, sin escribir", async () => {
    const malo = { ...ficha(G14), propietarioDoc: "10137037019" }; // no cierra el dígito verificador
    const r0 = await guardar(malo, { partes: [{ clave: "titular", accion: "agregar" }] });
    expect(r0[0].mensaje).toMatch(/último dígito/);
    const r = await guardar(ficha(G13PLT), { partes: [{ clave: "titular", accion: "agregar", docTipo: "RUC", docNumero: "123" }] });
    expect(r[0].estado).toBe("fallo");
    expect(r[0].mensaje).toMatch(/11 dígitos/);
    expect(H.guardarParte).not.toHaveBeenCalled();
  });

  it("plan ocupado: el permiso se crea igual, sin atarlo, y el plan no se toca", async () => {
    H.crearContrato.mockImplementationOnce(async () => {
      throw new PlanOcupadoError("ocupado");
    });
    const r = await guardar(ficha(G14), { partes: [], permiso: { accion: "agregar" } });
    expect(r[0].estado).toBe("agregado");
    expect(H.crearContrato).toHaveBeenCalledTimes(2);
    expect(H.crearContrato.mock.calls[1][1]).not.toHaveProperty("planId");
    expect(H.updatePlan).not.toHaveBeenCalled();
  });

  it("una placa que el directorio rechaza vuelve con su motivo; si el directorio no responde, no se escribe nada", async () => {
    H.guardarVehiculo.mockRejectedValueOnce(new PlacaInvalidaError("placa", "Le falta un número a la placa."));
    const r = await guardar(ficha(G14), { partes: [], vehiculo: { accion: "agregar" } });
    expect(r[0]).toMatchObject({ estado: "fallo", mensaje: "No se pudo: Le falta un número a la placa." });

    H.listarPartes.mockRejectedValueOnce(new Error("pooler caído"));
    const r2 = await guardar(ficha(G14), { partes: [{ clave: "titular", accion: "agregar" }], permiso: { accion: "agregar" } });
    expect(r2.every((x) => x.estado === "fallo")).toBe(true);
    expect(H.guardarParte).not.toHaveBeenCalled();
    expect(H.crearContrato).not.toHaveBeenCalled();
  });

  it("plan que ya existía sin permiso: el permiso se crea igual pero NO se le ata (revisión 02-10)", async () => {
    const r = await guardar(ficha(G14), { partes: [], permiso: { accion: "agregar" } }, PLAN.id, false);
    const ultimo = H.crearContrato.mock.calls.at(-1)?.[1] as { planId?: string | null } | undefined;
    expect(ultimo?.planId ?? null).toBeNull();
    expect(r.some((x) => x.clave === "permiso")).toBe(true);
  });
});
