/**
 * Tarjetas del catálogo de trámites: la pieza héroe, la entrada al Registro de
 * Plantación Forestal y la card de cada formato. Extraídas de
 * `TramitesCatalogo` sin cambiar conducta.
 */

import {
  ArrowRight,
  ArrowUpCircle,
  Axe,
  Ban,
  BookOpen,
  Building2,
  CalendarClock,
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
  ShieldAlert,
  Siren,
  Stamp,
  TreePine,
  Truck,
  UserCog,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { AUTORIDADES, ICONO_TRAMITE, type FormatoTramite } from "@/lib/forestal/tramites-catalogo";

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

/** El ⓘ sobre fondos de color: mismo ícono, en blanco. */
const TIP_SOBRE_COLOR = "[&>button]:text-white/90 [&>button:hover]:bg-white/15 [&>button:hover]:text-white";

/** Pieza héroe: gradiente firma + greca amazónica + el ícono grande. */
export function Hero({
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
export function RegistroPlantacionCard({ onClick }: { onClick: () => void }) {
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

export function Card({
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
