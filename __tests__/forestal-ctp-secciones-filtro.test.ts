/**
 * Facetas, filtrado, totales y CSV de Producción/Despacho.
 *
 * La regla que se testea una y otra vez: una línea ANULADA no cuenta. Ni en las
 * opciones de filtro, ni en los totales de pantalla, ni en el pie del CSV — un
 * libro que suma lo dado de baja declara madera que no existe.
 */
import { describe, expect, it } from "vitest";
import {
  claveSalida,
  contarFiltros,
  enRango,
  rangoActivo,
  rangosPuestos,
  textoDeRango,
  facetasDeSeccion,
  filtrarSeccion,
  totalesDeSeccion,
  type LineaCtp,
} from "@/lib/forestal/ctp-secciones-filtro";
import { nombreArchivoSeccion, seccionACsv, type LineaCsv } from "@/lib/forestal/ctp-secciones-csv";

const linea = (over: Partial<LineaCsv> = {}): LineaCsv => ({
  id: "l1",
  lineNo: 1,
  entryDate: "2026-05-26T00:00:00.000Z",
  speciesCommon: "Tornillo",
  speciesScientific: "Cedrelinga cateniformis",
  productType: "aserrada",
  destino: "Maderera Lima SAC",
  cites: false,
  quantity: "10",
  volumeInputM3: "12.5",
  pieces: 20,
  rendimientoPct: "80",
  unit: "pt",
  gtfIngreso: "001-0000120",
  gtfNumber: "002-0000001",
  observations: null,
  annulledReason: null,
  status: "registrado",
  ...over,
});

describe("facetasDeSeccion", () => {
  it("agrupa por especie/producto/destino con su peso y ordena por volumen", () => {
    const f = facetasDeSeccion([
      linea({ id: "a", speciesCommon: "Tornillo", quantity: "10" }),
      linea({ id: "b", speciesCommon: "Shihuahuaco", quantity: "30" }),
      linea({ id: "c", speciesCommon: "Tornillo", quantity: "5" }),
    ]);
    expect(f.species.map((s) => s.value)).toEqual(["Shihuahuaco", "Tornillo"]);
    expect(f.species[1]).toMatchObject({ value: "Tornillo", count: 2, volumeM3: 15 });
  });

  it("ignora las líneas anuladas — una opción que sólo tienen ellas sería una trampa", () => {
    const f = facetasDeSeccion([
      linea({ id: "a", speciesCommon: "Tornillo" }),
      linea({ id: "b", speciesCommon: "Caoba", status: "anulado" }),
    ]);
    expect(f.species.map((s) => s.value)).toEqual(["Tornillo"]);
  });

  it("no inventa una opción vacía cuando el campo viene null", () => {
    const f = facetasDeSeccion([linea({ destino: null }), linea({ id: "b", destino: "  " })]);
    expect(f.destinos).toEqual([]);
  });
});

describe("filtrarSeccion", () => {
  const lineas = [
    linea({ id: "a", speciesCommon: "Tornillo", productType: "aserrada", cites: false }),
    linea({ id: "b", speciesCommon: "Shihuahuaco", productType: "rolliza", cites: true }),
  ];

  it("filtra por especie, producto y CITES", () => {
    expect(filtrarSeccion(lineas, { species: "Tornillo" }).map((l) => l.id)).toEqual(["a"]);
    expect(filtrarSeccion(lineas, { product: "rolliza" }).map((l) => l.id)).toEqual(["b"]);
    expect(filtrarSeccion(lineas, { cites: true }).map((l) => l.id)).toEqual(["b"]);
  });

  it("sin filtros devuelve todo y los filtros se acumulan", () => {
    expect(filtrarSeccion(lineas, {})).toHaveLength(2);
    expect(filtrarSeccion(lineas, { species: "Tornillo", product: "rolliza" })).toHaveLength(0);
  });

  it("cuenta cuántos filtros están puestos (el badge)", () => {
    expect(contarFiltros({})).toBe(0);
    expect(contarFiltros({ species: "Tornillo", cites: true })).toBe(2);
  });
});

/**
 * La columna «Salida» se filtra desde su cabecera (autofiltro estilo Excel), y
 * el badge de la fila usa la MISMA `claveSalida`. Lo que se testea acá es que la
 * regla sea una sola: si difirieran, la tabla podria mostrar «En patio» en la
 * fila y esconder esa misma fila al filtrar por «En patio».
 */
describe("claveSalida", () => {
  const prod = (over: Partial<LineaCtp> = {}): LineaCtp =>
    linea({ section: "produccion", quantity: "10", ...over } as Partial<LineaCsv>);

  it("nada despachado ni reprocesado = sigue en el patio", () => {
    expect(claveSalida(prod())).toBe("stock");
    expect(claveSalida(prod({ despachadoQty: "0", reprocesadoQty: "0" }))).toBe("stock");
  });

  it("salio una parte = parcial; salio todo = despachado", () => {
    expect(claveSalida(prod({ despachadoQty: "4" }))).toBe("parcial");
    expect(claveSalida(prod({ despachadoQty: "6", reprocesadoQty: "4" }))).toBe("salido");
  });

  it("el reprocesado tambien saca madera del patio, no solo el despacho", () => {
    expect(claveSalida(prod({ reprocesadoQty: "10" }))).toBe("salido");
  });

  it("no opina de una linea de despacho ni de una corrida sin producir", () => {
    expect(claveSalida(linea({ section: "despacho", quantity: "10" } as Partial<LineaCsv>))).toBeNull();
    expect(claveSalida(prod({ quantity: null }))).toBeNull();
  });

  it("acepta numeros ademas de strings: el endpoint los manda asi", () => {
    expect(claveSalida({ section: "produccion", quantity: "10", despachadoQty: 4 })).toBe("parcial");
  });
});

describe("faceta y filtro de salida", () => {
  const prod = (over: Partial<LineaCtp> = {}): LineaCtp =>
    linea({ section: "produccion", quantity: "10", ...over } as Partial<LineaCsv>);

  it("ordena patio -> parcial -> despachado, no por volumen", () => {
    const f = facetasDeSeccion([
      prod({ id: "c", quantity: "100", despachadoQty: "100" }),
      prod({ id: "a" }),
      prod({ id: "b", despachadoQty: "4" }),
    ]);
    expect(f.salidas.map((s) => s.value)).toEqual(["stock", "parcial", "salido"]);
    expect(f.salidas[0]).toMatchObject({ value: "stock", count: 1, volumeM3: 10 });
  });

  it("no ofrece un estado que no existe en el periodo", () => {
    const f = facetasDeSeccion([prod({ id: "a" }), prod({ id: "b" })]);
    expect(f.salidas.map((s) => s.value)).toEqual(["stock"]);
    expect(f.salidas[0].count).toBe(2);
  });

  it("una linea anulada no aporta al filtro de salida", () => {
    const f = facetasDeSeccion([prod({ id: "a", despachadoQty: "4", status: "anulado" })]);
    expect(f.salidas).toEqual([]);
  });

  it("filtra por el estado elegido y suma al badge de filtros puestos", () => {
    const lineas = [prod({ id: "a" }), prod({ id: "b", despachadoQty: "10" })];
    expect(filtrarSeccion(lineas, { salida: "stock" }).map((l) => l.id)).toEqual(["a"]);
    expect(filtrarSeccion(lineas, { salida: "salido" }).map((l) => l.id)).toEqual(["b"]);
    expect(contarFiltros({ salida: "stock" })).toBe(1);
    expect(contarFiltros({ species: "Tornillo", salida: "stock" })).toBe(2);
  });
});

/**
 * «Mayor que» / «entre X e Y» — el otro autofiltro de Excel. La regla que más
 * importa: un valor AUSENTE no entra en un rango pedido (una corrida abierta no
 * declara rendimiento; si pasara «rend ≥ 50 %» la tabla afirmaría de ella algo
 * que el libro no sabe).
 */
describe("enRango / rangoActivo", () => {
  it("sin topes no filtra nada", () => {
    expect(rangoActivo(undefined)).toBe(false);
    expect(rangoActivo({ min: null, max: null })).toBe(false);
    expect(enRango(5, undefined)).toBe(true);
    expect(enRango(null, { min: null, max: null })).toBe(true);
  });

  it("respeta cada tope, inclusive en los bordes", () => {
    expect(enRango(5, { min: 5, max: null })).toBe(true);
    expect(enRango(4.99, { min: 5, max: null })).toBe(false);
    expect(enRango(5, { min: null, max: 5 })).toBe(true);
    expect(enRango(5.01, { min: null, max: 5 })).toBe(false);
    expect(enRango(3, { min: 2, max: 4 })).toBe(true);
    expect(enRango(1, { min: 2, max: 4 })).toBe(false);
  });

  it("lo que no tiene dato queda AFUERA de un rango pedido", () => {
    expect(enRango(null, { min: 50, max: null })).toBe(false);
    expect(enRango(Number.NaN, { min: 50, max: null })).toBe(false);
  });

  it("acepta rangos al reves sin romper (no devuelve todo)", () => {
    expect(enRango(3, { min: 4, max: 2 })).toBe(false);
  });

  it("se lee como se habla", () => {
    expect(textoDeRango("consumido", { min: 0.5, max: null })).toBe("Consumido ≥ 0.5 m³");
    expect(textoDeRango("rend", { min: null, max: 50 })).toBe("Rend. ≤ 50 %");
    expect(textoDeRango("piezas", { min: 10, max: 20 })).toBe("Piezas 10 – 20 pz");
  });
});

describe("filtrarSeccion con rangos", () => {
  const l = (over: Partial<LineaCsv>) => linea(over);
  const lineas = [
    l({ id: "a", volumeInputM3: "1", pieces: 5, rendimientoPct: "40" }),
    l({ id: "b", volumeInputM3: "10", pieces: 50, rendimientoPct: "60" }),
    l({ id: "c", volumeInputM3: null, pieces: null, rendimientoPct: null }),
  ];

  it("acota por consumido, piezas y rendimiento", () => {
    expect(filtrarSeccion(lineas, { rangos: { consumido: { min: 5, max: null } } }).map((x) => x.id)).toEqual(["b"]);
    expect(filtrarSeccion(lineas, { rangos: { piezas: { min: null, max: 10 } } }).map((x) => x.id)).toEqual(["a"]);
    expect(filtrarSeccion(lineas, { rangos: { rend: { min: 50, max: 70 } } }).map((x) => x.id)).toEqual(["b"]);
  });

  it("los rangos se acumulan entre si y con las facetas", () => {
    expect(
      filtrarSeccion(lineas, { rangos: { consumido: { min: 5, max: null }, rend: { min: null, max: 50 } } }),
    ).toHaveLength(0);
    expect(
      filtrarSeccion(lineas, { species: "Tornillo", rangos: { consumido: { min: 0.5, max: null } } }).map((x) => x.id),
    ).toEqual(["a", "b"]);
  });

  it("la linea sin el dato no entra, pero sin rango puesto sigue estando", () => {
    expect(filtrarSeccion(lineas, { rangos: { consumido: { min: 0, max: null } } }).map((x) => x.id)).toEqual(["a", "b"]);
    expect(filtrarSeccion(lineas, {}).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("cuenta y lista SOLO los rangos con algo puesto (el badge y los chips)", () => {
    expect(contarFiltros({ rangos: { consumido: { min: null, max: null } } })).toBe(0);
    expect(contarFiltros({ species: "Tornillo", rangos: { rend: { min: 50, max: null } } })).toBe(2);
    expect(rangosPuestos({ rangos: { consumido: { min: null, max: null }, piezas: { min: 3, max: null } } })).toEqual([
      { campo: "piezas", texto: "Piezas ≥ 3 pz" },
    ]);
  });
});

describe("totalesDeSeccion", () => {
  it("suma sólo lo vigente", () => {
    const t = totalesDeSeccion([
      linea({ id: "a", quantity: "10", volumeInputM3: "12.5", pieces: 20 }),
      linea({ id: "b", quantity: "999", volumeInputM3: "999", pieces: 999, status: "anulado" }),
    ]);
    expect(t).toEqual({ lineas: 1, cantidad: 10, consumido: 12.5, piezas: 20 });
  });
});

describe("seccionACsv", () => {
  it("producción: cabecera, fila y pie con consumido + producido", () => {
    const out = seccionACsv("produccion", [linea()]).split("\r\n");
    expect(out[0].split(";")[6]).toBe("Consumido (m3)");
    expect(out[1].split(";")[6]).toBe("12,5000");
    expect(out[2]).toContain("TOTAL (1 líneas vigentes)");
  });

  it("despacho: incluye GTF de salida y destino", () => {
    const out = seccionACsv("despacho", [linea()]).split("\r\n");
    const celdas = out[1].split(";");
    expect(celdas[9]).toBe("002-0000001");
    expect(celdas[10]).toBe("Maderera Lima SAC");
  });

  it("el pie no suma las anuladas", () => {
    const out = seccionACsv("despacho", [linea(), linea({ id: "b", quantity: "500", status: "anulado" })]).split("\r\n");
    expect(out.at(-1)).toContain("TOTAL (1 líneas vigentes)");
    expect(out.at(-1)!.split(";")[6]).toBe("10,0000");
  });

  it("el nombre del archivo lleva la sección y el período sin tildes", () => {
    expect(nombreArchivoSeccion("produccion", "Mayo 2026")).toBe("produccion-ctp-mayo-2026.csv");
  });
});

describe("tipos", () => {
  it("LineaCtp es el subconjunto que necesitan las facetas", () => {
    const l: LineaCtp = linea();
    expect(l.status).toBe("registrado");
  });
});
