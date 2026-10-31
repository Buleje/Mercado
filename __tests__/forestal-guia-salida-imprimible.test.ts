/**
 * La GTF de SALIDA del CTP lista para los papeles de la guía del Libro TH
 * (27-10): el talonario de la matricial y «con formato» imprimen las mismas
 * entradas que arma el servidor (`entradasGuiaSalida`). Aserrada → sólo el
 * detalle (37), sin lista; trozas que salen sin aserrar → su lista partida en
 * hojas. Y el talonario dice lo MISMO que la hoja SERFOR, casillero por
 * casillero (los dos salen de `cuerpoGuiaSalida`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-enabled-specs", () => ({ piezasDelNegocio: async () => ({ negocio: null, piezas: [] }) }));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,QR" } }));
vi.mock("@/lib/base-verificacion-cliente", () => ({ obtenerBaseVerificacion: async () => "https://bodega.pe" }));

import { casillerosGtf, cuerpoGtfOficial, detalleGtf, type LineaProducto } from "@/lib/forestal/ctp-gtf-formato";
import { documentoGtfSalida, lineasDeLaGuiaSalida, type GtfDespacho } from "@/lib/forestal/ctp-gtf-print";
import { faltantesGtf, leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { cuerpoGuiaSalida, entradasGuiaSalida, type GuiaSalidaImprimible } from "@/lib/forestal/guia-salida-imprimible";
import type { PiezaGuia } from "@/lib/forestal/loth-guia-despacho";
import type { PermisoDeGuia } from "@/lib/forestal/ctp-ficha-types";

const ficha = {
  nombreCtp: "CTP QA",
  razonSocial: "Aserradero QA SAC",
  ruc: "20123456789",
  codigoCtp: "CTP-25-001",
  distrito: "Callería",
  provincia: "Coronel Portillo",
  region: "Ucayali",
  logo: "data:image/png;base64,LOGO-PESADO",
};
const permisos: PermisoDeGuia[] = [{ codigo: "25-UCA/C-OPP-A-001-18", tipo: "CONCESION", resolucionNumero: "RD-123", vigenciaHasta: "2030-12-31", isActive: true }];

const datosCon = (guia: Record<string, unknown> = {}) =>
  leerGtfDatos({
    propietario: { nombre: "Aserradero QA", esElCtp: true },
    destinatario: { nombre: "Maderas Lima", direccion: "Av. Argentina 123" },
    transportista: { nombre: "Transportes Selva" },
    vehiculo: { placa: "ABC-123", conductor: "Juan Pérez", licencia: "Q12345678" },
    traslado: { puntoPartida: "Pucallpa", puntoLlegada: "Lima", fechaInicio: "2026-10-20", fechaFin: "2026-10-24" },
    titulos: ["25-UCA/C-OPP-A-001-18"],
    observaciones: "Carga con lona",
    guia,
  });

const linea = (comun: string, cientifico: string, tipoProducto: string, total: number): LineaProducto => ({
  cientifico, comun, tipoProducto, presentacion: "m³", cantidad: 40, unidad: "m³", total,
});
const aserrada = [
  linea("Tornillo", "Cedrelinga cateniformis", "Madera aserrada", 12.345),
  linea("Cumala", "Virola sp.", "Madera aserrada", 4.2),
  linea("Capirona", "Calycophyllum spruceanum", "Madera aserrada", 3.1),
];

const pieza = (i: number): PiezaGuia => ({
  codigo: `T-${String(i + 1).padStart(3, "0")}`, arbol: `A-${i + 1}`, comun: "Shihuahuaco", cientifico: "Dipteryx micrantha",
  cites: false, diamMayorM: 0.62, diamMenorM: 0.55, lengthM: 4.2, volumeM3: 1.13,
});

const guiaDe = (extra: Partial<GuiaSalidaImprimible>): GuiaSalidaImprimible => ({
  despachoId: "desp-1",
  lineNo: 63,
  lineIds: ["desp-1", "desp-2", "desp-3"],
  gtfNumber: "019-002-0000077",
  fecha: "2026-10-20",
  datos: datosCon(),
  lineas: aserrada,
  cadena: { corridas: [{ lineNo: 40, quantity: 12.345, guias: ["019-001-000123"] }, { lineNo: 41, quantity: 7.3, guias: ["019-001-000123", "019-001-000124"] }] },
  trozas: [],
  enRollo: false,
  titular: "Aserradero QA SAC",
  faltan: [],
  anulada: false,
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T15:00:00Z"));
});

describe("entradasGuiaSalida", () => {
  it("los datos de prueba arman una guía completa (si no, el test no prueba nada)", () => {
    expect(faltantesGtf(datosCon())).toEqual([]);
  });

  it("aserrada con 3 productos → 3 filas en el detalle (37) y ninguna lista", () => {
    const e = entradasGuiaSalida(guiaDe({}), ficha, permisos);
    expect(detalleGtf(e.cuerpo.lineas).filas).toHaveLength(3);
    expect(e.filas).toEqual([]);
    expect(e.listas).toMatchObject({ hojas: 1, casillero35: "019-002-0000077" });
    const c = casillerosGtf(e.cuerpo);
    // (32) cada guía de origen una sola vez aunque dos corridas la compartan.
    expect(c["36"]).toBe("019-001-000123, 019-001-000124");
    expect(c["35"]).toBe("019-002-0000077");
    // Quien emite la lista es el CTP; el logo no viaja en el JSON del talonario.
    expect(e.lista).toMatchObject({ titular: "Aserradero QA SAC", subtitulo: "Código de CTP: CTP-25-001", ruc: "20123456789", guia: "019-002-0000077" });
    expect(e.lista.ubicacion).toBe("Callería · Coronel Portillo · Ucayali");
    expect(e.cuerpo.ficha.logo).toBeUndefined();
    // El N° de lista de productos que escribió el operador va en el (35).
    const conNro = entradasGuiaSalida(guiaDe({ datos: datosCon({ listaTrozasNro: "LP-7" }) }), ficha, permisos);
    expect(casillerosGtf(conNro.cuerpo)["35"]).toBe("LP-7");
  });

  it("la partida de la salida va «No aplica» si el formulario no eligió el modo; un modo elegido se respeta", () => {
    const c = casillerosGtf(entradasGuiaSalida(guiaDe({}), ficha, permisos).cuerpo);
    expect([c.p17, c.p18, c.p19, c.p20a]).toEqual(["NO APLICA", "NO APLICA", "NO APLICA", "NO APLICA"]);
    const d = datosCon();
    const continua = { ...d, traslado: { ...d.traslado, partida: { ...d.traslado.partida, modo: "continua" as const, nombre: "Depósito Yarina" } } };
    expect(casillerosGtf(entradasGuiaSalida(guiaDe({ datos: continua }), ficha, permisos).cuerpo).p17).toBe("Depósito Yarina");
  });

  it("trozas que salen sin aserrar → su lista con todas las filas, partida de a 30 y numerada por hoja", () => {
    const trozas = Array.from({ length: 35 }, (_, i) => pieza(i));
    const rollo = [{ ...linea("Shihuahuaco", "Dipteryx micrantha", "Madera rolliza", 39.55), presentacion: "Trozas", cantidad: 35 }];
    const e = entradasGuiaSalida(
      guiaDe({ lineas: rollo, lineIds: ["desp-1"], trozas, enRollo: true, datos: datosCon({ listaTrozasNro: "9" }) }),
      ficha,
      permisos,
    );
    expect(e.filas).toHaveLength(35);
    expect(e.filas[0]).toMatchObject({ codificacion: "T-001", especieCientifica: "Dipteryx micrantha" });
    expect(e.listas).toMatchObject({ hojas: 2, filasPorHoja: 30, numeros: ["9", "10"] });
    expect(casillerosGtf(e.cuerpo)["35"]).toBe(e.listas.casillero35);
    expect(e.listas.casillero35).toContain("9");
  });

  it("el talonario dice lo mismo que la hoja SERFOR, casillero por casillero", async () => {
    const trozas = Array.from({ length: 35 }, (_, i) => pieza(i));
    for (const g of [guiaDe({}), guiaDe({ trozas, enRollo: true, datos: datosCon({ listaTrozasNro: "9" }) })]) {
      const e = entradasGuiaSalida(g, ficha, permisos);
      const despacho: GtfDespacho = {
        id: g.despachoId,
        lineNo: g.lineNo,
        entryDate: g.fecha,
        productType: g.lineas[0].tipoProducto,
        speciesCommon: g.lineas[0].comun,
        speciesScientific: g.lineas[0].cientifico,
        cites: false,
        quantity: String(g.lineas[0].total),
        unitLabel: "m³",
        pieces: g.lineas[0].cantidad,
        gtfNumber: g.gtfNumber,
        destino: "Lima",
      };
      const { logo: _logo, ...fichaSinLogo } = ficha;
      const hoja = await documentoGtfSalida(despacho, fichaSinLogo, g.cadena, g.datos, g.lineas, permisos, g.trozas.length);
      // La hoja A4 lleva, en cada copia, el MISMO cuerpo que imprime el talonario.
      expect(hoja.cuerpos[0]).toContain(cuerpoGtfOficial(e.cuerpo));
      // Y los casilleros son los del cuerpo que arma la hoja (con su logo: ninguno lo lee).
      const deLaHoja = cuerpoGuiaSalida({
        gtfNumber: despacho.gtfNumber,
        fecha: despacho.entryDate,
        ficha,
        datos: g.datos,
        lineas: lineasDeLaGuiaSalida(despacho, g.lineas),
        cadena: g.cadena,
        permisos,
        trozasEnLista: g.trozas.length,
      });
      expect(casillerosGtf(e.cuerpo)).toEqual(casillerosGtf(deLaHoja));
    }
  });
});
