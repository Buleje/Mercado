"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Printer, ArrowLeft, Loader2 } from "@buleje/design-system/icons";
import type { VentaGuardada } from "@/components/admin/pos/pos-shared";
import { entradaDesdeVenta } from "@/components/admin/pos/recibo/entrada-recibo";
import { useReciboVenta } from "@/components/admin/pos/recibo/use-recibo-venta";
import ReciboPapel, { SelectorFormatoRecibo } from "@/components/admin/pos/recibo/ReciboPapel";

/**
 * Reimprimir el recibo de una venta del POS (historial, «último ticket»). Usa
 * el mismo modelo y la misma hoja que el modal de venta completada: 80 mm,
 * 58 mm o A4, con el formato que el negocio dejó elegido.
 */
export default function ReciboPOSPage() {
  const { id } = useParams<{ id: string }>();
  const [venta, setVenta] = useState<VentaGuardada | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch(`/api/sales/${encodeURIComponent(id)}`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<VentaGuardada>) : Promise.reject(new Error(r.status === 404 ? "No encontramos esa venta" : "No se pudo cargar la venta"))))
      .then((v) => { if (vivo) setVenta(v); })
      .catch((e: unknown) => { if (vivo) setError(e instanceof Error ? e.message : "No se pudo cargar la venta"); });
    return () => { vivo = false; };
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[var(--surface-sunken)]">
        <p className="text-base text-[var(--text-secondary)]">{error}</p>
        <Link href="/admin?tab=ventas-caja&vista=pos" className="text-base font-semibold text-[var(--accent-ink)] underline">Volver al POS</Link>
      </div>
    );
  }
  if (!venta) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-sunken)]" role="status" aria-label="Cargando el recibo">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }
  return <ReciboDeLaVenta venta={venta} />;
}

function ReciboDeLaVenta({ venta }: { venta: VentaGuardada }) {
  const entrada = useMemo(
    () =>
      entradaDesdeVenta({
        ventaId: venta.id,
        detalles: { items: [], total: 0, payment: venta.payment ?? "", venta },
        atendio: null,
        respaldo: { total: 0, metodo: venta.payment ?? "", vuelto: null, fecha: new Date(venta.createdAt ?? Date.now()) },
      }),
    [venta],
  );
  const recibo = useReciboVenta(entrada);
  const { modelo } = recibo;

  return (
    <div className="min-h-screen bg-[var(--surface-sunken)]">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 py-3">
        <Link href="/admin?tab=ventas-caja&vista=pos" className="flex items-center gap-1 text-base text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          <ArrowLeft className="h-4 w-4" /> Volver al POS
        </Link>
        <div className="w-full sm:w-[26rem]">
          <SelectorFormatoRecibo valor={recibo.formato} onChange={recibo.setFormato} />
        </div>
        <button
          type="button"
          onClick={recibo.imprimir}
          disabled={recibo.cargando}
          className="flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          <Printer className="h-5 w-5" /> Imprimir {modelo.nombreCorto.toLowerCase()}
        </button>
      </div>
      {modelo.faltantes.length > 0 && (
        <p className="mx-auto mt-4 max-w-3xl px-4 text-sm font-medium text-[var(--data-warning-ink)]">Falta cargar: {modelo.faltantes.join(", ")}.</p>
      )}
      <div className="mx-auto max-w-3xl px-4 py-6">
        <ReciboPapel html={recibo.html} formato={recibo.formato} titulo={`${modelo.nombreCorto} ${modelo.numero}`} />
      </div>
    </div>
  );
}
