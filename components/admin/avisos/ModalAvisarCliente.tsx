"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Search, Send } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { button } from "@/components/ui-system/button-variants";
import { csrfHeaders } from "@/lib/csrf-client";
import { orderStatusMeta } from "@/lib/chat/order-context";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { numeroCorto, paraQuien, pedidoDesdeApi, type PedidoParaAviso } from "./tipos";

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  /** Quedó un aviso nuevo en el historial: recargarlo. */
  onAvisado: () => void;
}

/** Los pedidos más recientes entre los que se elige (el buscador filtra sobre estos). */
const PEDIDOS_RECIENTES = 100;

/**
 * Avisar a un cliente: eliges el pedido, el servidor arma el mensaje del estado
 * en que está (mismo `POST /api/notifications { phone, orderId }` de siempre),
 * lo deja en el historial y devuelve el link de WhatsApp con el texto listo.
 * Nada sale solo: el mensaje lo mandas tú desde WhatsApp.
 */
export function ModalAvisarCliente({ abierto, onCerrar, onAvisado }: Props) {
  const [pedidos, setPedidos] = useState<PedidoParaAviso[] | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [texto, setTexto] = useState("");
  const [elegido, setElegido] = useState<PedidoParaAviso | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto || pedidos) return;
    let vivo = true;
    fetch(`/api/orders?limit=${PEDIDOS_RECIENTES}&page=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: unknown) => {
        if (!vivo) return;
        const lista = Array.isArray(j) ? j.map(pedidoDesdeApi).filter((p): p is PedidoParaAviso => !!p) : [];
        setPedidos(lista);
      })
      .catch(() => { if (vivo) setErrorCarga(true); });
    return () => { vivo = false; };
  }, [abierto, pedidos]);

  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const lista = pedidos ?? [];
    if (!q) return lista.slice(0, 12);
    const digitos = q.replace(/\D/g, "");
    return lista.filter((p) => p.nombre.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || (digitos.length >= 3 && (p.celular ?? "").replace(/\D/g, "").includes(digitos)));
  }, [pedidos, texto]);

  const cerrar = () => {
    setElegido(null); setWaUrl(null); setError(null); setTexto("");
    onCerrar();
  };

  const preparar = async () => {
    if (!elegido?.celular || enviando) return;
    setEnviando(true); setError(null);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ phone: elegido.celular, orderId: elegido.id }),
      });
      const j = (await res.json().catch(() => ({}))) as { whatsappUrl?: string; error?: string };
      if (!res.ok || !j.whatsappUrl) throw new Error(j.error ?? `HTTP ${res.status}`);
      setWaUrl(j.whatsappUrl);
      onAvisado();
    } catch (e) {
      setError(e instanceof Error && e.message === "order not found" ? "Ese pedido ya no existe." : "No se pudo preparar el mensaje. Prueba otra vez.");
    } finally {
      setEnviando(false);
    }
  };

  const pie = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" onClick={cerrar} className={button({ variant: "secondary", className: "rounded-xl" })}>
        {waUrl ? "Listo" : "Cancelar"}
      </button>
      {waUrl ? (
        <a href={waUrl} target="_blank" rel="noopener noreferrer" className={button({ variant: "primary", className: "rounded-xl" })}>
          <ExternalLink className="h-4 w-4" aria-hidden />
          Abrir WhatsApp
        </a>
      ) : (
        <button type="button" onClick={() => void preparar()} aria-disabled={!elegido?.celular || enviando} className={button({ variant: "primary", className: "rounded-xl aria-disabled:opacity-60" })}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          Preparar mensaje
        </button>
      )}
    </div>
  );

  return (
    <AdminModal open={abierto} onClose={cerrar} title="Avisar a un cliente" description="El mensaje sale según el estado del pedido." footer={pie}>
      <div className={cn(MODAL_BODY, "space-y-3")}>
        <label className="relative block">
          <span className="sr-only">Buscar pedido</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            type="search"
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setElegido(null); setWaUrl(null); }}
            placeholder="Cliente, celular o N° de pedido…"
            className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
          />
        </label>

        {errorCarga ? (
          <p className="flex items-center gap-2 text-sm text-[var(--data-error-ink)]"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden />No se pudieron traer los pedidos.</p>
        ) : !pedidos ? (
          <p className="flex items-center gap-2 py-4 text-sm text-[var(--text-secondary)]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Trayendo los pedidos…</p>
        ) : visibles.length === 0 ? (
          <p className="py-4 text-sm text-[var(--text-secondary)]">Ningún pedido reciente coincide con «{texto}».</p>
        ) : (
          <ul aria-label="Pedidos recientes" className="max-h-80 space-y-1 overflow-y-auto">
            {visibles.map((p) => {
              const sel = elegido?.id === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={sel}
                    onClick={() => { setElegido(p); setWaUrl(null); setError(null); }}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                      sel ? "border-[var(--accent)] bg-primary/10" : "border-transparent hover:bg-[var(--surface-sunken)]",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-[var(--text-primary)]">{p.nombre}</span>
                      <span className="block truncate text-[var(--text-secondary)]">
                        {p.celular ? paraQuien(p.celular) : "sin celular"} · {numeroCorto(p.id)} · {orderStatusMeta(p.status).label}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-[var(--text-primary)]">{formatCurrency(p.total)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {elegido && !elegido.celular && <p className="text-sm text-[var(--data-warning-ink)]">Ese pedido no tiene celular: no hay a quién escribirle.</p>}
        {waUrl && <p className="flex items-center gap-2 text-sm text-[var(--data-success-ink)]"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />Quedó en el historial. Ábrelo en WhatsApp para mandarlo.</p>}
        {error && <p className="flex items-center gap-2 text-sm text-[var(--data-error-ink)]"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden />{error}</p>}
      </div>
    </AdminModal>
  );
}
