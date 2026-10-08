"use client";

/**
 * TramitesCatalogo — elegir el trámite.
 *
 * Diseño (identidad editorial de selva, ADR-069/075): el trámite más usado sale
 * como pieza héroe con el gradiente teal profundo de la marca y la greca
 * shipiba; el resto va agrupado POR AUTORIDAD, porque así trabaja el operador
 * ("esto va al Gobierno Regional, esto a OSINFOR") y no en una grilla de ocho
 * cards idénticas donde todo pesa igual.
 *
 * Cada formato lleva su ícono: con ocho iguales hay que leer los ocho títulos.
 */

import { useState } from "react";
import { m as motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpCircle,
  Axe,
  Ban,
  BookOpen,
  Building2,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  Compass,
  FileStack,
  FileText,
  FileWarning,
  FileX,
  Flame,
  Globe,
  Pause,
  PenLine,
  RotateCcw,
  Route,
  Scale,
  Search,
  ShieldAlert,
  Siren,
  Stamp,
  TreePine,
  Truck,
  UserCog,
  X,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { staggerContainer, staggerChild } from "@/components/ui-system/motion";
import {
  AUTORIDADES,
  FORMATOS_TRAMITE,
  ICONO_TRAMITE,
  type AutoridadTramite,
  type FormatoTramite,
} from "@/lib/forestal/tramites-catalogo";
import { contarPorEstado, type TramiteRegistro } from "@/lib/forestal/tramites-registro";

const ICONOS: Record<string, LucideIcon> = {
  Stamp,
  Compass,
  Building2,
  BookOpen,
  UserCog,
  ShieldAlert,
  Globe,
  PenLine,
  Truck,
  Ban,
  ArrowUpCircle,
  FileWarning,
  Pause,
  RotateCcw,
  ClipboardCheck,
  FileStack,
  Scale,
  CalendarClock,
  Siren,
  FileX,
  Axe,
  Route,
  Flame,
};

const iconoDe = (id: string): LucideIcon => ICONOS[ICONO_TRAMITE[id] ?? ""] ?? FileText;

/** Caja del ícono por tono de autoridad — el color dice a quién va sin leer. */
const TONO_ICONO: Record<string, string> = {
  accent: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] ring-1 ring-inset ring-primary/25",
  info: "bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)] ring-1 ring-inset ring-[var(--data-info-500)]/25",
  warning:
    "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)] ring-1 ring-inset ring-[var(--data-warning-500)]/25",
  muted: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--rule-base)]",
};

/** Franja superior por tono — la misma idea del ícono, ahora en el borde de
 *  la card: se lee el grupo antes que el título, incluso en la vista mobile
 *  donde las cards se apilan una debajo de otra. */
const TONO_FRANJA: Record<string, string> = {
  accent: "before:bg-[var(--accent)]",
  info: "before:bg-[var(--data-info-500)]",
  warning: "before:bg-[var(--data-warning-500)]",
  muted: "before:bg-[var(--rule-strong)]",
};

/** El que se pide una y otra vez: se lleva la pieza héroe. */
const DESTACADO = "visado-talonario-gtf";

/** Cuatro por fila cuando hay ancho: cada card es sólo ícono + nombre. */
const GRILLA = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

/** Cards de un grupo que se ven sin desplegar (dos filas de cuatro). */
const VISIBLES_POR_GRUPO = 8;

/** Orden de los grupos: el que más trabajo genera primero. */
const ORDEN_AUTORIDAD: AutoridadTramite[] = ["arffs", "serfor", "osinfor", "otra"];

const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Tono de los chips de autoridad — mismos tokens que `TONO_ICONO`, ahora en botón. */
const TONO_CHIP: Record<string, string> = {
  accent: "border-primary/40 bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
  info: "border-[var(--data-info-500)] bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/12 dark:text-[var(--data-info-500)]",
  warning: "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  muted: "border-[var(--rule-strong)] bg-[var(--surface-sunken)] text-[var(--text-primary)]",
};

export default function TramitesCatalogo({
  tramites,
  onElegir,
  onAbrirPlantaciones,
}: {
  tramites: TramiteRegistro[];
  onElegir: (formatoId: string) => void;
  /** Abre el Registro de Plantación Forestal (RNPF) — un módulo propio, no un
   *  `FormatoTramite` más: la ficha estructurada del Anexo N°01 no entra en el
   *  motor de oficios/cartas (ADR-380). */
  onAbrirPlantaciones: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  /** Qué autoridades se ven: la que más trabajo genera arranca abierta y las
   *  otras se abren con su chip (ley de la vista: lo secundario, plegado). */
  const [abiertas, setAbiertas] = useState<AutoridadTramite[]>(["arffs"]);
  const alternar = (aut: AutoridadTramite) =>
    setAbiertas((a) => (a.includes(aut) ? a.filter((x) => x !== aut) : [...a, aut]));
  /** Grupos con todas sus cards a la vista: ARFFS tiene 15 y empujaba el resto
   *  de la pantalla; se muestran las primeras y el resto se despliega. */
  const [completas, setCompletas] = useState<AutoridadTramite[]>([]);
  const alternarCompleta = (aut: AutoridadTramite) =>
    setCompletas((a) => (a.includes(aut) ? a.filter((x) => x !== aut) : [...a, aut]));
  const usados = (id: string) => tramites.filter((t) => t.formatoId === id).length;
  const destacado = FORMATOS_TRAMITE.find((f) => f.id === DESTACADO);
  const resto = FORMATOS_TRAMITE.filter((f) => f.id !== DESTACADO);
  const porEstado = contarPorEstado(tramites);
  const enCurso = porEstado.presentado + porEstado.observado;

  /**
   * Buscador + filtro por autoridad (Brandon 2026-08-26, "consultá ideas y
   * mejorá esto"): 22 formatos ya no se recorren a ojo agrupados en cuatro
   * secciones — el mismo problema que resolvió el buscador de `TramitesExpediente`
   * ("con 14 formatos... encontrar el que buscás a ojo deja de alcanzar"),
   * ahora acá en el catálogo. `sinTildes` para que "tala" encuentre "Aviso de
   * inicio de aprovechamiento" aunque el operador tipee sin acento.
   */
  const q = sinTildes(busqueda.trim());
  const matches = (f: FormatoTramite) => sinTildes(f.nombre).includes(q) || sinTildes(f.proposito).includes(q);
  const activo = q !== "";
  const resultados = activo ? FORMATOS_TRAMITE.filter(matches) : [];

  return (
    <div className="space-y-6">
      <TirasResumen total={FORMATOS_TRAMITE.length} guardados={tramites.length} enCurso={enCurso} resueltos={porEstado.resuelto} />

      <div className="space-y-3">
        <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setBusqueda("")}
            placeholder="Buscar formato por nombre o para qué sirve…"
            aria-label="Buscar formato por nombre o para qué sirve"
            className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
          {busqueda && (
            <button type="button" onClick={() => setBusqueda("")} aria-label="Limpiar búsqueda" className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ORDEN_AUTORIDAD.map((aut) => (
            <FiltroChip
              key={aut}
              label={`${AUTORIDADES[aut].corto} · ${FORMATOS_TRAMITE.filter((f) => f.autoridad === aut).length}`}
              tono={AUTORIDADES[aut].tono}
              activo={abiertas.includes(aut) && !activo}
              onClick={() => {
                setBusqueda("");
                alternar(aut);
              }}
            />
          ))}
        </div>
      </div>

      {activo ? (
        resultados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--rule-base)] py-10 text-center">
            <Search className="h-8 w-8 text-[var(--text-tertiary)]" aria-hidden="true" />
            <p className="font-bold text-[var(--text-primary)]">Ningún formato coincide</p>
            <p className="text-sm text-[var(--text-tertiary)]">Prueba con otra palabra.</p>
          </div>
        ) : (
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className={GRILLA}>
            {resultados.map((f) => (
              <motion.div key={f.id} variants={staggerChild}>
                <Card formato={f} usados={usados(f.id)} onElegir={onElegir} />
              </motion.div>
            ))}
          </motion.div>
        )
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {destacado && <Hero formato={destacado} usados={usados(destacado.id)} onElegir={onElegir} />}
            <RegistroPlantacionCard onClick={onAbrirPlantaciones} />
          </div>

          {ORDEN_AUTORIDAD.map((aut) => {
            if (!abiertas.includes(aut)) return null;
            const grupo = resto.filter((f) => f.autoridad === aut);
            if (grupo.length === 0) return null;
            const meta = AUTORIDADES[aut];
            const plegable = grupo.length > VISIBLES_POR_GRUPO + 1;
            const verTodas = !plegable || completas.includes(aut);
            const visibles = verTodas ? grupo : grupo.slice(0, VISIBLES_POR_GRUPO);
            return (
              <section key={aut} className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-[var(--rule-soft)] pb-2">
                  <SectionTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">
                    {meta.label}
                  </SectionTitle>
                  <InfoTip title={meta.label} what={meta.detalle} />
                </div>
                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                  className={GRILLA}
                >
                  {visibles.map((f) => (
                    // Un grupo de una sola card en una grilla de tres deja dos huecos
                    // que se leen como "falta algo": esa card se estira y pasa a
                    // horizontal. Se ve elegida, no sobrante.
                    <motion.div key={f.id} variants={staggerChild} className={grupo.length === 1 ? "col-span-full" : ""}>
                      <Card formato={f} usados={usados(f.id)} onElegir={onElegir} ancha={grupo.length === 1} />
                    </motion.div>
                  ))}
                </motion.div>
                {plegable && (
                  <button
                    type="button"
                    onClick={() => alternarCompleta(aut)}
                    aria-expanded={verTodas}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"
                  >
                    {verTodas ? "Ver menos" : `Ver los ${grupo.length - VISIBLES_POR_GRUPO} restantes`}
                    <ChevronDown className={`h-4 w-4 transition-transform ${verTodas ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

/**
 * Tira de resumen: cuántos formatos hay y qué tan viva está la carpeta. Sin
 * esto el módulo abría directo en la pieza héroe — vistosa, pero sin decir
 * nada de lo que ya se hizo. Un número por dato, no una tabla: es la entrada
 * al catálogo, no el expediente (eso ya lo tiene su propia pestaña).
 */
function TirasResumen({
  total,
  guardados,
  enCurso,
  resueltos,
}: {
  total: number;
  guardados: number;
  enCurso: number;
  resueltos: number;
}) {
  const items: { label: string; value: number; tono: "neutral" | "info" | "success" }[] = [
    { label: "formatos disponibles", value: total, tono: "neutral" },
    { label: "guardados en el expediente", value: guardados, tono: "neutral" },
    { label: "en curso ante la autoridad", value: enCurso, tono: "info" },
    { label: "resueltos", value: resueltos, tono: "success" },
  ];
  const TONO: Record<string, string> = {
    neutral: "text-[var(--text-primary)]",
    info: "text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
    success: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  };
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline gap-1.5">
          <span className={`font-display text-xl leading-none tabular-nums ${TONO[it.tono]}`}>{it.value}</span>
          <span className="text-xs text-[var(--text-tertiary)]">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Chip del filtro de autoridad — mismo look que el buscador del Expediente. */
function FiltroChip({
  label,
  activo,
  tono = "muted",
  onClick,
}: {
  label: string;
  activo: boolean;
  tono?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-bold transition ${
        activo
          ? TONO_CHIP[tono]
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"
      }`}
    >
      {label}
    </button>
  );
}

/** El ⓘ sobre fondos de color: mismo ícono, en blanco. */
const TIP_SOBRE_COLOR = "[&>button]:text-white/90 [&>button:hover]:bg-white/15 [&>button:hover]:text-white";

/** Pieza héroe: gradiente firma + greca amazónica + el ícono grande. */
function Hero({
  formato,
  usados,
  onElegir,
}: {
  formato: FormatoTramite;
  usados: number;
  onElegir: (id: string) => void;
}) {
  const Icono = iconoDe(formato.id);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onElegir(formato.id)}
        className="group relative flex h-full w-full items-center justify-between gap-4 overflow-hidden rounded-2xl p-5 pr-12 text-left text-white shadow-[var(--shadow-md)] transition-shadow hover:shadow-[var(--shadow-lg)]"
        style={{
          background:
            "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 55%, #0d3b3b 100%)",
        }}
      >
        {/* Greca shipiba: identidad de la casa, decorativa. */}
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.13]">
          <defs>
            <pattern id="greca-tramites" width="26" height="26" patternUnits="userSpaceOnUse">
              <path d="M0 13h6v-6h7v6h6v7h-6v6H6v-6H0z" fill="none" stroke="white" strokeWidth="1.1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#greca-tramites)" />
        </svg>
        {/* Brillo diagonal que barre al hover. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-y-10 -left-1/4 w-1/3 rotate-12 bg-linear-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[320%]"
        />
        <span className="relative min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide">
            El más pedido · {AUTORIDADES[formato.autoridad].corto}
          </span>
          <SectionTitle as="h2" className="mt-2 text-2xl font-bold leading-tight tracking-tight text-white!">{formato.nombre}</SectionTitle>
          <span className="mt-2 inline-flex items-center gap-2 text-sm font-bold">
            Llenar y presentar
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            {usados > 0 && (
              <span className="text-xs font-normal text-white/75">
                · {usados} {usados === 1 ? "presentado" : "presentados"}
              </span>
            )}
          </span>
        </span>
        <Icono className="relative h-14 w-14 shrink-0 text-white/95 drop-shadow transition-transform group-hover:scale-110" aria-hidden="true" />
      </button>
      <span className={`absolute right-2 top-2 ${TIP_SOBRE_COLOR}`}>
        <InfoTip title={formato.nombre} what={formato.proposito} />
      </span>
    </div>
  );
}

/**
 * Registro de Plantación Forestal (RNPF) — la tarjeta de entrada al módulo
 * nuevo (ADR-380). No es una card más del grid de oficios: es un trámite
 * distinto (ficha estructurada, no una carta), así que lleva su propio look
 * — tono verde vivero en vez del teal de marca, para que se distinga de un
 * vistazo de "esto es SOLICITAR algo" vs "esto es REGISTRAR una plantación".
 */
function RegistroPlantacionCard({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className="group flex h-full w-full items-center gap-4 rounded-2xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] p-5 pr-12 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--data-success-500)] hover:shadow-[var(--shadow-md)] dark:bg-[var(--data-success-500)]/10"
      >
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <TreePine className="h-6 w-6" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--data-success-500)]/15 px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            Registro Nacional · SERFOR
          </span>
          <span className="mt-1.5 block text-xl font-bold leading-snug tracking-tight text-[var(--text-primary)]">
            Registro de Plantación Forestal
          </span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-[var(--data-success-700)] transition-transform group-hover:translate-x-1 dark:text-[var(--data-success-500)]" aria-hidden="true" />
      </button>
      <span className="absolute right-2 top-2">
        <InfoTip
          title="Registro de Plantación Forestal"
          what="Inscripción o actualización ante SERFOR: titular, predio, bloques y especies, hasta generar el Formato Nº 01 del Registro Nacional de Plantaciones Forestales."
        />
      </span>
    </div>
  );
}

function Card({
  formato,
  usados,
  onElegir,
  ancha = false,
}: {
  formato: FormatoTramite;
  usados: number;
  onElegir: (id: string) => void;
  /** Única del grupo: ocupa la fila. */
  ancha?: boolean;
}) {
  const Icono = iconoDe(formato.id);
  const tono = AUTORIDADES[formato.autoridad].tono;
  const base =
    `group relative w-full overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 pr-9 text-left transition-all before:absolute before:inset-x-0 before:top-0 before:h-1 before:content-[''] hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-[var(--shadow-md)] ${TONO_FRANJA[tono]}`;

  return (
    <div className="relative h-full">
      <button type="button" onClick={() => onElegir(formato.id)} className={`${base} flex h-full flex-col justify-between gap-2 pt-4`}>
        <span className="flex items-start gap-3">
          <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105 ${TONO_ICONO[tono]}`}>
            <Icono className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-bold leading-snug text-[var(--text-primary)]">{formato.nombre}</span>
        </span>
        {usados > 0 && (
          <span className="pl-12 text-xs text-[var(--text-tertiary)]">
            {usados} presentado{usados === 1 ? "" : "s"}
          </span>
        )}
      </button>
      {/* El «para qué sirve» y el N° de campos van al ⓘ: 22 cards con 2 líneas de texto cada una era la pantalla entera. */}
      <span className="absolute right-1 top-3">
        <InfoTip
          title={formato.nombre}
          what={formato.proposito}
          example={`${formato.campos.length} campos por llenar.`}
          side={ancha ? "left" : "right"}
        />
      </span>
    </div>
  );
}
