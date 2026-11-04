import { describe, expect, it } from "vitest";
import { armarAviso, consultaDeProveedor, fechaDelDato } from "@/lib/forestal/aviso-proveedor";
import { revisarGrupo, type GrupoRevision } from "@/lib/forestal/revision-proveedores";
import { buscarInfractor, type SancionSerfor } from "@/lib/forestal/serfor-infractores";
import type { ResumenOsinfor } from "@/lib/forestal/osinfor-supervisiones";
import { PROVEEDOR_INVENTARIO_APERTURA } from "@/lib/forestal/ctp-serfor-a-libro";

const LISTA: SancionSerfor[] = [
  {
    infractor: "MADERERA EL RIO S.A.C.",
    documento: "20601234567",
    tituloHab: null,
    resolucion: "RA D000511-2023-GRU-GGR-GERFFS",
    fecha: "2023-09-12",
    organo: "ARFFS",
    ambito: "GORE UCAYALI",
  },
  {
    infractor: "PEREZ RAMOS, JUAN",
    documento: "41234567",
    tituloHab: "25-PUC/C-J-058-03",
    resolucion: "RD 00692-2021-OSINFOR/08.2",
    fecha: "2021-05-03",
    organo: "OSINFOR",
    ambito: "UCAYALI",
  },
];

const osinfor = (codigo: string, nivel: ResumenOsinfor["nivel"], extra: Partial<ResumenOsinfor> = {}): ResumenOsinfor => ({
  codigo,
  nivel,
  titulo: "",
  detalle: "",
  titular: null,
  supervisiones: [],
  enRoja: nivel === "rojo" ? 1 : 0,
  pauEnTramite: nivel === "ambar" ? 1 : 0,
  esPlantacion: false,
  ...extra,
});

function grupo(nombre: string, documento: string | null, codigos: string[]): GrupoRevision {
  return {
    clave: "aviso",
    parteId: null,
    nombre,
    documento,
    permisos: codigos.map((codigo, i) => ({ id: `p${i}`, codigo, titularNombre: "", titularId: null, titularDoc: null })),
  };
}

const FUENTES = { corteSerfor: "2026-10-13", serforRespondio: true, consultadoEn: "2026-11-04T19:32:00.000Z" };

describe("consultaDeProveedor", () => {
  it("sin nada útil no consulta (la existencia de apertura no tiene a quién revisar)", () => {
    expect(consultaDeProveedor({ nombre: "", documento: "", codigo: "" })).toBeNull();
    expect(consultaDeProveedor({ nombre: PROVEEDOR_INVENTARIO_APERTURA })).toBeNull();
    expect(consultaDeProveedor({ nombre: "Juan", documento: "123" })).toBeNull();
  });

  it("la clave no cambia por mayúsculas, espacios u orden del nombre", () => {
    const a = consultaDeProveedor({ nombre: "Juan Perez Ramos", codigo: "25-PUC/C-J-058-03" });
    const b = consultaDeProveedor({ nombre: "PEREZ RAMOS, juan", codigo: " 25-puc/c-j-058-03 " });
    expect(a?.clave).toBe(b?.clave);
  });

  it("un código con comillas no se manda a OSINFOR", () => {
    expect(consultaDeProveedor({ codigo: "25-PUC' OR 1=1" })?.codigo ?? null).toBeNull();
  });
});

describe("armarAviso", () => {
  it("RUC sancionado = rojo con la fecha de la última sanción y la fuente", () => {
    const serfor = buscarInfractor(LISTA, { documento: "20601234567", nombre: "Maderera El Río SAC" }, "2026-10-13");
    const fila = revisarGrupo(grupo("Maderera El Río SAC", "20601234567", []), [serfor], new Map());
    const a = armarAviso(fila, FUENTES);
    expect(a.tono).toBe("rojo");
    expect(a.titulo).toBe("Sancionado en SERFOR: 1 sanción (la última del 12/09/2023)");
    expect(a.fuentes).toHaveLength(1);
    expect(a.fuentes[0]).toMatchObject({ fecha: "2026-10-13", como: "lista_al", respondio: true });
  });

  it("permiso en lista roja de OSINFOR sin sanción en SERFOR = rojo por OSINFOR", () => {
    const serfor = buscarInfractor(LISTA, { nombre: "Comunidad Nativa Nueva Luz", codigo: "17-SEC/P-MAD-001-20" }, "2026-10-13");
    const mapa = new Map([["17-SEC/P-MAD-001-20", osinfor("17-SEC/P-MAD-001-20", "rojo")]]);
    const fila = revisarGrupo(grupo("Comunidad Nativa Nueva Luz", null, ["17-SEC/P-MAD-001-20"]), [serfor], mapa);
    const a = armarAviso(fila, FUENTES);
    expect(a.tono).toBe("rojo");
    expect(a.titulo).toContain("lista roja de OSINFOR");
    expect(a.fuentes.map((f) => f.nombre)).toEqual(["Registro de Infractores de SERFOR", "Mapa de OSINFOR"]);
  });

  it("el permiso sancionado a OTRA persona = ámbar, no rojo", () => {
    const serfor = buscarInfractor(
      LISTA,
      // DNI contra DNI: otra persona de verdad (un RUC 20 contra un DNI no prueba nada).
      { documento: "47777777", nombre: "Rosa Diaz Vela", codigo: "25-PUC/C-J-058-03" },
      "2026-10-13",
    );
    const mapa = new Map([["25-PUC/C-J-058-03", osinfor("25-PUC/C-J-058-03", "verde")]]);
    const fila = revisarGrupo(grupo("Rosa Diaz Vela", "47777777", ["25-PUC/C-J-058-03"]), [serfor], mapa);
    const a = armarAviso(fila, FUENTES);
    expect(a.tono).toBe("ambar");
    expect(a.titulo).toBe("El permiso tiene 1 sanción a otra persona");
  });

  it("limpio con las dos fuentes = línea «revisado»; si OSINFOR no respondió, nunca dice limpio", () => {
    const serfor = buscarInfractor(LISTA, { documento: "20608888888", codigo: "25-PUC/C-J-100-01" }, "2026-10-13");
    const ok = revisarGrupo(
      grupo("Forestal Limpia SAC", "20608888888", ["25-PUC/C-J-100-01"]),
      [serfor],
      new Map([["25-PUC/C-J-100-01", osinfor("25-PUC/C-J-100-01", "verde")]]),
    );
    expect(armarAviso(ok, FUENTES).tono).toBe("revisado");

    const sinOsinfor = revisarGrupo(
      grupo("Forestal Limpia SAC", "20608888888", ["25-PUC/C-J-100-01"]),
      [serfor],
      new Map([["25-PUC/C-J-100-01", null]]),
    );
    const a = armarAviso(sinOsinfor, FUENTES);
    expect(a.tono).toBe("incompleto");
    expect(a.titulo).toContain("Mapa de OSINFOR no respondió");
  });

  it("SERFOR caído + sin permiso = incompleto (no verde)", () => {
    const fila = revisarGrupo(grupo("Forestal X SAC", "20608888888", []), [], new Map());
    expect(armarAviso(fila, { ...FUENTES, serforRespondio: false }).tono).toBe("incompleto");
  });
});

describe("fechaDelDato", () => {
  it("date-only sin correrse de día", () => {
    expect(fechaDelDato("2026-10-13")).toBe("13/10/2026");
    expect(fechaDelDato(null)).toBe("sin fecha");
  });
});
