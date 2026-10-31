/**
 * El volumen OFICIAL en toda la distribución (Brandon 2026-10-03: «Resúmenes
 * en tablas, la tabla por especie, los bloques y el Anexo 04 por permiso: todo
 * el volumen tiene que cuadrar el mismo; de ahí se sacan los tres primeros
 * decimales»). Con 2+ permisos, cada permiso suma lo suyo (Brandon, mismo día).
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { distribuirPorCapacidad, type BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { agruparOficial, resumenPorEspecie } from "@/lib/forestal/cubicacion-resumen";
import { anexosPorPermiso, filasDelAnexo, resumenPorEspecieTipo } from "@/lib/forestal/anexo-por-permiso";
import { distConVolumenOficial, repartoOficial } from "@/lib/forestal/reparto-oficial";
import { m3DeLinea, m3OficialDeFila } from "@/lib/forestal/gtf-redondeo";
import { tipoDePieza } from "@/lib/forestal/cubicacion-tipo";
import { filasDeMedidas, resumenDeBloques } from "@/lib/forestal/distribucion-export";

let n = 0;
function pieza(cantidad: number, espesor: number, ancho: number, largo: number, especie = "Tornillo"): PiezaCubicada {
  const base = { id: `p${++n}`, cantidad, espesor, ancho, largo, uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const, especie };
  return { ...base, ...cubicarPieza(base) };
}
const bloque = (o: Partial<BloqueRolliza> & { id: string }): BloqueRolliza => ({
  etiqueta: o.id, especie: "Tornillo", m3: 1, origen: "manual", costoM3: null, aprovechablePct: 55, ...o,
});

/* Medidas que redondean «de más» fila por fila: el caso del 31,185 vs 31,188. */
const LOTE: PiezaCubicada[] = [
  pieza(7, 1, 2, 6), pieza(9, 1, 2, 7), pieza(1, 1, 3, 6), pieza(5, 1, 4, 8),
  pieza(4, 2, 6, 6), pieza(6, 2, 6, 8), pieza(3, 2, 8, 10), pieza(11, 2, 3, 9),
  pieza(8, 1, 2, 6, "Cumala"), pieza(2, 2, 6, 10, "Cumala"), pieza(4, 3, 3, 8, "Cumala"),
];
const BLOQUES = [
  bloque({ id: "b1", m3: 0.35, permiso: "CON-25-UCA-0142" }),
  bloque({ id: "b2", m3: 0.4, permiso: "CON-25-UCA-0207" }),
  bloque({ id: "b3", especie: "Cumala", m3: 0.25, permiso: "CON-25-UCA-0207" }),
];
const dist = distribuirPorCapacidad(BLOQUES, LOTE);
const of = repartoOficial(dist);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const suma = (vs: Iterable<number>) => r3([...vs].reduce((a, v) => a + v, 0));

describe("un solo volumen en todas las tablas", () => {
  it("el volumen del lote es el de las tablas de Resúmenes con las filas de la Distribución (Σ por permiso + falta)", () => {
    const tablas = agruparOficial(LOTE, "especie", 0, of.porFila);
    expect(tablas.total.m3).toBe(of.total);
    // Cualquier dimensión suma lo mismo, y sus filas suman su total.
    for (const dim of ["especie", "tipo", "medida", "largo", "espesor", "ancho", "seccion"] as const) {
      const t = agruparOficial(LOTE, dim, 0, of.porFila);
      expect(t.total.m3, dim).toBe(of.total);
      expect(suma(t.grupos.map((g) => g.m3)), dim).toBe(of.total);
    }
    // La tabla por especie y tipo: cada especie = Σ de sus filas, y entre todas el total.
    const bloquesEsp = resumenPorEspecie(LOTE, 0, of.porFila);
    expect(suma(bloquesEsp.map((b) => b.total.m3))).toBe(of.total);
    for (const b of bloquesEsp) expect(suma(b.tipos.map((x) => x.m3))).toBe(b.total.m3);
    // Las filas del lote son la suma de las de cada permiso y la falta.
    expect(suma(of.porFila.values())).toBe(of.total);
  });

  it("Distribuido + Falta = el volumen del lote (sin redondeo entre permisos); hay falta de verdad en este caso", () => {
    expect(of.falta).toBeGreaterThan(0);
    expect(r3(of.distribuido + of.falta)).toBe(of.total);
  });

  it("cada permiso suma lo suyo: su fila = Σ de SUS piezas redondeada una vez (como su GTF en SERFOR)", () => {
    for (const a of anexosPorPermiso(dist)) {
      const propias = new Map<string, PiezaCubicada[]>();
      for (const p of a.piezas) {
        const k = `${(p.especie ?? "").toLowerCase()}|${tipoDePieza(p)}`;
        propias.set(k, [...(propias.get(k) ?? []), p]);
      }
      for (const f of resumenPorEspecieTipo(a)) {
        const ps = propias.get(`${f.especie.toLowerCase()}|${f.tipo}`) ?? [];
        expect(f.m3, `${a.label} ${f.especie} ${f.tipo}`).toBe(m3OficialDeFila(ps.map(m3DeLinea)));
      }
    }
  });

  it("Σ bloques = Distribuido = Σ Anexos 04 por permiso", () => {
    expect(suma(of.porBloque.values())).toBe(of.distribuido);
    const anexos = anexosPorPermiso(dist);
    expect(anexos).toHaveLength(2);
    expect(suma(anexos.map((a) => a.totalM3))).toBe(of.distribuido);
  });

  it("cada Anexo por permiso: su resumen y su detalle por medida suman su total", () => {
    for (const a of anexosPorPermiso(dist)) {
      expect(suma(resumenPorEspecieTipo(a).map((r) => r.m3)), a.label).toBe(a.totalM3);
      expect(suma(filasDelAnexo(a).map((f) => f.m3)), a.label).toBe(a.totalM3);
      expect(a.totalMedidasM3).toBe(a.totalM3);
    }
  });

  it("el PDF/Excel (vista oficial): las medidas de cada bloque suman lo que usa el bloque, y el total es Distribuido", () => {
    const vista = distConVolumenOficial(dist, of);
    const bloques = resumenDeBloques(vista);
    expect(suma(bloques.map((b) => b.usadoM3))).toBe(of.distribuido);
    const medidas = filasDeMedidas(vista);
    expect(suma(medidas.map((m) => m.m3))).toBe(of.distribuido);
    for (const b of bloques) {
      expect(suma(medidas.filter((m) => m.bloque === b.bloque).map((m) => m.m3)), b.bloque).toBe(b.usadoM3);
    }
    expect(vista.totales.amparadaM3).toBe(of.distribuido);
    expect(vista.totales.faltanteM3).toBe(of.falta);
    expect(vista.totales.aserradaM3).toBe(r3(of.distribuido + of.falta));
  });

  it("todo valor oficial va en milésimos enteros (lo que se copia con 3 decimales es lo que hay)", () => {
    for (const v of [...of.porBloque.values(), ...of.porBloqueMedida.values(), ...of.porFaltaMedida.values()]) {
      expect(Math.abs(v * 1000 - Math.round(v * 1000))).toBeLessThan(1e-6);
    }
  });
});
