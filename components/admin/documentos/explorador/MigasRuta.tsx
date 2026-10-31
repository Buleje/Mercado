"use client";

/**
 * Barra de dirección del explorador del Archivo, como la de Windows: Atrás,
 * Adelante, Subir un nivel, «Lugares» (vistas, Acceso rápido, carpetas,
 * inteligentes y etiquetas, para cuando el panel lateral está escondido) y la
 * ruta (Archivo › Facturas › 2026). Cada tramo lleva a esa carpeta y recibe lo
 * que arrastras desde el explorador (se mueve ahí).
 */

import { useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronRight, Compass, FileArchive, FolderArchive, PanelLeftClose, PanelLeftOpen,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import MenuEnPunto from "./MenuEnPunto";
import { arrastreActual, fijarArrastre, hayCargaInterna, leerCarga, type CargaArrastre } from "./destino-soltar";
import type { ItemMenu } from "./item-menu";
import { puntoDeElemento, type PuntoDeMenu } from "./ubicar-menu";

interface Props {
  /** De la raíz a la carpeta abierta. Vacío = estás en la raíz. */
  ruta: readonly DbDocumentFolder[];
  /** «Archivo» en la raíz; «Favoritos», «Recientes»… en las otras vistas. */
  raiz: string;
  onIr: (carpetaId: string | null) => void;
  puedeAtras: boolean;
  onAtras: () => void;
  puedeAdelante: boolean;
  onAdelante: () => void;
  /** ¿Lo que viene arrastrado del explorador puede entrar en ese tramo? */
  puedeSoltar: (carpetaId: string | null) => boolean;
  onSoltar: (carga: CargaArrastre, carpetaId: string | null) => void;
  /** El menú «Lugares» (se arma al abrirlo). */
  lugares: () => ItemMenu[];
  /** Mostrar u ocultar el panel lateral (sólo en pantallas anchas). */
  panel?: { visible: boolean; alternar: () => void };
  zip?: { onClick: () => void; ocupado: boolean };
  className?: string;
}

const BOTON =
  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export default function MigasRuta(p: Props) {
  const { ruta, raiz, onIr } = p;
  const [sobre, setSobre] = useState<string | null>(null);
  const [menuEn, setMenuEn] = useState<PuntoDeMenu | null>(null);
  const [items, setItems] = useState<ItemMenu[]>([]);
  const padre = ruta.length > 1 ? ruta[ruta.length - 2].id : null;

  const soltable = (id: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!hayCargaInterna([...e.dataTransfer.types])) return;
      if (!p.puedeSoltar(id)) { e.dataTransfer.dropEffect = "none"; return; }
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setSobre(id ?? "raiz");
    },
    onDragLeave: () => setSobre(null),
    onDrop: (e: DragEvent) => {
      if (!hayCargaInterna([...e.dataTransfer.types])) return;
      e.preventDefault();
      e.stopPropagation();
      setSobre(null);
      const carga = leerCarga(e.dataTransfer) ?? arrastreActual();
      fijarArrastre(null);
      if (carga) p.onSoltar(carga, id);
    },
  });

  const tramo = (id: string | null, etiqueta: ReactNode, ultimo: boolean) => (
    <button
      type="button"
      onClick={() => { if (!ultimo) onIr(id); }}
      aria-current={ultimo ? "location" : undefined}
      aria-disabled={ultimo || undefined}
      {...soltable(id)}
      className={cn(
        "inline-flex min-h-12 max-w-[14rem] items-center gap-1.5 truncate rounded-xl px-2 text-sm font-bold transition-colors",
        ultimo ? "cursor-default text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
        sobre === (id ?? "raiz") && "bg-[var(--accent)]/12 ring-2 ring-[var(--accent)]",
      )}
    >
      {etiqueta}
    </button>
  );

  return (
    <nav
      aria-label="Ruta de carpetas"
      data-qa="barra-ruta"
      className={cn("flex min-w-0 items-center gap-0.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-1", p.className)}
    >
      {p.panel && (
        <button
          type="button"
          className={cn(BOTON, "hidden lg:inline-flex")}
          onClick={p.panel.alternar}
          aria-pressed={p.panel.visible}
          aria-label={p.panel.visible ? "Ocultar el panel lateral" : "Mostrar el panel lateral"}
          title={p.panel.visible ? "Ocultar el panel lateral" : "Mostrar el panel lateral"}
        >
          {p.panel.visible ? <PanelLeftClose className="h-5 w-5" aria-hidden /> : <PanelLeftOpen className="h-5 w-5" aria-hidden />}
        </button>
      )}
      <button type="button" className={BOTON} onClick={p.onAtras} disabled={!p.puedeAtras} aria-label="Atrás" title="Atrás (Alt+←)">
        <ArrowLeft className="h-5 w-5" aria-hidden />
      </button>
      <button type="button" className={cn(BOTON, "hidden sm:inline-flex")} onClick={p.onAdelante} disabled={!p.puedeAdelante} aria-label="Adelante" title="Adelante (Alt+→)">
        <ArrowRight className="h-5 w-5" aria-hidden />
      </button>
      <button type="button" className={BOTON} onClick={() => onIr(padre)} disabled={ruta.length === 0} aria-label="Subir un nivel" title="Subir un nivel (Alt+↑)">
        <ArrowUp className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        data-qa="explorador-lugares"
        onClick={(e) => { setItems(p.lugares()); setMenuEn(puntoDeElemento(e.currentTarget)); }}
        aria-haspopup="menu"
        aria-expanded={menuEn !== null}
        aria-label="Lugares: vistas, carpetas, inteligentes y etiquetas"
        title="Lugares: vistas, carpetas, inteligentes y etiquetas"
        className="inline-flex h-12 shrink-0 items-center gap-1 rounded-xl px-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
      >
        <Compass className="h-5 w-5" aria-hidden />
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      <div className="mx-1 h-6 w-px shrink-0 bg-[var(--rule-base)]" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tramo(null, <><FolderArchive className="h-4 w-4 shrink-0" aria-hidden /> {raiz}</>, ruta.length === 0)}
        {ruta.map((f, i) => (
          <span key={f.id} className="inline-flex min-w-0 items-center gap-0.5">
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            {tramo(f.id, <span className="truncate">{f.name}</span>, i === ruta.length - 1)}
          </span>
        ))}
      </div>
      {p.zip && (
        <button
          type="button"
          className={cn(BOTON, "hidden sm:inline-flex")}
          onClick={p.zip.onClick}
          disabled={p.zip.ocupado}
          aria-label="Descargar los archivos de esta carpeta (ZIP)"
          title={p.zip.ocupado ? "Comprimiendo…" : "Descargar los archivos de esta carpeta (ZIP)"}
        >
          <FileArchive className="h-5 w-5" aria-hidden />
        </button>
      )}
      <InfoTip
        title="Cómo se usa"
        what="Doble clic en una carpeta para entrar; en un archivo, para abrirlo. En el celular basta un toque y mantener presionado muestra las opciones."
        affects="Clic derecho en el espacio vacío: Nuevo › Carpeta, Pegar, Ordenar, Agrupar y Propiedades. Ctrl+X y Ctrl+V mueven, Ctrl+Z deshace, F2 cambia el nombre y Supr elimina."
        example="Elige varios con Ctrl, Shift o arrastrando un rectángulo en el espacio vacío, y suéltalos sobre una carpeta o un tramo de esta ruta para moverlos ahí."
        className="mr-2 shrink-0"
      />
      <MenuEnPunto abrirEn={menuEn} items={items} etiqueta="Lugares" onCerrado={() => setMenuEn(null)} />
    </nav>
  );
}
