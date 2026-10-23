"use client";

/**
 * DocumentosModule v2 — Drive interno enterprise (sprint 2026-05-10).
 *
 * Reemplaza el módulo client-only con localStorage. Persistencia real
 * vía Supabase Storage + Prisma. Multi-tenant. Features:
 *   • Drag & drop multi-archivo con progress
 *   • Carpetas custom anidadas (sidebar)
 *   • Bulk actions (select + delete/move/tag/favorite)
 *   • Renombrar inline (doble-click)
 *   • Compartir con link público (token + opcional password)
 *   • Versionado (subir v2, ver historial)
 *   • Audit log por documento
 *   • Firma digital visual (canvas → sello en PDF)
 *   • Generador de plantillas (contrato, recibo, cotización, acuerdo)
 *   • Auto-categorización IA (Claude/OpenAI vision)
 *   • Búsqueda con OCR (ocrText ILIKE)
 */

import { Upload } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { SidebarResizeHandle } from "./archivo/piezas-sueltas";
import { SIDEBAR_MIN_W, SIDEBAR_MAX_W } from "./archivo/compartido";
import CabeceraArchivo from "./archivo/CabeceraArchivo";
import AvisosArchivo from "./archivo/AvisosArchivo";
import CartelEtiqueta from "./archivo/CartelEtiqueta";
import PanelLateralArchivo from "./archivo/PanelLateralArchivo";
import BarraDeHerramientas from "./archivo/BarraDeHerramientas";
import RutaDeCarpeta from "./archivo/RutaDeCarpeta";
import BarraDeSeleccion from "./archivo/BarraDeSeleccion";
import AvisosDeLista from "./archivo/AvisosDeLista";
import VistasArchivo from "./archivo/VistasArchivo";
import VistaPreviaArchivo from "./archivo/VistaPreviaArchivo";
import ModalesArchivo from "./archivo/ModalesArchivo";
import { useArchivo } from "./archivo/use-archivo";
import { precargarArchivo, DE_LOS_DOCUMENTOS } from "./archivo/perezosos";

export default function DocumentosModule() {
  const arch = useArchivo();
  const { onDrop, onDragOver, onDragLeave, dragOver, filterMode, kpis, sinPanel, sidebarWidth,
    setSidebarWidth, ex, docDelMenu, menuDe } = arch;
  return (
    <div
      className="space-y-4 relative"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDragEnter={() => precargarArchivo("importar")}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-modal pointer-events-none flex items-center justify-center bg-primary/20 backdrop-blur-sm">
          <div className="bg-[var(--surface-raised)] border-4 border-dashed border-primary rounded-3xl p-8 shadow-[var(--shadow-xl)]">
            <Upload className="h-12 w-12 mx-auto text-primary mb-3" />
            <p className="text-xl font-extrabold text-[var(--text-primary)]">Suelta los archivos para subir</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">PDF, imágenes, docs, planillas</p>
          </div>
        </div>
      )}

      <CabeceraArchivo arch={arch} />

      <AvisosArchivo arch={arch} />

      {/* Hero stats — en la papelera se ocultan: el listado que hay en memoria es
          el de los BORRADOS, así que "Total archivos" y "Espacio usado" contaban
          la papelera como si fuera el drive (4 archivos, 976 KB, con 41 vivos).
          Ocultos por defecto (Brandon 2026-08-30): la fila de resumen empujaba
          los documentos, que es lo que se busca casi siempre al abrir el drive.
          El botón que los muestra vive arriba, en el header (alineado con
          "Subir archivos" — 2026-09-24), acá sólo queda el panel. */}
      {filterMode !== "trash" && kpis.panel}

      <CartelEtiqueta arch={arch} />

      {/* Explorador estilo Windows: sin panel lateral (Ver › Panel lateral lo
          vuelve a mostrar) y en el celular nunca; lo del panel queda en
          «Lugares», al lado de Atrás. */}
      <div
        className={cn("grid grid-cols-1 gap-5", !sinPanel && "lg:grid-cols-[var(--docs-sidebar-w)_12px_1fr] lg:gap-x-0")}
        style={{ "--docs-sidebar-w": `${sidebarWidth}px` } as React.CSSProperties}
      >
        <PanelLateralArchivo arch={arch} />

        {!sinPanel && <SidebarResizeHandle
          width={sidebarWidth}
          min={SIDEBAR_MIN_W}
          max={SIDEBAR_MAX_W}
          onChange={setSidebarWidth}
          onCommit={(w) => { try { localStorage.setItem("doc-sidebar-width", String(w)); } catch { /* quota */ } }}
        />}

        {/* ─── Main list ─── */}
        <div
          className="space-y-4"
          onPointerOver={() => precargarArchivo(...DE_LOS_DOCUMENTOS)}
          onFocusCapture={() => precargarArchivo(...DE_LOS_DOCUMENTOS)}
        >
          <BarraDeHerramientas arch={arch} />

          <RutaDeCarpeta arch={arch} />

          <BarraDeSeleccion arch={arch} />

          <AvisosDeLista arch={arch} />

          <VistasArchivo arch={arch} />
        </div>
      </div>

      {/* Clic derecho del explorador (carpetas, fondo, Acceso rápido), la
          imagen de ícono, y el menú de un archivo en las vistas de íconos. */}
      {ex.capas}
      {docDelMenu && menuDe(docDelMenu, "fila", true)}

      <VistaPreviaArchivo arch={arch} />

      <ModalesArchivo arch={arch} />
    </div>
  );
}
