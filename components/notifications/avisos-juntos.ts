/**
 * Cómo se lee la lista del centro de notificaciones del panel (Brandon
 * 2026-10-18: «más minimalista y mejor elaborado»). Puro, sin React.
 *
 * 1. **Repetidos juntos.** Un recordatorio que el cron deja cada día era una
 *    tarjeta por día. Medido el 18-10 en los 100 avisos más recientes: `main`
 *    tenía 19 distintos y Blas 7 (94 «beneficio de cacao» iguales). Ahora el
 *    mismo aviso (tipo + título + registro + enlace) es UNA fila con «N veces
 *    · desde …».
 * 2. **Nivel**, con las mismas cuatro palabras que el superadmin
 *    (`lib/superadmin/nivel-aviso.ts`): dice CUÁNDO actuar, no sólo la etiqueta
 *    de origen. Un HIGH de hace una semana ya no es «urgente»; un cliente nuevo
 *    o la venta alta del día son «informativo» (no piden nada).
 * 3. **Orden dentro del día**: lo sin leer primero, por nivel; lo leído al final.
 */
import { NIVELES, type Nivel } from "@/lib/superadmin/nivel-aviso";

export type { Nivel };

export interface AvisoBase {
  id: string;
  type: string;
  title: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  createdAt: string;
  readAt?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
}

export interface AvisoJunto<T extends AvisoBase> {
  /** El más nuevo: el que se muestra. */
  aviso: T;
  /** Fecha del más nuevo (para agrupar por día con `agruparPorDia`). */
  createdAt: string;
  /** Cuántas veces llegó (1 = no se repite). */
  veces: number;
  /** Fecha del más viejo: desde cuándo se repite. */
  desde: string;
  /** Sin leer = el más nuevo sin leer (lo de antes ya lo tapó el nuevo). */
  sinLeer: boolean;
  /** Las copias sin leer, la más nueva primero: «marcar leída» las marca. */
  idsSinLeer: string[];
  nivel: Nivel;
}

const DIA = 86_400_000;

/** Tipos que sólo cuentan algo: no piden una acción tuya. */
const INFORMATIVOS: ReadonlySet<string> = new Set([
  "CLIENTE_NUEVO",
  "VENTA_ALTA",
  "META_ALCANZADA",
  "forecast_daily",
  "AGRADECIMIENTO",
  "CUMPLEANOS",
  "CREDIT_WEEKLY_REPORT",
  "CREDIT_SCORE_CHANGE",
]);

/** Umbrales con nombre (días desde el aviso más nuevo). */
export const DIAS_URGENTE = 3;
export const DIAS_IMPORTANTE = 7;

/**
 * El nivel de un aviso guardado:
 *  · informativo — los tipos que sólo cuentan algo;
 *  · urgente     — HIGH de los últimos 3 días;
 *  · importante  — HIGH más viejo, o MEDIUM de la última semana;
 *  · leve        — MEDIUM más viejo y todo LOW.
 */
export function nivelDeAviso(
  a: Pick<AvisoBase, "type" | "severity" | "createdAt">,
  ahora: number = Date.now(),
): Nivel {
  if (INFORMATIVOS.has(a.type)) return "informativo";
  const t = Date.parse(a.createdAt);
  const dias = Number.isFinite(t) ? Math.max(0, (ahora - t) / DIA) : Infinity;
  if (a.severity === "HIGH") return dias <= DIAS_URGENTE ? "urgente" : "importante";
  if (a.severity === "MEDIUM") return dias <= DIAS_IMPORTANTE ? "importante" : "leve";
  return "leve";
}

/**
 * Un enlace afuera (WhatsApp) lleva el mensaje del día en la consulta («lleva 78
 * días…» + una firma nueva): se compara sin ella. Medido el 18-10 en `main`: con
 * la consulta, 50 avisos distintos; sin ella, 19. La fila abre el enlace del más
 * nuevo, que es el que tiene el mensaje al día.
 */
const enlaceParaComparar = (url: string | null | undefined) =>
  !url ? "" : /^https?:\/\//i.test(url) ? url.split(/[?#]/, 1)[0] : url;

const clave = (a: AvisoBase) =>
  [a.type, a.title.trim(), a.entityId ?? "", enlaceParaComparar(a.actionUrl)].join("\u0000");

/** Junta las copias del mismo aviso; el resultado va del más nuevo al más viejo. */
export function juntarRepetidos<T extends AvisoBase>(
  items: readonly T[],
  ahora: number = Date.now(),
): AvisoJunto<T>[] {
  const ordenados = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const porClave = new Map<string, T[]>();
  for (const it of ordenados) {
    const k = clave(it);
    const copias = porClave.get(k);
    if (copias) copias.push(it);
    else porClave.set(k, [it]);
  }
  return [...porClave.values()].map((copias) => {
    const aviso = copias[0];
    return {
      aviso,
      createdAt: aviso.createdAt,
      veces: copias.length,
      desde: copias[copias.length - 1].createdAt,
      sinLeer: !aviso.readAt,
      idsSinLeer: copias.filter((c) => !c.readAt).map((c) => c.id),
      nivel: nivelDeAviso(aviso, ahora),
    };
  });
}

/** Rango para ordenar: sin leer por nivel (0-3), leído al final (4). */
const rango = (j: Pick<AvisoJunto<AvisoBase>, "sinLeer" | "nivel">) =>
  j.sinLeer ? NIVELES.indexOf(j.nivel) : NIVELES.length;

/** Orden dentro de un día: sin leer y urgente primero; a igual rango, lo más nuevo. */
export function ordenarDelDia<J extends Pick<AvisoJunto<AvisoBase>, "sinLeer" | "nivel" | "createdAt">>(
  items: readonly J[],
): J[] {
  return [...items].sort(
    (a, b) => rango(a) - rango(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

/**
 * Cuántas copias marca un clic. Cada «leído» es un PATCH y el centro relee la
 * lista después de cada uno: 94 copias serían ~190 pedidos y el límite de la
 * API es 60 por minuto. El resto queda para el próximo clic (la fila ya se ve
 * leída: manda la copia más nueva) o para «Marcar todas leídas».
 */
export const TOPE_MARCAR_JUNTOS = 10;
