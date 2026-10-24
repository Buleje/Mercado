/**
 * Ingresos por guía (2026-09-25): la migración de las columnas elegidas y la
 * lista ÚNICA del menú «Más» que comparten la fila de la tabla y la tarjeta
 * del celular.
 *
 * Por qué: a 400 px la tarjeta no tenía menú — «Corregir la recepción», las
 * fotos, el costo, acomodar y rechazar sólo existían en la computadora. Y el
 * defecto de columnas cambió («Estado» apagada): quien ya había elegido las
 * suyas no puede encontrarse la tabla cambiada.
 */

import { describe, expect, it, vi } from "vitest";
import {
  CLAVE_COLS_GUIAS,
  COLS_GUIAS_DEFECTO,
  columnasVivas,
  migrarColumnasGuias,
} from "@/components/admin/forestal/ctp-guias-columnas";
import {
  accionesDeAsiento,
  accionesDeGuia,
  type ManejadoresDeGuia,
} from "@/components/admin/forestal/ctp-guia-acciones";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import type { WoodEntry } from "@/components/admin/forestal/ctp-shared";

function storage(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    datos,
  };
}

const V1_DEFECTO = JSON.stringify({ ...COLS_GUIAS_DEFECTO, estado: true });

describe("migrarColumnasGuias", () => {
  it("sin nada guardado no escribe nada: arranca el defecto nuevo", () => {
    const s = storage();
    expect(migrarColumnasGuias(s)).toBeNull();
    expect(s.datos.has(CLAVE_COLS_GUIAS)).toBe(false);
  });

  it("lo guardado IGUAL al defecto viejo (nunca eligió) pasa al defecto nuevo: «Estado» apagada", () => {
    const s = storage({ "ctp-ingresos-cols": V1_DEFECTO });
    const r = migrarColumnasGuias(s);
    expect(r?.estado).toBe(false);
    expect(r).toEqual(COLS_GUIAS_DEFECTO);
    expect(JSON.parse(s.datos.get(CLAVE_COLS_GUIAS)!)).toEqual(COLS_GUIAS_DEFECTO);
  });

  it("si eligió algo (prendió «Costo»), se respeta TODO lo suyo, «Estado» incluido", () => {
    const suyas = { ...COLS_GUIAS_DEFECTO, estado: true, costo: true };
    const s = storage({ "ctp-ingresos-cols": JSON.stringify(suyas) });
    expect(migrarColumnasGuias(s)).toEqual(suyas);
  });

  it("con la clave nueva ya escrita no vuelve a migrar (idempotente)", () => {
    const nueva = { ...COLS_GUIAS_DEFECTO, origen: true };
    const s = storage({ "ctp-ingresos-cols": V1_DEFECTO, [CLAVE_COLS_GUIAS]: JSON.stringify(nueva) });
    expect(migrarColumnasGuias(s)).toEqual(nueva);
  });

  it("un JSON roto no rompe la pantalla: vuelve al defecto", () => {
    expect(migrarColumnasGuias(storage({ "ctp-ingresos-cols": "{roto" }))).toBeNull();
  });
});

describe("columnasVivas", () => {
  it("proveedor y permiso son DOS columnas (Brandon, 2026-09-26)", () => {
    expect(columnasVivas(COLS_GUIAS_DEFECTO).izquierda).toBe(3); // documento + proveedor + permiso
    expect(columnasVivas({ ...COLS_GUIAS_DEFECTO, proveedor: false }).izquierda).toBe(2);
    expect(columnasVivas({ ...COLS_GUIAS_DEFECTO, proveedor: false, permiso: false }).izquierda).toBe(1);
  });

  it("«Estado» cuenta a la derecha sólo si está prendida", () => {
    expect(columnasVivas(COLS_GUIAS_DEFECTO).derecha).toBe(0);
    expect(columnasVivas({ ...COLS_GUIAS_DEFECTO, estado: true }).derecha).toBe(1);
  });
});

// ── accionesDeGuia ──────────────────────────────────────────────────────────

function linea(p: Partial<WoodEntry> = {}): WoodEntry {
  return {
    id: "e1",
    status: "validado",
    fechaRecepcion: "2026-09-20",
    photos: null,
    serforGtf: null,
    costoTotal: null,
    ...p,
  } as unknown as WoodEntry;
}

function guia(lineas: WoodEntry[], especies = 1): GuiaIngreso<WoodEntry> {
  return {
    clave: "001-0001",
    gtfNumber: "0001",
    status: lineas[0]?.status ?? "validado",
    especies: Array.from({ length: especies }, (_, i) => ({ comun: `E${i}`, volumenM3: 1, cites: false })),
    lineas,
  } as unknown as GuiaIngreso<WoodEntry>;
}

function manejadores(extra: Partial<ManejadoresDeGuia> = {}): ManejadoresDeGuia {
  return {
    onVerDocumento: vi.fn(),
    onVerGuia: vi.fn(),
    onCostear: vi.fn(),
    onCorregirRecepcion: vi.fn(),
    onAcomodar: vi.fn(),
    onDetail: vi.fn(),
    onChain: vi.fn(),
    onDuplicate: vi.fn(),
    onEdit: vi.fn(),
    onStartReject: vi.fn(),
    ...extra,
  };
}

const ids = (g: GuiaIngreso<WoodEntry>, h: ManejadoresDeGuia) => accionesDeGuia(g, h).map((a) => a.id);

describe("accionesDeGuia — el «Más» de la fila y de la tarjeta", () => {
  it("una guía YA recibida ofrece corregir la recepción, fotos y costo", () => {
    const h = manejadores();
    expect(ids(guia([linea()]), h)).toEqual(
      expect.arrayContaining(["documento", "fotos", "costo", "corregir-recepcion", "cadena", "duplicar", "rechazar"]),
    );
  });

  it("sin recibir no ofrece corregir la recepción (no hay fecha que corregir)", () => {
    const h = manejadores();
    expect(ids(guia([linea({ fechaRecepcion: null, status: "pendiente" })]), h)).not.toContain("corregir-recepcion");
  });

  it("acomodar sólo con dos o más especies, y sólo si la vista lo cablea", () => {
    const g2 = guia([linea({ id: "a" }), linea({ id: "b" })], 2);
    expect(ids(g2, manejadores())).toContain("acomodar");
    expect(ids(g2, manejadores({ onAcomodar: undefined }))).not.toContain("acomodar");
    expect(ids(guia([linea()], 1), manejadores())).not.toContain("acomodar");
  });

  it("las fotos abren el detalle del primer asiento y dicen cuántas hay", () => {
    const h = manejadores();
    // Legado (https) y privada con sello (ADR-434): las dos cuentan; basura no.
    const g = guia([linea({ photos: ["https://x.supabase.co/a.jpg", { url: "priv:t1/forestal-carga/b.webp" }, "a.jpg"] })]);
    const fotos = accionesDeGuia(g, h).find((a) => a.id === "fotos")!;
    expect(fotos.label).toBe("Fotos de la carga (2)");
    fotos.onSelect();
    expect(h.onDetail).toHaveBeenCalledWith(g.lineas[0]);
  });

  it("«Ver los N asientos» sólo si la superficie los sabe desplegar", () => {
    const g2 = guia([linea({ id: "a" }), linea({ id: "b" })], 2);
    expect(ids(g2, manejadores())).not.toContain("asientos");
    expect(ids(g2, manejadores({ asientos: { abierta: false, onAlternar: vi.fn() } }))).toContain("asientos");
  });

  it("rechazar pide el motivo del PRIMER asiento, y sólo en guías de una línea", () => {
    const h = manejadores();
    accionesDeGuia(guia([linea({ id: "x1", status: "pendiente" })]), h).find((a) => a.id === "rechazar")!.onSelect();
    expect(h.onStartReject).toHaveBeenCalledWith("x1");
    expect(ids(guia([linea({ id: "a" }), linea({ id: "b" })], 2), manejadores())).not.toContain("rechazar");
  });
});

describe("accionesDeAsiento — el «Más» de un asiento desplegado", () => {
  const h = () => ({ onDetail: vi.fn(), onChain: vi.fn(), onDuplicate: vi.fn(), onEdit: vi.fn(), onStartReject: vi.fn() });

  it("pendiente: ver, duplicar, corregir y rechazar (lo que antes eran íconos sueltos)", () => {
    const ids = accionesDeAsiento(linea({ status: "pendiente" }), h()).map((a) => a.id);
    expect(ids).toEqual(["ver", "duplicar", "editar", "rechazar"]);
  });

  it("validado: cadena y ANULAR, sin corregir", () => {
    const acc = accionesDeAsiento(linea({ status: "validado" }), h());
    expect(acc.map((a) => a.id)).toEqual(["ver", "duplicar", "cadena", "rechazar"]);
    expect(acc.find((a) => a.id === "rechazar")?.label).toBe("Anular el asiento");
  });

  /* «Ver la GTF de SERFOR» salió del asiento (revisión de Brandon 25-09, «que
     no haya duplicados»): todos los asientos comparten la MISMA GTF y el
     «Documento de la guía» de la fila de arriba ya la abre. */
  it("el asiento no repite la GTF de SERFOR aunque la vista la pase", () => {
    expect(accionesDeAsiento(linea(), { ...h(), onVerGuia: vi.fn() }).map((a) => a.id)).not.toContain("gtf");
    expect(accionesDeAsiento(linea(), h()).map((a) => a.id)).not.toContain("gtf");
  });
});
