"use client";

/**
 * TarjetaMeta — una meta: a qué área pertenece, cuánto lleva, cómo va y a qué
 * módulo llevar para ver el detalle (ADR-488).
 *
 * El avance NO se tipea (salvo la meta a mano): llega derivado del servidor
 * (`AvanceMetaDTO`). Lo que explica la cifra —qué mide, de dónde sale, qué días
 * cuenta, la proyección— va al ⓘ, no a párrafos.
 */
import { useRef, type CSSProperties } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Minus,
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

export interface TarjetaMetaProps {
  meta: MetaDTO;
  avance?: AvanceMetaDTO;
  hoy: string;
  onEditar: (meta: MetaDTO) => void;
  onBorrar: (meta: MetaDTO) => void;
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
      className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--area)_35%,transparent)] bg-[color-mix(in_srgb,var(--area)_10%,transparent)] px-2 py-0.5 text-xs font-semibold text-[var(--text-primary)]"
    >
      <Icono className="h-3.5 w-3.5 text-[var(--area)]" aria-hidden="true" />
      {area.nombre}
    </span>
  );
}

export function TarjetaMeta({ meta, avance: av, hoy, onEditar, onBorrar }: TarjetaMetaProps) {
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
  const href = hrefDeMeta(meta.category);
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
      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <BadgeArea category={meta.category} />
            <span className="text-xs font-semibold text-[var(--text-tertiary)]">{NOMBRE_PERIODO[meta.period]}</span>
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
            size="sm"
            actions={[
              { id: "editar", label: "Editar", icon: Pencil, onSelect: desdeMenu(() => onEditar(meta)) },
              { id: "eliminar", label: "Eliminar", icon: Trash2, tone: "danger", onSelect: desdeMenu(() => onBorrar(meta)) },
            ]}
          />
        </div>
      </header>

      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 tabular-nums">
          <span className="text-xl font-extrabold text-[var(--text-primary)]">{cifraGrande(avance, unidad)}</span>{" "}
          <span className="text-sm font-semibold text-[var(--text-secondary)]">de {cifraDeMeta(meta.target, unidad)}</span>
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

      {av?.parcial && (
        <p className={`-mt-1 flex items-center gap-1 text-xs font-semibold ${TEXTO_TONO.aviso}`}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Dato parcial
          <InfoTip title="Dato parcial" what={av.parcial} ariaLabel="Por qué el dato es parcial" />
        </p>
      )}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-3 border-t border-[var(--rule-soft)] pt-2">
        {href ? (
          <EnlacePanel href={href} title={`Abre ${cat?.fuente ?? area.nombre}`} className="inline-flex min-h-10 items-center text-sm">
            Ver en {area.nombre} ›
          </EnlacePanel>
        ) : (
          <span className="inline-flex min-h-10 items-center text-sm text-[var(--text-tertiary)]">El avance lo anotas tú</span>
        )}
        {av && <span className="text-xs text-[var(--text-tertiary)]">{av.etiqueta}</span>}
      </footer>
    </article>
  );
}
