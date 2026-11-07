"use client";

/**
 * «Meta del mes: S/ X · vas S/ Y → Metas y logros» en Mi Plata › Gastos ›
 * Presupuesto (19-10, «una sola meta»).
 *
 * La sección «Metas del mes» de Gastos guardaba otra meta de ventas y otro
 * tope de gastos en el navegador. Se fue: la meta es UNA, la de Metas y logros
 * (`/api/goals`, categorías `ventas` y `gastos`, período mensual), y se cambia
 * sólo ahí. Esta línea la muestra con lo que lleva el mes (lo mide el
 * servidor) y salta a cambiarla.
 *
 * Si este navegador tenía la meta vieja y el servidor no tiene la suya, se
 * ofrece una vez «Guardar tu meta anterior (S/ X) en el sistema».
 */
import { useEffect, useState } from "react";
import { Target } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { button } from "@/components/ui-system/button-variants";
import { useMetas } from "@/hooks/use-metas";
import { CLAVE_META_VIEJA, CLAVE_META_VIEJA_OFRECIDA, leerMetaVieja, metaMensual, queOfrecerGuardar, type MetaVieja } from "@/lib/admin/meta-anterior-local";
import { formatCurrency } from "@/lib/currency";
import { limaDateKey } from "@/lib/utils";

const HREF_METAS = "/admin?tab=metas-logros&vista=metas";
const soles = (n: number) => formatCurrency(n, { decimals: 0 });

function leerDelNavegador(): MetaVieja | null {
  try {
    if (localStorage.getItem(CLAVE_META_VIEJA_OFRECIDA)) return null;
    return leerMetaVieja(localStorage.getItem(CLAVE_META_VIEJA), limaDateKey().slice(0, 7));
  } catch {
    return null;
  }
}

export default function LineaMetaDelMes() {
  const { metas, avances, cargando, error, crear } = useMetas();
  const [vieja, setVieja] = useState<MetaVieja | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => setVieja(leerDelNavegador()), []);

  // Sin permiso para las metas (o sin red): la línea no se dibuja; el presupuesto sigue igual.
  if (cargando || error) return null;

  const ventas = metaMensual(metas, "ventas");
  const gastos = metaMensual(metas, "gastos");
  const vaVentas = ventas ? avances.get(ventas.id)?.avance : null;
  const vaGastos = gastos ? avances.get(gastos.id)?.avance : null;
  const ofrecer = queOfrecerGuardar(vieja, metas);

  const olvidar = (clave: string, valor?: string) => {
    try {
      if (valor) localStorage.setItem(clave, valor);
      else localStorage.removeItem(clave);
    } catch {
      // Storage bloqueado: igual se esconde en esta visita.
    }
    setVieja(null);
  };

  const guardar = async (o: MetaVieja) => {
    setGuardando(true);
    setAviso(null);
    const pedidos = [
      o.ventas ? crear({ name: "Ventas del mes", category: "ventas", period: "mensual", target: o.ventas, current: 0, unit: "S/" }) : null,
      o.gastos ? crear({ name: `No gastar más de ${soles(o.gastos)} al mes`, category: "gastos", period: "mensual", target: o.gastos, current: 0, unit: "S/" }) : null,
    ].filter((p) => p !== null);
    const resultados = await Promise.all(pedidos);
    setGuardando(false);
    const fallo = resultados.find((r) => !r.ok);
    if (fallo && !fallo.ok) {
      setAviso(fallo.error);
      return;
    }
    olvidar(CLAVE_META_VIEJA);
  };

  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
        <Target className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        {ventas ? (
          <span>
            Meta del mes: <strong className="tabular-nums text-[var(--text-primary)]">{soles(ventas.target)}</strong>
            {vaVentas != null && <span className="tabular-nums"> · vas {soles(vaVentas)}</span>}
          </span>
        ) : (
          <span>Sin meta de ventas del mes</span>
        )}
        {gastos && (
          <span>
            Tope de gastos: <strong className="tabular-nums text-[var(--text-primary)]">{soles(gastos.target)}</strong>
            {vaGastos != null && <span className="tabular-nums"> · llevas {soles(vaGastos)}</span>}
          </span>
        )}
        <EnlacePanel href={HREF_METAS} className="inline-flex min-h-12 items-center font-semibold">
          {ventas || gastos ? "Cambiarla en Metas y logros" : "Ponla en Metas y logros"}
        </EnlacePanel>
      </p>
      {ofrecer && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2 text-sm text-[var(--text-primary)]">
          <span className="min-w-0 flex-[1_1_16rem]">
            Este equipo tenía {ofrecer.ventas ? `una meta de ${soles(ofrecer.ventas)}` : ""}
            {ofrecer.ventas && ofrecer.gastos ? " y " : ""}
            {ofrecer.gastos ? `un tope de gastos de ${soles(ofrecer.gastos)}` : ""} guardado sólo aquí.
          </span>
          <button type="button" disabled={guardando} onClick={() => void guardar(ofrecer)} className={button({ variant: "primary", className: "h-12 rounded-xl px-4 text-sm" })}>
            {guardando ? "Guardando…" : `Guardar tu meta anterior (${soles((ofrecer.ventas ?? ofrecer.gastos) as number)}) en el sistema`}
          </button>
          <button type="button" disabled={guardando} onClick={() => olvidar(CLAVE_META_VIEJA_OFRECIDA, "1")} className={button({ variant: "ghost", className: "h-12 rounded-xl px-4 text-sm" })}>
            No, gracias
          </button>
          {aviso && <span className="w-full text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">{aviso}</span>}
        </div>
      )}
    </div>
  );
}
