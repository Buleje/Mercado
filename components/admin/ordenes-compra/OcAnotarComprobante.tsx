"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { TIPOS_COMPROBANTE, type TipoComprobante } from "@/lib/compras/estados-oc";
import { button } from "@/components/ui-system/button-variants";
import type { OrdenOC } from "@/components/admin/ordenes-compra/oc-compartido";

const CAMPO = "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

/**
 * C59 · Anotar el comprobante del proveedor DESPUÉS de crear la orden: la
 * factura llega con la mercadería. El PATCH ya lo aceptaba (ADR-377) pero no
 * había dónde escribirlo, y la orden quedaba «sin comprobante» para siempre.
 */
export default function OcAnotarComprobante({
  orden, onGuardado, onCancelar,
}: { orden: OrdenOC; onGuardado: (msg: string) => void; onCancelar: () => void }) {
  const [tipo, setTipo] = useState<TipoComprobante>(
    orden.invoiceType && orden.invoiceType !== "ninguno" ? (orden.invoiceType as TipoComprobante) : "factura",
  );
  const [numero, setNumero] = useState(orden.invoiceNumber ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sinNumero = tipo !== "ninguno" && !numero.trim();

  const guardar = async () => {
    if (sinNumero) { setError("Escribe el número que dice el papel (por ejemplo F001-123)."); return; }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/purchases/${orden.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(tipo === "ninguno" ? { invoiceType: tipo } : { invoiceType: tipo, invoiceNumber: numero.trim() }),
      });
      if (!res.ok) {
        const d = await leerJson<{ error?: unknown }>(res);
        setError(typeof d?.error === "string" ? d.error : `No se guardó (error ${res.status})`);
        return;
      }
      onGuardado(tipo === "ninguno" ? "Anotado: esta compra no trae comprobante" : `Comprobante anotado: ${numero.trim()}`);
    } catch {
      setError("Sin conexión con el servidor: no se guardó");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2" data-qa="anotar-comprobante">
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-secondary)]">
        Tipo
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoComprobante)} className={CAMPO} data-qa="tipo-comprobante">
          {TIPOS_COMPROBANTE.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      {tipo !== "ninguno" && (
        <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-secondary)]">
          Número
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value.slice(0, 60))}
            onKeyDown={(e) => { if (e.key === "Enter") void guardar(); }}
            placeholder="F001-123"
            className={`${CAMPO} w-40`}
            autoFocus
          />
        </label>
      )}
      <button type="button" onClick={() => void guardar()} disabled={guardando} className={button({ variant: "primary", className: "rounded-xl" })}>
        {guardando ? "Guardando…" : "Guardar"}
      </button>
      <button type="button" onClick={onCancelar} className={button({ variant: "ghost", className: "rounded-xl" })}>Cancelar</button>
      {error && <p role="alert" className="basis-full text-sm font-semibold text-[var(--data-error-ink)]">{error}</p>}
    </div>
  );
}
