"use client";

/**
 * «Mi cuenta › Puntos»: cuántos tienes, tu nivel y cuánto falta para el
 * siguiente. Cómo se ganan y cuánto valen va en el ⓘ, no en párrafos.
 * Se pide recién al abrir esta sección.
 */

import Link from "next/link";
import { ChevronRight } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useCustomerIntelligence } from "@/hooks/use-customer-intelligence";
import { DESTINOS, rutaCuenta } from "./cuenta-rutas";

type Nivel = "bronce" | "plata" | "oro" | "diamante";
const NIVELES: Nivel[] = ["bronce", "plata", "oro", "diamante"];
/** Los mismos umbrales que mostraba el panel anterior del cliente. */
const DESDE: Record<Nivel, number> = { bronce: 0, plata: 500, oro: 2000, diamante: 5000 };
const NOMBRE: Record<Nivel, string> = { bronce: "Bronce", plata: "Plata", oro: "Oro", diamante: "Diamante" };

function avance(nivel: Nivel, puntos: number) {
  const siguiente = NIVELES[NIVELES.indexOf(nivel) + 1];
  if (!siguiente) return { siguiente: null, faltan: 0, porcentaje: 100 };
  const rango = DESDE[siguiente] - DESDE[nivel];
  const porcentaje = Math.min(100, Math.max(0, ((puntos - DESDE[nivel]) / rango) * 100));
  return { siguiente, faltan: Math.max(0, DESDE[siguiente] - puntos), porcentaje };
}

const AYUDA = (
  <InfoTip
    title="Tus puntos"
    what="Sumas puntos con cada compra en esta tienda."
    example="50 pts = S/ 1 de descuento en tu próximo pedido."
    ariaLabel="Cómo funcionan los puntos"
  />
);

export function SeccionPuntos({ base, conSesion }: { base: string; conSesion: boolean }) {
  const titulo = (
    <div className="flex items-center gap-1.5">
      <CardTitle>Mis puntos</CardTitle>
      {AYUDA}
    </div>
  );
  if (!conSesion) {
    return (
      <div className="flex flex-col gap-2">
        {titulo}
        <p className="text-base text-[var(--text-secondary)]">Entra para ver tus puntos.</p>
      </div>
    );
  }
  return <PuntosDelCliente base={base} titulo={titulo} />;
}

function PuntosDelCliente({ base, titulo }: { base: string; titulo: React.ReactNode }) {
  const { data, loading, error } = useCustomerIntelligence();
  const nivel: Nivel = data.loyaltyTier ?? "bronce";
  const puntos = data.loyaltyPoints ?? 0;
  const { siguiente, faltan, porcentaje } = avance(nivel, puntos);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
      {titulo}
      {loading ? (
        <div aria-busy="true" className="h-16 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
      ) : error ? (
        <p className="text-base text-[var(--text-secondary)]">No pudimos leer tus puntos. Intenta en un momento.</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <p className="text-3xl font-semibold tabular-nums leading-none text-[var(--text-primary)]">
              {puntos.toLocaleString("es-PE")}
              <span className="ml-1.5 text-base font-medium text-[var(--text-secondary)]">pts</span>
            </p>
            <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-sm font-semibold text-[var(--text-primary)] ring-1 ring-[var(--accent)]">
              {NOMBRE[nivel]}
            </span>
          </div>
          {siguiente ? (
            <div className="flex flex-col gap-1.5">
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(porcentaje)}
                aria-label={`Avance a ${NOMBRE[siguiente]}`}
                className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
              >
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${porcentaje}%` }} />
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Te faltan {faltan.toLocaleString("es-PE")} pts para {NOMBRE[siguiente]}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">Llegaste al nivel más alto.</p>
          )}
        </>
      )}
      <Link
        href={rutaCuenta(base, DESTINOS.puntos)}
        className="inline-flex h-12 items-center gap-1 self-start rounded-xl px-1 text-base font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline"
      >
        Ver y canjear mis puntos
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
