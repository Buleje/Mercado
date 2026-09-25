import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  esNumeroRegistroValido,
  intentosConsulta,
  normalizarNumeroRegistro,
  parsearConsultaGtf,
  urlConsultaGtf,
} from "@/lib/forestal/serfor-gtf";

/**
 * La consulta pública de GTF es un JSP viejo de SERFOR: su HTML puede cambiar sin
 * aviso y no hay contrato que lo garantice. Los fixtures son respuestas REALES
 * del servicio (2026-07-30) — la encontrada es una guía de verdad, con los datos
 * de personas cambiados por ficticios.
 */

const fx = (n: string) => readFileSync(join(process.cwd(), "__tests__/fixtures", n), "utf8");
const noEncontrada = fx("serfor-gtf-no-encontrada.html");
const encontrada = fx("serfor-gtf-encontrada.html");

describe("SERFOR · URL de consulta", () => {
  it("manda los TRES parámetros: sin ellos el servlet tira 500", () => {
    const url = new URL(urlConsultaGtf("1-19-0313629"));
    expect(url.origin + url.pathname).toBe("https://sniffs.serfor.gob.pe/control/gtf/consultas/consultarGtf.do");
    expect(url.searchParams.get("nuRegistroGuia")).toBe("1-19-0313629");
    expect(url.searchParams.get("tipoBusqueda")).toBe("GTF");
    expect(url.searchParams.get("tipoSeguimiento")).toBe("MAP");
    expect(new URL(urlConsultaGtf("1-19-0313629", "SEG")).searchParams.get("tipoBusqueda")).toBe("SEG");
  });

  it("CONSERVA los guiones: sin ellos SERFOR no encuentra la guía", () => {
    expect(normalizarNumeroRegistro(" 1-19-0313629 ")).toBe("1-19-0313629");
    expect(esNumeroRegistroValido("1-19-0313629")).toBe(true);
    expect(esNumeroRegistroValido("46")).toBe(false);
    expect(esNumeroRegistroValido("ABC-123")).toBe(false);
  });

  it("prueba las dos escrituras del número en los dos modos del formulario", () => {
    expect(intentosConsulta("1-19-0313629").map((i) => `${i.numero}|${i.modo}`)).toEqual([
      "1-19-0313629|GTF",
      "1-19-0313629|SEG",
      "1190313629|GTF",
      "1190313629|SEG",
    ]);
  });
});

describe("SERFOR · guía inexistente (respuesta real)", () => {
  const r = parsearConsultaGtf(noEncontrada, "461363");

  it("la reconoce como no encontrada, no como error", () => {
    expect(r.estado).toBe("no_encontrada");
    expect(r.gtf).toBeNull();
  });

  it("conserva el mensaje de SERFOR en sus palabras", () => {
    expect(r.mensaje).toMatch(/No se encontraron datos/i);
    expect(r.mensaje).toMatch(/no existe en nuestra base de datos/i);
  });
});

describe("SERFOR · guía real 1-19-0313629", () => {
  const r = parsearConsultaGtf(encontrada, "1-19-0313629");
  const g = r.gtf!;

  it("la encuentra y trae la cabecera del registro", () => {
    expect(r.estado).toBe("encontrada");
    expect(g.numeroRegistro).toBe("1-19-0313629");
    expect(g.gtfNumber).toBe("019-0000003");
    expect(g.estado).toBe("Activa");
    expect(g.fechaExpedicion).toBe("17/12/2024");
    expect(g.fechaVencimiento).toBe("24/12/2024");
  });

  it("trae al titular con su título habilitante y su resolución", () => {
    expect(g.titular).toBe("COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI");
    expect(g.origenRecurso).toBe("PERMISO");
    expect(g.numeroTitulo).toBe("19-SEC/PER-FMC-2024-008");
    expect(g.numeroResolucion).toMatch(/D000485-2024-MIDAGRI-SERFOR-ATFFS SELVA CENTRAL/);
    expect(g.rucInstancia).toBe("20156701263");
    expect(g.departamento).toBe("PASCO");
    expect(g.provincia).toBe("OXAPAMPA");
    expect(g.distrito).toBe("PUERTO BERMUDEZ");
  });

  it("separa propietario y destinatario aunque compartan etiquetas", () => {
    // Las tres secciones repiten "Dirección", "Departamento"…: si no se cortan
    // por su título, el destinatario termina con los datos del titular.
    expect(g.propietario).toBe("COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI");
    expect(g.destinatario).toBe("INVERSIONES AGROFORESTALES BLAS SAC");
    expect(g.destinatarioDistrito).toBe("CONSTITUCION");
    expect(g.destinatarioDireccion).toMatch(/JOSE MARIA ARGUEDAS/);
  });

  it("trae los datos del transporte", () => {
    expect(g.tipoTransporte).toBe("Terrestre");
    expect(g.tipoVehiculo).toBe("Camión / Carreta");
    expect(g.placa).toMatch(/V2H-901/);
  });

  it("lee el detalle del producto con sus volúmenes", () => {
    expect(g.productos).toHaveLength(2);
    expect(g.productos[0]).toMatchObject({
      cientifico: "Copaifera reticulata Ducke",
      comun: "Copaiba",
      tipoProducto: "MADERA EN ROLLO",
      presentacion: "TROZAS",
      volumen: 9.065,
    });
    expect(g.productos[1]).toMatchObject({ comun: "Sapotillo", volumen: 4.874 });
  });

  it("toma el volumen total que DECLARA la guía, sin recalcularlo", () => {
    expect(g.volumenTotal).toBe(13.939);
  });

  it("lee la lista de trozas con codificación y dimensiones", () => {
    expect(g.trozas.length).toBeGreaterThanOrEqual(2);
    expect(g.trozas[0]?.codificacion).toBeTruthy();
    expect(g.trozas[0]?.dimensiones).toMatch(/X/);
  });

  it("guarda todo lo publicado por si aparece una etiqueta nueva", () => {
    expect(Object.keys(g.campos).length).toBeGreaterThan(20);
  });
});

describe("SERFOR · respuestas raras", () => {
  it("una respuesta vacía es 'sin respuesta', no una guía sin datos", () => {
    expect(parsearConsultaGtf("", "1").estado).toBe("sin_respuesta");
  });

  it("HTML sin nada reconocible tampoco se toma como guía encontrada", () => {
    expect(parsearConsultaGtf("<html><body><p>mantenimiento</p></body></html>", "1").estado).toBe("sin_respuesta");
  });
});
