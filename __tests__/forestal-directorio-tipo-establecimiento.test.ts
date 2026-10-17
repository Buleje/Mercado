/**
 * ADR-493 · El tipo de establecimiento —casillero (19) de la guía 2024— se
 * guarda en la ficha del Directorio y llena la partida al elegir el local.
 *
 * Lo que se cuida: guardar con tipo y leerlo; un guardado que no trae el tipo
 * (alta rápida por documento, pantalla que no lo muestra) no lo borra; la
 * ficha lo marca «Guía (19)»; elegir el establecimiento llena el (19); «Guardar
 * en la libreta» y «Guardar aparte» lo llevan.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown> & { id: string; tenantId: string; docTipo: string | null; docNumero: string | null; deletedAt: Date | null };

const H = vi.hoisted(() => ({ filas: [] as Array<Record<string, unknown>>, updates: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestParty: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        (H.filas as Fila[]).find((f) => {
          if (f.tenantId !== where.tenantId) return false;
          if (where.id != null && f.id !== where.id) return false;
          if (where.docNumero != null && (f.docTipo !== where.docTipo || f.docNumero !== where.docNumero)) return false;
          const d = where.deletedAt as null | { not: null } | undefined;
          if (d === null && f.deletedAt !== null) return false;
          if (d && typeof d === "object" && f.deletedAt === null) return false;
          return true;
        }) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        H.updates.push(data);
        const f = H.filas.find((x) => x.id === where.id)!;
        Object.assign(f, data);
        return { ...f };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const f = { id: `p${H.filas.length + 1}`, deletedAt: null, usos: 0, ultimoUso: null, activo: true, bitacora: null, adjuntos: null, ...data };
        H.filas.push(f);
        return { ...f };
      },
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {}, auditCtpEsperando: async () => {} }));
vi.mock("@/lib/db/forest-ctp-consumo.db", () => ({ CONSUMO_VIGENTE: {} }));

import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { PARTIDA_VACIA, partidaImpresa } from "@/lib/forestal/ctp-gtf-datos";
import { parteInputSchema, type Parte } from "@/lib/forestal/directorio";
import { aLaGuia, fichaDeParte, internosDePartida, planGuardado, type ValorParte } from "@/lib/forestal/libreta";

const T = "tenant-qa";
const RUC = "20156698963";
const LOCAL = { roles: ["establecimiento" as const], nombre: "Depósito El Puerto", docTipo: "RUC" as const, docNumero: RUC, direccion: "Jr. Tacna 123" };
const tipoGuardado = () => H.filas[0]?.tipoEstablecimiento;

beforeEach(() => {
  H.filas.length = 0;
  H.updates.length = 0;
});

describe("Directorio: la columna tipoEstablecimiento", () => {
  it("guardar con tipo → leer con tipo", async () => {
    const p = await ForestDirectorioDB.guardarParte(T, { ...LOCAL, tipoEstablecimiento: "Depósito" }, "qa");
    expect(p.tipoEstablecimiento).toBe("Depósito");
    expect(tipoGuardado()).toBe("Depósito");
    expect((await ForestDirectorioDB.getParte(T, p.id))?.tipoEstablecimiento).toBe("Depósito");
  });

  it("alta rápida por documento SIN tipo (o con «») no borra el que estaba", async () => {
    await ForestDirectorioDB.guardarParte(T, { ...LOCAL, tipoEstablecimiento: "Depósito" }, "qa");
    await ForestDirectorioDB.guardarParte(T, { ...LOCAL, roles: ["destinatario"] }, "qa");
    expect(H.updates.at(-1)).not.toHaveProperty("tipoEstablecimiento");
    await ForestDirectorioDB.guardarParte(T, { ...LOCAL, tipoEstablecimiento: "" }, "qa");
    expect(tipoGuardado()).toBe("Depósito");
  });

  it("edición con id: sin el campo no lo toca; con «» lo vacía (edición explícita)", async () => {
    const p = await ForestDirectorioDB.guardarParte(T, { ...LOCAL, tipoEstablecimiento: "Centro de comercialización" }, "qa");
    await ForestDirectorioDB.guardarParte(T, { ...LOCAL, id: p.id, notas: "x" }, "qa");
    expect(tipoGuardado()).toBe("Centro de comercialización");
    await ForestDirectorioDB.guardarParte(T, { ...LOCAL, id: p.id, tipoEstablecimiento: "" }, "qa");
    expect(tipoGuardado()).toBeNull();
  });

  it("un valor fuera de la lista guardado a mano no se le ofrece a la guía", async () => {
    const p = await ForestDirectorioDB.guardarParte(T, LOCAL, "qa");
    H.filas[0].tipoEstablecimiento = "Aserradero";
    expect((await ForestDirectorioDB.getParte(T, p.id))?.tipoEstablecimiento).toBeNull();
  });

  it("el Zod acepta la lista del (19) o vacío, y nada más", () => {
    expect(parteInputSchema.safeParse({ ...LOCAL, tipoEstablecimiento: "Lugar de acopio" }).success).toBe(true);
    expect(parteInputSchema.safeParse({ ...LOCAL, tipoEstablecimiento: "" }).success).toBe(true);
    expect(parteInputSchema.safeParse({ ...LOCAL, tipoEstablecimiento: "Aserradero" }).success).toBe(false);
  });
});

const FICHA: Parte = {
  id: "p1", roles: ["establecimiento"], nombre: "DEPÓSITO EL PUERTO", categoria: "empresa", codigoCtp: "25-UCA/DEP-0042",
  tipoEstablecimiento: "Depósito", docTipo: "RUC", docNumero: RUC, direccion: "Jr. Tacna 123", region: "Ucayali",
  provincia: "Coronel Portillo", distrito: "Callería", zona: null, ubigeo: null, telefono: null, email: null, registroMtc: null,
  licencia: null, tituloHabilitante: null, resolucion: null, planManejo: null, arffs: null, representante: null,
  representanteDni: null, notas: null, activo: true, usos: 0, ultimoUso: null, logo: null, adjuntos: [],
};
const campoTipo = (p: Parte, rol: Parte["roles"][number]) =>
  fichaDeParte(p, rol).grupos.flatMap((g) => g.campos).find((c) => c.clave === "tipoEstablecimiento");

describe("Libreta: la ficha y la partida", () => {
  it("la ficha del establecimiento lo marca «Guía (19)» y avisa si falta", () => {
    expect(campoTipo(FICHA, "establecimiento")).toMatchObject({ sello: "guia", casillero: "(19)", valor: "Depósito" });
    const sin = { ...FICHA, tipoEstablecimiento: null };
    expect(campoTipo(sin, "establecimiento")?.falta).toBe(true);
    expect(fichaDeParte(sin, "establecimiento").faltan).toContain("el tipo de establecimiento");
  });

  it("con otro papel no sale en la guía: interno, y sólo si está cargado", () => {
    expect(campoTipo(FICHA, "destinatario")?.sello).toBe("interno");
    expect(campoTipo({ ...FICHA, tipoEstablecimiento: null }, "destinatario")).toBeUndefined();
  });

  it("elegir el establecimiento llena el (19) y sale en el papel", () => {
    const partida = { ...PARTIDA_VACIA, nombre: FICHA.nombre, direccion: "Jr. Tacna 123", ...internosDePartida(FICHA) };
    expect(partida.tipoEstablecimiento).toBe("Depósito");
    expect(partida.autorizacion).toBe("25-UCA/DEP-0042");
    expect(partidaImpresa(partida)?.tipo).toBe("Depósito");
  });

  it("elegir uno sin tipo limpia el (19) del local anterior", () => {
    expect(internosDePartida({ ...FICHA, tipoEstablecimiento: null }).tipoEstablecimiento).toBe("");
  });

  const valor: ValorParte = { nombre: "Depósito El Puerto", docTipo: "RUC", docNumero: RUC, direccion: "Jr. Tacna 123", autorizacion: "25-UCA/DEP-0042", tipoEstablecimiento: "Depósito" };

  it("«Guardar en la libreta» lleva el tipo; uno fuera de la lista no viaja (no tumba el guardado)", () => {
    const plan = planGuardado(valor, "establecimiento", []);
    expect("input" in plan && plan.input.tipoEstablecimiento).toBe("Depósito");
    const raro = planGuardado({ ...valor, tipoEstablecimiento: "Aserradero" }, "establecimiento", []);
    expect("input" in raro && raro.input).not.toHaveProperty("tipoEstablecimiento");
  });

  it("«Guardar aparte» (otro local del mismo RUC) también lo guarda", () => {
    const empresa = { ...FICHA, roles: ["proveedor" as const], tipoEstablecimiento: null, direccion: "Av. Centenario 500" };
    const choque = planGuardado(valor, "establecimiento", [empresa]);
    expect("choque" in choque).toBe(true);
    const aparte = planGuardado(valor, "establecimiento", [empresa], true);
    expect("input" in aparte && aparte.input).toMatchObject({ tipoEstablecimiento: "Depósito", docNumero: undefined });
  });

  it("el alta de un establecimiento nuevo pasa (18) y (19) a la partida; otro papel no", () => {
    expect(aLaGuia(valor, "establecimiento")).toMatchObject({ autorizacion: "25-UCA/DEP-0042", tipoEstablecimiento: "Depósito" });
    expect(aLaGuia({ ...valor, tipoEstablecimiento: "" }, "establecimiento")).not.toHaveProperty("tipoEstablecimiento");
    expect(aLaGuia(valor, "destinatario")).not.toHaveProperty("tipoEstablecimiento");
  });
});
