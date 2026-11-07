/**
 * Cada fila del Excel del SNIFFS → la troza del libro que es, y si puede
 * entrar al lote (Brandon 27-10). Lo usa el servidor para la vista previa y
 * otra vez al importar: la pantalla no decide nada.
 *
 * Emparejar (las reglas del re-import de diámetros, `diametros-al-reimportar`):
 *  · por **Código Planta**, acotado a su guía si la fila la trae;
 *  · si no, por el **código de la troza** dentro de su guía;
 *  · un código que matchea dos piezas NO se adivina: «ambigua».
 *
 * Que entre al lote lo dice el libro, no el SNIFFS: `motivo` es el de
 * `motivoNoElegible` (ya consumida, no llegó, guía anulada…) y el lote pide
 * UNA especie y UN título habilitante — las mismas reglas que `agregarTrozas`,
 * que al importar vuelve a mirar todo bajo lock (L-A1, ADR-393). El volumen
 * que se consume es el del LIBRO (el de la guía); el del Excel sólo avisa si
 * difiere. D1/D2 del Excel completan sólo las puntas vacías.
 *
 * PURO y client-safe (los tipos los comparte la pantalla).
 */

import { claveEspecie } from "./loth-constants";
import type { FilaLoteExcel } from "./lote-desde-excel";
import { MAX_DIAMETRO_CM, redondear2 } from "./medidas-troza";

/** Una troza del libro que podría ser una fila del pegado, como la lee el servidor. */
export interface CandidataLote {
  id: string;
  codigoPlanta: string | null;
  codificacion: string | null;
  gtf: string | null;
  especieComun: string | null;
  especieCientifica: string | null;
  /** El título habilitante de su ingreso (`WoodEntry.originCode`). */
  permiso: string | null;
  volumenM3: number | null;
  d1Cm: number | null;
  d2Cm: number | null;
  largoM: number | null;
  /** El lote vivo donde ya está, si está en uno. */
  lote: { id: string; code: string } | null;
  /** `motivoNoElegible` del libro; `null` = se puede consumir. */
  motivo: string | null;
  /** El día que entró al patio (`ingresoDeLaTroza`): la corrida no puede ser antes (T3). */
  ingresoDia: string | null;
}

export type EstadoFilaLote =
  | "entra"
  | "ya-en-el-lote"
  /** Su guía está en el libro SIN lista de trozas: se carga del Excel y entra (28-10). */
  | "se-carga"
  | "no-entra"
  | "no-encontrada"
  | "ambigua"
  | "repetida";

/**
 * Una guía registrada en el libro que todavía no tiene su lista de trozas
 * (Brandon 28-10: «quiero que sí se pueda consumir lo importado»). La lista
 * se completa desde el Excel del SNIFFS por el mismo camino que el inventario
 * (`agregarTrozas` con `desdeImportacion`): agrega el detalle que trae su
 * propio documento; el volumen, la especie y el GTF declarados no cambian.
 */
export interface GuiaSinLista {
  gtf: string;
  /** La fila del ingreso que recibe las piezas (la de su especie, si son varias). */
  filas: { woodEntryId: string; especie: string; cientifica: string | null }[];
  permiso: string | null;
  ingresoDia: string | null;
  /** Validada o con fecha de recepción: sus piezas pueden ir a la sierra (ADR-339). */
  recibida: boolean;
}

/** Dónde y con qué especie se carga una troza nueva en su guía. */
export interface CargaEnGuia {
  woodEntryId: string;
  especieComun: string;
  especieCientifica: string | null;
}

export interface FilaCruzada {
  fila: number;
  /** Sólo en «se-carga»: a qué fila de la guía va y con qué especie. */
  carga?: CargaEnGuia;
  codigo: string;
  gtf: string | null;
  estado: EstadoFilaLote;
  /** El porqué, cuando no entra (o qué pasa con ella). */
  motivo: string | null;
  trozaId: string | null;
  especie: string | null;
  volumenLibro: number | null;
  volumenExcel: number | null;
  /** El Excel dice otro volumen que el libro (más de 1 dm³): se consume el del libro. */
  volumenDistinto: boolean;
  /** Las puntas que el Excel completa (sólo si el libro las tiene vacías). */
  completaD1: number | null;
  completaD2: number | null;
}

/** El lote vivo con el mismo N° que el pegado. */
export interface LoteExistente {
  id: string;
  code: string;
  status: string;
  especie: string;
  permiso: string | null;
  /** Sus piezas todavía sin consumir: las que no vengan en el pegado quedan apartadas. */
  libres: readonly string[];
}

export interface CruceLote {
  filas: FilaCruzada[];
  /** La especie del lote: la de sus trozas en el libro. */
  especie: { comun: string; cientifica: string | null } | null;
  permiso: string | null;
  /** Lo que impide importar el lote entero. Vacío = se puede. */
  bloqueos: string[];
  /** Lo que conviene saber antes de importar, sin frenarlo. */
  avisos: string[];
  /** El primer día en que se pudo aserrar todo (T3): la fecha de consumo no puede ser antes. */
  fechaMinima: string | null;
  /** Lo que entra: piezas y m³ del LIBRO. */
  piezas: number;
  volumenM3: number;
  /** Cuántas trozas completan D1/D2 con el Excel. */
  conMedidas: number;
  existente: LoteExistente | null;
}

/** Lo que devuelve el servidor al importar un lote. */
export interface ResultadoImportarLote {
  lote: { id: string; code: string };
  corrida: { id: string; lineNo: number };
  piezas: number;
  volumenM3: number;
  /** Se sumó al lote que ya estaba programado con ese N°. */
  sumadoAExistente: boolean;
  medidas: { guardadas: number; rechazadas: number };
  /** Trozas cargadas a una guía que no tenía su lista (28-10). */
  trozasCargadas: number;
}

/** Más de 1 dm³ de diferencia es otro dato, no el redondeo del SNIFFS (3 decimales). */
export const TOLERANCIA_VOLUMEN_M3 = 0.001;

const limpio = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();
/** La punta del Excel que viaja: sólo sobre una vacía del libro y con un valor que una troza puede tener. */
const punta = (libro: number | null, excel: number | null) =>
  libro == null && excel != null && excel > 0 && excel <= MAX_DIAMETRO_CM
    ? redondear2(excel)
    : null;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Las candidatas de UNA fila: por Código Planta (y su guía), si no por el código de la troza en su guía. */
function candidatasDe(f: FilaLoteExcel, todas: readonly CandidataLote[]): CandidataLote[] {
  const gtf = limpio(f.gtf);
  const enSuGuia = (c: CandidataLote) => !gtf || limpio(c.gtf) === gtf;
  const planta = limpio(f.codigoPlanta);
  if (planta) {
    const porPlanta = todas.filter((c) => limpio(c.codigoPlanta) === planta && enSuGuia(c));
    if (porPlanta.length > 0) return porPlanta;
  }
  const troza = limpio(f.codigoTroza);
  if (troza && gtf)
    return todas.filter((c) => limpio(c.codificacion) === troza && limpio(c.gtf) === gtf);
  return [];
}

/**
 * El cruce de un lote. `existente` = el lote vivo con el mismo N°: si está
 * abierto se le suman las piezas (es el que se programó antes); si ya se
 * consumió o se cerró, no se toca.
 */
export function cruzarLote(
  filas: readonly FilaLoteExcel[],
  candidatas: readonly CandidataLote[],
  existente: LoteExistente | null,
  guiasSinLista: readonly GuiaSinLista[] = [],
): CruceLote {
  const usadas = new Map<string, number>();
  const sinLista = new Map(guiasSinLista.map((g) => [limpio(g.gtf), g]));
  /* Las que se cargan se cuentan como candidatas para la especie, el permiso y T3. */
  const pseudo: CandidataLote[] = [];
  const cruzadas: FilaCruzada[] = filas.map((f) => {
    const codigo = (f.codigoPlanta ?? f.codigoTroza ?? "").trim();
    const base: FilaCruzada = {
      fila: f.fila,
      codigo,
      gtf: f.gtf,
      estado: "no-encontrada",
      motivo: null,
      trozaId: null,
      especie: f.especie,
      volumenLibro: null,
      volumenExcel: f.volumenM3,
      volumenDistinto: false,
      completaD1: null,
      completaD2: null,
    };
    const cs = candidatasDe(f, candidatas);
    const guia = cs.length === 0 && f.gtf ? sinLista.get(limpio(f.gtf)) : undefined;
    if (guia) {
      /* Cargarla para que después no se pueda consumir dejaría la lista a medias
         de un intento fallido: se dice el camino antes de escribir nada. */
      if (!guia.recibida) {
        return {
          ...base,
          estado: "no-entra",
          motivo: `la guía ${guia.gtf} todavía no se recibió en el patio: recepciónala en Ingresos`,
        };
      }
      if (!(f.volumenM3 != null && f.volumenM3 > 0)) {
        return { ...base, estado: "no-entra", motivo: "sin volumen en el Excel: no se puede cargar ni consumir" };
      }
      const clave = `${limpio(f.gtf)}|${limpio(f.codigoPlanta ?? f.codigoTroza)}`;
      const antes = usadas.get(clave);
      if (antes != null) return { ...base, estado: "repetida", motivo: `es la misma troza de la fila ${antes}` };
      usadas.set(clave, f.fila);
      const carga = cargaEnGuia(guia, f.especie);
      pseudo.push({
        id: `carga:${clave}`,
        codigoPlanta: f.codigoPlanta,
        codificacion: f.codigoTroza,
        gtf: guia.gtf,
        especieComun: carga.especieComun,
        especieCientifica: carga.especieCientifica,
        permiso: guia.permiso,
        volumenM3: f.volumenM3,
        d1Cm: f.d1Cm,
        d2Cm: f.d2Cm,
        largoM: f.largoM,
        lote: null,
        motivo: null,
        ingresoDia: guia.ingresoDia,
      });
      return {
        ...base,
        estado: "se-carga",
        motivo: `la guía ${guia.gtf} no tiene su lista de trozas: se carga del Excel`,
        trozaId: `carga:${clave}`,
        gtf: guia.gtf,
        especie: carga.especieComun,
        volumenLibro: f.volumenM3,
        carga,
      };
    }
    if (cs.length === 0) {
      return {
        ...base,
        motivo: f.gtf ? `no está en la guía ${f.gtf} del libro` : "no está en el libro",
      };
    }
    if (cs.length > 1) {
      return {
        ...base,
        estado: "ambigua",
        motivo: `${cs.length} trozas del libro tienen ese código: agrega la guía a la fila`,
      };
    }
    const c = cs[0];
    const vol = c.volumenM3;
    const conTroza: FilaCruzada = {
      ...base,
      trozaId: c.id,
      gtf: c.gtf ?? f.gtf,
      especie: c.especieComun ?? f.especie,
      volumenLibro: vol,
      volumenDistinto:
        vol != null && f.volumenM3 != null && Math.abs(vol - f.volumenM3) > TOLERANCIA_VOLUMEN_M3,
      completaD1: punta(c.d1Cm, f.d1Cm),
      completaD2: punta(c.d2Cm, f.d2Cm),
    };
    const antes = usadas.get(c.id);
    if (antes != null)
      return {
        ...conTroza,
        estado: "repetida",
        motivo: `es la misma troza de la fila ${antes}`,
        completaD1: null,
        completaD2: null,
      };
    usadas.set(c.id, f.fila);
    if (c.motivo)
      return {
        ...conTroza,
        estado: "no-entra",
        motivo: c.motivo,
        completaD1: null,
        completaD2: null,
      };
    if (c.lote && c.lote.id !== existente?.id) {
      return {
        ...conTroza,
        estado: "no-entra",
        motivo: `ya está en el lote ${c.lote.code}`,
        completaD1: null,
        completaD2: null,
      };
    }
    return { ...conTroza, estado: c.lote ? "ya-en-el-lote" : "entra" };
  });

  const entran = cruzadas.filter((f) => f.estado === "entra" || f.estado === "ya-en-el-lote" || f.estado === "se-carga");
  const todas = [...candidatas, ...pseudo];
  const deEntran = entran.map((f) => todas.find((c) => c.id === f.trozaId)!).filter(Boolean);

  const bloqueos: string[] = [];
  if (existente && existente.status !== "abierto") {
    bloqueos.push(
      `El lote ${existente.code} ya existe y está ${existente.status}: cambia el N° de lote.`,
    );
  }
  if (entran.length === 0) bloqueos.push("Ninguna troza del pegado se puede consumir.");

  /* L-A1: una especie por lote, con la clave del libro («Ishpíngo» = «Ishpingo»). */
  const especies = new Map<string, CandidataLote>();
  for (const c of deEntran) especies.set(claveEspecie(c.especieComun), c);
  if (especies.size > 1) {
    const nombres = [...especies.values()].map((c) => c.especieComun ?? "sin especie");
    bloqueos.push(
      `Un lote es de una sola especie y el pegado trae ${nombres.join(", ")}: pega una especie por lote.`,
    );
  }
  const unaEspecie = especies.size === 1 ? [...especies.values()][0] : null;
  if (
    existente &&
    unaEspecie &&
    claveEspecie(existente.especie) !== claveEspecie(unaEspecie.especieComun)
  ) {
    bloqueos.push(
      `El lote ${existente.code} es de ${existente.especie} y las trozas son ${unaEspecie.especieComun}.`,
    );
  }

  /* ADR-393: un lote, un título habilitante. */
  const permisos = [
    ...new Set(deEntran.map((c) => c.permiso?.trim()).filter((p): p is string => Boolean(p))),
  ];
  if (permisos.length > 1) {
    bloqueos.push(
      `Un lote ampara un solo permiso y el pegado trae trozas de ${permisos.join(" y ")}.`,
    );
  }
  if (existente?.permiso && permisos.length === 1 && permisos[0] !== existente.permiso.trim()) {
    bloqueos.push(
      `El lote ${existente.code} es del permiso ${existente.permiso} y las trozas, del ${permisos[0]}.`,
    );
  }

  const avisos: string[] = [];
  /* Consumo parcial (ADR-356): las piezas del lote programado que no vienen en
     el pegado siguen apartadas y el lote queda abierto. */
  if (existente && existente.status === "abierto") {
    const ids = new Set(entran.map((f) => f.trozaId));
    const sobran = existente.libres.filter((id) => !ids.has(id)).length;
    if (sobran > 0) {
      avisos.push(
        `El lote ${existente.code} tiene ${sobran} troza${sobran === 1 ? "" : "s"} que no está${sobran === 1 ? "" : "n"} en el pegado: quedan apartadas y el lote sigue abierto.`,
      );
    }
  }
  /* El libro decide si entra; el SNIFFS sólo avisa si no la tiene en consumo. */
  const sinConsumo = filas.filter(
    (f, k) => f.estado && !/consum/i.test(f.estado) && entran.includes(cruzadas[k]),
  ).length;
  if (sinConsumo > 0) {
    avisos.push(
      `${sinConsumo} troza${sinConsumo === 1 ? "" : "s"} no figura${sinConsumo === 1 ? "" : "n"} «En consumo» en el SNIFFS: revisa la columna Estado Actual.`,
    );
  }

  const cargadas = cruzadas.filter((f) => f.estado === "se-carga");
  if (cargadas.length > 0) {
    const guias = [...new Set(cargadas.map((f) => f.gtf))].join(", ");
    avisos.push(
      `${cargadas.length} troza${cargadas.length === 1 ? "" : "s"} se carga${cargadas.length === 1 ? "" : "n"} a la guía ${guias}, que no tenía su lista: ` +
        "es el detalle del Excel del SNIFFS (el volumen y la especie declarados de la guía no cambian).",
    );
  }

  /* El permiso del Excel («Contrato», Brandon 28-10: «se guarda poniendo el
     permiso»): manda si las trozas no traen el suyo; si lo traen y es otro,
     gana el de sus guías (ADR-393) y se avisa. */
  const contratos = new Map<string, number>();
  for (const f of filas) {
    const c = f.contrato?.trim();
    if (c) contratos.set(c, (contratos.get(c) ?? 0) + 1);
  }
  const permisoExcel = [...contratos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  if (contratos.size > 1) {
    avisos.push(
      `El Excel trae ${contratos.size} contratos en este lote (${[...contratos.keys()].join(", ")}): un lote es de un solo permiso.`,
    );
  }
  if (permisoExcel && permisos.length === 1 && permisos[0] !== permisoExcel) {
    avisos.push(
      `El Excel dice permiso ${permisoExcel} y las trozas son del ${permisos[0]} (el de sus guías): el lote queda del ${permisos[0]}.`,
    );
  }

  const dias = deEntran
    .map((c) => c.ingresoDia)
    .filter((d): d is string => Boolean(d))
    .sort();
  const especie = unaEspecie?.especieComun?.trim()
    ? {
        comun: unaEspecie.especieComun.trim(),
        cientifica: deEntran.find((c) => c.especieCientifica)?.especieCientifica ?? null,
      }
    : null;
  return {
    filas: cruzadas,
    especie,
    permiso:
      existente?.permiso ?? (permisos.length === 1 ? permisos[0] : permisos.length === 0 ? permisoExcel : null),
    bloqueos,
    avisos,
    fechaMinima: dias.at(-1) ?? null,
    piezas: entran.length,
    volumenM3: r4(entran.reduce((a, f) => a + (f.volumenLibro ?? 0), 0)),
    conMedidas: entran.filter((f) => f.completaD1 != null || f.completaD2 != null).length,
    existente,
  };
}

/** `AAAA-MM-DD` → `dd/mm/aaaa`. */
export const diaLegible = (dia: string) =>
  `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

/** ¿`AAAA-MM-DD` es un día que existe? («2026-02-31» no.) */
export function esDiaValido(dia: string | null | undefined): dia is string {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const d = new Date(`${dia}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dia;
}

/**
 * Por qué la fecha elegida no sirve (T3, ADR-433): una troza no se asierra
 * antes de llegar. `null` = sirve.
 */
export function fechaFueraDeRango(
  fecha: string | null,
  fechaMinima: string | null,
  hoy: string,
): string | null {
  if (!fecha) return "Pon la fecha del consumo.";
  if (!esDiaValido(fecha)) return "Esa fecha no existe: corrígela.";
  if (fecha > hoy) return "La fecha del consumo no puede ser futura.";
  if (fechaMinima && fecha < fechaMinima) {
    return `Las trozas entraron al libro el ${diaLegible(fechaMinima)}: el consumo no puede ser antes.`;
  }
  return null;
}

/**
 * A qué fila de la guía va una troza nueva y con qué especie. El SNIFFS
 * escribe «Cedrelinga cateniformis / TORNILLO» (científico / común); manda la
 * especie DECLARADA en la guía: con una sola fila, ésa; con varias, la que
 * coincida con lo que dice el Excel.
 */
export function cargaEnGuia(guia: GuiaSinLista, especieExcel: string | null): CargaEnGuia {
  const partes = (especieExcel ?? "").split("/").map((x) => x.trim()).filter(Boolean);
  const claves = new Set(partes.map((x) => claveEspecie(x)));
  const fila =
    guia.filas.find((f) => claves.has(claveEspecie(f.especie)) || (f.cientifica && claves.has(claveEspecie(f.cientifica)))) ??
    (guia.filas.length === 1 ? guia.filas[0] : null);
  if (fila) return { woodEntryId: fila.woodEntryId, especieComun: fila.especie, especieCientifica: fila.cientifica };
  return {
    woodEntryId: guia.filas[0]!.woodEntryId,
    especieComun: partes.length > 1 ? partes.slice(1).join(" / ") : (partes[0] ?? "Sin especie"),
    especieCientifica: partes.length > 1 ? partes[0]! : null,
  };
}
