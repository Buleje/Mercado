"use client";

/**
 * FichaCuenta — vínculo con Adelantos, sugeridos por documento, saldo abierto
 * (ADR-414 §1/§5/§7). «Ver su cuenta» salta al módulo de Adelantos — no hay
 * una segunda pantalla de plata acá, sólo el puente.
 */

import { useEffect, useState } from "react";
import { Link2, Link2Off, Loader2, Search, Wallet } from "@buleje/design-system/icons";
import { formatearPEN } from "../rrhh-ui";
import type { FichaColaboradorDTO } from "@/lib/rrhh/tipos";
import type { RrhhApiError } from "@/hooks/use-rrhh-puestos";

interface BeneficiarioLite {
  id: string;
  nombre: string;
  documento?: string | null;
}

interface Props {
  vinculo: FichaColaboradorDTO["vinculo"];
  cuenta: FichaColaboradorDTO["cuenta"];
  guardando: boolean;
  onVincular: (beneficiarioId: string | null) => Promise<{ ok: true } | { ok: false; error: RrhhApiError }>;
  onCambio: () => void;
}

/** Salta a Adelantos sin remontar el hub entero (memoria: `admin:navigate`, mismo patrón que `PorCobrarDashboard`). */
function irAAdelantos() {
  window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: "adelantos" } }));
}

export default function FichaCuenta({ vinculo, cuenta, guardando, onVincular, onCambio }: Props) {
  const [buscando, setBuscando] = useState(false);
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<BeneficiarioLite[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!buscando) return;
    let vigente = true;
    setCargandoLista(true);
    fetch("/api/adelantos/beneficiarios", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (!vigente) return;
        const arr = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
        setLista(arr.map((x) => ({ id: String(x.id), nombre: String(x.nombre ?? "Sin nombre"), documento: x.documento ? String(x.documento) : null })));
      })
      .finally(() => { if (vigente) setCargandoLista(false); });
    return () => { vigente = false; };
  }, [buscando]);

  const vincular = async (id: string | null) => {
    setError(null);
    const res = await onVincular(id);
    if (!res.ok) { setError(res.error.error === "documento_no_coincide" ? "Esa cuenta tiene otro documento — no se puede vincular." : (res.error.message ?? "No se pudo vincular")); return; }
    setBuscando(false);
    onCambio();
  };

  const filtrada = q.trim() ? lista.filter((b) => `${b.nombre} ${b.documento ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) : lista;

  if (vinculo.beneficiario) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-[var(--rule-base)] p-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{vinculo.beneficiario.nombre}</p>
          {vinculo.beneficiario.documento && <p className="text-xs text-[var(--text-tertiary)]">{vinculo.beneficiario.documento}</p>}
        </div>
        {cuenta && (
          <div className="flex items-center gap-2 rounded-xl bg-[var(--surface-sunken)] p-3">
            <Wallet className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">{formatearPEN(cuenta.adelantosAbiertosPen)} abiertos</p>
              <p className="text-xs text-[var(--text-tertiary)]">{cuenta.abiertos} adelanto(s) sin cerrar</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button type="button" onClick={irAAdelantos} className="text-xs font-bold text-primary hover:underline">Ver su cuenta →</button>
          <button
            type="button"
            disabled={guardando}
            onClick={() => vincular(null)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
          >
            <Link2Off className="h-3.5 w-3.5" /> Desvincular
          </button>
        </div>
        {error && <p className="text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--text-tertiary)]">Sin cuenta vinculada. Sin vínculo no hay «Ver su cuenta» ni cruce con adelantos al pagar (F2).</p>

      {vinculo.sugeridos.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-bold text-[var(--text-secondary)]">Mismo documento, sin vincular:</p>
          <ul className="space-y-1.5">
            {vinculo.sugeridos.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-[var(--rule-base)] px-3 py-2">
                <span className="text-sm text-[var(--text-primary)]">{s.nombre}</span>
                <button type="button" disabled={guardando} onClick={() => vincular(s.id)} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline disabled:opacity-50">
                  <Link2 className="h-3.5 w-3.5" /> Vincular
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!buscando ? (
        <button type="button" onClick={() => setBuscando(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          <Search className="h-3.5 w-3.5" /> Buscar la cuenta a mano
        </button>
      ) : (
        <div className="space-y-2 rounded-xl border border-[var(--rule-base)] p-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o documento..." className="h-9 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]" />
          {cargandoLista && <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />}
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {filtrada.slice(0, 30).map((b) => (
              <li key={b.id}>
                <button type="button" disabled={guardando} onClick={() => vincular(b.id)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-sunken)] disabled:opacity-50">
                  <span className="truncate text-[var(--text-primary)]">{b.nombre}</span>
                  {b.documento && <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{b.documento}</span>}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setBuscando(false)} className="text-xs font-semibold text-[var(--text-tertiary)]">Cerrar</button>
        </div>
      )}
      {error && <p className="text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
    </div>
  );
}
