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
