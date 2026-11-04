/**
 * osinfor-supervisiones — qué dice OSINFOR de un permiso (título habilitante).
 *
 * Fuente: el servicio público del mapa de OSINFOR (SISFOR, capa «Planes de
 * manejo forestal supervisados», sin clave). Trae una fila por plan supervisado
 * con dos datos que importan al comprar madera:
 *   - OBSERVATORIO: «V» lista verde (aprovechamiento correcto o faltas menores),
 *     «R» lista roja (OSINFOR halló aprovechamiento no autorizado). Varias
 *     supervisiones del mismo plan llegan juntas: «R,V», «V, V, V».
 *   - ESTADO_PAU: el proceso sancionador (PAU) — en trámite, concluido, o el
 *     informe archivado sin PAU.
 *
 * Medido 04-11-2026 (15.477 filas): el texto llega con la tilde rota de 6
 * formas («PAU en tr0mite», «trNmite», «tr mite», «trGmite», «tramite»,
 * «trámite») y el observatorio trae ruido («SI», «NO», «NO_INDICA», «[NULL]»,
 * «Supervision de gabinete»). Esta lib lo normaliza; lo que no reconoce queda
 * como «sin dato», nunca como verde.
 *
 * Los registros de plantación (REG-PLT) no aparecen: 0 de 15.477 filas.
 *
 * PURO y client-safe (sin fetch, sin Date.now).
 */

export type EstadoPau = "en_tramite" | "concluido" | "archivado" | "sin_dato";
export type ListaObservatorio = "roja" | "verde" | "ambas" | "sin_dato";
export type NivelOsinfor = "rojo" | "ambar" | "verde" | "sin_supervision";

/** Una fila tal como llega del servicio (solo los campos que se piden). */
export interface FilaSisfor {
  NUM_THABILITANTE?: string | null;
  NOMBRE_POA?: string | null;
  TITULAR?: string | null;
  ESTADO_PAU?: string | null;
  OBSERVATORIO?: string | null;
  FECHA_SUPERVISION_INICIO?: number | null;
  TIPOSUP?: string | null;
}

export interface SupervisionOsinfor {
  plan: string;
  /** YYYY-MM-DD o null si no la publica. */
  fecha: string | null;
  /** CAMPO · GABINETE · … tal cual. */
  tipo: string | null;
  estadoPau: EstadoPau;
  lista: ListaObservatorio;
}

export interface ResumenOsinfor {
  codigo: string;
  nivel: NivelOsinfor;
  /** Una frase para la persona que va a comprar la madera. */
  titulo: string;
  detalle: string;
  titular: string | null;
  supervisiones: SupervisionOsinfor[];
  enRoja: number;
  pauEnTramite: number;
  /** El código es un registro de plantación: OSINFOR no los publica. */
  esPlantacion: boolean;
}

/** Quita tildes, espacios raros y pasa a minúsculas para comparar. */
function plano(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ \s]+/g, " ")
    .trim()
    .toLowerCase();
}

export function normalizarEstadoPau(crudo: string | null | undefined): EstadoPau {
  const s = plano(crudo ?? "");
  if (!s || s === "-" || s === "no_indica") return "sin_dato";
  // «PAU en tr?mite» con cualquier letra rota en lugar de la «á».
  if (/^pau en tr.?mite/.test(s)) return "en_tramite";
  if (s.startsWith("pau concluido")) return "concluido";
  if (s.startsWith("archivo")) return "archivado";
  return "sin_dato";
}

export function leerObservatorio(crudo: string | null | undefined): ListaObservatorio {
  const partes = (crudo ?? "")
    .toUpperCase()
    .split(/[,;]/)
    .map((p) => p.trim());
  const roja = partes.includes("R");
  const verde = partes.includes("V");
  if (roja && verde) return "ambas";
  if (roja) return "roja";
  if (verde) return "verde";
  return "sin_dato";
}

/** Los códigos de permiso son letras, números, guiones, barras y puntos. */
const CODIGO_VALIDO = /^[A-Z0-9][A-Z0-9 ./-]{2,59}$/;

/**
 * Deja el código listo para consultar (mayúsculas, sin espacios dobles) o
 * null si trae algo que no es de un código. Protege el `where` que se arma
 * para el servicio de OSINFOR: nada de comillas ni paréntesis.
 */
export function codigoConsultable(crudo: string | null | undefined): string | null {
  const c = (crudo ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  return CODIGO_VALIDO.test(c) ? c : null;
}

export function esRegistroPlantacion(codigo: string): boolean {
  return /REG-PLT/i.test(codigo);
}

function aFecha(ms: number | null | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

export function aSupervision(f: FilaSisfor): SupervisionOsinfor {
  return {
    plan: (f.NOMBRE_POA ?? "").trim() || "Plan sin nombre",
    fecha: aFecha(f.FECHA_SUPERVISION_INICIO),
    tipo: (f.TIPOSUP ?? "").trim() || null,
    estadoPau: normalizarEstadoPau(f.ESTADO_PAU),
    lista: leerObservatorio(f.OBSERVATORIO),
  };
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/**
 * Semáforo del permiso. Orden: lista roja > PAU en trámite > PAU concluido >
 * verde. Un PAU concluido no dice si hubo multa (eso está en la resolución),
 * por eso va en ámbar y no en verde.
 */
export function resumirSupervisiones(codigo: string, filas: FilaSisfor[]): ResumenOsinfor {
  const supervisiones = filas
    .map(aSupervision)
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  const titular = filas.map((f) => (f.TITULAR ?? "").trim()).find(Boolean) ?? null;
  const esPlantacion = esRegistroPlantacion(codigo);
  const enRoja = supervisiones.filter((s) => s.lista === "roja" || s.lista === "ambas").length;
  const pauEnTramite = supervisiones.filter((s) => s.estadoPau === "en_tramite").length;
  const pauConcluido = supervisiones.filter((s) => s.estadoPau === "concluido").length;
  const base = { codigo, titular, supervisiones, enRoja, pauEnTramite, esPlantacion };
  const n = supervisiones.length;

  if (n === 0) {
    return {
      ...base,
      nivel: "sin_supervision",
      titulo: "OSINFOR no publica supervisiones de este permiso",
      detalle: esPlantacion
        ? "Los registros de plantación no figuran en OSINFOR (ninguno entre los más de 15 mil planes que publica). Pide al proveedor su registro vigente en la ARFFS."
        : "Puede ser un permiso nuevo o aún no supervisado. No es una alerta: solo no hay dato.",
    };
  }
  if (enRoja > 0) {
    return {
      ...base,
      nivel: "rojo",
      titulo: `Lista roja en ${plural(enRoja, "plan", "planes")} de ${n}`,
      detalle:
        "OSINFOR halló aprovechamiento no autorizado en este permiso. Comprar esa madera es riesgoso: revisa la resolución antes de pagar.",
    };
  }
  if (pauEnTramite > 0) {
    return {
      ...base,
      nivel: "ambar",
      titulo: `Proceso sancionador (PAU) en trámite en ${plural(pauEnTramite, "plan", "planes")}`,
      detalle: "OSINFOR todavía no resuelve. Pide al proveedor el estado del PAU y guarda la constancia.",
    };
  }
  if (pauConcluido > 0) {
    return {
      ...base,
      nivel: "ambar",
      titulo: `Tuvo ${plural(pauConcluido, "proceso sancionador", "procesos sancionadores")} ya concluido`,
      detalle: "El mapa no dice si terminó en multa o en archivo: el resultado está en la resolución (SIGOsfc).",
    };
  }
  return {
    ...base,
    nivel: "verde",
    titulo: `Supervisado sin alertas (${plural(n, "plan", "planes")})`,
    detalle: "Lista verde o informe archivado, sin proceso sancionador publicado.",
  };
}

/** Página pública del observatorio con la búsqueda del código ya escrita. */
export function enlaceObservatorio(codigo: string, lista: "roja" | "verde" = "roja"): string {
  const pagina = lista === "roja" ? "listaRoja" : "listaVerde";
  return `https://observatorio.osinfor.gob.pe/Home/${pagina}?SearchString=${encodeURIComponent(codigo)}`;
}

/** Consulta pública de SIGOsfc (resoluciones y detalle del título). */
export const ENLACE_SIGOSFC = "https://sigosfc.osinfor.gob.pe/";
