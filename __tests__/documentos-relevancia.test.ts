import { describe, it, expect } from "vitest";
import {
  buscarIndice,
  coincidenciaDe,
  contenidoCrudo,
  descripcionDe,
  fragmentoDe,
  ordenarPorRelevancia,
  tieneDescripcion,
  type DocBuscable,
} from "@/lib/documentos/relevancia";
import { conDescripcionPropia, construirTextoBuscable, MARCA_DESC_PROPIA } from "@/lib/documents/texto-buscable";
import { motivoDeFalloIA } from "@/lib/documents/aviso-ia";
import { palabrasUtiles } from "@/lib/documentos/terminos-busqueda";

const doc = (over: Partial<DocBuscable> = {}): DocBuscable => ({
  name: "IMG_2034.pdf",
  tags: [],
  aiTags: [],
  ocrText: null,
  ocrMetadata: null,
  uploadedAt: "2026-07-01T10:00:00.000Z",
  ...over,
});

describe("buscarIndice — sin tildes ni mayúsculas", () => {
  it("encuentra ignorando tildes en el texto y en la búsqueda", () => {
    expect(buscarIndice("Descripción del local", "descripcion")).toBe(0);
    expect(buscarIndice("Descripcion del local", "descripción")).toBe(0);
    expect(buscarIndice("Bodega SAN MARTÍN", "san martin")).toBe(7);
  });

  it("devuelve -1 cuando no está", () => {
    expect(buscarIndice("contrato de alquiler", "factura")).toBe(-1);
    expect(buscarIndice("", "algo")).toBe(-1);
  });

  it("el índice sigue apuntando al texto ORIGINAL (el plegado no corre las posiciones)", () => {
    const texto = "Ñandú: contrato";
    const i = buscarIndice(texto, "contrato");
    expect(texto.slice(i, i + 8)).toBe("contrato");
  });
});

describe("fragmentoDe", () => {
  it("recorta alrededor y marca el pedazo que coincide", () => {
    const f = fragmentoDe("a".repeat(80) + " alquiler del local " + "b".repeat(80), "alquiler", 10);
    expect(f?.match).toBe("alquiler");
    expect(f?.antes.startsWith("…")).toBe(true);
    expect(f?.despues.endsWith("…")).toBe(true);
  });

  it("sin coincidencia devuelve null", () => {
    expect(fragmentoDe("hola", "chau")).toBeNull();
  });
});

describe("descripciones", () => {
  it("la escrita por la persona le gana a la de la IA", () => {
    const d = doc({ ocrMetadata: { description: "Lo que dijo la IA", descripcionUsuario: "Lo que sé yo" } });
    expect(descripcionDe(d)).toEqual({ texto: "Lo que sé yo", fuente: "usuario" });
  });

  it("si no hay descripción de IA se usa su resumen", () => {
    expect(descripcionDe(doc({ ocrMetadata: { summary: "Boleta de luz" } }))).toEqual({
      texto: "Boleta de luz",
      fuente: "ia",
    });
  });

  it("sin nada, no hay descripción", () => {
    expect(tieneDescripcion(doc())).toBe(false);
    expect(tieneDescripcion(doc({ ocrMetadata: { description: "  " } }))).toBe(false);
  });
});

describe("contenidoCrudo — separa el archivo de lo que agregó la IA", () => {
  it("corta en el primer bloque agregado", () => {
    const buscable = construirTextoBuscable({
      texto: "TEXTO DEL ARCHIVO",
      descripcion: "Contrato de alquiler del local de Pucallpa",
      keyFacts: ["Renta: S/1500"],
      tags: ["contrato"],
    });
    expect(contenidoCrudo(buscable).trim()).toBe("TEXTO DEL ARCHIVO");
    expect(buscable).toContain("[Descripción] Contrato de alquiler");
  });
});

describe("coincidenciaDe — dónde apareció", () => {
  it("prefiere el nombre sobre el contenido", () => {
    const d = doc({ name: "contrato-local.pdf", ocrText: "bla bla contrato bla" });
    expect(coincidenciaDe(d, ["contrato"])?.campo).toBe("nombre");
  });

  it("encuentra por la descripción de la IA cuando el nombre no dice nada", () => {
    const d = doc({ ocrMetadata: { description: "Contrato de alquiler del local de la bodega" } });
    const c = coincidenciaDe(d, ["alquiler"]);
    expect(c?.campo).toBe("descripcion");
    expect(c?.fragmento?.match).toBe("alquiler");
  });

  it("la descripción propia pesa más que la de la IA", () => {
    const d = doc({ ocrMetadata: { description: "algo de alquiler", descripcionUsuario: "alquiler del puesto 3" } });
    expect(coincidenciaDe(d, ["alquiler"])?.campo).toBe("propia");
  });

  it("más términos encontrados = más puntaje", () => {
    const d = doc({ ocrMetadata: { description: "Contrato de alquiler del local en Pucallpa" } });
    const uno = coincidenciaDe(d, ["alquiler"])!.puntaje;
    const dos = coincidenciaDe(d, ["alquiler", "pucallpa"])!.puntaje;
    expect(dos).toBeGreaterThan(uno);
  });

  it("sin coincidencia devuelve null", () => {
    expect(coincidenciaDe(doc({ name: "foto.jpg" }), ["factura"])).toBeNull();
    expect(coincidenciaDe(doc({ name: "foto.jpg" }), ["a"])).toBeNull(); // 1 letra no cuenta
  });
});

describe("ordenarPorRelevancia", () => {
  it("el que coincide en el nombre va antes que el que coincide en el cuerpo", () => {
    const porNombre = doc({ name: "alquiler-2026.pdf", uploadedAt: "2020-01-01T00:00:00.000Z" });
    const porCuerpo = doc({ name: "escaneo.pdf", ocrText: "algo de alquiler perdido en la página 8" });
    const [primero] = ordenarPorRelevancia([porCuerpo, porNombre], ["alquiler"]);
    expect(primero.name).toBe("alquiler-2026.pdf");
  });

  it("los que no coinciden quedan al final, recientes primero", () => {
    const coincide = doc({ name: "alquiler.pdf" });
    const viejo = doc({ name: "otro.pdf", uploadedAt: "2020-01-01T00:00:00.000Z" });
    const nuevo = doc({ name: "otro2.pdf", uploadedAt: "2026-07-20T00:00:00.000Z" });
    const orden = ordenarPorRelevancia([viejo, nuevo, coincide], ["alquiler"]).map((d) => d.name);
    expect(orden).toEqual(["alquiler.pdf", "otro2.pdf", "otro.pdf"]);
  });
});

describe("conDescripcionPropia — el bloque de la persona es reemplazable", () => {
  it("agrega el bloque al final", () => {
    expect(conDescripcionPropia("texto", "mía")).toBe(`texto${MARCA_DESC_PROPIA}mía`);
  });

  it("es idempotente: reemplaza, no acumula", () => {
    const uno = conDescripcionPropia("texto", "primera");
    const dos = conDescripcionPropia(uno, "segunda");
    expect(dos).toBe(`texto${MARCA_DESC_PROPIA}segunda`);
    expect(dos.split(MARCA_DESC_PROPIA)).toHaveLength(2);
  });

  it("vacío la borra sin tocar el resto", () => {
    expect(conDescripcionPropia(`texto${MARCA_DESC_PROPIA}algo`, "  ")).toBe("texto");
  });

  it("sobrevive al re-análisis de la IA (entra por construirTextoBuscable)", () => {
    const reanalizado = construirTextoBuscable({
      texto: "texto nuevo",
      descripcion: "descripción nueva de la IA",
      descripcionPropia: "es el contrato del puesto 3",
    });
    expect(reanalizado).toContain(`${MARCA_DESC_PROPIA}es el contrato del puesto 3`);
    // En el texto buscable (lo que matchea el servidor) sigue estando, y el
    // bloque no se cuenta como "contenido del archivo": se lee de ocrMetadata,
    // que es lo que le da su etiqueta propia en la lista.
    const d = doc({ ocrText: reanalizado, ocrMetadata: { descripcionUsuario: "es el contrato del puesto 3" } });
    expect(contenidoCrudo(reanalizado)).not.toContain("puesto 3");
    expect(coincidenciaDe(d, ["puesto 3"])?.campo).toBe("propia");
  });
});

describe("motivoDeFalloIA — el error del proveedor, en castellano", () => {
  it("sin cupo diario: dice qué pasó, que el texto no se perdió y cuándo volver", () => {
    const crudo = "Failed after 3 attempts. Last error: Rate limit reached for model `llama-3.3-70b-versatile` on tokens per day (TPD): Limit 100000, Used 99596. Please try again in 45m11.626s. Need more tokens?";
    const msg = motivoDeFalloIA(crudo);
    expect(msg).toContain("tope por hoy");
    expect(msg).toContain("45m11s"); // sin milésimas: no le sirven a nadie
    expect(msg).toContain("quedó guardado");
  });

  it("credencial rechazada se distingue del cupo", () => {
    expect(motivoDeFalloIA("401 Unauthorized: invalid api key")).toMatch(/credencial|API key/i);
  });

  it("cualquier otra cosa invita a reintentar", () => {
    expect(motivoDeFalloIA("socket hang up")).toMatch(/probá de nuevo/i);
  });
});

describe("palabrasUtiles — el relleno del castellano no se busca", () => {
  it("saca las palabras vacías", () => {
    expect(palabrasUtiles("la factura del proveedor de arroz")).toEqual(["factura", "proveedor", "arroz"]);
  });

  it("descarta las de una letra y baja a minúsculas", () => {
    expect(palabrasUtiles("El Roble S")).toEqual(["roble"]);
  });

  it("si TODO es relleno, busca eso igual (mejor algo que nada)", () => {
    expect(palabrasUtiles("de la")).toEqual(["de", "la"]);
  });
});
