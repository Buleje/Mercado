import { describe, expect, it } from "vitest";
import {
  compararConAnterior,
  diaDeLima,
  fechaCorta,
  huellasDeFilas,
  mensajeVigilante,
  type EstadoVigilante,
} from "@/lib/forestal/vigilante-proveedores";
import type { FilaRevision, PermisoRevisado } from "@/lib/forestal/revision-proveedores";
import type { CoincidenciaInfractor } from "@/lib/forestal/serfor-infractores";

const AHORA = "2026-12-01T14:00:00.000Z";
const PERMISO = "25-PUC/P-MAD-A-018-07";

function sancion(over: Partial<CoincidenciaInfractor> = {}): CoincidenciaInfractor {
  return {
    infractor: "COMUNIDAD NATIVA SAN LUIS",
    documento: "20393286238",
    tituloHab: PERMISO,
    resolucion: "00046-2023-OSINFOR/08.2",
    fecha: "2023-02-27",
    organo: "OSINFOR",
    ambito: "GORE UCAYALI",
    motivo: "documento",
    ...over,
  };
}

function permiso(osinfor: PermisoRevisado["osinfor"], codigo = PERMISO): PermisoRevisado {
  return { id: `k-${codigo}`, codigo, osinfor, sinConsultar: osinfor == null };
}

function fila(over: Partial<FilaRevision> = {}): FilaRevision {
  return {
    clave: "parte:1",
    parteId: "1",
    nombre: "COMUNIDAD NATIVA SAN LUIS",
    documento: "20393286238",
    nivel: "rojo",
    certeza: "segura",
    sanciones: [],
    permisos: [],
    ...over,
  };
}

const LIMPIO = { nivel: "verde" as const, enRoja: 0, pauEnTramite: 0, esPlantacion: false };
const EN_ROJA = { nivel: "rojo" as const, enRoja: 1, pauEnTramite: 1, esPlantacion: false };

function estadoDe(filas: FilaRevision[], ahora = "2026-11-01T14:00:00.000Z"): EstadoVigilante {
  return compararConAnterior(null, huellasDeFilas(filas), { ahora, corteSerfor: "2026-10-13" }).estado;
}

describe("vigilante de proveedores · huellas", () => {
  it("una sanción por documento, la lista roja y el PAU son tres hechos", () => {
    const { huellas, osinforSinDato } = huellasDeFilas([
      fila({ sanciones: [sancion()], permisos: [permiso(EN_ROJA)] }),
    ]);
    expect(huellas.map((h) => h.tipo).sort()).toEqual(["osinfor_pau", "osinfor_roja", "serfor"]);
    expect(osinforSinDato).toEqual([]);
  });

  it("la coincidencia SOLO por nombre no cuenta (homónimos)", () => {
    const { huellas } = huellasDeFilas([fila({ documento: null, sanciones: [sancion({ motivo: "nombre", documento: null })] })]);
    expect(huellas).toEqual([]);
  });

  it("la misma sanción en dos filas (ficha + permiso suelto) cuenta una vez", () => {
    const s = sancion();
    const { huellas } = huellasDeFilas([
      fila({ sanciones: [s] }),
      fila({ clave: "permiso:9", parteId: null, sanciones: [{ ...s, motivo: "permiso" }] }),
    ]);
    expect(huellas.filter((h) => h.tipo === "serfor")).toHaveLength(1);
  });

  it("el permiso al que OSINFOR no contestó queda como «sin dato»", () => {
    const { huellas, osinforSinDato } = huellasDeFilas([fila({ permisos: [permiso(null)] })]);
    expect(huellas).toEqual([]);
    expect(osinforSinDato).toHaveLength(1);
  });
});

describe("vigilante de proveedores · comparar con la vez anterior", () => {
  it("la primera vez guarda la foto y no avisa nada", () => {
    const c = compararConAnterior(null, huellasDeFilas([fila({ sanciones: [sancion()] })]), {
      ahora: AHORA,
      corteSerfor: "2026-10-13",
    });
    expect(c.primeraVez).toBe(true);
    expect(c.nuevas).toEqual([]);
    expect(c.estado.claves.length).toBeGreaterThan(0);
    expect(c.estado.revisadoEn).toBe(AHORA);
  });

  it("si nada cambió, no hay nada nuevo", () => {
    const filas = [fila({ sanciones: [sancion()], permisos: [permiso(EN_ROJA)] })];
    const c = compararConAnterior(estadoDe(filas), huellasDeFilas(filas), { ahora: AHORA, corteSerfor: null });
    expect(c.primeraVez).toBe(false);
    expect(c.nuevas).toEqual([]);
  });

  it("una sanción que aparece este mes es nueva (y solo esa)", () => {
    const antes = [fila({ permisos: [permiso(EN_ROJA)] })];
    const ahora = [fila({ sanciones: [sancion()], permisos: [permiso(EN_ROJA)] })];
    const c = compararConAnterior(estadoDe(antes), huellasDeFilas(ahora), { ahora: AHORA, corteSerfor: null });
    expect(c.nuevas.map((h) => h.tipo)).toEqual(["serfor"]);
  });

  it("OSINFOR caído un mes NO hace «salir y volver a entrar» al permiso (aviso falso)", () => {
    const conRoja = [fila({ permisos: [permiso(EN_ROJA)] })];
    const caido = [fila({ permisos: [permiso(null)] })];
    const mes2 = compararConAnterior(estadoDe(conRoja), huellasDeFilas(caido), { ahora: AHORA, corteSerfor: null });
    expect(mes2.nuevas).toEqual([]);
    expect(mes2.estado.claves.some((k) => k.startsWith("osinfor-roja:"))).toBe(true);
    const mes3 = compararConAnterior(mes2.estado, huellasDeFilas(conRoja), { ahora: AHORA, corteSerfor: null });
    expect(mes3.nuevas).toEqual([]);
  });

  it("lo que salió de la lista se quita sin avisar; si vuelve a entrar, avisa de nuevo", () => {
    const conRoja = [fila({ permisos: [permiso(EN_ROJA)] })];
    const limpio = [fila({ permisos: [permiso(LIMPIO)] })];
    const salio = compararConAnterior(estadoDe(conRoja), huellasDeFilas(limpio), { ahora: AHORA, corteSerfor: null });
    expect(salio.nuevas).toEqual([]);
    expect(salio.estado.claves).toEqual([]);
    const volvio = compararConAnterior(salio.estado, huellasDeFilas(conRoja), { ahora: AHORA, corteSerfor: null });
    expect(volvio.nuevas.map((h) => h.tipo).sort()).toEqual(["osinfor_pau", "osinfor_roja"]);
  });

  it("la misma sanción publicada después sin documento no es nueva (alias)", () => {
    const antes = [fila({ sanciones: [sancion()] })];
    const ahora = [fila({ sanciones: [sancion({ documento: null, motivo: "permiso" })] })];
    const c = compararConAnterior(estadoDe(antes), huellasDeFilas(ahora), { ahora: AHORA, corteSerfor: null });
    expect(c.nuevas).toEqual([]);
  });
});

describe("vigilante de proveedores · el mensaje", () => {
  it("un renglón por proveedor, con RUC, la resolución y la fecha de la lista", () => {
    const { huellas } = huellasDeFilas([fila({ sanciones: [sancion()], permisos: [permiso(EN_ROJA)] })]);
    const m = mensajeVigilante(huellas, {
      negocio: "Maderera El Bosque",
      desde: "2026-11-01T14:00:00.000Z",
      corteSerfor: "2026-10-13",
    });
    expect(m.proveedores).toBe(1);
    expect(m.titulo).toBe("1 proveedor tuyo entró a la lista de sancionados");
    expect(m.whatsapp).toContain("*COMUNIDAD NATIVA SAN LUIS (RUC 20393286238)*");
    expect(m.whatsapp).toContain("resolución 00046-2023-OSINFOR/08.2 del 27/02/2023");
    expect(m.whatsapp).toContain("lista roja de OSINFOR");
    expect(m.whatsapp).toContain("Desde la última revisión (01/11/2026)");
    expect(m.whatsapp).toContain("lista al 13/10/2026");
    expect(m.telegram).toContain("<b>COMUNIDAD NATIVA SAN LUIS (RUC 20393286238)</b>");
    expect(m.cuerpo).toMatch(/^COMUNIDAD NATIVA SAN LUIS \(RUC 20393286238\): /);
  });

  it("con más de 8 proveedores corta y dice cuántos faltan", () => {
    const filas = Array.from({ length: 10 }, (_, i) =>
      fila({
        clave: `parte:${i}`,
        nombre: `PROVEEDOR ${i}`,
        documento: `2010000000${i}`,
        sanciones: [sancion({ infractor: `PROVEEDOR ${i}`, documento: `2010000000${i}`, resolucion: `0010${i}-2024-X` })],
      }),
    );
    const m = mensajeVigilante(huellasDeFilas(filas).huellas, { negocio: null, desde: null, corteSerfor: null });
    expect(m.proveedores).toBe(10);
    expect(m.titulo).toBe("10 proveedores tuyos entraron a la lista de sancionados");
    expect(m.whatsapp).toContain("…y 2 más.");
  });

  it("Telegram escapa el HTML del nombre", () => {
    const { huellas } = huellasDeFilas([
      fila({ nombre: "A<B> & C", sanciones: [sancion({ infractor: "A<B> & C" })] }),
    ]);
    const m = mensajeVigilante(huellas, { negocio: null, desde: null, corteSerfor: null });
    expect(m.telegram).toContain("A&lt;B&gt; &amp; C");
    expect(m.telegram).not.toContain("<B>");
  });
});

describe("vigilante de proveedores · fechas", () => {
  it("fecha sola sin correrse un día, e instante como día de Lima", () => {
    expect(fechaCorta("2023-02-27")).toBe("27/02/2023");
    expect(fechaCorta(null)).toBeNull();
    // 02:00 UTC del 5 = 21:00 del 4 en Lima.
    expect(diaDeLima("2026-11-05T02:00:00.000Z")).toBe("04/11/2026");
  });
});
