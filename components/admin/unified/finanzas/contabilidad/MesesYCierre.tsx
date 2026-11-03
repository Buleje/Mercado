"use client";

/**
 * Mi Plata › Contabilidad › Meses y cierre. Cada mes con su estado, cuántos
 * asientos tiene, si cuadra y su utilidad. Cerrar congela el mes; reabrir lo
 * deja editar. Solo dueño y administrador pueden (el servidor lo valida).
 */
import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, Lock, Unlock } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { button } from "@/components/ui-system/button-variants";
import { useContabilidad } from "@/hooks/use-contabilidad-datos";
import { useAccionContable } from "@/hooks/use-contabilidad-acciones";
import type { PeriodoResumen, RespuestaPeriodos } from "@/lib/contabilidad/tipos";
import { mesConAnio } from "../resultado/fuentes";
import { Bloque, Cargador, CabeceraConta, Cuadra, Insignia, soles } from "./compartido";

const AYUDA = "Cuando un mes ya está revisado, lo cierras: queda congelado y nadie cambia sus números sin querer. Si hay que corregir algo, lo reabres.";

export default function MesesYCierre() {
  const estado = useContabilidad<RespuestaPeriodos>("periodos");
  const { ejecutar } = useAccionContable();
  const { confirm } = useConfirm();
  const [enCurso, setEnCurso] = useState<string | null>(null);

  const cambiar = async (p: PeriodoResumen, accion: "cerrar" | "reabrir") => {
    const nombre = mesConAnio(p.periodo);
    const si = await confirm(
      accion === "cerrar"
        ? {
            title: `¿Cerrar ${nombre}?`,
            description: "Al cerrar, el mes queda congelado: sus asientos se guardan tal cual están hoy y no podrás agregar ni anular asientos ahí. Si te equivocas, puedes reabrirlo.",
            confirmLabel: "Sí, cerrar el mes",
            intent: "warning",
          }
        : {
            title: `¿Reabrir ${nombre}?`,
            description: "El mes vuelve a poder editarse y sus asientos automáticos se vuelven a armar con lo que hay hoy. Los números pueden cambiar.",
            confirmLabel: "Sí, reabrir",
            intent: "warning",
          },
    );
    if (!si) return;
    setEnCurso(p.periodo);
    const res = await ejecutar<PeriodoResumen>("POST", `periodos/${p.periodo}/${accion}`);
    setEnCurso(null);
    if (res.ok) { toast.success(accion === "cerrar" ? `${nombre} quedó cerrado.` : `${nombre} se reabrió.`); estado.recargar(); }
    else toast.error(res.error);
  };

  return (
    <div className="space-y-4">
      <CabeceraConta titulo="Meses y cierre" ayuda={AYUDA} onActualizar={estado.recargar} />
      <Cargador estado={estado}>
        {(d) => (
          <Bloque className="overflow-x-auto">
            <DataTable>
              <thead>
                <tr>
                  <th>Mes</th><th>Estado</th><th className="text-right">Asientos</th><th>Cuadra</th><th className="text-right">Utilidad</th><th className="text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {d.periodos.map((p) => {
                  const cerrado = p.estado === "cerrado";
                  return (
                    <tr key={p.periodo}>
                      <td className="whitespace-nowrap font-semibold">{mesConAnio(p.periodo)}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <Insignia tono={cerrado ? "info" : "neutro"}>{cerrado ? "Cerrado" : "Abierto"}</Insignia>
                          {p.seMovioDespues && (
                            <span className="inline-flex items-center gap-1 text-sm text-[var(--data-warning-ink)]" title="Alguien cambió algo de este mes después de cerrarlo. Reábrelo y ciérralo otra vez para actualizarlo.">
                              <AlertTriangle className="h-4 w-4" aria-hidden />Se movió después
                            </span>
                          )}
                        </div>
                        {cerrado && p.cerradoAt && (
                          <span className="block text-xs text-[var(--text-secondary)]">{p.cerradoPor ? `por ${p.cerradoPor}` : ""}</span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">{p.asientos}</td>
                      <td><Cuadra ok={p.cuadra} /></td>
                      <td className={`whitespace-nowrap text-right font-semibold tabular-nums ${p.utilidad < 0 ? "text-[var(--data-error-ink)]" : ""}`}>{soles(p.utilidad)}</td>
                      <td className="text-right">
                        <button type="button" disabled={enCurso !== null} onClick={() => void cambiar(p, cerrado ? "reabrir" : "cerrar")} className={button({ variant: "secondary", className: "gap-2 rounded-xl px-4" })}>
                          {cerrado ? <Unlock className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
                          {enCurso === p.periodo ? "Un momento…" : cerrado ? "Reabrir" : "Cerrar mes"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </Bloque>
        )}
      </Cargador>
    </div>
  );
}
