/**
 * tramites-registro — el expediente de un trámite, normalizado en el servidor.
 *
 * Un trámite sin fecha de presentación es un trámite que se vuelve a hacer. Este
 * módulo define QUÉ se guarda y lo normaliza: el cliente propone, el servidor
 * decide (mismo criterio que `cubicacion-registro`, ADR-308 §4).
 *
 * PURO: sin Prisma ni fetch — se testea sin DB.
 */

import {
  AUTORIDADES,
  formatoPorId,
  type AutoridadTramite,
  type DatosTramite,
} from "./tramites-catalogo";
import {
  CartaYaImpresaError,
  esCarta,
  huellaCarta,
  sellarEmision,
  type EmisionCarta,
} from "./tramites-carta";

/**
 * El ciclo real de un trámite en mesa de partes:
 * borrador → presentado → (observado ⇄ presentado) → resuelto | desistido.
 */
export type EstadoTramite = "borrador" | "presentado" | "observado" | "resuelto" | "desistido";

export const ESTADOS_TRAMITE: {
  key: EstadoTramite;
  label: string;
  tono: "muted" | "info" | "warning" | "success";
}[] = [
  { key: "borrador", label: "Borrador", tono: "muted" },
  { key: "presentado", label: "Presentado", tono: "info" },
  { key: "observado", label: "Observado", tono: "warning" },
  { key: "resuelto", label: "Resuelto", tono: "success" },
  { key: "desistido", label: "Desistido", tono: "muted" },
];

export interface TramiteRegistro {
  id: string;
  /**
   * Código interno para identificar y buscar ESTE trámite (Brandon
   * 2026-08-25: "un código de cada documento que diga qué documento es para
   * identificar y luego buscarlo") — `{AUTORIDAD}-{AAAA}-{correlativo}`, ej.
   * "ARFFS-2026-014". Se asigna UNA vez al crear el borrador (a diferencia de
   * `numeroDocumento`, que espera al primer "Presentado") y nunca se
   * reasigna: es la referencia propia de Brandon para ubicar el expediente,
   * no un número oficial ante la autoridad — por eso NO sale impreso en el
   * papel (`tramites-print.ts` no lo lee).
   */
  codigoInterno: string;
  /** Id del formato del catálogo (`visado-talonario-gtf`, …). */
  formatoId: string;
  /** Copia del nombre: si mañana se renombra el formato, el expediente viejo
   *  sigue diciendo lo que se presentó. */
  formatoNombre: string;
  autoridad: AutoridadTramite;
  asunto: string;
  datos: DatosTramite;
  estado: EstadoTramite;
  /** N° que le puso la autoridad al expediente (el que sirve para preguntar). */
  expedienteAutoridad: string | null;
  /** Cuándo se presentó en mesa de partes (date-only, `YYYY-MM-DD`). */
  fechaPresentacion: string | null;
  /** Cuándo respondió la autoridad. */
  fechaRespuesta: string | null;
  /**
   * Fecha límite real para presentar ESTE trámite (date-only), cuando responde
   * a una notificación con plazo propio (ej. descargo ante supervisión: el
   * plazo corre desde `fechaNotificacion` del formato, no desde hoy).
   *
   * SIEMPRE la tipea el operador — el catálogo no inventa un número de días
   * por formato (regla de honestidad legal del módulo, `tramites-catalogo.ts`):
   * cada TUPA/norma sectorial cuenta distinto y el sistema no lo sabe. Lo que
   * el sistema SÍ hace es avisar con anticipación una vez que el operador
   * cargó la fecha real (`tramitesPorVencer`, T-3 por defecto).
   */
  fechaLimite: string | null;
  notas: string | null;
  /**
   * N° de documento propio, correlativo por año ("001-2026") — sólo en
   * formatos con `correlativo: true` (ADR-364 ronda 3). `null` hasta que el
   * trámite pasa a "Presentado" por primera vez; una vez asignado NUNCA se
   * reasigna, ni siquiera si el trámite vuelve a "Borrador".
   */
  numeroDocumento: string | null;
  /**
   * Cuándo salió el aviso automático de "vence pronto" por WhatsApp (cron
   * `tramites-vencimiento`) para el `fechaLimite` ACTUAL — se resetea solo si
   * `fechaLimite` cambia (mismo patrón que `expiryReminderSentAt` en
   * documentos). Sin esto el cron mandaría el mismo aviso todos los días de
   * la ventana, no una vez por vencimiento.
   */
  avisoVencimientoEnviadoEn: string | null;
  /**
   * Cuándo salió el aviso automático de "N días sin respuesta" por WhatsApp
   * (cron `tramites-sin-respuesta`) para la `fechaPresentacion` ACTUAL — se
   * resetea solo si `fechaPresentacion` cambia (mismo criterio que
   * `avisoVencimientoEnviadoEn` con `fechaLimite`): si el trámite se vuelve a
   * presentar con fecha nueva, es una espera nueva y merece avisar de nuevo.
   */
  avisoSinRespuestaEnviadoEn: string | null;
  /**
   * La primera vez que la carta salió impresa (ADR-487): cuándo, quién y qué
   * declaraba. Sólo en las cartas que salen de las guías (`esCarta`). Una vez
   * sellada, lo que declara (guías, permiso, expediente) ya no cambia bajo el
   * mismo código: reimprimir la saca igual; cambiarlo es otra carta.
   * Opcional: los trámites guardados antes no lo traen.
   */
  emision?: EmisionCarta | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface TramiteInput {
  id?: string;
  /** Preservado por el caller desde el registro existente — el cliente nunca
   *  lo manda, `construirTramite` lo asigna solo la primera vez. */
  codigoInterno?: string;
  formatoId: string;
  formatoNombre?: string;
  autoridad: AutoridadTramite;
  asunto?: string;
  datos?: DatosTramite;
  estado?: string;
  expedienteAutoridad?: string | null;
  fechaPresentacion?: string | null;
  fechaRespuesta?: string | null;
  fechaLimite?: string | null;
  notas?: string | null;
  /** Preservado por el caller (`ForestTramitesDB.save`) desde el registro
   *  existente — el cliente nunca lo manda, `construirTramite` lo asigna solo. */
  numeroDocumento?: string | null;
  /** Ídem: el sello del aviso automático y el `fechaLimite` que tenía ANTES,
   *  para decidir si el sello sigue valiendo o hay que resetearlo. */
  avisoVencimientoEnviadoEn?: string | null;
  fechaLimiteAnterior?: string | null;
  /** Ídem para el sello de "sin respuesta": el sello y la `fechaPresentacion`
   *  que tenía ANTES, para decidir si sigue valiendo o hay que resetearlo. */
  avisoSinRespuestaEnviadoEn?: string | null;
  fechaPresentacionAnterior?: string | null;
  /** El cliente pide sellar la carta porque la va a imprimir (ADR-487). */
  emitir?: boolean;
  /** Preservado por el caller desde el registro existente: el sello de la primera impresión. */
  emision?: EmisionCarta | null;
  /** Quién imprime (lo pone el caller con el usuario de la sesión, nunca el cliente). */
  emitidaPor?: string;
  createdAt?: string;
  createdBy?: string;
  /** El ahora, inyectado: así el registro es determinista en los tests. */
  ahora?: string;
}

const texto = (v: unknown, max: number): string =>
  String(v ?? "")
    .trim()
    .slice(0, max);

const opcional = (v: unknown, max: number): string | null => {
  const t = texto(v, max);
  return t || null;
};

/** `YYYY-MM-DD` o null. Una fecha inventada es peor que ninguna. */
const fechaSolo = (v: unknown): string | null => {
  const t = texto(v, 30);
  if (!t) return null;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
};

const ESTADOS = new Set(ESTADOS_TRAMITE.map((e) => e.key));

/**
 * El número más alto que YA salió de cada correlativo («REL-2026-» → 7,
 * «doc:<formato>-2026» → 3). Los correlativos se sacan de los trámites que
 * existen, y un trámite se puede borrar (o caer del tope de la lista): sin este
 * piso, el «REL-2026-0007» de una carta borrada volvía a salir en otra, y dos
 * papeles impresos quedaban con el mismo código. Sólo sube; lo guarda
 * `ForestTramitesDB` bajo el mismo candado que la lista.
 */
export type PisosCorrelativo = Record<string, number>;

const claveNumeroDocumento = (formatoId: string, sufijoAnio: string): string =>
  `doc:${formatoId}${sufijoAnio}`;

/** Lee el piso guardado (JSON del KV): lo que no es un entero positivo no cuenta. */
export function leerPisos(raw: unknown): PisosCorrelativo {
  const out: PisosCorrelativo = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isInteger(v) && v > 0) out[k] = v;
  }
  return out;
}

/** El piso después de guardar `registro`, o `null` si no subió nada (no hay que escribir). */
export function pisosTrasRegistro(
  pisos: PisosCorrelativo,
  registro: TramiteRegistro,
): PisosCorrelativo | null {
  const next = { ...pisos };
  let subio = false;
  const subir = (clave: string, n: number) => {
    if (Number.isFinite(n) && n > (next[clave] ?? 0)) {
      next[clave] = n;
      subio = true;
    }
  };
  const cod = registro.codigoInterno?.match(/^(.+-\d{4}-)(\d+)$/);
  if (cod) subir(cod[1], Number(cod[2]));
  const doc = registro.numeroDocumento?.match(/^(\d+)(-\d{4})$/);
  if (doc) subir(claveNumeroDocumento(registro.formatoId, doc[2]), Number(doc[1]));
  return subio ? next : null;
}

/**
 * Siguiente correlativo del formato, para el AÑO de `hoy`: "NNN-YYYY", 3
 * dígitos, se resetea cada año (un talonario real no arrastra la numeración
 * de un año al otro). Mira sólo los `numeroDocumento` YA asignados de ese
 * mismo formato — un trámite todavía sin número (borrador) no cuenta.
 */
function siguienteNumeroDocumento(
  existentes: TramiteRegistro[],
  formatoId: string,
  hoy: Date,
  pisos: PisosCorrelativo = {},
): string {
  const sufijo = `-${hoy.getUTCFullYear()}`;
  const usados = existentes
    .filter((t) => t.formatoId === formatoId && t.numeroDocumento?.endsWith(sufijo))
    .map((t) => Number(t.numeroDocumento!.slice(0, -sufijo.length)))
    .filter((n) => Number.isFinite(n));
  const siguiente = Math.max(0, ...usados, pisos[claveNumeroDocumento(formatoId, sufijo)] ?? 0) + 1;
  return `${String(siguiente).padStart(3, "0")}${sufijo}`;
}

/**
 * Siguiente código interno para la autoridad de `hoy`: "SIGLA-AAAA-NNN", 3
 * dígitos, correlativo GLOBAL a todos los formatos de esa autoridad (no por
 * formato, a diferencia de `numeroDocumento`) — es la libreta de Brandon
 * para ubicar "el ARFFS-2026-014", no el talonario oficial ante la autoridad.
 */
function siguienteCodigoInterno(
  existentes: TramiteRegistro[],
  autoridad: AutoridadTramite,
  hoy: Date,
  prefijoFormato?: string,
  pisos: PisosCorrelativo = {},
): string {
  /* La carta con prefijo propio (ADR-487: «REL-2026-0001») lleva su propio
     correlativo, de 4 dígitos: una relación al mes por permiso llega a cientos. */
  const propio = (prefijoFormato ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const sigla =
    propio ||
    (AUTORIDADES[autoridad]?.corto ?? "TRAM").toUpperCase().replace(/[^A-Z0-9]/g, "") ||
    "TRAM";
  const prefijo = `${sigla}-${hoy.getUTCFullYear()}-`;
  const usados = existentes
    .filter((t) => t.codigoInterno?.startsWith(prefijo))
    .map((t) => Number(t.codigoInterno!.slice(prefijo.length)))
    .filter((n) => Number.isFinite(n));
  const siguiente = Math.max(0, ...usados, pisos[prefijo] ?? 0) + 1;
  return `${prefijo}${String(siguiente).padStart(propio ? 4 : 3, "0")}`;
}

/**
 * Los valores del formulario, acotados: es un JSON en KV, no un textarea
 * infinito. `datos.guiasJson` (ADR-364, la relación de guías con su lista de
 * trozas) es el campo más pesado y tiene su propio tope (abajo); el resto,
 * 20 KB — sigue acotado, no es "cualquier cosa cabe".
 */
const MAX_CAMPOS = 40;
const MAX_LARGO_CAMPO = 20_000;
/**
 * La lista de guías de la carta va entera o no va: cortada a la mitad deja de
 * ser JSON y la carta guardada declararía 0 guías. Cada troza ocupa ~65
 * caracteres («019-001-0000772-12 · CAPIRONA · Ø0.55/0.48m · L4.2m · 0.874 m³»),
 * así que 20 000 eran ~300 trozas: un mes movido de un permiso no entraba y,
 * desde que imprimir guarda (ADR-487), tampoco se podía imprimir. 200 000 son
 * ~3 000 trozas.
 */
const MAX_LARGO_GUIAS_JSON = 200_000;

/** El tope de un casillero del formulario (lo comparte la validación de la ruta: lo que pasa, no se corta). */
export const limiteDeCampo = (clave: string): number =>
  clave === "guiasJson" ? MAX_LARGO_GUIAS_JSON : MAX_LARGO_CAMPO;

function limpiarDatos(datos: DatosTramite | undefined): DatosTramite {
  const out: DatosTramite = {};
  if (!datos || typeof datos !== "object") return out;
  for (const [k, val] of Object.entries(datos)) {
    if (Object.keys(out).length >= MAX_CAMPOS) break;
    const clave = texto(k, 60);
    if (!clave) continue;
    out[clave] = texto(val, limiteDeCampo(clave));
  }
  return out;
}

/** Id estable y legible: `tra-<formato>-<sufijo>`; dos en el mismo milisegundo, el segundo con `-2`. */
function nuevoId(formatoId: string, ahora: string, existentes: TramiteRegistro[]): string {
  const slug = formatoId.replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "tramite";
  // Sufijo derivado del instante: sin `Math.random` para que el registro sea
  // reproducible desde el mismo input (los tests pasan `ahora`).
  const suf = ahora.replace(/[^0-9]/g, "").slice(-9);
  const base = `tra-${slug}-${suf}`;
  const usados = new Set(existentes.map((t) => t.id));
  let id = base;
  for (let i = 2; usados.has(id); i++) id = `${base}-${i}`;
  return id;
}

/**
 * Arma el registro que se guarda. Reglas que impone (no son opcionales):
 *
 * · un trámite `presentado`/`observado`/`resuelto` SIN fecha de presentación no
 *   tiene sentido: se le pone la de hoy, porque "presentado" es un hecho con
 *   fecha y sin ella no se puede contar el plazo de respuesta;
 * · `resuelto` sin fecha de respuesta toma la de hoy por la misma razón;
 * · un estado desconocido cae a `borrador`, nunca a "presentado" (no se declara
 *   presentado algo que quizá no salió de la oficina).
 */
export function construirTramite(
  input: TramiteInput,
  existentes: TramiteRegistro[] = [],
  pisos: PisosCorrelativo = {},
): TramiteRegistro {
  const ahora = input.ahora ?? new Date().toISOString();
  const hoy = ahora.slice(0, 10);
  const estado: EstadoTramite = ESTADOS.has(input.estado as EstadoTramite)
    ? (input.estado as EstadoTramite)
    : "borrador";
  const formatoId = texto(input.formatoId, 60);
  const formato = formatoPorId(formatoId);

  const yaSalio = estado === "presentado" || estado === "observado" || estado === "resuelto";
  const fechaPresentacion = fechaSolo(input.fechaPresentacion) ?? (yaSalio ? hoy : null);
  const fechaRespuesta = fechaSolo(input.fechaRespuesta) ?? (estado === "resuelto" ? hoy : null);

  // El código interno se asigna al crear el borrador (no espera a
  // "Presentado", a diferencia de `numeroDocumento`) y nunca se reasigna.
  const codigoInterno =
    texto(input.codigoInterno, 30) ||
    siguienteCodigoInterno(
      existentes,
      input.autoridad,
      new Date(ahora),
      formato?.prefijoCodigo,
      pisos,
    );

  // El N° de documento se asigna UNA sola vez, al primer "Presentado" — nunca
  // se reasigna (`opcional(input.numeroDocumento,…)` trae el que ya tenía, el
  // caller lo preserva desde el registro existente).
  const numeroPrevio = opcional(input.numeroDocumento, 20);
  const necesitaNumero = Boolean(formato?.correlativo) && yaSalio && !numeroPrevio;
  const numeroDocumento = necesitaNumero
    ? siguienteNumeroDocumento(existentes, formatoId, new Date(ahora), pisos)
    : numeroPrevio;

  // El sello del aviso automático sólo sigue valiendo si el plazo NO cambió;
  // si el operador movió la fecha límite, es un vencimiento nuevo y merece
  // avisar de nuevo (mismo criterio que `expiryReminderSentAt` en documentos).
  const fechaLimite = fechaSolo(input.fechaLimite);
  const avisoVencimientoEnviadoEn =
    fechaLimite === (input.fechaLimiteAnterior ?? null)
      ? opcional(input.avisoVencimientoEnviadoEn, 40)
      : null;

  // Mismo criterio: el sello de "sin respuesta" sólo sigue valiendo si la
  // fecha de presentación no cambió.
  const avisoSinRespuestaEnviadoEn =
    fechaPresentacion === (input.fechaPresentacionAnterior ?? null)
      ? opcional(input.avisoSinRespuestaEnviadoEn, 40)
      : null;

  // La carta impresa (ADR-487): el sello se pone UNA vez, al primer «imprimir»,
  // y desde ahí lo que declara no cambia bajo el mismo código. Si llega otro
  // contenido, el cliente tenía que abrir una carta nueva: se rechaza.
  const datos = limpiarDatos(input.datos);
  const emisionPrevia = input.emision ?? null;
  const carta = formato && esCarta(formato) ? formato : null;
  if (carta && emisionPrevia && emisionPrevia.huella !== huellaCarta(carta, datos)) {
    throw new CartaYaImpresaError(codigoInterno);
  }
  const emision =
    emisionPrevia ??
    (carta && input.emitir
      ? sellarEmision(carta, datos, ahora, input.emitidaPor ?? input.createdBy ?? "")
      : null);

  return {
    id: texto(input.id, 80) || nuevoId(formatoId, ahora, existentes),
    codigoInterno,
    formatoId,
    formatoNombre: texto(input.formatoNombre, 120) || texto(formatoId, 120),
    autoridad: input.autoridad,
    asunto: texto(input.asunto, 300),
    datos,
    estado,
    expedienteAutoridad: opcional(input.expedienteAutoridad, 80),
    fechaPresentacion,
    fechaRespuesta,
    fechaLimite,
    notas: opcional(input.notas, 2000),
    numeroDocumento,
    avisoVencimientoEnviadoEn,
    avisoSinRespuestaEnviadoEn,
    emision,
    createdAt: input.createdAt ?? ahora,
    createdBy: texto(input.createdBy, 80) || "unknown",
    updatedAt: ahora,
  };
}

/** Días transcurridos desde la presentación (para "hace 12 días sin respuesta"). */
export function diasDesdePresentacion(t: TramiteRegistro, hoy: Date): number | null {
  if (!t.fechaPresentacion) return null;
  const d = new Date(`${t.fechaPresentacion}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.max(0, Math.floor((hoyUtc - d.getTime()) / 86_400_000));
}

/**
 * Los que están esperando respuesta hace más de `dias`. No es un plazo legal
 * (cada procedimiento tiene el suyo en el TUPA): es el recordatorio de ir a
 * preguntar, que es lo que en la práctica mueve un expediente.
 */
export function tramitesSinRespuesta(
  lista: TramiteRegistro[],
  hoy: Date,
  dias = 15,
): TramiteRegistro[] {
  return lista
    .filter((t) => t.estado === "presentado" || t.estado === "observado")
    .filter((t) => (diasDesdePresentacion(t, hoy) ?? 0) >= dias)
    .sort((a, b) => (a.fechaPresentacion ?? "").localeCompare(b.fechaPresentacion ?? ""));
}

/**
 * Días que faltan hasta `fechaLimite` (negativo = ya venció). Ese límite lo
 * carga el operador con la fecha real de SU caso (la que dice la notificación
 * o su TUPA) — acá sólo se cuenta la resta, nunca se inventa el plazo.
 */
export function diasHastaLimite(t: TramiteRegistro, hoy: Date): number | null {
  if (!t.fechaLimite) return null;
  const d = new Date(`${t.fechaLimite}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.floor((d.getTime() - hoyUtc) / 86_400_000);
}

/**
 * Los que vencen pronto o ya vencieron: el aviso que tiene que llegar ANTES
 * del plazo, no 15 días después (a diferencia de `tramitesSinRespuesta`, que
 * mira hacia atrás desde que se presentó). Sólo entran los que siguen vivos
 * (ni resueltos ni desistidos) — un trámite resuelto no "vence" más.
 */
export function tramitesPorVencer(
  lista: TramiteRegistro[],
  hoy: Date,
  diasAntes = 3,
): (TramiteRegistro & { diasRestantes: number })[] {
  return lista
    .filter((t) => t.estado !== "resuelto" && t.estado !== "desistido" && t.fechaLimite)
    .map((t) => ({ t, dias: diasHastaLimite(t, hoy) }))
    .filter(
      (x): x is { t: TramiteRegistro; dias: number } => x.dias !== null && x.dias <= diasAntes,
    )
    .sort((a, b) => a.dias - b.dias)
    .map(({ t, dias }) => ({ ...t, diasRestantes: dias }));
}

/** Conteo por estado para los chips de la bandeja. */
export function contarPorEstado(lista: TramiteRegistro[]): Record<EstadoTramite, number> {
  const base: Record<EstadoTramite, number> = {
    borrador: 0,
    presentado: 0,
    observado: 0,
    resuelto: 0,
    desistido: 0,
  };
  for (const t of lista) base[t.estado] += 1;
  return base;
}
