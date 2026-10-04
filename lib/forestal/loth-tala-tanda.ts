/**
 * «Talar varios árboles de una vez» (Brandon 28-09): los árboles marcados en
 * «Ver censo» entran en UNA planilla —una fila por árbol, con su especie y su
 * coordenada del censo ya puestas— y se asientan en un solo guardado, una
 * línea de tala por fila.
 *
 * Lo mismo que la tala de a una, fila por fila: las dos formas de anotar el Ø
 * (`derivarTala`), lo que la norma exige según el modo (`obligatoriedadTala`),
 * lo medido contra lo censado (`compararConCenso`) y el ≈ pt al 56 %
 * (`ptAserrableDeRolliza`, nunca m³ × 424). La validación de verdad —T3 ya
 * talado, T8 bajo el DMC, período cerrado— la hace el libro al guardar: acá
 * sólo se traduce su respuesta para que la fila que falló diga qué corregir,
 * sin frenar a las demás.
 *
 * En una PLANTACIÓN (ADR-459) la fila puede venir del registro en vez del
 * censo: «Bolaina × 3» son tres filas de esa especie, sin árbol marcado, con
 * el código propuesto (001-BOL…) que el operador puede cambiar.
 *
 * Puro a propósito: la planilla lo pinta y los tests lo prueban sin montar nada.
 */

import { compararConCenso, latLngDelArbol, type ArbolParaElegir } from "./loth-censo-uso";
import { derivarTala, medicionCrudaDe, medidasVacias, type FormaMedicion, type MedidasTala } from "./loth-forma-medicion";
import { ptAserrableDeRolliza } from "./loth-restante";
import { obligatoriedadTala, type ModoAprovechamiento } from "./loth-tala";

/** De dónde salió la coordenada de la fila (se guarda con la línea: `gpsOrigen`). */
export type OrigenGpsFila = "telefono" | "censo";

export type ResultadoFila =
  | { estado: "guardada"; lineNo: number | null }
  | { estado: "fallida"; codigo: string; mensaje: string };

export interface FilaTala {
  /** El id del árbol en el censo (o uno propio en el registro): clave estable (se puede quitar una del medio). */
  id: string;
  /**
   * `censo`: un árbol marcado (su código no se toca). `registro`: una especie
   * del registro de la plantación, sin árbol marcado — el código es propuesto
   * y se puede cambiar; `arbol` lleva sólo la especie y el código.
   */
  origen: "censo" | "registro";
  arbol: ArbolParaElegir;
  medidas: MedidasTala;
  /** `null` = la de «Para todos». Una fila puede tener la suya. */
  fecha: string | null;
  motosierrista: string | null;
  motosierristaId: string | null;
  hora: string | null;
  gps: { lat: number; lng: number; origen: OrigenGpsFila } | null;
  fotoUrl: string | null;
  /** T8: por qué se tumba uno bajo el DMC. Queda escrito en el libro. */
  justificacionDmc: string;
  /** T9: por qué se registra por encima del cupo de la especie. Se pide cuando la ruta lo rechaza. */
  motivoCupo: string;
  /** Observación libre de ESTA tala (item 10). */
  nota: string;
  resultado: ResultadoFila | null;
}

/** Lo que vale para toda la jornada; cada fila puede cambiar fecha, motosierrista y hora. */
export interface ComunesTala {
  /** `AAAA-MM-DD`. */
  fecha: string;
  motosierrista: string;
  motosierristaId: string | null;
  /** `HH:MM` o vacío. */
  hora: string;
  modo: ModoAprovechamiento | null;
}

/**
 * La fila de un árbol del censo. La coordenada entra copiada del censo (con
 * ese origen, para no pasar por una tomada en el tocón); las medidas NO: el
 * DAP es del árbol en pie y el libro consigna lo medido en el tocón. El censo
 * queda a la vista en la fila, para cotejar.
 */
export function filaDeArbol(a: ArbolParaElegir): FilaTala {
  const p = latLngDelArbol(a);
  return {
    id: a.id,
    origen: "censo",
    arbol: a,
    medidas: medidasVacias(),
    fecha: null,
    motosierrista: null,
    motosierristaId: null,
    hora: null,
    gps: p ? { lat: p[0], lng: p[1], origen: "censo" } : null,
    fotoUrl: null,
    justificacionDmc: "",
    motivoCupo: "",
    nota: "",
    resultado: null,
  };
}

/** Lo que hace falta de una especie del registro para armar su fila. */
export interface EspecieParaFila {
  especie: string;
  cientifico: string | null;
  cites: boolean;
}

/**
 * La fila de una especie del registro (plantación sin árbol marcado): la
 * especie, el científico y el CITES puestos, el código propuesto y nada del
 * censo —ni DAP, ni coordenada, ni reparo—.
 */
export function filaDelRegistro(e: EspecieParaFila, codigo: string, id: string): FilaTala {
  const arbol: ArbolParaElegir = {
    id,
    treeCode: codigo,
    speciesCommon: e.especie,
    speciesScientific: e.cientifico,
    speciesNative: null,
    cites: e.cites,
    dapM: null,
    hcM: null,
    volM3: null,
    utmZona: null,
    utmX: null,
    utmY: null,
    condicion: null,
    notes: null,
    estadoCenso: "en_pie",
    categoria: null,
    dmcCm: null,
    uso: null,
    disponibilidad: "disponible",
    motivoNoDisponible: null,
    reparo: null,
    desfase: null,
  };
  return { ...filaDeArbol(arbol), origen: "registro" };
}

/** Los códigos que ya tiene la planilla (para no proponer uno repetido). */
export function codigosDeLaPlanilla(filas: readonly FilaTala[]): string[] {
  return filas.map((f) => f.arbol.treeCode.trim()).filter(Boolean);
}

const claveDeCodigoFila = (c: string) => c.trim().toUpperCase();

/** Los códigos que se repiten dentro de la planilla (T3 rechazaría el segundo). */
export function codigosRepetidos(filas: readonly FilaTala[]): ReadonlySet<string> {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const f of filas) {
    const k = claveDeCodigoFila(f.arbol.treeCode);
    if (!k) continue;
    if (vistos.has(k)) repetidos.add(k);
    vistos.add(k);
  }
  return repetidos;
}

/** Cómo se nombra la fila en los avisos: su código o, sin código, su especie. */
export const nombreDeFila = (f: FilaTala): string => f.arbol.treeCode.trim() || f.arbol.speciesCommon;

/** Suma árboles sin repetir (por id del censo): «Agregar del censo» con uno ya en la planilla no lo duplica. */
export function agregarArboles(filas: readonly FilaTala[], arboles: readonly ArbolParaElegir[]): FilaTala[] {
  const ya = new Set(filas.map((f) => f.id));
  const nuevas = arboles.filter((a) => !ya.has(a.id)).map(filaDeArbol);
  return [...filas, ...nuevas];
}

/** Fecha, motosierrista y hora con los que se asienta la fila: la suya o la común. */
export function efectivosDeFila(f: FilaTala, c: ComunesTala) {
  const propio = f.motosierrista != null;
  return {
    fecha: f.fecha ?? c.fecha,
    motosierrista: propio ? f.motosierrista! : c.motosierrista,
    motosierristaId: propio ? f.motosierristaId : c.motosierristaId,
    hora: f.hora ?? c.hora,
  };
}

export interface FilaCalculada {
  diamMayorM: number | null;
  diamMenorM: number | null;
  longitudM: number | null;
  volumenM3: number | null;
  /** (medido − censo) / censo del volumen, en %. Negativo = merma. */
  difPct: number | null;
  /** 30 % o más: otro árbol, una medida mal anotada o un fuste hueco. */
  muyDistinto: boolean;
  /** ≈ pt aserrables al 56 % (referencia, no lo declara el libro). */
  ptAserrable: number | null;
  /** Se tipeó alguna medida. */
  tipeada: boolean;
  /** Lo que falta para poder asentarla (vacío = lista). */
  faltan: string[];
  /** Se puede asentar ahora: completa y todavía no entró al libro. */
  lista: boolean;
}

/**
 * Lo que sale de las medidas de una fila y si ya se puede asentar. Exige lo
 * mismo que la tala de a una: la longitud aprovechable siempre, y el Ø y el
 * volumen salvo que la troza se despache del área (RDE 264-2019, items 6-9).
 */
export function calcularFila(
  f: FilaTala,
  forma: FormaMedicion,
  modo: ModoAprovechamiento | null,
  repetidos: ReadonlySet<string> = new Set(),
): FilaCalculada {
  const d = derivarTala(f.medidas, forma);
  const oblig = obligatoriedadTala(modo);
  const comp = compararConCenso(f.arbol, { diamMayorM: d.diamMayorM, longitudM: d.longitudM, volumenM3: d.volumenM3 });
  const m = f.medidas;
  const tipeada = [m.d1, m.d2, m.totalM, ...m.mayor, ...m.menor].some((v) => v.trim() !== "");
  const faltan: string[] = [];
  const codigo = claveDeCodigoFila(f.arbol.treeCode);
  if (!codigo) faltan.push("el código del árbol");
  else if (repetidos.has(codigo)) faltan.push("un código que no se repita en la planilla");
  if (!(d.longitudM != null && d.longitudM > 0)) faltan.push("la longitud");
  if (oblig.volumen && !(d.volumenM3 != null && d.volumenM3 > 0)) faltan.push(forma === "promedio" ? "D1 y D2" : "los Ø mayor y menor");
  if (d.excedeDescuento) faltan.push("descuentos más largos que el fuste");
  const guardada = f.resultado?.estado === "guardada";
  return {
    diamMayorM: d.diamMayorM,
    diamMenorM: d.diamMenorM,
    longitudM: d.longitudM,
    volumenM3: d.volumenM3,
    difPct: comp.volumen.difPct,
    muyDistinto: comp.muyDistinto,
    ptAserrable: d.volumenM3 != null && d.volumenM3 > 0 ? ptAserrableDeRolliza(d.volumenM3) : null,
    tipeada,
    faltan,
    lista: faltan.length === 0 && !guardada,
  };
}

export interface TotalesTanda {
  /** Filas que entran con el próximo guardado. */
  listas: number;
  listasM3: number;
  listasPt: number;
  /** Filas con algo tipeado que todavía no alcanza: NO se asientan. */
  aMedias: string[];
  /** Filas sin medir: tampoco se asientan (se avisa). */
  sinMedir: string[];
  guardadas: number;
  guardadasM3: number;
  fallidas: number;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Los totales del pie: lo que entra, lo que ya entró y lo que falta. Vista previa: el libro suma lo suyo. */
export function totalesTanda(filas: readonly FilaTala[], calc: readonly FilaCalculada[]): TotalesTanda {
  const t: TotalesTanda = { listas: 0, listasM3: 0, listasPt: 0, aMedias: [], sinMedir: [], guardadas: 0, guardadasM3: 0, fallidas: 0 };
  filas.forEach((f, i) => {
    const c = calc[i];
    if (f.resultado?.estado === "guardada") {
      t.guardadas += 1;
      t.guardadasM3 += c.volumenM3 ?? 0;
      return;
    }
    if (f.resultado?.estado === "fallida") t.fallidas += 1;
    if (c.lista) {
      t.listas += 1;
      t.listasM3 += c.volumenM3 ?? 0;
      t.listasPt += c.ptAserrable ?? 0;
    } else if (c.tipeada) t.aMedias.push(nombreDeFila(f));
    else t.sinMedir.push(nombreDeFila(f));
  });
  t.listasM3 = r4(t.listasM3);
  t.guardadasM3 = r4(t.guardadasM3);
  return t;
}

/**
 * Lo que viaja al libro por fila: lo MISMO que manda la tala de a una
 * (`LothEntryForm`), para que el backend valide igual — T3, T8, período.
 */
export function payloadDeFila(
  f: FilaTala,
  c: FilaCalculada,
  comunes: ComunesTala,
  forma: FormaMedicion,
  ctx: { planId: string | null; caratulaId: string | null },
): Record<string, unknown> {
  const e = efectivosDeFila(f, comunes);
  const a = f.arbol;
  const motosierrista = e.motosierrista.trim();
  return {
    section: "tala",
    caratulaId: ctx.caratulaId,
    planId: ctx.planId,
    entryDate: new Date(`${e.fecha}T00:00:00.000Z`).toISOString(),
    treeCode: a.treeCode.trim(),
    isRama: false,
    speciesCommon: a.speciesCommon,
    speciesScientific: a.speciesScientific,
    cites: a.cites,
    diamMayorM: c.diamMayorM,
    diamMenorM: c.diamMenorM,
    lengthM: c.longitudM,
    ...(c.volumenM3 != null && c.volumenM3 > 0 ? { volumeM3: c.volumenM3 } : {}),
    // ADR-422: de dónde salieron el Ø promedio y la longitud, y en qué forma.
    medicionCruda: medicionCrudaDe({ ...f.medidas, modo: comunes.modo }, forma),
    discarded: false,
    consumoInterno: false,
    marcadoFuste: false,
    marcadoTocon: false,
    observations: f.nota.trim() || null,
    ...(f.justificacionDmc.trim() ? { justificacionDmc: f.justificacionDmc.trim() } : {}),
    ...(f.motivoCupo.trim() ? { motivoSobreCupo: f.motivoCupo.trim() } : {}),
    gpsLat: f.gps?.lat ?? null,
    gpsLng: f.gps?.lng ?? null,
    gpsOrigen: f.gps?.origen ?? null,
    photoUrl: f.fotoUrl,
    motosierrista: motosierrista || null,
    motosierristaId: motosierrista ? e.motosierristaId : null,
    horaTala: e.hora || null,
  };
}

/**
 * La respuesta del libro, en lo que la fila tiene que decir. El mensaje es el
 * del backend (ya viene en español y con el dato: «tiene 82,0 cm de DAP y el
 * DMC… es 90 cm»); el código decide qué campo se abre para corregir.
 */
export function resultadoDeRespuesta(status: number, body: unknown): ResultadoFila {
  const b = (body && typeof body === "object" ? body : {}) as { entry?: { lineNo?: unknown }; error?: unknown; message?: unknown };
  if (status >= 200 && status < 300) {
    const lineNo = typeof b.entry?.lineNo === "number" ? b.entry.lineNo : null;
    return { estado: "guardada", lineNo };
  }
  const codigo = typeof b.error === "string" ? b.error : `HTTP_${status}`;
  if (status === 429) {
    return { estado: "fallida", codigo: "RATE_LIMIT", mensaje: "Demasiadas consultas seguidas: espera un minuto y vuelve a guardar." };
  }
  const mensaje = typeof b.message === "string" && b.message.trim() ? b.message : `No se pudo guardar (error ${status}).`;
  return { estado: "fallida", codigo, mensaje };
}

/** Qué hay que tocar en la fila que falló. */
export function queCorregir(r: ResultadoFila | null): "justificacion" | "cupo" | "fecha" | "codigo" | "especie" | "otro" | null {
  if (r?.estado !== "fallida") return null;
  if (r.codigo === "T8_BAJO_DMC") return "justificacion";
  if (r.codigo === "T9_CUPO_ESPECIE") return "cupo";
  if (r.codigo === "PERIODO_CERRADO") return "fecha";
  // T3: ese código ya está talado en el negocio (en una plantación, se cambia el código).
  if (r.codigo === "T3_TALA_DUPLICADA") return "codigo";
  // T7 en una plantación: la especie no está en su registro.
  if (r.codigo === "T7_ESPECIE_NO_AUTORIZADA") return "especie";
  return "otro";
}

/**
 * Una fila guardada ya es una línea del libro: no se edita desde acá (se
 * corrige con una subsanación). La que falló conserva su aviso hasta el
 * próximo guardado: borrarlo al tipear escondía el motivo mientras se corregía.
 */
export type CambioFila = Partial<Omit<FilaTala, "id" | "origen" | "arbol" | "resultado">>;

export function editarFila(f: FilaTala, cambio: CambioFila): FilaTala {
  if (f.resultado?.estado === "guardada") return f;
  return { ...f, ...cambio };
}

/**
 * El código de una fila del registro (el propuesto se puede cambiar). Uno del
 * censo es el de su placa: no se toca. Una guardada, tampoco.
 */
export function cambiarCodigo(f: FilaTala, codigo: string): FilaTala {
  if (f.origen !== "registro" || f.resultado?.estado === "guardada") return f;
  return { ...f, arbol: { ...f.arbol, treeCode: codigo.toUpperCase().slice(0, 40) } };
}

/** Pide el motivo T8 antes de guardar: el cálculo del plan ya lo ve bajo el DMC. */
export function pideJustificacion(f: FilaTala): boolean {
  return f.arbol.categoria === "bajo_dmc" || queCorregir(f.resultado) === "justificacion";
}
