/**
 * Tests — árboles del censo que NO salen en el mapa del Libro TH (30-09).
 *
 * Blas: 67 árboles vivos, 2 sin utmX/utmY; el mapa dibuja 65 y no decía nada.
 * Se fija:
 *   - qué se considera «sin coordenadas» = EXACTAMENTE lo que `toCenso` no
 *     dibuja (complemento, no una regla paralela), sin contar los borrados;
 *   - el motivo de cada uno (sin nada, incompleta, inválida);
 *   - el titular en singular/plural y el orden por código (2-TOR antes que 10-TOR);
 *   - la revisión de lo que se tipea: mismas reglas de rango del alta del censo.
 */
import { describe, expect, it } from "vitest";
import { toCenso, type CensusTreeDTO } from "@/components/admin/forestal/loth-mapa-shared";
import {
  arbolesSinCoordenadas,
  revisarCoordenadasArbol,
  tituloSinCoordenadas,
  zonaMasUsada,
  ZONA_UTM_POR_DEFECTO,
} from "@/components/admin/forestal/loth-mapa-sin-coordenadas";

const arbol = (id: string, extra: Partial<CensusTreeDTO> = {}): CensusTreeDTO => ({
  id,
  treeCode: id,
  speciesCommon: "Tornillo",
  estado: "en_pie",
  utmZona: "18S",
  utmX: "521961",
  utmY: "8918254",
  ...extra,
});

describe("arbolesSinCoordenadas", () => {
  it("lista los que no tienen Este ni Norte y deja los que sí", () => {
    const lista = arbolesSinCoordenadas([
      arbol("1"),
      arbol("2", { utmX: null, utmY: null }),
      arbol("3", { utmX: undefined, utmY: undefined, estado: "talado", speciesCommon: "Copaiba" }),
    ]);
    expect(lista.map((a) => a.id)).toEqual(["2", "3"]);
    expect(lista[1]).toMatchObject({
      code: "3",
      species: "Copaiba",
      estado: "talado",
      estadoLabel: "Talado",
      motivo: "sin_coordenadas",
      detalle: "Sin Este ni Norte",
    });
  });

  it("un censo completo no devuelve nada", () => {
    expect(arbolesSinCoordenadas([arbol("1"), arbol("2")])).toEqual([]);
    expect(arbolesSinCoordenadas([])).toEqual([]);
  });

  it("dice el motivo: sólo uno de los dos, o un par que no sirve", () => {
    const [soloEste, soloNorte, ceros, cadenaVacia] = arbolesSinCoordenadas([
      arbol("a", { utmY: null }),
      arbol("b", { utmX: null }),
      arbol("c", { utmX: "0", utmY: "0" }),
      arbol("d", { utmX: "", utmY: "" }),
    ]).sort((x, y) => x.id.localeCompare(y.id));
    expect(soloEste).toMatchObject({ motivo: "incompleta", detalle: "Falta el Norte" });
    expect(soloNorte).toMatchObject({ motivo: "incompleta", detalle: "Falta el Este" });
    expect(ceros.motivo).toBe("invalida");
    expect(ceros.detalle).toMatch(/fuera del rango UTM/);
    expect(cadenaVacia.motivo).toBe("sin_coordenadas");
  });

  it("no cuenta un árbol borrado: ya no es del censo", () => {
    expect(arbolesSinCoordenadas([arbol("1", { utmX: null, utmY: null, deletedAt: "2026-09-01T00:00:00Z" })])).toEqual([]);
  });

  it("ordena por código como se lee en el monte: 2-TOR antes que 10-TOR", () => {
    const lista = arbolesSinCoordenadas(["10-TOR", "2-TOR", "9-TOR"].map((c) => arbol(c, { utmX: null, utmY: null })));
    expect(lista.map((a) => a.code)).toEqual(["2-TOR", "9-TOR", "10-TOR"]);
  });

  it("un estado que no conoce lo muestra tal cual, sin inventar rótulo", () => {
    const [a] = arbolesSinCoordenadas([arbol("1", { utmX: null, utmY: null, estado: "en_revision" })]);
    expect(a.estadoLabel).toBe("en_revision");
  });

  it("es el complemento EXACTO de lo que el mapa dibuja: cada árbol vivo está en uno y sólo uno", () => {
    const censo: CensusTreeDTO[] = [
      arbol("ok"),
      arbol("decimales", { utmX: 521961.5, utmY: "8918254.25" }),
      arbol("nada", { utmX: null, utmY: null }),
      arbol("medio", { utmX: "521961", utmY: null }),
      arbol("ceros", { utmX: "0", utmY: "0" }),
      arbol("negativo", { utmX: "-5", utmY: "8918254" }),
      arbol("texto", { utmX: "abc", utmY: "8918254" }),
      arbol("borrado", { utmX: null, utmY: null, deletedAt: "2026-09-01T00:00:00Z" }),
    ];
    const enMapa = new Set(toCenso(censo).map((c) => c.id));
    const sin = new Set(arbolesSinCoordenadas(censo).map((a) => a.id));
    for (const t of censo.filter((x) => !x.deletedAt)) {
      expect(enMapa.has(t.id) !== sin.has(t.id), `${t.id}: en el mapa XOR en la lista`).toBe(true);
    }
    expect(sin.has("borrado")).toBe(false);
    expect(enMapa.has("borrado")).toBe(false);
  });
});

describe("tituloSinCoordenadas", () => {
  it("singular y plural", () => {
    expect(tituloSinCoordenadas(1)).toBe("1 árbol sin coordenadas: no sale en el mapa");
    expect(tituloSinCoordenadas(2)).toBe("2 árboles sin coordenadas: no salen en el mapa");
  });
});

describe("zonaMasUsada", () => {
  it("toma la zona que más trae el censo, sin contar borrados", () => {
    expect(
      zonaMasUsada([
        arbol("1", { utmZona: "18S" }),
        arbol("2", { utmZona: "18s" }),
        arbol("3", { utmZona: "19L" }),
        arbol("4", { utmZona: "19L", deletedAt: "2026-09-01T00:00:00Z" }),
        arbol("5", { utmZona: null }),
      ]),
    ).toBe("18S");
  });

  it("si ninguno trae zona, propone la de siempre", () => {
    expect(zonaMasUsada([arbol("1", { utmZona: null }), arbol("2", { utmZona: " " })])).toBe(ZONA_UTM_POR_DEFECTO);
    expect(zonaMasUsada([])).toBe("18L");
  });
});

describe("revisarCoordenadasArbol", () => {
  const b = (utmX: string, utmY: string, utmZona = "18L") => ({ utmX, utmY, utmZona });

  it("lee las coordenadas como en el alta del censo: «521 922» y «8.918.151»", () => {
    const r = revisarCoordenadasArbol(b("521 922", "8.918.151", " 18 l "));
    expect(r.errores).toEqual([]);
    expect(r).toMatchObject({ este: 521922, norte: 8918151, zona: "18L" });
  });

  it("Este y Norte son obligatorios: vacío los marca y dice cuál falta", () => {
    const r = revisarCoordenadasArbol(b("", ""));
    expect(r.errores).toEqual(["Falta el Este.", "Falta el Norte."]);
    expect([...r.invalidos].sort()).toEqual(["utmX", "utmY"]);
  });

  it("uno solo: marca sólo el que falta", () => {
    const r = revisarCoordenadasArbol(b("521922", ""));
    expect(r.errores).toEqual(["Falta el Norte."]);
    expect([...r.invalidos]).toEqual(["utmY"]);
  });

  it("Este y Norte cambiados de lugar: el rango de 6 y 7 cifras lo atrapa y marca los dos", () => {
    const r = revisarCoordenadasArbol(b("8918151", "521922"));
    expect(r.errores.join(" ")).toMatch(/Este 8918151 fuera del rango UTM/);
    expect([...r.invalidos].sort()).toEqual(["utmX"]);
    expect(r.este).toBe(8918151);
  });

  it("texto que no es número", () => {
    const r = revisarCoordenadasArbol(b("abc", "8918151"));
    expect(r.errores).toEqual(["El Este no es un número."]);
    expect([...r.invalidos]).toEqual(["utmX"]);
  });

  it("una zona que no es UTM se rechaza; vacía pide la zona", () => {
    expect(revisarCoordenadasArbol(b("521922", "8918151", "99X")).zona).toBeNull();
    expect(revisarCoordenadasArbol(b("521922", "8918151", "sur")).errores[0]).toMatch(/no es una zona UTM/);
    const vacia = revisarCoordenadasArbol(b("521922", "8918151", " "));
    expect(vacia.errores).toEqual(["Falta la zona UTM (ej. 18L)."]);
    expect([...vacia.invalidos]).toEqual(["utmZona"]);
  });

  it("una coordenada buena para el censo entra al mapa: lo que se acepta acá, `toCenso` lo dibuja", () => {
    const r = revisarCoordenadasArbol(b("521922", "8918151", "18S"));
    const t = arbol("x", { utmX: r.este, utmY: r.norte, utmZona: r.zona });
    expect(toCenso([t])).toHaveLength(1);
    expect(arbolesSinCoordenadas([t])).toEqual([]);
  });
});
