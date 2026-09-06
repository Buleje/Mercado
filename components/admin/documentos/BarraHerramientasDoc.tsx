"use client";

/**
 * BarraHerramientasDoc — todo lo que se le puede hacer al documento, a la vista.
 *
 * Antes estaba en un menú que había que desplegar (y antes de eso, sólo en el
 * menú de la lista: había que cerrar el documento para sellarlo). Con el modal
 * ocupando casi la pantalla sobra lugar para tenerlas al costado: se ve de una
 * qué se puede hacer, sin abrir nada.
 *
 * Las acciones que no aplican al archivo abierto no se dibujan — un .xlsx no
 * ofrece "rotar", que es cosa de PDF.
 */

import type { ComponentType } from "react";
import {
  Sparkles, Download, MessageCircle, Pencil, FolderInput, Star, Trash2, Printer,
  Link2, PencilLine, Stamp, RotateCw, FileStack, Scissors, Clock as AlarmClock, Tag,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface AccionesDoc {
  onAnalyze?: () => void;
  onStamp?: () => void;
  onRotate?: () => void;
  onSplit?: () => void;
  onEditPages?: () => void;
  onMove?: () => void;
  onSign?: () => void;
  onSetStatus?: (estado: string) => void;
  onRename?: () => void;
  onWhatsApp?: () => void;
  onDownload?: () => void;
  onToggleFav?: () => void;
  onDelete?: () => void;
  onPrint?: () => void;
  onShare?: () => void;
  onExpiry?: () => void;
  onTag?: () => void;
}

interface Props {
  acciones: AccionesDoc;
  esPdf: boolean;
  favorito: boolean;
  estado: string;
}

const ESTADOS_RAPIDOS = [
  { valor: "approved", texto: "Está bien", punto: "bg-[var(--data-success-500)]" },
  { valor: "observado", texto: "Hay que corregir", punto: "bg-[var(--data-error-500)]" },
  { valor: "review", texto: "En revisión", punto: "bg-[var(--data-warning-500)]" },
];

function Boton({ icono: Icono, texto, onClick, destacado, peligro }: {
  icono: ComponentType<{ className?: string }>;
  texto: string;
  onClick: () => void;
  destacado?: boolean;
  peligro?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
        peligro
          ? "text-[var(--data-error)] hover:bg-[var(--data-error-500)]/10"
          : destacado
            ? "bg-primary/10 text-[var(--accent-ink)] hover:bg-primary/15 dark:text-[var(--accent)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
      )}
    >
      <Icono className="h-4 w-4 shrink-0" />
      <span className="truncate">{texto}</span>
    </button>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--rule-soft)] px-2 py-2 last:border-b-0">
      <p className="px-2.5 pb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
        {titulo}
      </p>
      {children}
    </div>
  );
}

export default function BarraHerramientasDoc({ acciones: a, esPdf, favorito, estado }: Props) {
  return (
    <aside
      className="hidden w-56 shrink-0 flex-col overflow-y-auto border-l border-[var(--rule-base)] bg-[var(--surface-raised)] lg:flex"
      aria-label="Herramientas del documento"
    >
      {a.onSetStatus && (
        <Grupo titulo="Marcar">
          {ESTADOS_RAPIDOS.map((e) => (
            <button
              key={e.valor}
              onClick={() => a.onSetStatus?.(estado === e.valor ? "none" : e.valor)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors",
                estado === e.valor
                  ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
              )}
              title={estado === e.valor ? "Quitar esta marca" : undefined}
            >
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", e.punto)} aria-hidden />
              <span className="truncate">{e.texto}</span>
              {estado === e.valor && <span className="ml-auto text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">✓</span>}
            </button>
          ))}
        </Grupo>
      )}

      <Grupo titulo="Compartir">
        {a.onWhatsApp && <Boton icono={MessageCircle} texto="Enviar por WhatsApp" onClick={a.onWhatsApp} destacado />}
        {a.onShare && <Boton icono={Link2} texto="Crear un enlace" onClick={a.onShare} />}
        {a.onDownload && <Boton icono={Download} texto="Descargar" onClick={a.onDownload} />}
        {a.onPrint && <Boton icono={Printer} texto="Imprimir" onClick={a.onPrint} />}
      </Grupo>

      <Grupo titulo="Organizar">
        {a.onRename && <Boton icono={Pencil} texto="Cambiar el nombre" onClick={a.onRename} />}
        {a.onMove && <Boton icono={FolderInput} texto="Mover a carpeta" onClick={a.onMove} />}
        {a.onTag && <Boton icono={Tag} texto="Etiquetar" onClick={a.onTag} />}
        {a.onExpiry && <Boton icono={AlarmClock} texto="Vencimiento" onClick={a.onExpiry} />}
        {a.onToggleFav && (
          <Boton icono={Star} texto={favorito ? "Quitar de favoritos" : "Marcar favorito"} onClick={a.onToggleFav} />
        )}
      </Grupo>

      <Grupo titulo="Trabajar el archivo">
        {a.onAnalyze && <Boton icono={Sparkles} texto="Analizar con IA" onClick={a.onAnalyze} />}
        {a.onSign && esPdf && <Boton icono={PencilLine} texto="Solicitar firma" onClick={a.onSign} />}
        {a.onStamp && esPdf && <Boton icono={Stamp} texto="Sellar" onClick={a.onStamp} />}
        {a.onRotate && esPdf && <Boton icono={RotateCw} texto="Rotar 90°" onClick={a.onRotate} />}
        {a.onEditPages && esPdf && <Boton icono={FileStack} texto="Editar páginas" onClick={a.onEditPages} />}
        {a.onSplit && esPdf && <Boton icono={Scissors} texto="Dividir en páginas" onClick={a.onSplit} />}
      </Grupo>

      {a.onDelete && (
        <Grupo titulo="Cuidado">
          <Boton icono={Trash2} texto="Eliminar" onClick={a.onDelete} peligro />
        </Grupo>
      )}
    </aside>
  );
}
