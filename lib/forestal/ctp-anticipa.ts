/**
 * ctp-anticipa — lo que TODAVÍA no pasó pero va a pasar.
 *
 * `ctp-pendientes.ts` contesta «¿qué tengo que hacer hoy?». Este archivo
 * contesta la otra mitad, la que ningún libro sabía contestar: **¿qué se me
 * viene?**
 *
 * La diferencia no es cosmética. El score marca «2 ingresos fuera de plazo»
 * cuando ya es una infracción consumada: el pasado no se corrige, sólo se
 * espera a que salga del período. Avisar «esta guía vence el plazo mañana» es
 * lo mismo un día antes, cuando todavía se puede hacer algo. Igual con la
 * troza: «12 trozas varadas» es plata ya perdida; «12 trozas cruzan los 60 días
 * el jueves» es plata que se puede salvar aserrándolas.
 *
 * Cinco cosas se pueden ver venir con lo que el libro ya guarda:
 *   1. guías a punto de vencer el plazo de registro SERFOR (2 días hábiles)
 *   2. trozas que están por cruzar el umbral de varadas (se manchan, se rajan)
 *   3. un título habilitante que vence con madera suya todavía sin aserrar
 *   4. un permiso CITES que vence con esa especie viva en el patio
 *   5. cuántos días le quedan al patio al ritmo de consumo real
 *
 * PURO: recibe los datos ya cargados y decide. Ningún fetch, ninguna fecha
 * implícita (`ahora` entra por parámetro) — así la proyección se testea.
 */

import { PLAZO_REGISTRO_DIAS, diasHabilesDeRegistro } from "./ctp-compliance";
import { TROZAS_VARADAS_DIAS } from "./ctp-pendientes";

const MS_DIA = 86_400_000;

/**
 * Cuánto antes avisar. Nace de cuánto tarda la acción que evita el problema:
 * renovar un título ante la ARFFS no es inmediato (30 días es el mismo umbral
 * que ya usa la Ficha), y aserrar un lote de trozas se planifica con una
 * semana.
 */
export const HORIZONTE_DOCUMENTO_DIAS = 30;
export const HORIZONTE_TROZA_DIAS = 7;
/** Bajo esto, el patio se queda sin materia prima antes de fin de mes. */
export const HORIZONTE_PATIO_DIAS = 21;

export type GravedadAviso = "urgente" | "proximo";

export interface AvisoAnticipado {
  clave: string;
  gravedad: GravedadAviso;
  /** Días hasta el evento. Ordena la lista: lo más cerca, arriba. */
  dias: number;
  /** Qué va a pasar, en una línea. */
  titulo: string;
  /** Por qué importa y qué hacer. */
  detalle: string;
  /** Pestaña del Libro donde se actúa. */
  vista: string;
}

/* ── Entradas ─────────────────────────────────────────────────────────────── */

/** Un ingreso todavía sin registrar en el libro, para medirle el plazo. */
export interface IngresoEnPlazo {
  gtfNumber: string;
  /** Fecha de la operación (date-only, medianoche UTC). */
  entryDate: string | Date;
  /** `true` si el asiento ya está registrado — esos ya no corren plazo. */
  registrado: boolean;
}

/**
 * Las piezas que van a cruzar el umbral dentro de la ventana.
 *
 * Llega como BANDA (cuántas y cuántos m³) y no como lista porque así lo cuenta
 * la base: `contarTrozasVaradas` agrega en SQL para no traerse cinco mil piezas
 * al navegador por un aviso. La banda se arma restando dos conteos —«≥53 días»
 * menos «≥60»—, y por eso el aviso habla de la VENTANA («esta semana») y no de
 * un día exacto: un día exacto sería inventarle precisión al dato que hay.
 */
export interface BandaDeTrozas {
  piezas: number;
  m3: number;
  /** Ancho de la ventana en días. */
  ventanaDias: number;
}

/** Un documento de la Ficha que está por vencer. */
export interface DocumentoPorVencer {
  label: string;
  /** `yyyy-mm-dd`. Vacío = sin vencimiento cargado: no se inventa. */
  vencimiento: string;
}

export interface DatosAnticipa {
  /** GTF del monte emitidas que todavía no entraron al CTP: les corre el plazo. */
  ingresos: readonly IngresoEnPlazo[];
  trozasPorVarar?: BandaDeTrozas;
  /** Títulos habilitantes y permisos CITES de la Ficha. */
  documentos: readonly DocumentoPorVencer[];
  /** m³ de materia prima disponibles hoy en el patio. */
  patioM3: number;
  /** m³ consumidos en los últimos `consumoDias` días. */
  consumidoM3: number;
  consumoDias: number;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

/** Medianoche UTC de un instante — para restar días de calendario sin husos. */
const diaUtc = (v: string | Date | number): number => {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? NaN
    : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** Días que faltan para un `yyyy-mm-dd`; `null` si no hay fecha válida. */
export function diasPara(vencimiento: string, ahora: number): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimiento.trim())) return null;
  const v = Date.parse(`${vencimiento.trim()}T00:00:00Z`);
  if (Number.isNaN(v)) return null;
  return Math.round((v - diaUtc(ahora)) / MS_DIA);
}

const fmt = (n: number): string =>
  n.toLocaleString("es-PE", { maximumFractionDigits: n < 10 ? 2 : 0 });

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/* ── Las cinco proyecciones ───────────────────────────────────────────────── */

/**
 * Guías cuyo plazo de registro SERFOR está por vencerse.
 *
 * Se cuentan **días hábiles** con la MISMA función que decide `estaFueraDePlazo`
 * (single source, ADR-137): si acá se contaran corridos, el aviso llegaría el
 * día equivocado justo los fines de semana — que es cuando más se acumula.
 *
 * Lo ya vencido NO entra: eso ya lo dice el score, y repetirlo acá convertiría
 * la lista de «lo que se viene» en otra lista de lo que ya pasó.
 */
function avisosDePlazo(d: DatosAnticipa, ahora: number): AvisoAnticipado[] {
  const porDias = new Map<number, string[]>();
  for (const e of d.ingresos) {
    if (e.registrado) continue;
    /* `createdAt` = AHORA a propósito: el reloj del plazo sigue corriendo
       mientras la guía no se registra. `diasHabilesDeRegistro` toma `string |
       Date`, así que el instante entra como Date. */
    const usados = diasHabilesDeRegistro({ entryDate: e.entryDate, createdAt: new Date(ahora) });
    const quedan = PLAZO_REGISTRO_DIAS - usados;
    if (quedan < 0 || quedan > 1) continue; // vencido → score; >1 día → todavía no urge
    const lista = porDias.get(quedan) ?? [];
    lista.push(e.gtfNumber);
    porDias.set(quedan, lista);
  }

  return [...porDias.entries()].map(([quedan, gtfs]) => ({
    clave: `plazo-${quedan}`,
    gravedad: "urgente" as const,
    dias: quedan,
    titulo:
      quedan === 0
        ? `${gtfs.length} ${plural(gtfs.length, "guía vence", "guías vencen")} el plazo HOY`
        : `${gtfs.length} ${plural(gtfs.length, "guía vence", "guías vencen")} el plazo mañana`,
    detalle: `${gtfs.slice(0, 4).join(", ")}${gtfs.length > 4 ? ` y ${gtfs.length - 4} más` : ""}. Pasado el plazo de ${PLAZO_REGISTRO_DIAS} días hábiles ya es una infracción que no se puede corregir — sólo esperar a que salga del período.`,
    vista: "ingresos",
  }));
}

/**
 * Trozas a punto de cruzar el umbral de varada.
 *
 * El pendiente existente cuenta las que YA lo cruzaron: plata perdida. Esto
 * cuenta las que lo cruzan dentro de una semana, que es plata que todavía se
 * salva metiéndolas a la sierra.
 */
function avisoDeTrozas(d: DatosAnticipa): AvisoAnticipado | null {
  const b = d.trozasPorVarar;
  if (!b || b.piezas <= 0) return null;

  return {
    clave: "trozas-por-varar",
    gravedad: "proximo",
    /* La ventana, no un día: el conteo agregado no sabe cuál pieza es la más
       vieja, y fingir «cruzan en 3 días» sería precisión inventada. */
    dias: b.ventanaDias,
    titulo: `${b.piezas} ${plural(b.piezas, "troza cruza", "trozas cruzan")} los ${TROZAS_VARADAS_DIAS} días esta semana`,
    detalle:
      b.m3 > 0
        ? `${fmt(b.m3)} m³ que a partir de ahí empiezan a mancharse y rajarse. Aserrarlas ahora es la diferencia entre madera de primera y descarte.`
        : "A partir de ahí empiezan a mancharse y rajarse. Aserrarlas ahora las salva.",
    vista: "patio",
  };
}

/**
 * Documentos que vencen mientras todavía queda materia prima en el patio.
 *
 * Un título vencido NO invalida la madera ya ingresada, pero complica todo lo
 * que venga después: movilizarla, ampararla en una GTF de salida, sostenerla
 * ante una fiscalización. Un título que vence con el patio vacío es un trámite;
 * con madera colgando es un problema.
 *
 * El m³ que se muestra es el del PATIO ENTERO y se dice así —«quedan X m³ de
 * materia prima»—, NO el amparado por ese título: el libro no guarda el saldo
 * por título, y repartirlo a ojo sería fabricar un derivado con cara de dato
 * oficial. Con el patio en cero no hay aviso, que es la decisión que importa.
 */
function avisosDeDocumentos(d: DatosAnticipa, ahora: number): AvisoAnticipado[] {
  if (d.patioM3 <= 0) return [];   // vence, pero no hay madera colgando
  const out: AvisoAnticipado[] = [];
  for (const doc of d.documentos) {
    const dias = diasPara(doc.vencimiento, ahora);
    /* Sin fecha cargada no se inventa un vencimiento, y lo ya vencido lo dice
       el score: acá sólo lo que está por venir. */
    if (dias == null || dias < 0 || dias > HORIZONTE_DOCUMENTO_DIAS) continue;

    out.push({
      clave: `doc-${doc.label}`,
      gravedad: dias <= 7 ? "urgente" : "proximo",
      dias,
      titulo: `${doc.label} vence ${dias === 0 ? "hoy" : `en ${dias} ${plural(dias, "día", "días")}`}`,
      detalle: `Quedan ${fmt(d.patioM3)} m³ de materia prima en el patio. Renovarlo ante la ARFFS no es inmediato, y vencido esa madera queda difícil de movilizar y de amparar en una guía de salida.`,
      vista: "ficha",
    });
  }
  return out;
}

/**
 * Cuántos días le quedan al patio al ritmo real de consumo.
 *
 * No es una alerta de compliance: es de operación. Un aserradero que se queda
 * sin trozas para el jueves tenía que haber comprado el lunes.
 *
 * El ritmo sale de lo REALMENTE consumido en la ventana, no de una capacidad
 * teórica: la sierra que dice cortar 20 m³/día pero corta 11 hace que la
 * proyección teórica mienta a favor.
 */
function avisoDePatio(d: DatosAnticipa): AvisoAnticipado | null {
  if (d.consumoDias <= 0 || d.consumidoM3 <= 0 || d.patioM3 <= 0) return null;
  const porDia = d.consumidoM3 / d.consumoDias;
  if (porDia <= 0) return null;
  const dias = Math.floor(d.patioM3 / porDia);
  if (dias > HORIZONTE_PATIO_DIAS) return null;

  return {
    clave: "patio-se-acaba",
    gravedad: dias <= 7 ? "urgente" : "proximo",
    dias,
    titulo: `El patio da para ${dias} ${plural(dias, "día", "días")} más`,
    detalle: `Quedan ${fmt(d.patioM3)} m³ y en los últimos ${d.consumoDias} días se consumieron ${fmt(d.consumidoM3)} m³ (${fmt(porDia)} m³/día). Comprar toma tiempo: la guía del monte y el flete no salen el mismo día.`,
    vista: "patio",
  };
}

/**
 * Todo lo que se viene, de lo más cerca a lo más lejos.
 *
 * Sin avisos devuelve `[]` — y eso se muestra como «no se viene nada», que es
 * información. Una sección vacía sin decirlo parece rota.
 */
export function avisosQueVienen(d: DatosAnticipa, ahora: number = Date.now()): AvisoAnticipado[] {
  return [
    ...avisosDePlazo(d, ahora),
    avisoDeTrozas(d),
    ...avisosDeDocumentos(d, ahora),
    avisoDePatio(d),
  ]
    .filter((a): a is AvisoAnticipado => a !== null)
    .sort((a, b) => a.dias - b.dias || (a.gravedad === b.gravedad ? 0 : a.gravedad === "urgente" ? -1 : 1));
}
