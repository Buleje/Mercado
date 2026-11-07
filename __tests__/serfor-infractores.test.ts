import { describe, expect, it } from "vitest";
import {
  buscarInfractor,
  codigoComparable,
  documentoDe,
  fechaIso,
  nombreComparable,
  parsearInfractores,
  personaDelDocumento,
} from "@/lib/forestal/serfor-infractores";

// Filas con la forma real de INFRACTORES_202.csv (04-11-2026): BOM, celdas partidas
// con salto de línea dentro de comillas y fechas vacías.
const CSV = [
  "﻿Numero,Infractor,DocumentoIdentidad,tituloHab,Resolucion,FechaResolucion,OrganoSancionador,AmbitoInfraccion",
  "1,6 HERMANOS V & M S.A.C.,20603533811,,RA N° D000229-2022-MIDAGRI-SERFOR-ATFFS-LIMA,31/01/2022,ARFFS,ATFFS LIMA",
  "2,A&Q WOOD TECH EIRL,20602312420,,RA N° D000016-2026-MIDAGRI-SERFOR-ATFFS-SELVA CENTRAL,12/01/2026,ARFFS,ATFFS SELVA CENTRAL",
  "16,ACEVES PEDRO MERCADO BASTIDAS,21010291,25-UCA-ATA/PER-FMP-2018-038,RD N 00692-2021-OSINFOR-08.2,29/12/2021,OSINFOR,GORE UCAYALI",
  '46,ADRIÁN CANELOS QUIROZ,,"17-TAM/C-OPB-A-\n020-05",000075-2026-OSINFOR/DPSFFS,,OSINFOR,ATFFS APURIMAC',
  '60,"AGROFORESTAL COLPA\nS.A.C.",,"17-\nTAM/C-J-015-03",000074-2026-OSINFOR/DPSFFS,01/01/1900,OSINFOR,ATFFS APURIMAC',
  "70,JUAN PEREZ RAMOS,40112233,,RA 0001-2024-X,05/03/2024,ARFFS,GORE UCAYALI",
  "71,MERCADO BASTIDAS ACEVES PEDRO,21010291,25-UCA-ATA/PER-FMP-2018-038,00692-2021-OSINFOR/08.2,29/12/2021,OSINFOR,GORE UCAYALI",
  "72,OTRO TITULAR ANTERIOR,04963123,25-UCA-ATA/PER-FMP-2018-038,RD 0100-2019-OSINFOR,10/10/2019,OSINFOR,GORE UCAYALI",
  "73,SIN NUMERO DE RESOLUCION SAC,20111111111,,,01/01/1900,ARFFS,GORE UCAYALI",
  "",
].join("\r\n");

describe("parsearInfractores", () => {
  const filas = parsearInfractores(CSV);

  it("lee todas las filas, también las partidas en dos líneas", () => {
    expect(filas).toHaveLength(9);
    expect(filas[4].infractor).toBe("AGROFORESTAL COLPA S.A.C.");
  });

  it("junta el código del permiso partido y limpia el documento", () => {
    expect(filas[3].tituloHab).toBe("17-TAM/C-OPB-A-020-05");
    expect(filas[3].documento).toBeNull();
    expect(filas[0].documento).toBe("20603533811");
  });

  it("pasa la fecha a ISO y descarta el relleno de 1900", () => {
    expect(filas[0].fecha).toBe("2022-01-31");
    expect(filas[3].fecha).toBeNull();
    expect(filas[4].fecha).toBeNull();
  });

  it("la fila sin número de resolución se conserva", () => {
    expect(filas[8].resolucion).toBe("sin número de resolución");
  });

  it("sin las columnas que importan devuelve vacío en vez de inventar", () => {
    expect(parsearInfractores("a,b,c\n1,2,3")).toEqual([]);
  });
});

describe("normalizadores", () => {
  it("documento: solo DNI (8) o RUC (11)", () => {
    expect(documentoDe("RUC 20-603533811")).toBe("20603533811");
    expect(documentoDe("123")).toBeNull();
    expect(documentoDe("1549852")).toBe("01549852"); // DNI con el cero de adelante perdido
    expect(documentoDe("Partida N°12600025")).toBeNull();
    expect(documentoDe("ce 003608864")).toBeNull();
    expect(documentoDe("00000000000")).toBeNull();
  });

  it("RUC de persona natural = su DNI", () => {
    expect(personaDelDocumento("10401122334")).toBe("40112233");
    expect(personaDelDocumento("20603533811")).toBe("20603533811");
  });

  it("nombre: mismo orden no importa, puntos y tildes tampoco", () => {
    expect(nombreComparable("Pérez Ramos, Juan")).toBe(nombreComparable("JUAN PEREZ RAMOS"));
    expect(nombreComparable("6 Hermanos V&M SAC")).toBe(nombreComparable("6 HERMANOS V & M S.A.C."));
    expect(nombreComparable("COMUNIDAD")).toBeNull();
  });

  it("código y fecha", () => {
    expect(codigoComparable(" 17-tam/c-j-015-03 ")).toBe("17-TAM/C-J-015-03");
    expect(fechaIso("5/3/2024")).toBe("2024-03-05");
    expect(fechaIso("2024-03-05")).toBeNull();
  });
});

describe("buscarInfractor", () => {
  const filas = parsearInfractores(CSV);

  it("por RUC: segura", () => {
    const r = buscarInfractor(filas, { documento: "20602312420" }, "2026-10-13");
    expect(r.certeza).toBe("segura");
    expect(r.total).toBe(1);
    expect(r.coincidencias[0].motivo).toBe("documento");
    expect(r.corte).toBe("2026-10-13");
  });

  it("un RUC 10 encuentra la sanción publicada con el DNI", () => {
    const r = buscarInfractor(filas, { documento: "10401122334" });
    expect(r.certeza).toBe("segura");
    expect(r.coincidencias[0].infractor).toBe("JUAN PEREZ RAMOS");
  });

  it("por el código del permiso aunque en el CSV venga partido", () => {
    const r = buscarInfractor(filas, { codigo: "17-TAM/C-J-015-03" });
    expect(r.certeza).toBe("segura");
    expect(r.coincidencias[0].motivo).toBe("permiso");
  });

  it("solo el nombre: pide confirmar", () => {
    const r = buscarInfractor(filas, { nombre: "Canelos Quiroz Adrián" });
    expect(r.certeza).toBe("por_nombre");
    expect(r.titulo).toMatch(/mismo nombre/);
  });

  it("mismo nombre con otro documento = homónimo, no cuenta", () => {
    const r = buscarInfractor(filas, { nombre: "JUAN PEREZ RAMOS", documento: "47778899" });
    expect(r.certeza).toBe("ninguna");
    expect(r.titulo).toBe("No figura en el Registro de Infractores de SERFOR");
  });

  it("lo seguro va antes que lo del nombre y no se repite", () => {
    const r = buscarInfractor(filas, { documento: "40112233", nombre: "JUAN PEREZ RAMOS" });
    expect(r.total).toBe(1);
    expect(r.coincidencias[0].motivo).toBe("documento");
  });

  it("la misma sanción escrita de dos formas cuenta una vez", () => {
    const r = buscarInfractor(filas, { documento: "21010291" });
    expect(r.total).toBe(1);
  });

  it("la certeza no depende del orden de la lista: la misma sanción con y sin documento", () => {
    const conDoc = {
      infractor: "JUAN PEREZ RAMOS",
      documento: "40112233",
      tituloHab: null,
      resolucion: "RA 0001-2024-X",
      fecha: "2024-03-05",
      organo: "ARFFS",
      ambito: "GORE UCAYALI",
    };
    const sinDoc = { ...conDoc, documento: null };
    const busqueda = { documento: "40112233", nombre: "Juan Perez Ramos" };
    const ab = buscarInfractor([conDoc, sinDoc], busqueda);
    const ba = buscarInfractor([sinDoc, conDoc], busqueda);
    expect(ab.certeza).toBe("segura");
    expect(ba.certeza).toBe(ab.certeza);
    expect(ba.coincidencias).toEqual(ab.coincidencias);
    expect(ba.coincidencias).toHaveLength(1);
    expect(ba.coincidencias[0]?.motivo).toBe("documento");
  });

  it("sin nada válido con qué buscar NO dice «No figura", () => {
    const r = buscarInfractor(filas, { documento: "123", nombre: "x", codigo: "ab" });
    expect(r.certeza).toBe("sin_datos");
    expect(r.buscadoPor).toEqual([]);
    expect(r.titulo).not.toMatch(/^No figura/);
  });

  it("«no figura» dice con qué se buscó de verdad", () => {
    const r = buscarInfractor(filas, { nombre: "MARIA LOPEZ SOTO" });
    expect(r.certeza).toBe("ninguna");
    expect(r.detalle).toBe("Se buscó por su nombre y no aparece en la lista pública de SERFOR.");
  });

  it("el permiso con sanciones a OTRA persona no se le atribuye al titular", () => {
    const r = buscarInfractor(filas, { documento: "47778899", codigo: "25-UCA-ATA/PER-FMP-2018-038" });
    expect(r.certeza).toBe("del_permiso");
    expect(r.titulo).toMatch(/otras personas/);
    expect(r.coincidencias.every((c) => c.motivo === "permiso_otro")).toBe(true);
  });

  it("un DNI no descarta a una empresa buscada por RUC y nombre (clases distintas)", () => {
    const csv = "Numero,Infractor,DocumentoIdentidad,tituloHab,Resolucion,FechaResolucion,OrganoSancionador,AmbitoInfraccion\n1,ASOCIACION CERRO FORTALEZA DEL SUR,14133510,,RA 0005-2024-X,01/02/2024,ARFFS,GORE UCAYALI";
    const r = buscarInfractor(parsearInfractores(csv), { documento: "20555555551", nombre: "Asociación Cerro Fortaleza del Sur" });
    expect(r.certeza).toBe("por_nombre");
  });
});
