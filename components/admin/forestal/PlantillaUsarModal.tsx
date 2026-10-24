"use client";

/**
 * «Usar una plantilla»: la lista (con buscador) y, al elegir una, la vista
 * previa de lo que llena y lo que pisa. «Rellenar» la aplica; con otro permiso
 * pasa por el mismo cambio de plan que el selector de la guía.
 */

import { useState } from "react";
import { ArrowLeft, FolderOpen, Search } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { resumenPlantilla, type PlantillaGuia } from "@/lib/forestal/gtf-plantillas";
import type { PlantillasGuia } from "./hooks/use-plantillas-guia";
import PlantillaTarjeta from "./PlantillaTarjeta";
import PlantillaVistaPrevia from "./PlantillaVistaPrevia";

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function coincide(p: PlantillaGuia, q: string): boolean {
  if (!q.trim()) return true;
  const r = resumenPlantilla(p);
  const texto = sinTildes([p.nombre, r.permiso, r.destino].join(" "));
  return sinTildes(q).split(/\s+/).filter(Boolean).every((w) => texto.includes(w));
}

export default function PlantillaUsarModal({ pl, inicial, onCerrar }: { pl: PlantillasGuia; inicial: PlantillaGuia | null; onCerrar: () => void }) {
  const [q, setQ] = useState("");
  const [elegidaId, setElegidaId] = useState<string | null>(inicial?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  const lista = pl.plantillas;
  const elegida = lista?.find((p) => p.id === elegidaId) ?? null;
  const vista = elegida ? pl.vistaPrevia(elegida) : null;
  const visibles = (lista ?? []).filter((p) => coincide(p, q));

  const rellenar = () => {
    if (!elegida) return;
    pl.usar(elegida);
    onCerrar();
  };

  const pie = elegida ? (
    <ModalFooter error={error}>
      <button type="button" onClick={() => setElegidaId(null)} className={button({ variant: "secondary" })}>
        <ArrowLeft className="h-4 w-4" aria-hidden /> Otras plantillas
      </button>
      <button type="button" onClick={rellenar} className={button({ variant: "accent" })}>
        {vista?.estado.tipo === "cambia" ? "Cambiar el permiso y rellenar" : "Rellenar"}
      </button>
    </ModalFooter>
  ) : (
    <ModalFooter error={error} nota={lista ? `${visibles.length} de ${lista.length}` : undefined}>
      <button type="button" onClick={onCerrar} className={button({ variant: "secondary" })}>
        Cerrar
      </button>
    </ModalFooter>
  );

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title={elegida ? "Antes de rellenar" : "Usar una plantilla"}
      icon={FolderOpen}
      size="lg"
      aboveModals
      claveVentana="gtf-plantilla-usar"
      footer={pie}
    >
      <div className={`${MODAL_BODY} grid gap-3`}>
        {elegida && vista ? (
          <PlantillaVistaPrevia p={elegida} v={vista} />
        ) : lista === null && !pl.errorCarga ? (
          <p role="status" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <LoadingSpinner size={20} /> Trayendo tus plantillas…
          </p>
        ) : pl.errorCarga ? (
          <div role="alert" className="grid justify-items-start gap-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {pl.errorCarga}
            <button type="button" onClick={() => void pl.recargar()} className={button({ variant: "secondary" })}>
              Reintentar
            </button>
          </div>
        ) : lista && lista.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Todavía no guardas plantillas. Llena la guía y usa «Plantillas › Guardar como plantilla».
          </p>
        ) : (
          <>
            <label className="flex h-12 items-center gap-2 rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 focus-within:border-[var(--accent)]">
              <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              <span className="sr-only">Buscar plantilla</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre, permiso o destino"
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              />
            </label>
            {visibles.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">Ninguna plantilla dice «{q.trim()}».</p>
            ) : (
              <ul className="grid gap-2">
                {visibles.map((p) => (
                  <PlantillaTarjeta key={p.id} p={p} pl={pl} estado={pl.estado(p)} onElegir={() => setElegidaId(p.id)} onError={setError} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </AdminModal>
  );
}
