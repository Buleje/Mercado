/**
 * Vistas guardadas genéricas (M07, noche 17-10) y su primera pantalla fuera de
 * Pedidos (Mis clientes): nombre, tope, reemplazo, lectura de lo guardado y
 * cuál se ve ahora.
 */
import { describe, expect, it } from "vitest";
import {
  borrarVista,
  firmaEstable,
  guardarVista,
  leerVistas,
  nombreLimpio,
  TOPE_VISTAS,
  vistaActual,
  type VistaGuardada,
} from "@/lib/admin/vistas-guardadas";
import { ESTADO_ESTANDAR_CRM, esEstadoCrm, firmaCrm, VISTAS_DEL_SISTEMA_CRM, type EstadoCrm } from "@/components/admin/crm/vistas-crm";

const SISTEMA = [{ nombre: "Estándar" }, { nombre: "Con deuda" }];

describe("guardarVista", () => {
  it("pide nombre y no deja usar el de una del sistema (sin mirar tildes)", () => {
    expect(guardarVista([], "   ", 1, SISTEMA).error).toBe("Ponle un nombre a la vista");
    expect(guardarVista([], "estandar", 1, SISTEMA).error).toContain("«Estándar» ya es una vista del sistema");
  });

  it("el mismo nombre reemplaza; uno nuevo se suma", () => {
    const a = guardarVista([], "Fiados del barrio", 1, SISTEMA, 100);
    expect(a.error).toBeNull();
    const lista = a.lista!;
    const b = guardarVista(lista, "fiados  del barrio", 2, SISTEMA, 200);
    expect(b.lista).toHaveLength(1);
    expect(b.lista?.[0].estado).toBe(2);
    expect(b.error === null && b.reemplazo).toBe(true);
    expect(guardarVista(lista, "Otra", 3, SISTEMA, 300).lista).toHaveLength(2);
  });

  it(`tope de ${TOPE_VISTAS}`, () => {
    let lista: VistaGuardada<number>[] = [];
    for (let i = 0; i < TOPE_VISTAS; i++) lista = guardarVista(lista, `v${i}`, i, SISTEMA, i).lista!;
    expect(guardarVista(lista, "una más", 0, SISTEMA).error).toContain(`${TOPE_VISTAS} vistas`);
    expect(borrarVista(lista, lista[0].id)).toHaveLength(TOPE_VISTAS - 1);
  });

  it("el nombre se recorta a 40 letras y sin espacios de más", () => {
    expect(nombreLimpio(`  ${"a".repeat(50)}  `)).toHaveLength(40);
    expect(nombreLimpio("Los  de   la mañana")).toBe("Los de la mañana");
  });
});

describe("leerVistas", () => {
  const esNumero = (e: unknown): e is number => typeof e === "number";
  it("JSON roto, de otra versión o con estado inválido no rompe la pantalla", () => {
    expect(leerVistas("{roto", esNumero)).toEqual([]);
    expect(leerVistas(JSON.stringify({ no: "lista" }), esNumero)).toEqual([]);
    const raw = JSON.stringify([
      { id: "a", nombre: "Buena", estado: 1, en: 1 },
      { id: "b", nombre: "Mala", estado: "x", en: 1 },
      { id: "c", nombre: " ", estado: 1, en: 1 },
    ]);
    expect(leerVistas(raw, esNumero).map((v) => v.id)).toEqual(["a"]);
  });
});

describe("vistaActual y Mis clientes", () => {
  it("la estándar se reconoce aunque los filtros se hayan marcado en otro orden", () => {
    const a: EstadoCrm = { ...ESTADO_ESTANDAR_CRM, segmentos: ["frecuente", "perdido"] };
    const b: EstadoCrm = { ...ESTADO_ESTANDAR_CRM, segmentos: ["perdido", "frecuente"] };
    expect(firmaCrm(a)).toBe(firmaCrm(b));
    expect(vistaActual(VISTAS_DEL_SISTEMA_CRM, [], ESTADO_ESTANDAR_CRM, firmaCrm)?.id).toBe("estandar");
  });

  it("lo puesto a mano no es ninguna vista; una tuya se marca por su nombre", () => {
    const aMano: EstadoCrm = { ...ESTADO_ESTANDAR_CRM, busqueda: "rosa" };
    expect(vistaActual(VISTAS_DEL_SISTEMA_CRM, [], aMano, firmaCrm)).toBeNull();
    const tuya = { id: "v-1", nombre: "Rosa", estado: aMano, en: 1 };
    expect(vistaActual(VISTAS_DEL_SISTEMA_CRM, [tuya], { ...aMano, busqueda: "ROSA" }, firmaCrm)?.nombre).toBe("Rosa");
  });

  it("todas las del sistema son estados válidos y la primera es la estándar", () => {
    expect(VISTAS_DEL_SISTEMA_CRM[0].id).toBe("estandar");
    for (const v of VISTAS_DEL_SISTEMA_CRM) expect(esEstadoCrm(v.estado)).toBe(true);
    expect(esEstadoCrm({ ...ESTADO_ESTANDAR_CRM, credito: null })).toBe(false);
  });

  it("firmaEstable no depende del orden de las claves", () => {
    expect(firmaEstable({ a: 1, b: 2 })).toBe(firmaEstable({ b: 2, a: 1 }));
  });
});
