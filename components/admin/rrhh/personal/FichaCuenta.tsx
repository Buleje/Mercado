"use client";

/**
 * FichaCuenta — vínculo con Adelantos, sugeridos por documento, saldo abierto
 * (ADR-414 §1/§5/§7). «Ver su cuenta» salta al módulo de Adelantos — no hay
 * una segunda pantalla de plata acá, sólo el puente.
 */

import { useEffect, useState } from "react";
import { ArrowRight, Link2, Link2Off, Loader2, Search, Wallet } from "@buleje/design-system/icons";
import { BlockTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { AvisoRrhh, BOTON, CLASE_CAMPO } from "../rrhh-form";
import { formatearPEN, pluralizar } from "../rrhh-ui";
import type { FichaColaboradorDTO } from "@/lib/rrhh/tipos";
import type { RrhhApiError } from "@/hooks/use-rrhh-puestos";
import { sinDato } from "@/lib/errores/sin-dato";

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
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!buscando) return;
    let vigente = true;
    setCargandoLista(true);
    setErrorLista(null);
    fetch("/api/adelantos/beneficiarios", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<unknown>;
      })
      .then((data) => {
        if (!vigente) return;
        const arr = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
        setLista(arr.map((x) => ({ id: String(x.id), nombre: String(x.nombre ?? "Sin nombre"), documento: x.documento ? String(x.documento) : null })));
      })
      .catch((err) => {
        // Antes un error de red dejaba la lista vacía sin decir nada: parecía que no había cuentas.
        sinDato("RRHH cuentas de Adelantos")(err);
        if (vigente) setErrorLista("No se pudo cargar la lista de cuentas de Adelantos.");
      })
      .finally(() => {
        if (vigente) setCargandoLista(false);
      });
    return () => {
      vigente = false;
    };
  }, [buscando]);

  const vincular = async (id: string | null) => {
    setError(null);
    const res = await onVincular(id);
    if (!res.ok) {
      setError(res.error.error === "documento_no_coincide" ? "Esa cuenta tiene otro documento: no se puede vincular." : (res.error.message ?? "No se pudo vincular."));
      return;
    }
    setBuscando(false);
    onCambio();
  };

  const filtrada = q.trim() ? lista.filter((b) => `${b.nombre} ${b.documento ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) : lista;

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <BlockTitle as="h3">Cuenta en Adelantos</BlockTitle>
          {vinculo.beneficiario ? (
            <p className="mt-0.5 text-sm text-[var(--text-primary)]">
              {vinculo.beneficiario.nombre}
              {vinculo.beneficiario.documento && <span className="tabular-nums text-[var(--text-tertiary)]"> · {vinculo.beneficiario.documento}</span>}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">Sin cuenta vinculada: sus adelantos abiertos no se ven acá ni en Lo ganado.</p>
          )}
        </div>
        {vinculo.beneficiario && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={irAAdelantos} className={BOTON.chico}>
              Ver su cuenta <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" disabled={guardando} onClick={() => vincular(null)} className={BOTON.chicoFantasma}>
              <Link2Off className="h-4 w-4" /> Desvincular
            </button>
          </div>
        )}
      </div>

      {vinculo.beneficiario && cuenta && (
        <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-sunken)] px-4 py-3">
          <Wallet className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" />
          <div className="min-w-0">
            <p className="text-base font-bold tabular-nums text-[var(--text-primary)]">{formatearPEN(cuenta.adelantosAbiertosPen)} abiertos</p>
            <p className="text-xs text-[var(--text-tertiary)]">{pluralizar(cuenta.abiertos, "adelanto sin cerrar", "adelantos sin cerrar")}</p>
          </div>
        </div>
      )}

      {!vinculo.beneficiario && vinculo.sugeridos.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">Con su mismo documento, sin vincular:</p>
          <ul className="space-y-2">
            {vinculo.sugeridos.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-[var(--rule-base)] px-3.5 py-2.5">
                <span className="min-w-0 truncate text-sm text-[var(--text-primary)]">{s.nombre}</span>
                <button type="button" disabled={guardando} onClick={() => vincular(s.id)} className={BOTON.chico}>
                  <Link2 className="h-4 w-4" /> Vincular
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!vinculo.beneficiario &&
        (!buscando ? (
          <button type="button" onClick={() => setBuscando(true)} className={BOTON.chico}>
            <Search className="h-4 w-4" /> Buscar la cuenta a mano
          </button>
        ) : (
          <div className="space-y-2.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Buscar cuenta por nombre o documento"
                placeholder="Nombre o documento…"
                className={cn(CLASE_CAMPO, "pl-10")}
              />
            </div>
            {cargandoLista && (
              <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando cuentas…
              </p>
            )}
            {errorLista && <AvisoRrhh tono="error">{errorLista}</AvisoRrhh>}
            {!cargandoLista && !errorLista && filtrada.length === 0 && <p className="text-sm text-[var(--text-tertiary)]">Ninguna cuenta coincide.</p>}
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {filtrada.slice(0, 30).map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    disabled={guardando}
                    onClick={() => vincular(b.id)}
                    className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--surface-raised)] disabled:opacity-50"
                  >
                    <span className="truncate text-[var(--text-primary)]">{b.nombre}</span>
                    {b.documento && <span className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">{b.documento}</span>}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setBuscando(false)} className={BOTON.chicoFantasma}>
              Cerrar
            </button>
          </div>
        ))}

      {error && <AvisoRrhh tono="error">{error}</AvisoRrhh>}
    </section>
  );
}
