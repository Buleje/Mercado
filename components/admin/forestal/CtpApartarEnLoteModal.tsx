"use client";

/**
 * CtpApartarEnLoteModal — mandar las piezas elegidas a un lote de aserrío.
 *
 * El lote es la pila que entra junta al carro (ADR-334), y el libro exige **una
 * especie por lote** (L-A1): por eso acá sólo se ofrecen los lotes abiertos de
 * la especie de lo elegido, y si la selección mezcla especies se dice antes de
 * intentar —el servidor lo rechazaría igual, pero enterarse recién ahí obliga a
 * rehacer la selección entera—.
 *
 * El servidor AGREGA, nunca reemplaza, y devuelve las rechazadas con su motivo:
 * que 2 de 30 piezas estén consumidas no puede tirar abajo las otras 28. Ese
 * detalle se muestra tal cual, sin resumirlo en un «no se pudo».
 */

import { useEffect, useMemo, useState } from "react";
import { Layers, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { Btn, ModalFooter } from "./ctp-shared";

interface LoteAbierto {
  id: string;
  code: string;
  status: string;
  speciesCommon: string;
}

export interface CtpApartarEnLoteModalProps {
  /** Las piezas elegidas en la lista, con su especie para poder avisar antes. */
  piezas: readonly { id: string; codigo: string | null; especie: string | null }[];
  onClose: () => void;
  /** Se llamó con éxito: la vista tiene que releer el patio. */
  onListo: () => void;
}

export default function CtpApartarEnLoteModal({ piezas, onClose, onListo }: CtpApartarEnLoteModalProps) {
  const [lotes, setLotes] = useState<LoteAbierto[] | null>(null);
  const [elegido, setElegido] = useState<string>("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rechazadas, setRechazadas] = useState<{ codigo: string | null; motivo: string }[] | null>(null);

  /** Las especies de lo elegido: si hay más de una, ningún lote las acepta juntas. */
  const especies = useMemo(
    () => [...new Set(piezas.map((p) => (p.especie ?? "").trim()).filter(Boolean))],
    [piezas],
  );
  const mezcla = especies.length > 1;

  useEffect(() => {
    let vivo = true;
    ctpGet<{ lotes?: LoteAbierto[] }>("/api/admin/forestal/lotes-aserrio?status=abierto&limite=200")
      .then((r) => { if (vivo) setLotes(r.lotes ?? []); })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, []);

  /* Sólo los de la especie elegida: ofrecer los demás es ofrecer un rechazo. */
  const compatibles = useMemo(() => {
    if (!lotes || especies.length !== 1) return [];
    const esp = especies[0].toLowerCase();
    return lotes.filter((l) => l.speciesCommon.trim().toLowerCase() === esp);
  }, [lotes, especies]);

  const apartar = async () => {
    if (!elegido) return;
    setEnviando(true); setError(null); setRechazadas(null);
    try {
      const res = await fetch("/api/admin/forestal/lotes-aserrio", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ accion: "agregar", loteId: elegido, trozaIds: piezas.map((p) => p.id) }),
      });
      const r = (await res.json().catch(() => ({}))) as { agregadas?: number; rechazadas?: { codigo: string | null; motivo: string }[]; message?: string; error?: string };
      if (!res.ok) throw new Error(r.message ?? r.error ?? `HTTP ${res.status}`);
      /* El lote cambió: sin esto, la lista de lotes abierta en otra pestaña del
         libro sigue mostrando el conteo viejo. */
      invalidarCtp("lotes-aserrio");
      if (r.rechazadas?.length) {
        // Hubo parciales: se muestran y NO se cierra, para que se vea qué quedó afuera.
        setRechazadas(r.rechazadas);
        onListo();
      } else {
        onListo();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Apartar en un lote"
      description={`${piezas.length} ${piezas.length === 1 ? "pieza elegida" : "piezas elegidas"}`}
      icon={Layers}
      className="max-w-xl"
      footer={
        <ModalFooter>
          <Btn onClick={onClose}>Cerrar</Btn>
          <Btn variant="primary" disabled={!elegido || enviando || mezcla} onClick={() => void apartar()}>
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
            Apartar acá
          </Btn>
        </ModalFooter>
      }
    >
      <div className="space-y-3">
        {mezcla && (
          <p className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/12 p-3 text-sm font-bold text-[var(--text-primary)]">
            Elegiste {especies.join(", ")}. Un lote lleva una sola especie: separá la selección y hacelo en dos tandas.
          </p>
        )}
        {error && (
          <p className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}

        {!lotes && !error && (
          <p className="flex items-center justify-center gap-2 p-6 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando lotes abiertos…
          </p>
        )}

        {lotes && !mezcla && compatibles.length === 0 && (
          <p className="rounded-xl border-2 border-dashed border-[var(--rule-base)] p-5 text-center text-sm text-[var(--text-secondary)]">
            No hay ningún lote abierto de {especies[0] ?? "esa especie"}. Creá uno desde la pestaña Lotes y volvé.
          </p>
        )}

        {compatibles.length > 0 && !mezcla && (
          <ul className="space-y-1">
            {compatibles.map((l) => (
              <li key={l.id}>
                <label className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 py-2 transition-colors ${elegido === l.id ? "border-[var(--accent)] bg-primary/10 dark:bg-[var(--accent)]/12" : "border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]"}`}>
                  <input
                    type="radio"
                    name="lote"
                    checked={elegido === l.id}
                    onChange={() => setElegido(l.id)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-sm font-bold text-[var(--text-primary)]">{l.code}</span>
                    <span className="block text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{l.speciesCommon}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {rechazadas && rechazadas.length > 0 && (
          <div className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/12 p-3">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              {rechazadas.length} {rechazadas.length === 1 ? "pieza quedó" : "piezas quedaron"} afuera; el resto entró al lote.
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-[var(--text-secondary)]">
              {rechazadas.map((r, i) => (
                <li key={`${r.codigo ?? "sin"}-${i}`}>
                  <span className="font-mono font-bold text-[var(--text-primary)]">{r.codigo ?? "sin código"}</span>: {r.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
