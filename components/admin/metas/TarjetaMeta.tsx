"use client";

/**
 * TarjetaMeta — una meta: a qué área pertenece, cuánto lleva, cómo va, contra
 * qué vara (el período anterior entero) y a qué módulo llevar (ADR-488).
 *
 * El avance NO se tipea (salvo la meta a mano): llega derivado del servidor
 * (`AvanceMetaDTO`). Lo que explica la cifra —qué mide, de dónde sale, qué días
 * cuenta, la proyección— va al ⓘ, no a párrafos.
 *
 * Auditoría 10-10: el área es el enlace (badge + «›», como en Hoy) y ya no hay
 * pie con «Ver en …» y el mes repetido; el objetivo se toca para ajustarlo.
 * La meta de ventas del día lleva a Hoy y la del mes a Calendario: ahí está su
 * detalle hora a hora y día a día.
 */
import { useRef, type CSSProperties } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Minus,
  History,
  MoreHorizontal,
  Pencil,
  Trash2,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { BlockTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import ActionMenu from "@/components/admin/shared/action-menu";
import { areaDe, categoriaDe, hrefDeMeta, type AvanceMetaDTO } from "@/lib/admin/metas-catalogo";
import { NOMBRE_PERIODO, type EstadoMeta } from "@/lib/admin/metas-periodo";
import { fechaParaMostrar, type MetaDTO } from "@/lib/admin/metas-tareas";
import { BarraAvance } from "./BarraAvance";
import { TEXTO_TONO } from "./clases-meta";
import { cifraDeMeta, cifraGrande, diaMes, esConteo, lineaDeEstado, proyeccion } from "./formato-meta";
import { lineaVara } from "./vara-meta";

export interface TarjetaMetaProps {
  meta: MetaDTO;
  avance?: AvanceMetaDTO;
  hoy: string;
  onEditar: (meta: MetaDTO) => void;
  /** Tocar el objetivo: el modal de editar con el objetivo enfocado y las sugerencias a mano. */
  onAjustar: (meta: MetaDTO) => void;
  onBorrar: (meta: MetaDTO) => void;
}

/**
 * «Ventas cobradas del mes» ya dice que es mensual: el «Mensual» de al lado se
 * repetía en 6 de cada 7 tarjetas (los nombres de fábrica llevan el período).
 * Sólo se calla si el nombre nombra EL MISMO período.
 */
const DICE_PERIODO: Readonly<Record<MetaDTO["period"], RegExp>> = {
  diario: /\b(d[ií]a|diari[oa])\b/i,
  semanal: /\bsemana(l)?\b/i,
  mensual: /\b(mes|mensual)\b/i,
  trimestral: /\btrimestr(e|al)\b/i,
  anual: /\b(a[ñn]o|anual)\b/i,
};

/** La meta de ventas del día y la del mes tienen su detalle en las pestañas hermanas. */
function destinoDe(meta: MetaDTO): { href: string; nombre: string; title: string } | null {
  if (meta.category !== "ventas") return null;
  if (meta.period === "diario") return { href: "/admin?tab=metas-logros&vista=hoy", nombre: "Hoy", title: "Hora a hora en Hoy" };
  if (meta.period === "mensual") return { href: "/admin?tab=metas-logros&vista=calendario", nombre: "Calendario", title: "Día a día en Calendario" };
  return null;
}

/**
 * Cada estado con su icono: en oscuro el ámbar de «atrasada» y el rojo de «no
 * cumplida» quedan a 7° de tono uno del otro (medido 09-10), y el color solo
 * nunca debe ser la única señal.
 */
const ICONO_ESTADO: Readonly<Record<EstadoMeta, LucideIcon>> = {
  cumplida: CheckCircle2,
  en_camino: TrendingUp,
  atrasada: Clock,
  pasada_del_tope: AlertTriangle,
  no_cumplida: XCircle,
  sin_dato: Minus,
};

/** Badge del área: el icono con su color y el nombre en texto legible (el color sólo decora). */
export function BadgeArea({ category }: { category: string }) {
  const area = areaDe(category);
  const Icono = area.icono;
  return (
    <span
      style={{ "--area": area.color } as CSSProperties}
      className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--area)_35%,transparent)] bg-[color-mix(in_srgb,var(--area)_10%,transparent)] px-2 py-0.5 text-sm font-semibold text-[var(--text-primary)]"
    >
      <Icono className="h-3.5 w-3.5 text-[var(--area)]" aria-hidden="true" />
      {area.nombre}
    </span>
  );
}

export function TarjetaMeta({ meta, avance: av, hoy, onEditar, onAjustar, onBorrar }: TarjetaMetaProps) {
  const cat = categoriaDe(meta.category);
  const area = areaDe(meta.category);
  const sentido = cat?.sentido ?? "sube";
  const unidad = meta.unit;
  // La meta a mano lleva lo que anotaste aunque el avance no haya llegado.
  const avance = av ? av.avance : meta.category === "manual" ? meta.current : null;
  const estado = av?.estado ?? "sin_dato";
  const cerrada = av ? hoy > av.hasta : false;
  // Una ventana cerrada ya no tiene «ritmo a hoy»: la marca quedaba pegada al final de la barra.
  const esperado = cerrada ? null : (av?.esperado ?? null);
  const pct = av?.pct ?? null;
  const linea = av
    ? lineaDeEstado({ avance, target: meta.target, esperado, estado, sentido, hasta: av.hasta, cerrada, unidad })
    : { texto: "Todavía no se midió este período", tono: "neutro" as const };
  const proyectado = av ? proyeccion(avance, av.desde, av.hasta, hoy) : null;
  const hermana = destinoDe(meta);
  const href = hermana?.href ?? hrefDeMeta(meta.category);
  /* La de ventas del día no la repite: Hoy ya dice el mismo día de la semana pasada, entero y a esta hora. */
  const vara =
    hermana?.nombre === "Hoy"
      ? null
      : lineaVara({ anterior: av?.anterior, period: meta.period, hoy, target: meta.target, avance, sentido, unidad });
  const IconoEstado = ICONO_ESTADO[estado];
  /* El menú ⋯ cierra sin devolver el foco a su botón: al cerrar el modal de editar
     o la confirmación, el foco caía en <body> (medido 09-10 con Escape). Se lo
     devolvemos ANTES de abrir, que es lo que `AdminModal` guarda para restaurar. */
  const menuRef = useRef<HTMLDivElement>(null);
  const desdeMenu = (accion: () => void) => () => {
    menuRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    accion();
  };
  const cifra = `${cifraDeMeta(avance, unidad)} de ${cifraDeMeta(meta.target, unidad)}`;

  return (
    <article
      data-meta={meta.category}
      className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2">
            {href ? (
              /* 48 px de toque sin sumar alto a la fila (-my-3): el badge mide 24. */
              <EnlacePanel
                href={href}
                apariencia="heredada"
                title={hermana?.title ?? `Abre ${cat?.fuente ?? area.nombre}`}
                aria-label={hermana?.title ?? `Ver en ${area.nombre}`}
                className="-my-3 inline-flex min-h-12 items-center gap-1 text-sm font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]"
              >
                <BadgeArea category={meta.category} />
                <span aria-hidden="true">›{hermana ? ` ${hermana.nombre}` : ""}</span>
              </EnlacePanel>
            ) : (
              <BadgeArea category={meta.category} />
            )}
            {!DICE_PERIODO[meta.period].test(meta.name) && (
              <span className="text-sm font-semibold text-[var(--text-tertiary)]">{NOMBRE_PERIODO[meta.period]}</span>
            )}
          </div>
          <div className="flex items-start gap-1">
            <BlockTitle className="min-w-0 break-words">{meta.name}</BlockTitle>
            <InfoTip
              title={cat?.nombre ?? meta.name}
              ariaLabel={`Qué mide «${meta.name}»`}
              what={cat?.queMide ?? "Una meta que ya no está en el catálogo."}
              affects={
                <span>
                  Sale de: {cat?.fuente ?? "—"}.
                  {av && ` Cuenta ${av.etiqueta} (del ${diaMes(av.desde)} al ${diaMes(av.hasta)}).`}
                  {meta.dueDate && ` Vence el ${fechaParaMostrar(meta.dueDate)}.`}
                </span>
              }
              example={
                proyectado !== null || av?.detalle ? (
                  <span>
                    {av?.detalle}
                    {av?.detalle && proyectado !== null && " · "}
                    {proyectado !== null && `A este ritmo cerrarías con ${cifraDeMeta(proyectado, unidad)} (proyección, no dato).`}
                  </span>
                ) : undefined
              }
            />
          </div>
        </div>
        <div ref={menuRef} className="shrink-0">
          <ActionMenu
            label={`Opciones de ${meta.name}`}
            title="Editar o eliminar"
            icon={MoreHorizontal}
            soloIcono
            size="md"
            actions={[
              { id: "editar", label: "Editar", icon: Pencil, onSelect: desdeMenu(() => onEditar(meta)) },
              { id: "eliminar", label: "Eliminar", icon: Trash2, tone: "danger", onSelect: desdeMenu(() => onBorrar(meta)) },
            ]}
          />
        </div>
      </header>

      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 tabular-nums">
          <span className="text-xl font-extrabold text-[var(--text-primary)]">{cifraGrande(avance, unidad)}</span>
          {/* El objetivo se toca para ajustarlo (48 px de toque, -my-2 para no sumar alto). */}
          <button
            type="button"
            onClick={() => onAjustar(meta)}
            title="Ajustar el objetivo"
            aria-label={`Ajustar el objetivo de «${meta.name}»: ${cifraDeMeta(meta.target, unidad)}`}
            className="group -my-2 inline-flex min-h-12 items-center gap-1 rounded-lg px-1 text-sm font-semibold text-[var(--text-secondary)] underline decoration-dotted underline-offset-4 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            de {cifraDeMeta(meta.target, unidad)}
            <Pencil className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" aria-hidden="true" />
          </button>
        </p>
        {pct !== null && (
          <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text-secondary)]">{Math.round(pct)} %</span>
        )}
      </div>

      <BarraAvance
        avance={avance}
        target={meta.target}
        esperado={esperado}
        estado={estado}
        etiqueta={cifra}
        ritmo={esperado === null ? undefined : cifraDeMeta(esConteo(unidad) ? Math.round(esperado) : esperado, unidad)}
      />

      <p className={`flex items-start gap-1.5 text-sm font-semibold ${TEXTO_TONO[linea.tono]}`}>
        <IconoEstado className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{linea.texto}</span>
      </p>

      {vara && (
        <p
          className={`flex items-start gap-1.5 border-t border-[var(--rule-soft)] pt-2 text-sm ${vara.tono === "neutro" ? "text-[var(--text-secondary)]" : `font-semibold ${TEXTO_TONO[vara.tono]}`}`}
          title="El período anterior entero: la vara para saber si tu objetivo es realista"
        >
          <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 tabular-nums">{vara.texto}</span>
        </p>
      )}

      {av?.parcial && (
        <p className={`flex items-center gap-1 text-sm font-semibold ${TEXTO_TONO.aviso}`}>
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Dato parcial
          <InfoTip title="Dato parcial" what={av.parcial} ariaLabel="Por qué el dato es parcial" />
        </p>
      )}
    </article>
  );
}
