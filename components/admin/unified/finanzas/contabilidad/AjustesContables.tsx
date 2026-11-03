"use client";

/**
 * Ajustes de la contabilidad: si tus ventas llevan IGV, desde qué mes se
 * lleva la contabilidad y a qué cuenta va cada regla automática. Solo dueño y
 * administrador guardan (el servidor lo valida).
 */
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { toast } from "sonner";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { button } from "@/components/ui-system/button-variants";
import { useContabilidad } from "@/hooks/use-contabilidad-datos";
import { useAccionContable } from "@/hooks/use-contabilidad-acciones";
import type { AjustesEntrada, RespuestaAjustes, RespuestaPlan } from "@/lib/contabilidad/tipos";
import BuscadorDeCuenta from "./BuscadorDeCuenta";
import { Bloque, Cargador } from "./compartido";
import { CAMPO, ETIQUETA } from "./campos";

type Igv = "regimen" | "si" | "no";
const OPCIONES_IGV: { value: Igv; label: string }[] = [
  { value: "regimen", label: "Según mi régimen" },
  { value: "si", label: "Sí, con IGV" },
  { value: "no", label: "No, sin IGV" },
];
const aIgv = (v: boolean | null): Igv => (v === null ? "regimen" : v ? "si" : "no");
const deIgv = (v: Igv): boolean | null => (v === "regimen" ? null : v === "si");

function Formulario({ datos, plan, recargar }: { datos: RespuestaAjustes; plan: RespuestaPlan | null; recargar: () => void }) {
  const { ajustes, reglas } = datos;
  const [igv, setIgv] = useState<Igv>(aIgv(ajustes.ventasConIgvElegido));
  const [inicio, setInicio] = useState(ajustes.inicio);
  const [mapeo, setMapeo] = useState<Record<string, string>>(ajustes.mapeo);
  const { ejecutar, enviando, error } = useAccionContable();
  useEffect(() => { setIgv(aIgv(ajustes.ventasConIgvElegido)); setInicio(ajustes.inicio); setMapeo(ajustes.mapeo); }, [ajustes]);

  const imputables = useMemo(() => (plan?.cuentas ?? []).filter((c) => c.imputable && c.activa), [plan]);
  const cambio = igv !== aIgv(ajustes.ventasConIgvElegido) || inicio !== ajustes.inicio || JSON.stringify(mapeo) !== JSON.stringify(ajustes.mapeo);

  const guardar = async () => {
    const cuerpo: AjustesEntrada = { ventasConIgv: deIgv(igv), inicio, mapeo };
    const res = await ejecutar<RespuestaAjustes>("PUT", "ajustes", cuerpo);
    if (res.ok) { toast.success("Ajustes guardados."); recargar(); }
  };

  return (
    <div className="space-y-4">
      <Bloque className="space-y-4 p-4">
        <div>
          <span className={ETIQUETA}>¿Tus precios de venta ya incluyen IGV?</span>
          <SegmentedControl<Igv> size="xl" label="Ventas con IGV" value={igv} onChange={setIgv} options={OPCIONES_IGV} />
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Hoy se está tratando como {ajustes.ventasConIgv ? "con IGV" : "sin IGV"}
            {ajustes.regimen ? ` (régimen ${ajustes.regimen})` : ""}. Tasa {Math.round(ajustes.tasaIgv * 100)} %.
          </p>
        </div>
        <label className="block sm:max-w-xs">
          <span className={ETIQUETA}>La contabilidad empieza en</span>
          <input type="month" className={CAMPO} value={inicio} onChange={(e) => setInicio(e.target.value)} />
          <span className="mt-1 block text-sm text-[var(--text-secondary)]">Antes de este mes no se arman asientos.</span>
        </label>
      </Bloque>

      <Bloque className="overflow-x-auto">
        <DataTable>
          <thead><tr><th>Cuando pasa esto</th><th>Va al Debe</th><th>Va al Haber</th><th>Cuenta que puedes cambiar</th></tr></thead>
          <tbody>
            {reglas.map((r) => (
              <tr key={r.regla}>
                <td className="font-semibold">{r.etiqueta}</td>
                <td className="tabular-nums text-[var(--text-secondary)]">{r.debe.join(", ") || "—"}</td>
                <td className="tabular-nums text-[var(--text-secondary)]">{r.haber.join(", ") || "—"}</td>
                <td className="min-w-[14rem]">
                  {r.cambiable ? (
                    <BuscadorDeCuenta
                      cuentas={imputables}
                      valor={mapeo[r.regla] ?? (r.cambiable === "debe" ? r.debe[0] : r.haber[0]) ?? ""}
                      etiqueta={`Cuenta de «${r.etiqueta}»`}
                      onElegir={(c) => setMapeo({ ...mapeo, [r.regla]: c })}
                    />
                  ) : <span className="text-[var(--text-tertiary)]">No se cambia</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Bloque>

      {error && <p role="alert" className="text-sm font-bold text-[var(--data-error-ink)]">{error}</p>}
      <button type="button" onClick={() => void guardar()} disabled={!cambio || enviando} className={button({ variant: "accent", className: "rounded-xl px-5" })}>
        {enviando ? "Guardando…" : "Guardar ajustes"}
      </button>
    </div>
  );
}

export default function AjustesContables() {
  const estado = useContabilidad<RespuestaAjustes>("ajustes");
  const plan = useContabilidad<RespuestaPlan>("plan");
  return <Cargador estado={estado}>{(d) => <Formulario datos={d} plan={plan.datos} recargar={estado.recargar} />}</Cargador>;
}
