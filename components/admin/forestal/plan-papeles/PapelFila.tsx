"use client";

/**
 * Una fila de «Papeles del permiso» (52 px): un disco con el ícono y el color
 * del estado; el nombre con su ⓘ (qué es y qué norma lo pide); debajo, la
 * palabra del estado + el archivo que lo respalda y su vencimiento, o la
 * carpeta donde se guarda si todavía falta. A la derecha, UNA acción —Subir,
 * Renovar o Ver— y el resto en «⋯» (otra versión, ir a su carpeta).
 *
 * Subir acepta foto o PDF: en el celular abre la cámara. Un archivo con
 * candado para el rol que mira sale como «1 archivo con candado», sin nombre
 * ni «Ver» (security 25-10).
 */

import { useRef } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Clock,
  Eye,
  FolderOpen,
  Loader2,
  Minus,
  MoreHorizontal,
  RefreshCw,
  Truck,
  Upload,
  type LucideIcon,
} from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { fechaConDia } from "@/lib/forestal/loth-plan-costeo";
import type { EstadoPapel, PapelDelPlan } from "@/lib/forestal/loth-plan-papeles";
import { limaDateKey } from "@/lib/utils";

export interface AspectoPapel {
  label: string;
  icono: LucideIcon;
  /** Fondo del disco del ícono. */
  disco: string;
  /** El ícono y la palabra del estado (tinta `-ink`: AA sobre la tarjeta). */
  tinta: string;
  /** El tramo de la barra de avance. */
  tramo: string;
}

export const ASPECTO_PAPEL: Record<EstadoPapel, AspectoPapel> = {
  presente: {
    label: "Al día",
    icono: Check,
    disco: "bg-[var(--data-success-500)]/15",
    tinta: "text-[var(--data-success-ink)]",
    tramo: "bg-[var(--data-success-500)]",
  },
  vence_pronto: {
    label: "Vence pronto",
    icono: Clock,
    disco: "bg-[var(--data-warning-500)]/15",
    tinta: "text-[var(--data-warning-ink)]",
    tramo: "bg-[var(--data-warning-500)]",
  },
  vencido: {
    label: "Vencido",
    icono: AlertTriangle,
    disco: "bg-[var(--data-error-500)]/15",
    tinta: "text-[var(--data-error-ink)]",
    tramo: "bg-[var(--data-error-500)]",
  },
  falta: {
    label: "Falta",
    icono: AlertCircle,
    disco: "bg-[var(--data-warning-500)]/15",
    tinta: "text-[var(--data-warning-ink)]",
    tramo: "bg-[var(--rule-base)]",
  },
  segun_caso: {
    label: "Si aplica",
    icono: Minus,
    disco: "bg-[var(--surface-sunken)]",
    tinta: "text-[var(--text-secondary)]",
    tramo: "bg-[var(--rule-base)]",
  },
};

/** Lo que se archiva solo (las GTF): no se sube acá. */
const AUTOMATICO: AspectoPapel = { ...ASPECTO_PAPEL.segun_caso, label: "Automático", icono: Truck };

/** «jueves 10/09» (con el año si no es el de hoy). Fechas de día: sin hora. */
const fecha = (dia: string) => fechaConDia(dia.slice(0, 10), limaDateKey());

const conCandado = (n: number) => `${n} ${n === 1 ? "archivo" : "archivos"} con candado`;

/** La línea de abajo, sin la palabra del estado. */
function detalle(p: PapelDelPlan, destino: string | null): string | null {
  if (!p.subible && !p.archivo) return "Se archivan solas con cada guía";
  const partes: string[] = [];
  const candados = p.conCandado ?? 0;
  if (p.archivo?.nombre) {
    partes.push(p.archivo.nombre);
    if (candados > 0) partes.push(`${candados} más con candado`);
  } else if (p.archivo) {
    partes.push(conCandado(Math.max(candados, 1)));
  }
  if (p.vence) {
    const verbo = p.archivo ? (p.estado === "vencido" ? "venció" : "vence") : "plazo";
    partes.push(`${verbo} ${fecha(p.vence)}${p.archivo && p.venceDerivado ? " (vigencia del plan)" : ""}`);
  }
  if (p.cuantos > 1 && p.cuantos > candados) partes.push(`${p.cuantos} versiones`);
  if (!p.archivo && destino) partes.push(`se guarda en ${destino}`);
  if (p.archivo?.uploadedAt && partes.length < 3) partes.push(`subido ${fecha(p.archivo.uploadedAt)}`);
  return partes.length > 0 ? partes.join(" · ") : null;
}

export default function PapelFila({
  papel,
  destino,
  subiendo,
  bloqueado,
  onSubir,
  onVer,
  onIrACarpeta,
}: {
  papel: PapelDelPlan;
  /** «Registro de plantación › Resolución…»: dónde se guarda, o null. */
  destino: string | null;
  subiendo: boolean;
  /** Otra subida o escritura en curso. */
  bloqueado: boolean;
  onSubir: (files: File[]) => void;
  onVer: (documentId: string) => void;
  /** Abre su carpeta abajo, en el casillero que le toca. */
  onIrACarpeta?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const automatico = !papel.subible && !papel.archivo;
  const a = automatico ? AUTOMATICO : ASPECTO_PAPEL[papel.estado];
  const Icono = a.icono;
  const linea = detalle(papel, destino);
  const verId = papel.archivo?.documentId ?? null;
  const renovar = papel.archivo != null && (papel.estado === "vencido" || papel.estado === "vence_pronto");

  /* UNA acción a la vista: lo que este estado pide hacer. */
  const principal: "subir" | "renovar" | "ver" | null = !papel.subible
    ? verId
      ? "ver"
      : null
    : !papel.archivo
      ? "subir"
      : renovar
        ? "renovar"
        : verId
          ? "ver"
          : "subir";

  const abrirSelector = () => input.current?.click();
  const menu: MenuAccion[] = [
    ...(verId && principal !== "ver" ? [{ id: "ver", label: "Ver el archivo", icon: Eye, onSelect: () => onVer(verId) }] : []),
    ...(papel.subible && papel.archivo && principal === "ver"
      ? [{ id: "otra", label: "Subir otra versión", hint: "Foto o PDF; la anterior queda", icon: Upload, disabled: bloqueado, onSelect: abrirSelector }]
      : []),
    ...(onIrACarpeta && destino && !automatico
      ? [{ id: "carpeta", label: "Ir a su carpeta", hint: destino, icon: FolderOpen, onSelect: onIrACarpeta }]
      : []),
  ];

  /* En el celular, el botón queda sólo con su ícono: el nombre no baja a una tercera línea. */
  const etiqueta = "max-sm:sr-only";
  const cuadradoEnMovil = "max-sm:w-12 max-sm:px-0";

  return (
    <li data-papel={papel.clave} data-estado={papel.estado} className="flex min-h-13 items-center gap-3">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${a.disco}`} aria-hidden="true">
        <Icono className={`h-4 w-4 ${a.tinta}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-[var(--text-primary)]">
          {papel.nombre}{" "}
          <InfoTip
            className="align-middle"
            title={papel.nombre}
            what={papel.ayuda}
            affects={<span>Lo pide: {papel.fuente}</span>}
            example={papel.exigencia === "segun_caso" ? <span>No cuenta en «papeles» hasta que te lo pidan o lo subas.</span> : undefined}
          />
        </p>
        <p className="truncate text-xs text-[var(--text-secondary)]" title={linea ?? undefined}>
          <span className={`font-semibold ${a.tinta}`}>{a.label}</span>
          {linea && <> · {linea}</>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {principal === "ver" && verId && (
          <button type="button" className={button({ variant: "ghost", className: cuadradoEnMovil })} aria-label={`Ver ${papel.nombre}`} onClick={() => onVer(verId)}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            <span className={etiqueta}>Ver</span>
          </button>
        )}
        {(principal === "subir" || principal === "renovar") && (
          <button
            type="button"
            className={button({ variant: papel.estado === "segun_caso" ? "ghost" : "secondary", className: cuadradoEnMovil })}
            disabled={bloqueado}
            aria-label={`${principal === "renovar" ? "Renovar" : "Subir"} ${papel.nombre} (foto o PDF)`}
            onClick={abrirSelector}
          >
            {subiendo ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : principal === "renovar" ? (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Upload className="h-4 w-4" aria-hidden="true" />
            )}
            <span className={etiqueta}>{principal === "renovar" ? "Renovar" : "Subir"}</span>
          </button>
        )}
        {menu.length > 0 ? (
          <ActionMenu label={`Más de «${papel.nombre}»`} actions={menu} icon={MoreHorizontal} soloIcono size="md" />
        ) : (
          /* Sin «⋯», un hueco del mismo ancho: las acciones quedan en columna. */
          principal && <span className="hidden w-12 sm:block" aria-hidden="true" />
        )}
        {papel.subible && (
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length > 0) onSubir(files);
            }}
          />
        )}
      </div>
    </li>
  );
}
