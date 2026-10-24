"use client";

/**
 * Puntos y tarjeta de sellos del cliente, de sólo lectura (bloque de «Más del
 * cliente» en la ficha 360). Antes este bloque INVENTABA un historial: 0,5
 * puntos por sol de cada pedido y 1 punto = S/ 0,05, que no son las reglas del
 * programa (Campañas › Puntos: 1 punto = S/ 0,10, saldo en el cliente): la
 * misma persona tenía dos saldos distintos según la pantalla. Ahora dice el
 * saldo real (`/api/loyalty/[phone]`, el de Puntos) y su tarjeta de sellos;
 * canjear se hace allá.
 */
import { useEffect, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Star } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";
import { solesDePuntos } from "@/components/admin/crecimiento/puntos/mensajes";
import { TarjetaSellos } from "@/components/admin/crecimiento/puntos/TarjetaSellos";
import type { CanjeSellos, ConfigSellos, EstadoSellos } from "@/lib/loyalty/sellos";
import type { Cliente360 } from "@/components/admin/cliente360/use-cliente-360";

type Respuesta = { config: ConfigSellos | null; estado: EstadoSellos | null; canjes: CanjeSellos[] };
type Saldo = { loyaltyPoints?: number; loyaltyTier?: string };

const leer = <T,>(url: string) => fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);

export default function FichaPuntos({ ficha }: { ficha: Cliente360 }) {
  const phone = ficha.customer?.phone ?? ficha.phone;
  const [sellos, setSellos] = useState<Respuesta | null>(null);
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [cargando, setCargando] = useState(true);

  /* El saldo, de la misma ruta que la ficha de Campañas › Puntos (/api/customers/[phone] no lo trae). */
  useEffect(() => {
    if (!phone) return;
    let vivo = true;
    void Promise.all([leer<Respuesta>(`/api/loyalty/sellos?phone=${encodeURIComponent(phone)}`), leer<Saldo>(`/api/loyalty/${encodeURIComponent(phone)}`)]).then(([s, p]) => {
      if (!vivo) return;
      setSellos(s);
      setSaldo(p);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [phone]);

  const puntos = saldo?.loyaltyPoints ?? 0;
  const config = sellos?.config?.activo ? sellos.config : null;

  return (
    <div className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
      <CardTitle className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <Star className="h-4 w-4 text-[var(--data-warning-500)]" aria-hidden /> Puntos y sellos
      </CardTitle>
      <p className="text-sm text-[var(--text-secondary)]">
        <strong className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{cargando ? "…" : formatNumber(puntos)}</strong> puntos
        {puntos > 0 ? ` ≈ ${solesDePuntos(puntos)} de descuento` : ""}
        {saldo?.loyaltyTier ? <span className="capitalize"> · nivel {saldo.loyaltyTier}</span> : null}
      </p>
      {config && <TarjetaSellos estado={sellos?.estado ?? null} canjes={sellos?.canjes ?? []} premio={config.premio} cargando={cargando} />}
    </div>
  );
}
