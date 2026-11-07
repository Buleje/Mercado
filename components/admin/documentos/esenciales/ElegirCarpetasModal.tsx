"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Search, Star } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";
import { esEsencial, rutaDe } from "@/lib/documentos/esenciales";
import { FolderGlyph } from "../folder-visuals";
import { CAMPO_BUSCAR } from "./compartido";

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * «Elegir carpetas»: marcar y desmarcar varias de una vez sin ir al Archivo.
 * Lo mismo que «Llevar a Esenciales» del menú de la carpeta: al guardar, pone
 * la marca a las nuevas y se la quita a las que desmarcaste.
 */
export default function ElegirCarpetasModal({ carpetas, onGuardar, onClose }: {
  carpetas: readonly DbDocumentFolder[];
  onGuardar: (poner: DbDocumentFolder[], quitar: DbDocumentFolder[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(carpetas.filter(esEsencial).map((c) => c.id)));
  const [q, setQ] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Cada carpeta con su camino, en el orden del árbol (madre antes que hijas).
  const filas = useMemo(() => {
    const porId = new Map(carpetas.map((c) => [c.id, c]));
    return carpetas
      .map((c) => ({ c, ruta: rutaDe(c.id, porId) }))
      .sort((a, b) => [...a.ruta, a.c.name].join("\u0000").localeCompare([...b.ruta, b.c.name].join("\u0000"), "es", { numeric: true }));
  }, [carpetas]);
  const aguja = sinTildes(q.trim());
  const visibles = aguja ? filas.filter((f) => sinTildes(`${f.c.name} ${f.ruta.join(" ")}`).includes(aguja)) : filas;

  const poner = carpetas.filter((c) => elegidas.has(c.id) && !esEsencial(c));
  const quitar = carpetas.filter((c) => !elegidas.has(c.id) && esEsencial(c));
  const cambios = poner.length + quitar.length;

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const guardar = async () => {
    setGuardando(true);
    const ok = await onGuardar(poner, quitar);
    setGuardando(false);
    if (ok) onClose();
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Elegir carpetas esenciales"
      description={`${elegidas.size} elegida${elegidas.size === 1 ? "" : "s"}`}
      icon={Star}
      size="md"
      claveVentana="elegir-esenciales"
      footer={
        <ModalFooter>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Cancelar</button>
          <button type="button" onClick={() => void guardar()} disabled={cambios === 0 || guardando} className={cn(button({ variant: "primary" }), "gap-2")}>
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            {cambios === 0 ? "Sin cambios" : `Guardar (${cambios})`}
          </button>
        </ModalFooter>
      }
    >
      <div className={cn("space-y-3", MODAL_BODY)}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar carpeta"
            placeholder="Buscar carpeta…"
            className={CAMPO_BUSCAR}
          />
        </div>
        {visibles.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">{aguja ? `Ninguna carpeta con «${q.trim()}».` : "Todavía no hay carpetas."}</p>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-[var(--rule-soft)] overflow-y-auto rounded-xl border border-[var(--rule-base)]">
            {visibles.map(({ c, ruta }) => {
              const si = elegidas.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={si}
                    onClick={() => alternar(c.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-sunken)]"
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
                        si ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--text-inverse)]" : "border-[var(--rule-strong)]",
                      )}
                    >
                      {si && <Check className="h-4 w-4" />}
                    </span>
                    <FolderGlyph folder={c} className="h-5 w-5 shrink-0 text-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{c.name}</span>
                      {ruta.length > 0 && <span className="block truncate text-xs text-[var(--text-tertiary)]">{ruta.join(" › ")}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminModal>
  );
}
