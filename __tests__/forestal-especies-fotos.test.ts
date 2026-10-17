import { describe, it, expect } from "vitest";
import {
  claveEspecie,
  construirFoto,
  especiesSinFoto,
  fotoDe,
  indexarFotos,
  urlDeFotoValida,
  type FotoEspecie,
} from "@/lib/forestal/especies-fotos";

/**
 * Biblioteca de fotos de referencia (port del módulo `baseimg` del ERP forestal).
 * Lo que se testea es lo que hace que la foto APAREZCA: si la clave no tolera
 * cómo escribió el nombre cada guía, la foto queda cargada pero invisible.
 */

const foto = (over: Partial<FotoEspecie> = {}): FotoEspecie => ({
  clave: "cumala",
  nombre: "Cumala",
  cientifico: "Virola sp.",
  url: "https://abc.supabase.co/storage/v1/object/public/media/image-bank/cumala.webp",
  nota: "",
  actualizado: "2026-08-01T00:00:00.000Z",
  actualizadoPor: "qaadmin",
  ...over,
});

describe("clave de especie", () => {
  it("iguala mayúsculas, tildes y espacios de más", () => {
    expect(claveEspecie("Cumala Blanca")).toBe("cumala blanca");
    expect(claveEspecie("  CUMALA   BLANCA ")).toBe("cumala blanca");
    expect(claveEspecie("Marupá")).toBe("marupa");
  });

  it("un nombre vacío no es una clave", () => {
    expect(claveEspecie("   ")).toBe("");
    expect(claveEspecie(null)).toBe("");
  });
});

describe("de dónde puede venir la imagen", () => {
  it("acepta el storage propio y las rutas del sitio", () => {
    expect(urlDeFotoValida("https://abc.supabase.co/storage/v1/object/public/media/x.webp")).toBe(true);
    expect(urlDeFotoValida("/img/tornillo.webp")).toBe(true);
  });

  it("rechaza hotlinks: una foto de un tercero puede cambiar o caerse", () => {
    expect(urlDeFotoValida("https://cualquier-sitio.com/foto.jpg")).toBe(false);
    expect(urlDeFotoValida("javascript:alert(1)")).toBe(false);
    expect(urlDeFotoValida("")).toBe(false);
  });
});

describe("construir la entrada", () => {
  it("normaliza y sella quién la puso", () => {
    const f = construirFoto(
      { nombre: "  Cumala Blanca ", cientifico: " Virola sp. ", url: "/img/c.webp", nota: "corteza" },
      "brandon",
      "2026-08-01T10:00:00.000Z",
    );
    expect(f).not.toBeNull();
    expect(f!.clave).toBe("cumala blanca");
    expect(f!.nombre).toBe("Cumala Blanca");
    expect(f!.cientifico).toBe("Virola sp.");
    expect(f!.actualizadoPor).toBe("brandon");
  });

  it("sin nombre o con una URL ajena no se guarda nada", () => {
    expect(construirFoto({ nombre: "", url: "/img/c.webp" }, "x", "t")).toBeNull();
    expect(construirFoto({ nombre: "Cumala", url: "https://otro.com/c.jpg" }, "x", "t")).toBeNull();
  });
});

describe("resolver la foto de una fila del libro", () => {
  const indice = indexarFotos([foto(), foto({ clave: "tornillo", nombre: "Tornillo" })]);

  it("encuentra sin importar cómo esté escrito el nombre", () => {
    expect(fotoDe(indice, "CUMALA")?.nombre).toBe("Cumala");
    expect(fotoDe(indice, " tornillo ")?.nombre).toBe("Tornillo");
  });

  it("cae al género cuando la guía trae la especie completa", () => {
    // La biblioteca tiene "Cumala"; la guía dice "Cumala blanca".
    expect(fotoDe(indice, "Cumala blanca")?.nombre).toBe("Cumala");
  });

  it("sin foto devuelve null, no una imagen de otra especie", () => {
    expect(fotoDe(indice, "Shihuahuaco")).toBeNull();
    expect(fotoDe(indice, "")).toBeNull();
  });
});

describe("qué falta cargar", () => {
  it("lista las especies del libro sin foto, sin repetir", () => {
    const indice = indexarFotos([foto()]);
    expect(especiesSinFoto(indice, ["Cumala", "Tornillo", "tornillo", "Capirona", null, "  "])).toEqual([
      "Capirona",
      "Tornillo",
    ]);
  });
});
