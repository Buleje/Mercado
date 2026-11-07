/**
 * Atar el plan guardado a la ficha de su titular (ADR-518), con los dos
 * hallazgos de la revisión del 26-10:
 *
 * - Al EDITAR un plan que ya cuelga del permiso Y, «Traer del Directorio» sin
 *   elegir permiso creaba OTRO: el plan saltaba de permiso sin aviso, o caía en
 *   un 409 `plan_ocupado` sin salida. Ahora Y es su permiso: sólo se le pone la
 *   ficha si no tenía dueño, y nunca se crea uno nuevo.
 * - El titular cambiado a mano ya no se ata a la ficha vieja por «parecerse»;
 *   sólo con «Atar igual».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Contrato, ContratoInput } from "@/lib/forestal/contratos";
import type { Parte } from "@/lib/forestal/directorio";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: () => ({}) }));

const { atarPlanAlTitular } = await import("@/components/admin/forestal/loth-plan-atar-titular");
const { formularioVacio } = await import("@/components/admin/forestal/loth-plan-form-shared");
const contrato = (o: Partial<Contrato>): Contrato => ({
  id: "Y", codigo: "25-UCA/PER-FMC-2020-001", codigoNorm: "25-UCA/PER-FMC-2020-001", alias: null,
  titularNombre: "COMUNIDAD NATIVA SAN JUAN", titularId: null, titularDoc: null, titularDocTipo: null,
  resolucionNumero: null, resolucionFecha: null, tipo: "PER-FMC", arffs: null, region: null, provincia: null,
  distrito: null, areaHa: 480, vigenciaDesde: null, vigenciaHasta: "2030-01-01T00:00:00.000Z", estado: "vigente",
  planId: "plan-1", notas: null, isActive: true, createdAt: "2026-01-01T00:00:00.000Z", ...o,
});

const ficha = { id: "parte-1", nombre: "Comunidad Nativa San Juan", docTipo: "RUC", docNumero: "20600000001" } as Parte;

const crear = vi.fn(async (input: ContratoInput) => ({
  contrato: contrato({ id: "nuevo", codigo: input.codigo, titularId: input.titularId ?? null, planId: null }),
  yaExistia: false,
  error: null as string | null,
}));
const actualizar = vi.fn(async (id: string, cambios: Partial<ContratoInput>) => ({
  contrato: contrato({ id, ...(cambios as Partial<Contrato>) }),
  error: null as string | null,
}));
const fetchStub = vi.fn(async () => new Response("{}", { status: 200 }));

beforeEach(() => {
  crear.mockClear();
  actualizar.mockClear();
  fetchStub.mockClear();
  vi.stubGlobal("fetch", fetchStub);
});

const base = (o: { contratoId?: string; titularName?: string; contratos?: Contrato[]; atarIgual?: boolean }) => ({
  idPlan: "plan-1",
  f: {
    ...formularioVacio(),
    titularName: o.titularName ?? ficha.nombre,
    tituloHabilitante: "25-UCA/PER-FMC-2020-001",
    contratoId: o.contratoId ?? "",
  },
  permiso: null,
  titular: ficha,
  atarIgual: o.atarIgual,
  contratos: o.contratos ?? [],
  crear,
  actualizar,
  disponible: true,
});

describe("atarPlanAlTitular — el plan que ya cuelga de un permiso", () => {
  it("sin permiso elegido pero con f.contratoId: no crea otro, sólo le pone la ficha", async () => {
    const r = await atarPlanAlTitular(base({ contratoId: "Y", contratos: [contrato({})] }));
    expect(r).toBeNull();
    expect(crear).not.toHaveBeenCalled();
    expect(fetchStub).not.toHaveBeenCalled();
    expect(actualizar).toHaveBeenCalledTimes(1);
    const [id, cambios] = actualizar.mock.calls[0];
    expect(id).toBe("Y");
    expect(cambios).toEqual({ titularId: "parte-1", titularDoc: "20600000001", titularDocTipo: "RUC" });
    expect(cambios).not.toHaveProperty("planId");
  });

  it("si el permiso del plan ya tiene dueño, no se toca", async () => {
    const r = await atarPlanAlTitular(base({ contratoId: "Y", contratos: [contrato({ titularId: "otra-ficha" })] }));
    expect(r).toBeNull();
    expect(crear).not.toHaveBeenCalled();
    expect(actualizar).not.toHaveBeenCalled();
  });

  it("si la lista de permisos no trae el del plan, tampoco crea uno", async () => {
    const r = await atarPlanAlTitular(base({ contratoId: "Y", contratos: [] }));
    expect(r).toBeNull();
    expect(crear).not.toHaveBeenCalled();
    expect(actualizar).not.toHaveBeenCalled();
  });
});

describe("atarPlanAlTitular — titular cambiado a mano", () => {
  it("con otro nombre parecido no se ata a la ficha vieja", async () => {
    const r = await atarPlanAlTitular(base({ titularName: "Comunidad Campesina San Juan" }));
    expect(r).toBeNull();
    expect(crear).not.toHaveBeenCalled();
  });

  it("con «Atar igual» sí: crea el permiso con la ficha", async () => {
    const r = await atarPlanAlTitular(base({ titularName: "Comunidad Campesina San Juan", atarIgual: true }));
    expect(r).toBeNull();
    expect(crear).toHaveBeenCalledTimes(1);
    expect(crear.mock.calls[0][0]).toMatchObject({ titularId: "parte-1", planId: "plan-1" });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});
