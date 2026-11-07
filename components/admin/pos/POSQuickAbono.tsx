"use client";

import { useState, useEffect } from "react";
import { Check } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { fiadoDelCliente } from "@/lib/fiados/fiado-del-cliente";
import { formatCurrency } from "@/lib/format";
import type { MetodoCobro } from "@/lib/fiados/cobro-metodo";
import { MedioCobroCompacto, avisarSiSinCaja, cuerpoCobroACaja } from "./POSMedioCobro";

// ── Mejora QW-10g: Abono rápido desde la venta ──────────────────────────────
export default function QuickAbonoFromSale({ customerPhone, customerName }: { customerPhone?: string; customerName?: string }) {
  const [fiado, setFiado] = useState<{ id: string; saldo: number } | null>(null);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  /** Lo que dijo el servidor si el abono no entró. Antes se perdía. */
  const [errorAbono, setErrorAbono] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<MetodoCobro>("efectivo");

  useEffect(() => {
    if (!customerPhone) return;
    (async () => {
      try {
        /**
         * `customerId` es el teléfono: así se guarda el fiado (`Fiado.customerId`
         * se cruza contra `Customer.phone` en `FiadosDB.list`).
         *
         * Antes se pedía `?customerPhone=`, un parámetro que la API no lee: se
         * descartaba en silencio y volvían TODOS los fiados activos de la
         * bodega. El `.find()` de abajo tomaba el primero de la lista —el más
         * reciente, de cualquier cliente— y el abono se le acreditaba a ese.
         * Cobrabas S/50 a Juan y se los descontabas de la deuda de Pedro.
         */
        const res = await fetch(`/api/fiados?customerId=${encodeURIComponent(customerPhone)}&status=ACTIVO`);
        if (!res.ok) return;
        const data = await res.json();
        const fiados = Array.isArray(data) ? data : data.fiados ?? [];
        // Cinturón y tirantes: aunque el filtro del servidor vuelva a fallar,
        // `fiadoDelCliente` no devuelve un fiado que no sea de este teléfono.
        const activo = fiadoDelCliente(fiados, customerPhone);
        if (activo) setFiado({ id: activo.id, saldo: activo.saldo });
      } catch { /* silent */ }
    })();
  }, [customerPhone]);

  const abonar = async (monto: number) => {
    if (!fiado || paying) return;
    setPaying(true);
    setErrorAbono(null);
    try {
      const res = await fetch(`/api/fiados/${fiado.id}/pagar`, { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ monto, ...cuerpoCobroACaja(metodo) }) });
      // El endpoint devuelve 400/404/409/422/503 según el caso, y todos salían
      // como «Abono registrado» en verde: el cliente se iba creyendo que pagó.
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorAbono(typeof body?.error === "string" ? body.error : `No se pudo registrar el abono (error ${res.status})`);
        return;
      }
      avisarSiSinCaja(await res.json().catch(() => null));
      setDone(true);
    } catch (err) {
      console.warn("[POS] abono de fiado falló", err);
      setErrorAbono("Sin conexión — el abono no se registró.");
    } finally {
      setPaying(false);
    }
  };

  if (!fiado || done) return done ? (
    <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 dark:bg-primary/15 border border-[var(--data-success-500)]/30">
      <Check className="h-5 w-5 text-[var(--data-success-500)]" strokeWidth={3} />
      <span className="text-base font-semibold text-[var(--data-success-500)]">Abono registrado</span>
    </div>
  ) : null;

  const quickAmounts = [10, 20, 50].filter(a => a <= fiado.saldo);
  return (
    <div className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-4 space-y-3">
      <p className="text-sm font-semibold text-[var(--data-warning-ink)]">
        {customerName || customerPhone} tiene fiado de <span className="font-bold">{formatCurrency(Number(fiado.saldo))}</span>. ¿Abonar?
      </p>
      <MedioCobroCompacto valor={metodo} onCambiar={setMetodo} deshabilitado={paying} />
      <div className="flex flex-wrap gap-2">
        {quickAmounts.map(a => (
          <button key={a} onClick={() => abonar(a)} disabled={paying}
            className="px-4 min-h-10 rounded-xl text-sm font-semibold bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] hover:bg-[var(--data-warning-500)] hover:text-white transition-colors disabled:opacity-50">
            S/{a}
          </button>
        ))}
        <button onClick={() => abonar(fiado.saldo)} disabled={paying}
          className="px-4 min-h-10 rounded-xl text-sm font-semibold bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-[var(--accent-dark)] hover:text-white transition-colors disabled:opacity-50">
          Todo {formatCurrency(Number(fiado.saldo))}
        </button>
        <button onClick={() => setFiado(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors">No, gracias</button>
      </div>
      {errorAbono && (
        <p className="text-sm font-semibold text-[var(--data-error-500)]" role="alert">
          {errorAbono}
        </p>
      )}
    </div>
  );
}
