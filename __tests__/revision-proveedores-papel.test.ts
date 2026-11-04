import { describe, expect, it } from "vitest";
import type { FilaRevision, PermisoRevisado } from "@/lib/forestal/revision-proveedores";
import { resumirRevision } from "@/lib/forestal/revision-proveedores";
import {
  armarPapelRevision,
  codigoDelPapel,
  fuenteOsinforDe,
  lineasSerfor,
  nombreDelArchivo,
  resultadoDe,
} from "@/lib/forestal/revision-proveedores-papel";

/** El papel de resultado de «Revisar a todos» (revisión suelta de S/ 49, Brandon 04-11). */

const permiso = (codigo: string, o: Partial<PermisoRevisado> = {}): PermisoRevisado => ({
  id: `k-${codigo}`,
  codigo,
  osinfor: { nivel: "sin_supervision", enRoja: 0, pauEnTramite: 0, esPlantacion: false },
  sinConsultar: false,
  ...o,
});

const sancion = (resolucion: string, fecha: string, extra: Partial<FilaRevision["sanciones"][number]> = {}) => ({
  infractor: "COMUNIDAD NATIVA SAN LUIS",
  documento: "20393286238",
  tituloHab: null,
  resolucion,
  fecha,
  organo: "OSINFOR",
  ambito: "GORE UCAYALI",
  motivo: "documento" as const,
  ...extra,
});

const fila = (o: Partial<FilaRevision> & Pick<FilaRevision, "clave" | "nombre" | "nivel">): FilaRevision => ({
  parteId: o.clave.startsWith("parte:") ? o.clave.slice(6) : null,
  documento: null,
  certeza: "ninguna",
  sanciones: [],
  permisos: [],
  ...o,
});

const SAN_LUIS = fila({
  clave: "parte:p1",
  nombre: "COMUNIDAD NATIVA SAN LUIS",
  documento: "20393286238",
  nivel: "rojo",
  certeza: "segura",
  roles: ["proveedor"],
  sanciones: [sancion("00046-2023-OSINFOR/08.2", "2023-02-27")],
  permisos: [
    permiso("25-PUC/P-MAD-A-018-07", {
      osinfor: { nivel: "rojo", enRoja: 1, pauEnTramite: 1, esPlantacion: false, consultadoEn: "2026-11-04T14:05:00.000Z" },
    }),
  ],
});
const SOLO_ROJA = fila({
  clave: "permiso:k9",
  nombre: "C.N. SANTA ROSA DE DINAMARCA",
  nivel: "rojo",
  permisos: [
    permiso("25-PUC/P-MAD-A-017-10", {
      osinfor: { nivel: "rojo", enRoja: 2, pauEnTramite: 0, esPlantacion: false, consultadoEn: "2026-11-04T09:30:00.000Z" },
    }),
  ],
});
const DE_OTRO = fila({
  clave: "parte:p3",
  nombre: "Maderera Los Ríos",
  documento: "20111111111",
  nivel: "ambar",
  certeza: "del_permiso",
  roles: ["proveedor", "transportista"],
  sanciones: [sancion("00123-2024", "2024-05-10", { infractor: "JUAN PÉREZ", motivo: "permiso_otro" })],
  permisos: [permiso("25-PUC/C-MAD-2019-001")],
});
const HOMONIMO = fila({
  clave: "parte:p4",
  nombre: "José Ramírez",
  nivel: "nombre",
  certeza: "por_nombre",
  roles: ["cliente"],
  sanciones: [sancion("00777-2022", "2022-08-01", { infractor: "JOSE RAMIREZ", documento: null, motivo: "nombre" })],
});
const LIMPIO = fila({ clave: "parte:p5", nombre: "Aserradero Bueno", documento: "10456789012", nivel: "limpio", roles: ["proveedor"] });
const VACIO = fila({ clave: "parte:p6", nombre: "X", nivel: "sin_datos", certeza: "sin_datos", roles: ["proveedor"] });

const TODAS = [SAN_LUIS, SOLO_ROJA, DE_OTRO, HOMONIMO, LIMPIO, VACIO];
const datos = (filas = TODAS) => ({
  resumen: resumirRevision(filas),
  filas: filas.filter((f) => ["rojo", "ambar", "nombre"].includes(f.nivel)),
  sinAlerta: filas.filter((f) => ["limpio", "sin_datos"].includes(f.nivel)),
  corteSerfor: "2026-10-13",
  revisadoEn: "2026-11-04T21:10:00.000Z",
});

describe("papel de resultado de la revisión de proveedores", () => {
  it("lleva TODAS las fichas (también limpias y sin datos), lo grave arriba y numeradas", () => {
    const p = armarPapelRevision(datos());
    expect(p.filas.map((f) => [f.n, f.nombre, f.resultado.texto])).toEqual([
      [1, "COMUNIDAD NATIVA SAN LUIS", "Sancionado"],
      [2, "C.N. SANTA ROSA DE DINAMARCA", "Lista roja OSINFOR"],
      [3, "Maderera Los Ríos", "Revisar"],
      [4, "José Ramírez", "Posible: mismo nombre"],
      [5, "Aserradero Bueno", "Sin alertas"],
      [6, "X", "Sin datos"],
    ]);
    expect(p.cuentas.map((c) => c.cantidad)).toEqual([2, 1, 1, 1, 1]);
  });

  it("«Sancionado» solo si SERFOR lo dice; el porqué del ámbar distingue PAU de sanción a otra persona", () => {
    expect(resultadoDe(SOLO_ROJA).texto).toBe("Lista roja OSINFOR");
    expect(resultadoDe(DE_OTRO).porque).toBe("Su permiso tiene una sanción a nombre de otra persona");
    const conPau = { ...DE_OTRO, certeza: "ninguna" as const, sanciones: [], permisos: [permiso("X-1", { osinfor: { nivel: "ambar", enRoja: 0, pauEnTramite: 1, esPlantacion: false } })] };
    expect(resultadoDe(conPau).porque).toBe("PAU en trámite en OSINFOR");
  });

  it("cada resolución con su fecha y de quién es", () => {
    expect(lineasSerfor(SAN_LUIS)).toEqual(["00046-2023-OSINFOR/08.2 · 27/02/2023 · OSINFOR · GORE UCAYALI"]);
    expect(lineasSerfor(DE_OTRO)[0]).toContain("a otra persona: JUAN PÉREZ");
    expect(lineasSerfor(HOMONIMO)[0]).toContain("solo por el nombre");
    expect(lineasSerfor(LIMPIO)).toEqual(["No figura"]);
    expect(lineasSerfor(VACIO)).toEqual(["No se pudo buscar"]);
  });

  it("dice quién es: documento, papel en la libreta o «solo en el permiso»", () => {
    const p = armarPapelRevision(datos());
    expect(p.filas[0]?.quien).toBe("RUC 20393286238 · Proveedor");
    expect(p.filas[1]?.quien).toBe("sin RUC/DNI · solo en el permiso");
    expect(p.filas[2]?.quien).toBe("RUC 20111111111 · Proveedor · Transportista");
  });

  it("las fechas de las dos fuentes: lista de SERFOR y la consulta a OSINFOR (de la caché de 12 h)", () => {
    const p = armarPapelRevision(datos());
    expect(p.fuenteSerfor).toContain("lista al 13/10/2026");
    // 09:30 Z = 04:30 de Lima; 14:05 Z = 09:05 de Lima.
    expect(p.fuenteOsinfor).toBe(
      "Mapa de supervisiones de OSINFOR (lista roja y PAU), consultado entre el miércoles 04/11/2026 · 04:30 y el miércoles 04/11/2026 · 09:05",
    );
    expect(fuenteOsinforDe([LIMPIO], "2026-11-04T21:10:00.000Z")).toContain("sin permisos que consultar");
    // El día del papel es el de Lima: 21:10 Z sigue siendo 04-11 en Pucallpa.
    expect(p.fecha).toBe("2026-11-04");
  });

  it("sin respuesta de OSINFOR el papel sale incompleto", () => {
    const caido = { ...LIMPIO, permisos: [permiso("25-PUC/X", { osinfor: null })] };
    const sinConsultar = { ...HOMONIMO, permisos: [permiso("25-PUC/Y", { osinfor: null, sinConsultar: true })] };
    expect(armarPapelRevision(datos([caido, sinConsultar])).pendientesOsinfor).toBe(2);
    expect(armarPapelRevision(datos()).pendientesOsinfor).toBe(0);
  });

  it("el código: mismo resultado = mismo código; si cambia un resultado, cambia", () => {
    const a = codigoDelPapel(TODAS, "2026-11-04");
    expect(a).toMatch(/^REV-20261104-[0-9A-F]{4}$/);
    expect(codigoDelPapel([...TODAS], "2026-11-04")).toBe(a);
    expect(codigoDelPapel([SAN_LUIS, { ...SOLO_ROJA, nivel: "limpio" }, DE_OTRO, HOMONIMO, LIMPIO, VACIO], "2026-11-04")).not.toBe(a);
  });

  it("el archivo: número primero y sin letras que Windows no acepta", () => {
    expect(nombreDelArchivo({ codigo: "REV-20261104-7F3A", fecha: "2026-11-04" }, "Aserradero «X» / Pucallpa")).toBe(
      "REV-20261104-7F3A Revisión de proveedores - Aserradero «X» Pucallpa - 2026-11-04.pdf",
    );
  });
});
