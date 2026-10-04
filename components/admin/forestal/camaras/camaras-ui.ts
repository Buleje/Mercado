/**
 * Cámaras — lo que comparten las piezas de la pantalla (ADR-456): tipos de lo
 * que contesta la API, clases repetidas y cómo se le dice a una persona cada
 * cosa que leyó la IA. PURO: sin React ni fetch, para que la tarjeta de la
 * foto, el resumen del día y el modal de chalecos digan lo mismo con las
 * mismas palabras.
 */

import { esDireccionLocal, type ActividadPatio, type CruceChaleco, type Captura, type LecturaPila } from "@/lib/camaras/camaras";
import type { ResumenDelDia } from "@/lib/camaras/resumen";
import { ESTADO_ASISTENCIA_META } from "@/components/admin/rrhh/rrhh-ui";
import type { EstadoAsistencia } from "@/lib/rrhh/tipos";
import { formatDateTimeShort, formatTime, formatWeekday } from "@/lib/format";
import { limaDateKey } from "@/lib/utils";

export const API_CAMARAS = "/api/admin/camaras";

/** Número de chaleco → de quién es, como lo manda el GET. */
export type ChalecosPantalla = Record<string, { colaboradorId: string; nombre: string | null }>;

/** Una persona del personal, con lo justo para el selector del chaleco. */
export interface ColaboradorOpcion {
  id: string;
  nombre: string;
  apodo: string | null;
  puesto: string | null;
  chaleco: string | null;
}

/** `GET /api/admin/camaras/direccion`. */
export interface DireccionPublica {
  publica: string | null;
  origen: "fija" | "tunel" | null;
  desde: string | null;
  vivo: boolean;
}

export type { ResumenDelDia };

/* ── Clases que se repiten ─────────────────────────────────────────────── */

/** Botón secundario de 36 px: los de la fila de cada cámara y de las tarjetas. */
export const BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50";

/** Bloque de la pantalla: tarjeta con borde. */
export const BLOQUE = "rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4";

export type Tono = "ok" | "aviso" | "alerta" | "info" | "neutro";

/**
 * Pastilla de estado: texto primario sobre el tinte del tono, borde del tono.
 * El texto de color sobre su propio tinte no llega a AA en letra chica (medido
 * en Saldos, 24-09): el color va en el borde y en el ícono (`ICONO_TONO`).
 */
export const CHIP_TONO: Record<Tono, string> = {
  ok: "border-[var(--data-success-500)]/50 bg-[var(--data-success-500)]/10",
  aviso: "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-500)]/10",
  alerta: "border-[var(--data-error-500)]/60 bg-[var(--data-error-500)]/10",
  info: "border-[var(--data-info-500)]/50 bg-[var(--data-info-500)]/10",
  neutro: "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
};

/** El ícono de la pastilla lleva el color (texto chico semántico → `-ink`). */
export const ICONO_TONO: Record<Tono, string> = {
  ok: "text-[var(--data-success-ink)]",
  aviso: "text-[var(--data-warning-ink)]",
  alerta: "text-[var(--data-error-ink)]",
  info: "text-[var(--data-info-ink)]",
  neutro: "text-[var(--text-tertiary)]",
};

export const CHIP_BASE =
  "inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold text-[var(--text-primary)]";

/* ── Personas ──────────────────────────────────────────────────────────── */

/** «Juan Pérez Ríos» → «Juan Pérez»: en una pastilla, el nombre y el primer apellido alcanzan. */
export function nombreCorto(nombre: string | null | undefined): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  return partes.slice(0, 2).join(" ");
}

/** Lo que se dice de un chaleco visto en una foto: de quién es y qué dice su asistencia. */
/**
 * Lo que se dice de un chaleco visto en una foto. El DUEÑO sale de la lista
 * viva (`vivo`, la del GET): asignar el N° 9 tiene que cambiar todas las fotos
 * donde aparece, no sólo las que lleguen después. La MARCACIÓN sí es la
 * guardada con la foto —lo que había al sacarla— y sólo vale si el chaleco era
 * de la misma persona entonces.
 */
export function textoChaleco(
  c: Pick<CruceChaleco, "numero" | "colaboradorId" | "asistencia">,
  vivo: { colaboradorId: string; nombre: string | null } | null | undefined,
): { texto: string; tono: Tono; sinAsignar: boolean } {
  if (!vivo) return { texto: `N° ${c.numero} sin asignar`, tono: "neutro", sinAsignar: true };
  const quien = nombreCorto(vivo.nombre) || "persona dada de baja";
  if (c.colaboradorId !== vivo.colaboradorId) {
    return { texto: `N° ${c.numero} · ${quien}`, tono: "neutro", sinAsignar: false };
  }
  const a = c.asistencia;
  if (!a)
    return { texto: `N° ${c.numero} · ${quien} · sin marcación`, tono: "aviso", sinAsignar: false };
  if (a.entrada) {
    const tarde = a.estado === "TARDANZA";
    return {
      texto: `N° ${c.numero} · ${quien} · ${tarde ? "tardanza" : "marcó"} ${a.entrada}`,
      tono: tarde ? "aviso" : "ok",
      sinAsignar: false,
    };
  }
  /* Marcó, pero sin hora: falta, permiso, descanso… Si está en el patio con
     «falta», la pastilla lo dice tal cual — esa contradicción es el dato. */
  const meta = ESTADO_ASISTENCIA_META[a.estado as EstadoAsistencia];
  const tono: Tono = a.estado === "FALTA" ? "alerta" : a.estado === "PRESENTE" ? "ok" : "info";
  return {
    texto: `N° ${c.numero} · ${quien} · ${(meta?.label ?? a.estado).toLowerCase()}`,
    tono,
    sinAsignar: false,
  };
}

/** El estado de asistencia como palabra, para el resumen del día. */
export function etiquetaAsistencia(estado: string | null): string | null {
  if (!estado) return null;
  return ESTADO_ASISTENCIA_META[estado as EstadoAsistencia]?.label ?? estado;
}

/* ── Lo que se ve en la foto ───────────────────────────────────────────── */

export const ACTIVIDAD_LABEL: Record<ActividadPatio, string> = {
  carga: "Carga",
  descarga: "Descarga",
  aserrio: "Aserrío",
  apilado: "Apilado",
  transito: "Tránsito",
  ninguna: "Sin actividad",
};

/**
 * La pila de trozas contra la foto anterior. «Bajó» sólo es alarma si ese día
 * no hay despacho NI producción anotados: la sierra también la baja.
 */
export function textoPila(
  p: Pick<LecturaPila, "cambio" | "despachoDelDia" | "produccionDelDia" | "avisada"> & {
    confianza?: LecturaPila["confianza"];
  },
  /**
   * `true` en la pastilla de la FOTO: «sin despacho ni producción» es lo que
   * decía el libro al sacarla (la producción se anota días después), no una
   * acusación vigente — va en ámbar, no en rojo. El resumen del día relee el
   * libro y ése sí la marca en rojo.
   */
  alMomento = false,
): {
  texto: string;
  tono: Tono;
} {
  if (p.cambio === "bajo") {
    const partes = ["Pila bajó"];
    /* El libro sólo se consulta si la IA está segura: con confianza baja los
       dos quedan sin saber y la pastilla no acusa a nadie. */
    const sinExplicar = p.despachoDelDia === false && p.produccionDelDia === false;
    if (p.despachoDelDia) partes.push("hubo despacho");
    else if (p.produccionDelDia) partes.push("hubo producción");
    else if (sinExplicar) partes.push("sin despacho ni producción");
    else if (p.confianza === "baja") partes.push("poco seguro");
    if (p.avisada) partes.push("avisado");
    return {
      texto: partes.join(" · "),
      tono: sinExplicar
        ? alMomento
          ? "aviso"
          : "alerta"
        : p.despachoDelDia || p.produccionDelDia
          ? "neutro"
          : "aviso",
    };
  }
  if (p.cambio === "subio") return { texto: "Pila subió", tono: "info" };
  if (p.cambio === "igual") return { texto: "Pila igual", tono: "neutro" };
  return { texto: "No se ve la pila", tono: "neutro" };
}

/** Por qué una foto quedó sin leer, cuando el motivo es del sistema (no del modelo). */
const MOTIVO_SIN_LEER: Record<string, string> = {
  sin_ia_configurada: "Sin leer: falta la clave de la IA",
  presupuesto_agotado: "Sin leer: se acabó el saldo de la IA",
  no_se_pudo_leer: "La IA no pudo leerla",
  sin_tenant: "Sin leer",
};

export function sinLeer(c: Pick<Captura, "lectura">): string | null {
  const m = c.lectura?.motivo;
  return m ? (MOTIVO_SIN_LEER[m] ?? null) : null;
}

/**
 * ¿La IA no está leyendo? Mira la foto más nueva que tenga lectura: si vino sin
 * clave, la pantalla lo avisa. Una vieja sin clave no cuenta si después se cargó.
 */
export function faltaClaveIa(capturas: readonly Pick<Captura, "lectura">[]): boolean {
  const ultima = capturas.find((c) => c.lectura);
  return ultima?.lectura?.motivo === "sin_ia_configurada";
}

/* ── La dirección para la cámara ───────────────────────────────────────── */

export function esOrigenLocal(origin: string): boolean {
  try {
    const h = new URL(origin).hostname;
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "::1" ||
      h.endsWith(".localhost") ||
      /^(10|192\.168)\./.test(h)
    );
  } catch {
    return false;
  }
}

export type EstadoDireccion =
  | { tipo: "cargando"; base: "" }
  | { tipo: "fija"; base: string }
  | { tipo: "tunel"; base: string; desde: string | null }
  | { tipo: "tunel-caido"; base: string; desde: string | null }
  | { tipo: "local"; base: string }
  | { tipo: "pagina"; base: string };

/**
 * A qué dirección tiene que mandar la cámara. La de la pestaña sólo sirve si el
 * panel está publicado: en `localhost` la cámara 4G no llega nunca.
 */
export function estadoDireccion(
  dir: DireccionPublica | null,
  origin: string,
  cargando: boolean,
  baseDelPanel = "",
): EstadoDireccion {
  if (dir?.publica) {
    if (dir.origen === "fija") return { tipo: "fija", base: dir.publica };
    return dir.vivo
      ? { tipo: "tunel", base: dir.publica, desde: dir.desde }
      : { tipo: "tunel-caido", base: dir.publica, desde: dir.desde };
  }
  /* Mientras se pregunta no hay nada que copiar: con el túnel abierto, la de
     la pestaña es `localhost` y la cámara no llega nunca. El aviso tampoco se
     pinta hasta saber. */
  if (cargando && !dir) return { tipo: "cargando", base: "" };
  /* Sin túnel ni dirección fija del servidor: si el panel se abre en la PC pero
     el dominio público está configurado, la cámara con chip va a ese, no a
     `localhost` (copiarlo la dejaba mandando fotos a ninguna parte). */
  const publica = baseDelPanel.replace(/\/$/, "");
  if (publica && !esDireccionLocal(publica)) return { tipo: "fija", base: publica };
  return esOrigenLocal(origin) ? { tipo: "local", base: origin } : { tipo: "pagina", base: origin };
}

/**
 * La dirección que sirve pegar en la cámara, o `""` si ahora no hay ninguna:
 * mientras se averigua, y con el túnel caído (la vieja ya no recibe y al
 * reabrirlo sale otra). Con `""` los botones de copiar quedan apagados.
 */
/**
 * El servidor manda `token: ""` a quien no es admin ni dueño (revisión de
 * seguridad 2026-10-03): la dirección de la cámara deja subir imágenes como
 * ella, así que no se copia ni se muestra.
 */
export const SOLO_ADMIN_DIRECCION = "Solo admin o dueño ve la dirección de la cámara";

export function direccionCopiable(estado: EstadoDireccion, token: string): string {
  if (!token) return "";
  if (estado.tipo === "cargando" || estado.tipo === "tunel-caido" || !estado.base) return "";
  return `${estado.base}/api/webhooks/camara?k=${token}`;
}

/** Por qué no se puede copiar, para el `title` del botón apagado. */
export function porQueNoSeCopia(estado: EstadoDireccion): string {
  return estado.tipo === "tunel-caido"
    ? "El túnel está cerrado: ábrelo y copia la dirección nueva"
    : "Averiguando la dirección pública…";
}

/** «16:33» si es de hoy; «30 sep., 16:33» si no. */
export function horaODia(iso: string | null | undefined): string {
  if (!iso) return "";
  return limaDateKey(iso) === limaDateKey() ? formatTime(iso) : formatDateTimeShort(iso);
}

/* ── Días ──────────────────────────────────────────────────────────────── */

/** «2026-10-01» ± n días, sin salir de UTC. */
export function moverDia(fecha: string, n: number): string {
  return new Date(Date.parse(`${fecha}T12:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** «jueves 01/10» — el día como lo dice el panel. */
export function diaLegible(fecha: string): string {
  const semana = formatWeekday(`${fecha}T12:00:00.000Z`, {
    largo: true,
    soloFecha: true,
  }).toLowerCase();
  return `${semana} ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}
