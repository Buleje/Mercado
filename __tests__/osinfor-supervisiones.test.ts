import { describe, expect, it } from "vitest";
import {
  codigoConsultable,
  enlaceObservatorio,
  leerObservatorio,
  normalizarEstadoPau,
  resumirSupervisiones,
  type FilaSisfor,
} from "@/lib/forestal/osinfor-supervisiones";

// Valores reales medidos en el mapa de OSINFOR el 04-11-2026 (15.477 filas).

describe("normalizarEstadoPau", () => {
  it("reconoce «trámite» con la tilde rota de todas las formas medidas", () => {
    for (const s of ["PAU en trámite", "PAU en tramite", "PAU en tr0mite", "PAU en trNmite", "PAU en tr mite", "PAU en trGmite"]) {
      expect(normalizarEstadoPau(s)).toBe("en_tramite");
    }
  });
  it("concluido, archivado y lo que no es dato", () => {
    expect(normalizarEstadoPau("PAU Concluido")).toBe("concluido");
    expect(normalizarEstadoPau("PAU Concluido - Agotada la vía administrativa")).toBe("concluido");
    expect(normalizarEstadoPau("Archivo del Informe")).toBe("archivado");
    expect(normalizarEstadoPau("Archivo Preliminar")).toBe("archivado");
    for (const s of ["", " ", "-", "NO_INDICA", null, undefined]) expect(normalizarEstadoPau(s)).toBe("sin_dato");
  });
});

describe("leerObservatorio", () => {
  it("roja, verde, las dos y el ruido", () => {
    expect(leerObservatorio("R")).toBe("roja");
    expect(leerObservatorio("V, V, V")).toBe("verde");
    expect(leerObservatorio("R,V")).toBe("ambas");
    for (const s of ["", " ", "SI", "NO", "NO_INDICA", "[NULL]", "Supervision de gabinete", null]) {
      expect(leerObservatorio(s)).toBe("sin_dato");
    }
  });
});

describe("codigoConsultable", () => {
  it("acepta códigos reales y los pasa a mayúsculas", () => {
    expect(codigoConsultable(" 25-puc/c-j-058-03 ")).toBe("25-PUC/C-J-058-03");
    expect(codigoConsultable("10-HUA-PUE/PER-FMP-2026-007")).toBe("10-HUA-PUE/PER-FMP-2026-007");
  });
  it("rechaza lo que podría romper la consulta al servicio", () => {
    for (const s of ["x' OR 1=1 --", "A(1)", "ab", "", null, "A".repeat(61)]) expect(codigoConsultable(s)).toBeNull();
  });
});

const fila = (p: Partial<FilaSisfor>): FilaSisfor => ({ NOMBRE_POA: "POA 1", TITULAR: "TITULAR X", ...p });

describe("resumirSupervisiones", () => {
  it("lista roja manda aunque haya verdes", () => {
    const r = resumirSupervisiones("01-AMA/PER-FMC-2018-027", [
      fila({ OBSERVATORIO: "R", ESTADO_PAU: "PAU en trámite", FECHA_SUPERVISION_INICIO: 1571702400000 }),
      fila({ NOMBRE_POA: "POA 2", OBSERVATORIO: "V", ESTADO_PAU: "Archivo del Informe" }),
    ]);
    expect(r.nivel).toBe("rojo");
    expect(r.enRoja).toBe(1);
    expect(r.supervisiones[0]?.fecha).toBe("2019-10-22");
  });
  it("PAU en trámite sin roja = ámbar; PAU concluido = ámbar (no dice si hubo multa)", () => {
    expect(resumirSupervisiones("X-1", [fila({ OBSERVATORIO: "V", ESTADO_PAU: "PAU en tr0mite" })]).nivel).toBe("ambar");
    const c = resumirSupervisiones("X-1", [fila({ OBSERVATORIO: "", ESTADO_PAU: "PAU Concluido" })]);
    expect(c.nivel).toBe("ambar");
    expect(c.titulo).toMatch(/concluido/);
  });
  it("verde solo con supervisiones y sin PAU", () => {
    const r = resumirSupervisiones("10-HUA-PUE/PER-FMP-2018-008", [fila({ OBSERVATORIO: "V", ESTADO_PAU: "Archivo del Informe" })]);
    expect(r.nivel).toBe("verde");
    expect(r.titular).toBe("TITULAR X");
  });
  it("sin filas = sin supervisión, y los registros de plantación lo explican", () => {
    const plt = resumirSupervisiones("19-SEC/REG-PLT-2021-017", []);
    expect(plt.nivel).toBe("sin_supervision");
    expect(plt.esPlantacion).toBe(true);
    expect(plt.detalle).toMatch(/plantación/);
    expect(resumirSupervisiones("10-HUA-PUE/PER-FMP-2026-007", []).esPlantacion).toBe(false);
  });
});

describe("enlaceObservatorio", () => {
  it("lleva la búsqueda del código escrita", () => {
    expect(enlaceObservatorio("01-AMA/PER-FMC-2018-027")).toBe(
      "https://observatorio.osinfor.gob.pe/Home/listaRoja?SearchString=01-AMA%2FPER-FMC-2018-027",
    );
  });
});
