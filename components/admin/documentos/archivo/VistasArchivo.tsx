"use client";

import {
  AssistantView, DashboardView, CalendarView, ActivityView, EnlacesView, SyncEscritorioView, DuplicadosView, PapeleraView,
  VistaTerceros, CargandoVista,
} from "./perezosos";
import { slugActivo } from "./compartido";
import VistaExplorador from "../explorador/VistaExplorador";
import { EmptyState } from "./piezas-sueltas";
import GrillaDocs from "./GrillaDocs";
import ListaDocs from "./ListaDocs";
import type { ModeloArchivo } from "./use-archivo";
export default function VistasArchivo({ arch }: { arch: ModeloArchivo }) {
  const { filterMode, documents, setPreview, setSignDoc, setWhatsappDoc, patch, indexableDocs, handleIndexAll,
    reindexableDocs, handleReindexAll, folders, refresh, bulk, loading, displayDocs, restore, purge,
    restoreMany, purgeMany, explorandoVista, ex, activeFolderId, view, fileInputRef } = arch;
  return (
    <>
          {filterMode === "assistant" ? (
            <AssistantView
              onOpenDoc={(id) => { const d = documents.find((x) => x.id === id); if (d) setPreview(d); }}
              onSign={(id) => { const d = documents.find((x) => x.id === id); if (d) setSignDoc(d); }}
              onShare={(id) => { const d = documents.find((x) => x.id === id); if (d) setWhatsappDoc([d]); }}
              onApprove={(id) => { patch(id, { status: "approved" }); }}
              indexableCount={indexableDocs.length}
              onIndexAll={handleIndexAll}
              reindexableCount={reindexableDocs.length}
              onReindexAll={handleReindexAll}
            />
          ) : filterMode === "dashboard" ? (
            <DashboardView docs={documents} />
          ) : filterMode === "calendar" ? (
            <CalendarView docs={documents} onOpenDoc={setPreview} />
          ) : filterMode === "activity" ? (
            <ActivityView />
          ) : filterMode === "enlaces" ? (
            <EnlacesView onOpenDoc={(id) => { const d = documents.find((x) => x.id === id); if (d) setPreview(d); }} />
          ) : filterMode === "sync" ? (
            <SyncEscritorioView
              tenantId={slugActivo()}
              documentos={documents}
              carpetas={folders}
              onCambios={refresh}
            />
          ) : filterMode === "duplicados" ? (
            <DuplicadosView
              onOpenDoc={(d) => setPreview(d)}
              onEliminar={async (ids) => { await bulk("delete", ids); }}
            />
          ) : filterMode === "terceros" ? (
            <VistaTerceros arch={arch} />
          ) : loading && documents.length === 0 ? (
            <CargandoVista />
          ) : filterMode === "trash" ? (
            <PapeleraView
              docs={displayDocs}
              onRestore={restore}
              onPurge={purge}
              onRestoreMany={restoreMany}
              onPurgeMany={purgeMany}
            />
          ) : explorandoVista && ex.propsVista && (ex.enCarpetas || displayDocs.length > 0) ? (
            // En una carpeta vacía igual va el explorador: clic derecho › Nuevo
            // y soltar archivos tienen que andar justo ahí.
            <VistaExplorador key={`${filterMode}:${activeFolderId ?? ""}:${view}`} {...ex.propsVista} />
          ) : displayDocs.length === 0 && !(explorandoVista && ex.contenido.carpetas.length > 0) ? (
            <EmptyState onUpload={() => fileInputRef.current?.click()} />
          ) : view === "grid" ? (
            <GrillaDocs arch={arch} />
          ) : (
            <ListaDocs arch={arch} />
          )}
    </>
  );
}