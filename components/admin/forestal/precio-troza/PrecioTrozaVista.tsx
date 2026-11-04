"use client";

/**
 * Rendimiento › «Cuánto pagar» — ¿cuánto puedo pagar por la troza? (noche
 * 04-11, carril B2). El aserradero compra ROLLO por m³ y vende ASERRADA por
 * pie: con lo que rinde su sierra, el servidor dice el máximo por m³ de cada
 * especie y qué proveedor, permiso o guía rinde más.
 *
 * Las casillas se recuerdan por negocio (`localStorage`); la cuenta la hace
 * `GET /api/admin/forestal/precio-troza` con espera corta (`usePrecioTroza`).
 */
import { Loader2 } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { usePrecioTroza } from "@/hooks/use-precio-troza";
import { tenantKey, useTenantSlug } from "@/contexts/tenant-context";
import type { AgruparOrigenPor } from "@/lib/forestal/precio-troza-tipos";
import { CASILLAS_VACIAS, casillasGuardadas, type CampoPrecioTroza, type CasillasPrecioTroza } from "./precio-troza-formato";
import PrecioTrozaCasillas from "./precio-troza-casillas";
import PrecioTrozaEspecies from "./precio-troza-especies";
import PrecioTrozaOrigen from "./precio-troza-origen";

const AGRUPAR_VALIDOS: readonly AgruparOrigenPor[] = ["proveedor", "permiso", "guia"];

export default function PrecioTrozaVista() {
  const slug = useTenantSlug();
  const [guardadas, setGuardadas] = useLocalStorage<CasillasPrecioTroza>(tenantKey(slug, "precio-troza-casillas"), CASILLAS_VACIAS);
  const [agruparGuardado, setAgrupar] = useLocalStorage<AgruparOrigenPor>(tenantKey(slug, "precio-troza-agrupar"), "proveedor");
  /* Lo guardado en el navegador puede venir de otra versión: se limpia antes de usarlo. */
  const casillas = casillasGuardadas(guardadas);
  const agrupar: AgruparOrigenPor = AGRUPAR_VALIDOS.includes(agruparGuardado) ? agruparGuardado : "proveedor";
  const { datos, cargando, recalculando, error, recargar } = usePrecioTroza(casillas, agrupar);
  const cambiar = (campo: CampoPrecioTroza, valor: string) => setGuardadas((c) => ({ ...casillasGuardadas(c), [campo]: valor }));

  return (
    <div className="space-y-4" data-vista="precio-troza">
      <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
        Con lo que rinde tu aserradero, esto es lo máximo que puedes pagar por cada m³ de rollo sin perder.
        {recalculando && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)]" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Recalculando…
          </span>
        )}
      </p>

      <PrecioTrozaCasillas casillas={casillas} onCambiar={cambiar} recalculando={recalculando} />

      {cargando && (
        <p className="flex items-center gap-2 py-8 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Calculando con tus corridas y tus ventas…
        </p>
      )}
      {error && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--data-error-500)] px-3 py-2 text-sm text-[var(--data-error-ink)]" role="alert">
          {error}
          <button type="button" onClick={recargar} className="font-bold underline">Reintentar</button>
        </p>
      )}

      {datos && (
        <div className={recalculando ? "opacity-70 transition-opacity" : "transition-opacity"}>
          <PrecioTrozaEspecies datos={datos} />
        </div>
      )}
      {datos && <PrecioTrozaOrigen datos={datos} agrupar={agrupar} onAgrupar={setAgrupar} />}
    </div>
  );
}
