"use client";

import {
  CalendarClock, Combine, Download, Eye, FolderInput, Layers, Link2Off, Loader2, MessageCircle, PencilLine, PenTool, RotateCcw, Share2, Stamp, Trash2, Upload, type LucideIcon,
} from "@buleje/design-system/icons";
import Plegable from "@/components/admin/shared/Plegable";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { cuandoCorto, fraseDelMovimiento, type AccionDelHistorial, type MovimientoCarpeta } from "@/lib/documentos/movimientos-carpeta";
import type { DbDocument } from "@/lib/types/documents";
import { useMovimientosCarpeta } from "./use-movimientos-carpeta";

const ICONO: Record<AccionDelHistorial, LucideIcon> = {
  upload: Upload,
  view: Eye,
  download: Download,
  rename: PencilLine,
  move: FolderInput,
  delete: Trash2,
  restore: RotateCcw,
  share: Share2,
  share_revoke: Link2Off,
  sign: PenTool,
  version: Layers,
  merge: Combine,
  whatsapp_send: MessageCircle,
  stamp: Stamp,
  ai_expiry: CalendarClock,
};

interface Props {
  carpetaId: string;
  /** Cambia cuando cambian los papeles de la carpeta: vuelve a pedir la lista. */
  marca: string;
  documentos: readonly DbDocument[];
  abrir: (doc: DbDocument, lista: readonly DbDocument[]) => void;
  ahora: number;
}

/**
 * «Movimientos» del panel de Esenciales (Brandon 24-10): lo último que pasó
 * con los papeles de la carpeta y sus subcarpetas, con «Ver más». Plegado no
 * pide nada (el contenido se monta al abrir).
 */
export default function MovimientosCarpeta(props: Props) {
  return (
    <Plegable
      clave="esenciales:panel:movimientos"
      titulo="Movimientos"
      acciones={
        <InfoTip
          what="Lo último que pasó con los papeles de esta carpeta y sus subcarpetas: quién subió, abrió, movió o mandó a la papelera."
          affects="Ves sólo los papeles que tu rol puede abrir. Quién lo hizo, con nombre, lo ven el dueño, el admin y el encargado."
          example="Karla abrió «Acta de asamblea.pdf» · ayer 18:20"
        />
      }
    >
      <ListaMovimientos {...props} />
    </Plegable>
  );
}

function ListaMovimientos({ carpetaId, marca, documentos, abrir, ahora }: Props) {
  const m = useMovimientosCarpeta(carpetaId, marca);

  if (m.cargando && m.movimientos.length === 0) {
    return (
      <ul className="space-y-2" aria-busy="true" aria-label="Cargando movimientos">
        {[0, 1, 2].map((i) => <li key={i} className="h-11 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />)}
      </ul>
    );
  }
  if (m.fallo) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
        No se pudo cargar.
        <button type="button" onClick={m.reintentar} className={button({ variant: "ghost", size: "sm" })}>Prueba de nuevo</button>
      </p>
    );
  }
  if (m.movimientos.length === 0) return <p className="text-sm text-[var(--text-secondary)]">Todavía no hay movimientos.</p>;

  return (
    <div className="space-y-2" data-qa="esencial-movimientos">
      <ul className="space-y-1">
        {m.movimientos.map((mov) => (
          <li key={mov.id}>
            <FilaMovimiento mov={mov} ahora={ahora} doc={mov.papel.borrado ? null : (documentos.find((d) => d.id === mov.papel.id && !d.deletedAt) ?? null)} abrir={abrir} />
          </li>
        ))}
      </ul>
      {m.hayMas && (
        <button type="button" onClick={() => void m.verMas()} disabled={m.masCargando} className={cn(button({ variant: "ghost" }), "w-full gap-2")}>
          {m.masCargando && <Loader2 className="h-4 w-4 animate-spin" />} Ver más
        </button>
      )}
    </div>
  );
}

function FilaMovimiento({ mov, ahora, doc, abrir }: { mov: MovimientoCarpeta; ahora: number; doc: DbDocument | null; abrir: Props["abrir"] }) {
  const Icono = ICONO[mov.accion];
  const frase = fraseDelMovimiento(mov);
  const cuando = `${cuandoCorto(mov.cuando, ahora)}${mov.veces > 1 ? ` · ${mov.veces} veces` : ""}`;
  const cuerpo = (
    <>
      <Icono aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-sm text-[var(--text-primary)]">{frase}</span>
        <span className="block text-xs tabular-nums text-[var(--text-tertiary)]">{cuando}</span>
      </span>
    </>
  );
  const caja = "flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left";
  if (!doc) return <div className={caja} title={frase}>{cuerpo}</div>;
  return (
    <button type="button" onClick={() => abrir(doc, [doc])} title={`Abrir «${doc.name}»`} className={cn(caja, "min-h-11 hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]")}>
      {cuerpo}
    </button>
  );
}
