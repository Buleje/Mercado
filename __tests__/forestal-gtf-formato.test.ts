import { describe, expect, it } from "vitest";
import {
  casillasOrigen,
  cuerpoGtfOficial,
  fechaGtf,
  tablaProductos,
} from "@/lib/forestal/ctp-gtf-formato";
import { gtfDatosVacio } from "@/lib/forestal/ctp-gtf-datos";
import { emptyCtpFicha } from "@/lib/forestal/ctp-ficha-types";

describe("fechaGtf", () => {
  it("imprime DD.MM.YYYY, como el talonario", () => {
    expect(fechaGtf("2024-12-18")).toBe("18.12.2024");
  });

  it("una fecha ausente o rota queda EN BLANCO, no como texto raro", () => {
    // El casillero vacío se llena a mano; un "Invalid Date" impreso invalida
    // la guía por enmendadura cuando alguien lo tacha.
    expect(fechaGtf("")).toBe("");
    expect(fechaGtf(null)).toBe("");
    expect(fechaGtf("ayer")).toBe("");
  });
});

describe("casillasOrigen — el (5) es un juego de casillas, no un texto", () => {
  it("dibuja TODAS las opciones para que se vea cuáles NO son", () => {
    const html = casillasOrigen("concesion");
    for (const label of ["Concesión", "Permiso", "Autorización", "Bosque Local", "Desbosque", "Plantación"]) {
      expect(html).toContain(label);
    }
  });

  it("cruza sólo la que corresponde", () => {
    const html = casillasOrigen("permiso");
    // Una sola X en todo el bloque.
    expect(html.match(/>X</g) ?? []).toHaveLength(1);
  });

  it("sin origen declarado no cruza ninguna", () => {
    expect(casillasOrigen("").match(/>X</g)).toBeNull();
    expect(casillasOrigen(undefined).match(/>X</g)).toBeNull();
  });
});

describe("tablaProductos", () => {
  const linea = (total: number) => ({
    cientifico: "Cedrelinga cateniformis", comun: "Tornillo", tipoProducto: "Madera aserrada",
    presentacion: "Trozas", cantidad: 2, unidad: "Metros Cúbicos", total,
  });

  it("el volumen total cierra con la suma del detalle", () => {
    const html = tablaProductos([linea(2.704), linea(10.607)]);
    expect(html).toContain("13.311");
  });

  it("sin líneas lo dice, en vez de una tabla vacía que parece un error", () => {
    expect(tablaProductos([])).toContain("Sin líneas declaradas");
  });

  it("escapa el contenido: un nombre con < no rompe el documento", () => {
    const html = tablaProductos([{ ...linea(1), comun: '<script>x</script>' }]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("cuerpoGtfOficial", () => {
  const base = {
    ficha: { ...emptyCtpFicha(), razonSocial: "CC.NN. San Luis", arffs: "GORE Pasco", region: "Pasco" },
    datos: gtfDatosVacio(),
    lineas: [],
    numeroGtf: "019-0000004",
    fechaExpedicion: "2024-12-18",
    listasTrozas: "019-0000004",
    gtfOrigen: "",
  };

  it("numera los casilleros que el puesto de control pide por número", () => {
    const html = cuerpoGtfOficial(base);
    for (const n of ["(2)", "(5)", "(13)", "(22)", "(29)", "(31)", "(35)", "(38)", "(39)", "(40)"]) {
      expect(html).toContain(n);
    }
  });

  it("NO afirma 'REGISTRADA' si SERFOR no devolvió un número", () => {
    // Imprimirlo sin serlo sería fabricar la constancia de un trámite que
    // Buleje no hace: el registro lo asigna el SNIFFS.
    const html = cuerpoGtfOficial(base);
    expect(html).not.toContain("ESTADO: REGISTRADA");
    expect(html).toContain("pendiente de registro");
  });

  it("lo afirma SÓLO con el número que devolvió SERFOR", () => {
    const html = cuerpoGtfOficial({ ...base, registroSerfor: "1-19-0313969" });
    expect(html).toContain("ESTADO: REGISTRADA");
    expect(html).toContain("1-19-0313969");
  });

  it("por río pide MATRÍCULA y patrón, no placa y conductor", () => {
    const datos = { ...gtfDatosVacio() };
    datos.vehiculo = { ...datos.vehiculo, modo: "fluvial" as const };
    const html = cuerpoGtfOficial({ ...base, datos });
    expect(html).toContain("Matrícula N°");
    expect(html).toContain("Patrón");
  });

  it("un casillero sin dato va vacío, nunca con un guión que parezca declarado", () => {
    const html = cuerpoGtfOficial(base);
    expect(html).not.toContain("<b>—</b>");
  });
});

describe("detalles del formato que se ven en el papel", () => {
  const base = {
    ficha: { ...emptyCtpFicha(), representante: "Osvaldo Muños" },
    datos: gtfDatosVacio(), lineas: [], numeroGtf: "019-1",
    fechaExpedicion: "2024-12-18", listasTrozas: "", gtfOrigen: "",
  };

  it("un campo sin número no dibuja un '()' huérfano", () => {
    // El representante legal cuelga del (7): no tiene casillero propio.
    expect(cuerpoGtfOficial(base)).not.toContain("()</span>");
  });

  it("el tipo de transporte se lee entero, no el valor del enum", () => {
    expect(cuerpoGtfOficial(base)).toContain("Terrestre");
    expect(cuerpoGtfOficial(base)).not.toContain(">terrestre<");
  });
});
