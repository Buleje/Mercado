/**
 * Agrupación del radar (escala a 300 líneas).
 *
 * Lo que se blinda: al colapsar una columna, las aristas tienen que apuntar al
 * grupo y SUMAR sus volúmenes. Si la suma se pierde, el grosor y las etiquetas
 * del grafo agrupado mienten sobre cuánta madera pasó por ahí.
 */
import { describe, expect, it } from "vitest";
import {
  agregarAristas,
  agruparColumna,
  construirResolver,
  esGrupo,
  idGrupo,
  nodosVisibles,
  UMBRAL_AGRUPAR,
} from "@/lib/forestal/ctp-radar-grupos";

interface N { id: string; especie: string; vol: number }

const nodos = (n: number): N[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `w${i}`,
    especie: i % 3 === 0 ? "Tornillo" : i % 3 === 1 ? "Cumala" : "Shihuahuaco",
    vol: i + 1,
  }));

const agrupar = (ns: N[], opts = {}) => agruparColumna(ns, "ing", (n) => n.especie, (n) => n.vol, opts);

describe("agrupación de columnas", () => {
  it("por debajo del umbral no agrupa: con pocas líneas el detalle se lee", () => {
    const r = agrupar(nodos(UMBRAL_AGRUPAR));
    expect(r.agrupada).toBe(false);
    expect(r.grupos).toHaveLength(0);
  });

  it("por encima del umbral agrupa y suma el volumen de cada grupo", () => {
    const ns = nodos(30);
    const r = agrupar(ns);
    expect(r.agrupada).toBe(true);
    expect(r.grupos).toHaveLength(3);
    // Nada se pierde: la suma de los grupos es el total de la columna.
    const total = ns.reduce((s, n) => s + n.vol, 0);
    expect(r.grupos.reduce((s, g) => s + g.total, 0)).toBe(total);
    expect(r.grupos.reduce((s, g) => s + g.miembros.length, 0)).toBe(30);
  });

  it("ordena por volumen: el grupo más pesado arriba", () => {
    const r = agrupar(nodos(30));
    const totales = r.grupos.map((g) => g.total);
    expect([...totales].sort((a, b) => b - a)).toEqual(totales);
  });

  it("se puede forzar la agrupación aunque haya pocas líneas", () => {
    expect(agrupar(nodos(3), { forzar: true }).agrupada).toBe(true);
  });

  it("una clave vacía cae en «—», no rompe el grupo", () => {
    const r = agruparColumna([{ id: "a", especie: "  ", vol: 1 }], "ing", (n) => n.especie, (n) => n.vol, { forzar: true });
    expect(r.grupos[0].clave).toBe("—");
  });

  it("los ids de grupo son distinguibles de los reales", () => {
    expect(esGrupo(idGrupo("ing", "Tornillo"))).toBe(true);
    expect(esGrupo("w1")).toBe(false);
  });
});

describe("aristas en el espacio visible", () => {
  const ns = nodos(30);
  const { grupos } = agrupar(ns);
  const aristas = ns.map((n) => ({ from: n.id, to: "c1", volumeM3: 2 }));

  it("colapsado: N aristas paralelas se funden en una por grupo, con el volumen sumado", () => {
    const resolver = construirResolver(grupos, new Set());
    const ag = agregarAristas(aristas, (e) => e.volumeM3, resolver);
    expect(ag).toHaveLength(3); // una por especie
    expect(ag.reduce((s, e) => s + e.valor, 0)).toBe(60); // 30 × 2, nada se pierde
    expect(ag.every((e) => esGrupo(e.from))).toBe(true);
    expect(ag.find((e) => e.cuenta === 10)).toBeDefined();
  });

  it("expandido: los miembros de ese grupo recuperan su arista individual", () => {
    const expandido = grupos[0].id;
    const resolver = construirResolver(grupos, new Set([expandido]));
    const ag = agregarAristas(aristas, (e) => e.volumeM3, resolver);
    const miembros = grupos[0].miembros.length;
    // Los del grupo expandido van sueltos; los otros dos siguen agregados.
    expect(ag).toHaveLength(miembros + 2);
    expect(ag.reduce((s, e) => s + e.valor, 0)).toBe(60);
  });

  it("un extremo fuera de todo grupo se mantiene tal cual", () => {
    const resolver = construirResolver(grupos, new Set());
    const ag = agregarAristas(aristas, (e) => e.volumeM3, resolver);
    expect(ag.every((e) => e.to === "c1")).toBe(true);
  });

  it("valores no numéricos no envenenan la suma", () => {
    const resolver = construirResolver(grupos, new Set());
    // @ts-expect-error — simula una cantidad nula venida de la DB
    const ag = agregarAristas([{ from: "w0", to: "c1", v: null }], (e) => e.v, resolver);
    expect(ag[0].valor).toBe(0);
  });

  it("nodosVisibles refleja qué grupos están abiertos", () => {
    const abierto = grupos[1].id;
    const v = nodosVisibles(grupos, new Set([abierto]));
    expect(v.find((x) => x.grupo.id === abierto)!.expandido).toBe(true);
    expect(v.find((x) => x.grupo.id === abierto)!.miembros.length).toBeGreaterThan(0);
    expect(v.find((x) => x.grupo.id !== abierto)!.miembros).toHaveLength(0);
  });
});
