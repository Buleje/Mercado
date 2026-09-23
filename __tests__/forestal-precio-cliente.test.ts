/**
 * __tests__/forestal-precio-cliente.test.ts
 *
 * Precios por cliente y grupos de especies (ADR-430). Cada decisión de
 * Brandon (22-09) es un caso: el trato del cliente reemplaza a la planta sin
 * recargos; los grupos son de la planta y una especie va en uno solo; gana la
 * especie o el grupo sobre el tipo; el precio a mano manda sobre todo.
 */
import { describe, expect, it } from "vitest";
import {
  gruposEspeciesSchema,
  normalizarGrupos,
  precioDelCliente,
  tarifaClienteInputSchema,
  tarifaVigente,
  type GrupoEspecies,
  type TarifaCliente,
} from "@/lib/forestal/precio-cliente";
import { cotizarAserrio, explicarPrecio, type BloqueACobrar, type VersionTarifa } from "@/lib/forestal/tarifa-aserrio";
import { vinculoParteInputSchema } from "@/lib/forestal/vinculos-parte";

const GRUPOS: GrupoEspecies[] = [
  { id: "g-duras", nombre: "Duras", claves: ["anacaspi", "shihuahuaco"] },
  { id: "g-blandas", nombre: "Blandas", claves: ["bolaina"] },
];

const cliente = (parcial: Partial<TarifaCliente> = {}): TarifaCliente => ({
  id: "tc-1", parteId: "p1", servicio: "aserrio", vigenteDesde: "2026-09-01", basePt: 0.5,
  grupos: [], especies: [], tipos: [], nota: null, ...parcial,
});

const planta: VersionTarifa = {
  id: "v1", vigenteDesde: "2026-01-01", basePt: 0.4,
  especies: [{ clave: "cedro", nombre: "Cedro", precioPt: 0.7 }],
  grupos: [{ grupoId: "g-duras", precioPt: 0.9 }],
  tipos: [{ tipo: "Comercial", ajustePt: 0.05 }],
  largos: [{ desdePies: 12, hastaPies: null, ajustePt: 0.03 }],
  nota: null, creadoPor: null, creadoEn: null,
};

/* 2″×8″×13′: Comercial por medidas, 13 pies (tramo +0.03 de la planta). */
const bloque = (especie: string, pt = 100): BloqueACobrar => ({
  etiqueta: `PQ-${especie}`, especie, volumenM3: pt / 424, pt, espesorCm: 5.08, anchoCm: 20.32, largoM: 3.96,
});

describe("el precio del cliente: especie → grupo → tipo → su global", () => {
  it("la especie propia gana a todo lo demás del cliente", () => {
    const t = cliente({ especies: [{ clave: "tornillo", nombre: "Tornillo", precioPt: 0.6 }], tipos: [{ tipo: "Comercial", precioPt: 0.55 }] });
    expect(precioDelCliente(t, GRUPOS, "TORNILLO", "Comercial")).toEqual({ precioPt: 0.6, desde: "cliente-especie", grupo: null });
  });

  it("sin precio de la especie, el de su grupo; y gana al del tipo (decisión 3)", () => {
    const t = cliente({ grupos: [{ grupoId: "g-duras", precioPt: 1.2 }], tipos: [{ tipo: "Comercial", precioPt: 0.55 }] });
    expect(precioDelCliente(t, GRUPOS, "Anacaspi", "Comercial")).toEqual({ precioPt: 1.2, desde: "cliente-grupo", grupo: "Duras" });
  });

  it("el tipo sólo cuando la especie no tiene precio propio ni de grupo", () => {
    const t = cliente({ grupos: [{ grupoId: "g-duras", precioPt: 1.2 }], tipos: [{ tipo: "Comercial", precioPt: 0.55 }] });
    expect(precioDelCliente(t, GRUPOS, "Tornillo", "Comercial")?.desde).toBe("cliente-tipo");
  });

  it("y si nada lo cubre, su global; sin global, no hay trato (rige la planta)", () => {
    expect(precioDelCliente(cliente(), GRUPOS, "Tornillo", "Tabla")).toEqual({ precioPt: 0.5, desde: "cliente-general", grupo: null });
    expect(precioDelCliente(cliente({ basePt: null }), GRUPOS, "Tornillo", "Tabla")).toBeNull();
    expect(precioDelCliente(null, GRUPOS, "Tornillo", "Tabla")).toBeNull();
  });
});

describe("la versión vigente del trato", () => {
  const tarifas = [
    cliente({ id: "a", vigenteDesde: "2026-08-01", basePt: 0.45 }),
    cliente({ id: "b", vigenteDesde: "2026-09-10", basePt: 0.5 }),
    cliente({ id: "c", vigenteDesde: "2026-09-10", basePt: 0.52 }),
    cliente({ id: "v", servicio: "venta", vigenteDesde: "2026-01-01", basePt: 3.5 }),
  ];
  it("rige la de fecha más cercana hacia atrás; a igual fecha, la guardada después", () => {
    expect(tarifaVigente(tarifas, "aserrio", "2026-09-05")?.id).toBe("a");
    expect(tarifaVigente(tarifas, "aserrio", "2026-09-22")?.id).toBe("c");
    expect(tarifaVigente(tarifas, "aserrio", "2026-07-01")).toBeNull();
    expect(tarifaVigente(tarifas, "venta", "2026-09-22")?.id).toBe("v");
  });
});

describe("cotizar con el trato del cliente", () => {
  it("«0,50 toda especie» cobra 0,50: sin los recargos por tipo ni largo de la planta (decisión 1)", () => {
    const c = cotizarAserrio(planta, [bloque("Tornillo", 100)], { cliente: cliente(), grupos: GRUPOS });
    expect(c.lineas[0]).toMatchObject({ precioPt: 0.5, baseDesde: "cliente-general", ajusteTipoPt: 0, ajusteLargoPt: 0 });
    expect(c.importe).toBe(50);
    expect(c.clienteTarifaId).toBe("tc-1");
    expect(c.versionId).toBeNull();
  });

  it("lo que el trato no cubre va por la planta, con sus ajustes", () => {
    const c = cotizarAserrio(planta, [bloque("Cedro", 100)], { cliente: cliente({ basePt: null, especies: [{ clave: "tornillo", nombre: "Tornillo", precioPt: 0.6 }] }), grupos: GRUPOS });
    // 0.70 Cedro + 0.05 Comercial + 0.03 de 12 pies o más
    expect(c.lineas[0]).toMatchObject({ baseDesde: "especie", precioPt: 0.78 });
    expect(c.versionId).toBe("v1");
    expect(c.clienteTarifaId).toBeNull();
  });

  it("la planta también tiene grupos: especie → grupo → general", () => {
    const c = cotizarAserrio(planta, [bloque("Shihuahuaco", 10), bloque("Tornillo", 10)], { grupos: GRUPOS });
    expect(c.lineas.map((l) => [l.baseDesde, l.basePt, l.grupo ?? null])).toEqual([
      ["grupo", 0.9, "Duras"],
      ["general", 0.4, null],
    ]);
  });

  it("el precio a mano manda sobre el trato del cliente", () => {
    const c = cotizarAserrio(planta, [bloque("Tornillo", 100)], { precioManualPt: 0.35, cliente: cliente(), grupos: GRUPOS });
    expect(c.lineas[0]).toMatchObject({ baseDesde: "manual", precioPt: 0.35 });
    expect(c.clienteTarifaId).toBeNull();
  });

  it("sin tarifa de la planta, el trato del cliente alcanza para cobrar", () => {
    const c = cotizarAserrio(null, [bloque("Tornillo", 100)], { cliente: cliente(), grupos: GRUPOS });
    expect(c.cobrable).toBe(true);
    expect(c.avisos).toEqual([]);
  });

  it("dice de dónde salió cada precio", () => {
    const c = cotizarAserrio(planta, [bloque("Anacaspi", 10)], { cliente: cliente({ grupos: [{ grupoId: "g-duras", precioPt: 1.2 }] }), grupos: GRUPOS });
    expect(explicarPrecio(c.lineas[0])).toBe("S/ 1.20 por PT (precio del cliente para el grupo Duras)");
    const p = cotizarAserrio(planta, [bloque("Shihuahuaco", 10)], { grupos: GRUPOS });
    expect(explicarPrecio(p.lineas[0])).toContain("grupo Duras");
  });

  it("sin cliente ni grupos, todo sigue exactamente como antes", () => {
    const c = cotizarAserrio(planta, [bloque("Tornillo", 100)]);
    expect(c.lineas[0]).toMatchObject({ baseDesde: "general", precioPt: 0.48 });
  });
});

describe("lo que se guarda", () => {
  it("una especie no puede estar en dos grupos (decisión 2)", () => {
    const r = gruposEspeciesSchema.safeParse([
      { id: "g1", nombre: "Duras", especies: ["Anacaspi"] },
      { id: "g2", nombre: "Finas", especies: ["ANACASPI"] },
    ]);
    expect(r.success).toBe(false);
  });

  it("los grupos se guardan con claves normalizadas y sin repetir", () => {
    const r = gruposEspeciesSchema.safeParse([{ id: "g1", nombre: "Duras", especies: ["Anacaspi", "anacaspi ", "Shihuahuaco"] }]);
    expect(r.success).toBe(true);
    if (r.success) expect(normalizarGrupos(r.data)[0].claves).toEqual(["anacaspi", "shihuahuaco"]);
  });

  it("dos grupos con el mismo id son uno solo: se rechaza (la especie quedaba en dos grupos)", () => {
    const r = gruposEspeciesSchema.safeParse([
      { id: "g1", nombre: "Duras", especies: ["Anacaspi"] },
      { id: "g1", nombre: "Blandas", especies: ["Anacaspi", "Tornillo"] },
    ]);
    expect(r.success).toBe(false);
  });

  it("la fecha tiene que existir: 31 de febrero y mes 13 se rechazan antes de guardar", () => {
    const base = { parteId: "p1", servicio: "aserrio" as const, basePt: 0.5 };
    expect(tarifaClienteInputSchema.safeParse({ ...base, vigenteDesde: "2026-02-31" }).success).toBe(false);
    expect(tarifaClienteInputSchema.safeParse({ ...base, vigenteDesde: "2026-13-01" }).success).toBe(false);
    expect(tarifaClienteInputSchema.safeParse({ ...base, vigenteDesde: "2028-02-29" }).success).toBe(true);
    expect(vinculoParteInputSchema.safeParse({ parteId: "a", relacion: "tercero", vinculadaParteId: "b", desde: "2026-02-30" }).success).toBe(false);
  });

  it("un trato necesita al menos un precio, y cada especie, grupo o tipo uno solo", () => {
    const base = { parteId: "p1", servicio: "aserrio" as const, vigenteDesde: "2026-09-22" };
    expect(tarifaClienteInputSchema.safeParse({ ...base, basePt: null }).success).toBe(false);
    expect(tarifaClienteInputSchema.safeParse({ ...base, basePt: 0.5 }).success).toBe(true);
    expect(tarifaClienteInputSchema.safeParse({ ...base, basePt: null, especies: [{ nombre: "Tornillo", precioPt: 0.6 }, { nombre: "TORNILLO", precioPt: 0.7 }] }).success).toBe(false);
    expect(tarifaClienteInputSchema.safeParse({ ...base, basePt: 0 }).success).toBe(false);
  });
});
