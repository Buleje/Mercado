"use client";

import { useEffect, useState } from "react";
import { Search, UserPlus } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { buscarCandidatas, type CandidataRevendedora } from "./use-revendedoras";

type Resultado = { ok: true } | { ok: false; error: string };

const INPUT =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

const LISTAS: Record<string, string> = { mayorista: "Mayorista", especial: "Especial" };

/**
 * Buscar una clienta que ya existe y volverla revendedora. Si tenía lista
 * mayorista o especial, se le reemplaza (una clienta tiene una sola lista).
 */
export default function AgregarRevendedoraModal({ open, onClose, onMarcar }: { open: boolean; onClose: () => void; onMarcar: (id: string) => Promise<Resultado> }) {
  const [q, setQ] = useState("");
  const buscado = useDebounce(q.trim(), 300);
  const [lista, setLista] = useState<CandidataRevendedora[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [agregadas, setAgregadas] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    buscarCandidatas(buscado)
      .then((r) => vivo && (setLista(r), setError(null)))
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudo buscar."))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [buscado]);

  async function agregar(c: CandidataRevendedora) {
    setMarcando(c.customerId);
    const r = await onMarcar(c.customerId);
    setMarcando(null);
    if (!r.ok) return setError(r.error);
    setAgregadas((a) => [...a, c.customerId]);
    toast.success(`${c.nombre} ya es revendedora`);
  }

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Agregar revendedora"
      icon={UserPlus}
      size="md"
      claveVentana="revendedoras-agregar"
      footer={
        <ModalFooter error={error} nota={agregadas.length > 0 ? `${agregadas.length} agregada${agregadas.length === 1 ? "" : "s"}` : undefined}>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Listo</button>
        </ModalFooter>
      }
    >
      <div className={cn(MODAL_BODY, "space-y-3")}>
        <label className="relative block">
          <span className="sr-only">Buscar clienta</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o celular de la clienta" className={INPUT} />
        </label>
        {cargando && lista.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--text-tertiary)]">Buscando…</div>
        ) : lista.length === 0 ? (
          <div className="py-6 text-center text-sm text-[var(--text-secondary)]">
            {buscado ? "Ninguna clienta con ese nombre o celular. Créala primero en «Mis clientes»." : "No hay clientas para agregar."}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]" data-testid="candidatas-revendedora">
            {lista.map((c) => {
              const hecha = agregadas.includes(c.customerId);
              const otraLista = c.listaPrecio ? LISTAS[c.listaPrecio] : undefined;
              return (
                <li key={c.customerId} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-[var(--text-primary)]">{c.nombre}</div>
                    <div className="truncate text-xs text-[var(--text-tertiary)]">
                      {[c.celular, c.pueblo, otraLista && `Lista ${otraLista}: se reemplaza`].filter(Boolean).join(" · ") || "Sin celular"}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={hecha || marcando !== null}
                    onClick={() => void agregar(c)}
                    className={button({ variant: hecha ? "ghost" : "secondary", className: "shrink-0" })}
                  >
                    {hecha ? "Agregada" : marcando === c.customerId ? "Agregando…" : "Agregar"}
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
