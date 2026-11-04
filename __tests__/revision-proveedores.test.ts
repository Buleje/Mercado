import { describe, expect, it } from "vitest";
import {
  agruparPorTitular,
  filasConAlerta,
  juntarSerfor,
  nivelDeFila,
  resumirRevision,
  revisarGrupo,
  type ParteRevisable,
  type PermisoRevisable,
} from "@/lib/forestal/revision-proveedores";
import { buscarInfractor, type SancionSerfor } from "@/lib/forestal/serfor-infractores";
import type { ResumenOsinfor } from "@/lib/forestal/osinfor-supervisiones";

// Forma real del 04-11-2026: la propia Blas por su RUC (2023) y una comunidad con 2 de 2026.
const SANCIONES: SancionSerfor[] = [
  {
    infractor: "INVERSIONES AGROFORESTALES BLAS SOCIEDAD ANONIMA CERRADA",
    documento: "20605859438",
    tituloHab: null,
    resolucion: "RESOLUCION ADMINISTRATIVA N° D000511-2023-MIDAGRI-SERFOR-ATFFS SELVA CENTRAL",
    fecha: "2023-09-12",
    organo: "ARFFS",
    ambito: "ATFFS SELVA CENTRAL",
  },
  {
    infractor: "COMUNIDAD NATIVA SEPTIMO UNIDOS DE SANTA FE DE AGUACHINI",
    documento: "20156700615",
    tituloHab: null,
    resolucion: "RA D000032-2026-MIDAGRI-SERFOR-ATFFS-SELVA CENTRAL",
    fecha: "2026-01-21",
    organo: "ARFFS",
    ambito: "ATFFS SELVA CENTRAL",
  },
  {
    infractor: "COMUNIDAD NATIVA SEPTIMO UNIDOS DE SANTA FE DE AGUACHINI",
    documento: "20156700615",
    tituloHab: "19-SEC/PER-FMC-2024-008",
    resolucion: "RA D000118-2026-MIDAGRI-SERFOR-ATFFS-SELVA CENTRAL",
    fecha: "2026-03-16",
    organo: "ARFFS",
    ambito: "ATFFS SELVA CENTRAL",
  },
  {
    infractor: "JUAN PEREZ RAMOS",
    documento: "40112233",
    tituloHab: null,
    resolucion: "RA 0001-2024-X",
    fecha: "2024-03-05",
    organo: "ARFFS",
    ambito: "GORE UCAYALI",
  },
];

const parte = (
  id: string,
  nombre: string,
  docNumero: string | null,
  roles: string[] = ["proveedor"],
): ParteRevisable => ({
  id,
  nombre,
  docNumero,
  roles,
});
const permiso = (
  id: string,
  codigo: string,
  titularNombre: string,
  extra: Partial<PermisoRevisable> = {},
): PermisoRevisable => ({
  id,
  codigo,
  titularNombre,
  titularId: null,
  titularDoc: null,
  ...extra,
});
const osinfor = (codigo: string, nivel: ResumenOsinfor["nivel"]): ResumenOsinfor => ({
  codigo,
  nivel,
  titulo: "",
  detalle: "",
  titular: null,
  supervisiones: [],
  enRoja: nivel === "rojo" ? 1 : 0,
  pauEnTramite: nivel === "ambar" ? 1 : 0,
  esPlantacion: false,
});

describe("agruparPorTitular", () => {
  it("pega cada permiso a su ficha por titularId, por RUC o por nombre; el que no encaja queda solo", () => {
    const grupos = agruparPorTitular(
      [
        parte("p1", "Comunidad Nativa Séptimo Unidos de Santa Fe de Aguachini", "20156700615"),
        parte("p2", "Juan Pérez Ramos", null),
        parte("p3", "Chofer Uno", "44556677", ["conductor"]),
      ],
      [
        permiso("k1", "19-SEC/PER-FMC-2024-008", "C.N. Séptimo Unidos", { titularId: "p1" }),
        permiso("k2", "25-UCA/PER-FMP-2019-001", "Otro nombre", { titularDoc: "20156700615" }),
        permiso("k3", "25-UCA/PER-FMP-2020-002", "JUAN PEREZ RAMOS"),
        permiso("k4", "25-UCA/PER-FMP-2021-003", "Titular Sin Ficha", {
          titularDoc: "10223344556",
        }),
      ],
    );
    const porClave = new Map(grupos.map((g) => [g.clave, g]));
    expect(porClave.get("parte:p1")?.permisos.map((k) => k.id)).toEqual(["k1", "k2"]);
    expect(porClave.get("parte:p2")?.permisos.map((k) => k.id)).toEqual(["k3"]);
    // El conductor no es titular de madera: no se revisa.
    expect(porClave.has("parte:p3")).toBe(false);
    expect(porClave.get("permiso:k4")).toMatchObject({
      parteId: null,
      nombre: "Titular Sin Ficha",
      documento: "10223344556",
    });
  });

  it("la ficha sin RUC toma el documento de su permiso", () => {
    const [g] = agruparPorTitular(
      [parte("p1", "Nelly", null)],
      [permiso("k1", "X-1", "Nelly", { titularId: "p1", titularDoc: "21010291" })],
    );
    expect(g?.documento).toBe("21010291");
  });
});

describe("juntarSerfor", () => {
  it("la misma resolución hallada por el documento y por el permiso cuenta una vez, con el motivo más fuerte", () => {
    const porDoc = buscarInfractor(SANCIONES, { documento: "20156700615" });
    const porPermiso = buscarInfractor(SANCIONES, { codigo: "19-SEC/PER-FMC-2024-008" });
    const { certeza, sanciones } = juntarSerfor([porPermiso, porDoc]);
    expect(certeza).toBe("segura");
    expect(sanciones.map((s) => s.resolucion)).toEqual([
      "RA D000118-2026-MIDAGRI-SERFOR-ATFFS-SELVA CENTRAL",
      "RA D000032-2026-MIDAGRI-SERFOR-ATFFS-SELVA CENTRAL",
    ]);
    expect(sanciones.every((s) => s.motivo === "documento")).toBe(true);
  });

  it("sin búsquedas = sin datos (nunca «limpio»)", () => {
    expect(juntarSerfor([]).certeza).toBe("sin_datos");
  });
});

describe("nivelDeFila", () => {
  const p = (nivel: ResumenOsinfor["nivel"] | null) => ({
    id: "k",
    codigo: "X",
    osinfor: nivel ? { nivel, enRoja: 0, pauEnTramite: 0, esPlantacion: false } : null,
    sinConsultar: false,
  });
  it("lista roja de OSINFOR pesa igual que una sanción segura", () => {
    expect(nivelDeFila("ninguna", [p("rojo")])).toBe("rojo");
    expect(nivelDeFila("segura", [p("verde")])).toBe("rojo");
  });
  it("PAU en trámite o sanción del permiso a otra persona = revisar", () => {
    expect(nivelDeFila("ninguna", [p("ambar")])).toBe("ambar");
    expect(nivelDeFila("del_permiso", [])).toBe("ambar");
  });
  it("solo el nombre = «mismo nombre»; nada = limpio; sin con qué buscar = sin datos", () => {
    expect(nivelDeFila("por_nombre", [p("sin_supervision")])).toBe("nombre");
    expect(nivelDeFila("ninguna", [p(null)])).toBe("limpio");
    expect(nivelDeFila("sin_datos", [])).toBe("sin_datos");
  });
});

describe("revisión completa (forma de Blas, 04-11-2026)", () => {
  it("encuentra a la propia Blas y a la comunidad, ordena lo grave primero y cuenta lo que falta", () => {
    const grupos = agruparPorTitular(
      [
        parte("blas", "INVERSIONES AGROFORESTALES BLAS SAC", "20605859438", [
          "proveedor",
          "destinatario",
        ]),
        parte("cn", "COMUNIDAD NATIVA SEPTIMO UNIDOS DE SANTA FE DE AGUACHINI", "20156700615"),
        parte("limpio", "Proveedor Limpio SAC", "20999999999"),
        parte("sinDoc", "Juan Perez Ramos", null),
      ],
      [
        permiso("k1", "19-SEC/PER-FMC-2024-008", "C.N. Séptimo", { titularId: "cn" }),
        permiso("k2", "25-UCA/C-J-001-01", "Proveedor Limpio SAC", { titularId: "limpio" }),
      ],
    );
    const os = new Map([
      ["19-SEC/PER-FMC-2024-008", osinfor("19-SEC/PER-FMC-2024-008", "sin_supervision")],
      ["25-UCA/C-J-001-01", null],
    ]);
    const filas = grupos.map((g) => {
      const busquedas = [
        ...(g.parteId ? [{ documento: g.documento, nombre: g.nombre }] : []),
        ...g.permisos.map((k) => ({
          codigo: k.codigo,
          documento: k.titularDoc ?? g.documento,
          nombre: k.titularNombre,
        })),
      ];
      return revisarGrupo(
        g,
        busquedas.map((b) => buscarInfractor(SANCIONES, b)),
        os,
      );
    });

    const alertas = filasConAlerta(filas);
    expect(alertas.map((f) => [f.parteId, f.nivel, f.sanciones.length])).toEqual([
      // Mismo nivel: la sanción más nueva arriba (2026 antes que 2023).
      ["cn", "rojo", 2],
      ["blas", "rojo", 1],
      ["sinDoc", "nombre", 1],
    ]);
    expect(resumirRevision(filas)).toEqual({
      revisados: 4,
      permisos: 2,
      rojo: 2,
      ambar: 0,
      nombre: 1,
      sinDocumento: 1,
      sinDatos: 0,
      osinforSinRespuesta: 1,
      osinforSinConsultar: 0,
    });
  });

  it("un permiso que no se consultó (tope o tiempo) se cuenta aparte de «OSINFOR no respondió»", () => {
    const grupos = agruparPorTitular(
      [parte("a", "Proveedor Uno SAC", "20111111111"), parte("b", "Proveedor Dos SAC", "20222222222")],
      [
        permiso("k1", "19-SEC/PER-FMC-2024-008", "Proveedor Uno SAC", { titularId: "a" }),
        permiso("k2", "25-UCA/C-J-001-01", "Proveedor Dos SAC", { titularId: "b" }),
      ],
    );
    // k1 se le preguntó a OSINFOR y no contestó (null en el mapa); k2 ni entró al mapa.
    const os = new Map<string, ResumenOsinfor | null>([["19-SEC/PER-FMC-2024-008", null]]);
    const filas = grupos.map((g) => revisarGrupo(g, [buscarInfractor([], { documento: g.documento })], os));
    expect(filas.map((f) => f.permisos[0]?.sinConsultar)).toEqual([false, true]);
    expect(resumirRevision(filas)).toMatchObject({ osinforSinRespuesta: 1, osinforSinConsultar: 1 });
  });
});

describe("homónimos (mismo nombre, otro documento)", () => {
  it("el permiso del homónimo no se pega a la ficha y la ficha no sale en rojo por la sanción de él", () => {
    const sanciones: SancionSerfor[] = [
      {
        infractor: "Juan Perez Ramos",
        documento: "87654321",
        tituloHab: null,
        resolucion: "RA 0007-2025-X",
        fecha: "2025-05-05",
        organo: "ARFFS",
        ambito: "GORE UCAYALI",
      },
    ];
    const grupos = agruparPorTitular(
      [parte("p1", "Juan Perez Ramos", "12345678")],
      [permiso("k1", "25-UCA/PER-FMP-2020-002", "JUAN PEREZ RAMOS", { titularDoc: "87654321" })],
    );
    expect(grupos.map((g) => [g.clave, g.permisos.length])).toEqual([
      ["parte:p1", 0],
      ["permiso:k1", 1],
    ]);

    const filas = grupos.map((g) => {
      const busquedas = [
        ...(g.parteId ? [{ documento: g.documento, nombre: g.nombre }] : []),
        ...g.permisos.map((k) => ({
          codigo: k.codigo,
          documento: k.titularDoc ?? g.documento,
          nombre: k.titularNombre,
        })),
      ];
      return revisarGrupo(g, busquedas.map((b) => buscarInfractor(sanciones, b)), new Map());
    });
    const ficha = filas.find((f) => f.parteId === "p1");
    const suelto = filas.find((f) => f.parteId === null);
    expect(ficha?.nivel).not.toBe("rojo");
    expect(ficha?.sanciones).toEqual([]);
    expect(suelto?.nivel).toBe("rojo");
  });

  it("sin documento en alguno de los dos, el nombre sigue pegando el permiso a la ficha", () => {
    const [g] = agruparPorTitular(
      [parte("p1", "Juan Perez Ramos", "12345678")],
      [permiso("k1", "X-1", "JUAN PEREZ RAMOS")],
    );
    expect(g?.permisos.map((k) => k.id)).toEqual(["k1"]);
  });
});
