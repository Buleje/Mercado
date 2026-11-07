"use client";

/**
 * Mi Plata › Contabilidad › Libro diario. Cada movimiento de plata del mes
 * escrito como lo pide el contador (Debe / Haber). Los automáticos salen de las
 * mismas filas que «Resultado»; los manuales y la apertura los escribes tú.
 */
import { useState } from "react";
import { BookOpen, Download, ClipboardList, Plus } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { button } from "@/components/ui-system/button-variants";
import { useContabilidad } from "@/hooks/use-contabilidad-datos";
import { descargarExcelContable, useAccionContable } from "@/hooks/use-contabilidad-acciones";
import { useMesContable, mesActualLima } from "@/hooks/use-mes-contable";
import type { Asiento, RespuestaDiario, TipoAsientoManual } from "@/lib/contabilidad/tipos";
import { limaDateKey } from "@/lib/utils";
import { mesConAnio } from "../resultado/fuentes";
import AsientoBloque from "./AsientoBloque";
import AsientoManualModal from "./AsientoManualModal";
import AvisosContables from "./AvisosContables";
import { Bloque, Cargador, CabeceraConta, Cuadra, FRASE_VACIA, Insignia, soles } from "./compartido";

const AYUDA =
  "El libro diario es cada movimiento de plata escrito como lo pide el contador: lo que entra a una cuenta va al Debe, lo que sale va al Haber.";

/** El día con que arranca un asiento nuevo: hoy si miras el mes actual; si no, el último día del mes mirado. */
function fechaDelAsiento(mes: string): string {
  if (mes >= mesActualLima()) return limaDateKey();
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

export default function LibroDiario() {
  const { mes, setMes } = useMesContable();
  const estado = useContabilidad<RespuestaDiario>(`diario?mes=${mes}`);
  const [nuevo, setNuevo] = useState<TipoAsientoManual | null>(null);
  const { ejecutar } = useAccionContable();
  const { confirm } = useConfirm();

  const anular = async (a: Asiento) => {
    const si = await confirm({
      title: `¿Anular el asiento N.° ${a.numero}?`,
      description: "Queda tachado en el libro y deja de sumar. No se borra: se puede ver quién lo hizo.",
      intent: "danger",
      confirmLabel: "Sí, anular",
    });
    if (!si) return;
    const res = await ejecutar<{ ok: true }>("DELETE", `asientos/${encodeURIComponent(a.id)}`);
    if (res.ok) { toast.success("Asiento anulado."); estado.recargar(); } else toast.error(res.error);
  };

  const cerrado = estado.datos?.estado === "cerrado";
  return (
    <div className="space-y-4">
      <CabeceraConta
        titulo="Libro diario"
        ayuda={AYUDA}
        mes={mes}
        onMes={setMes}
        onActualizar={estado.recargar}
        accion={
          <button type="button" onClick={() => setNuevo("manual")} disabled={cerrado} title={cerrado ? "El mes está cerrado: reábrelo en «Meses y cierre»" : undefined} className={button({ variant: "accent", className: "gap-2 rounded-xl px-4" })}>
            <Plus className="h-4 w-4" aria-hidden />Asiento manual
          </button>
        }
        acciones={[
          { id: "apertura", label: "Asiento de apertura", hint: "Con qué plata y deudas empezó el negocio", icon: ClipboardList, onSelect: () => setNuevo("apertura") },
          { id: "excel", label: "Descargar Excel", hint: `El libro diario de ${mesConAnio(mes)}`, icon: Download, onSelect: () => void descargarExcelContable(mes, "diario") },
        ]}
      />
      <Cargador estado={estado}>
        {(d) => (
          <>
            <Bloque className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <BookOpen className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden />
              <Insignia tono={d.estado === "cerrado" ? "info" : "neutro"}>{d.estado === "cerrado" ? "Mes cerrado" : "Mes abierto"}</Insignia>
              <span className="text-sm text-[var(--text-secondary)]">{d.asientos.length} {d.asientos.length === 1 ? "asiento" : "asientos"}</span>
              <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold tabular-nums text-[var(--text-primary)]">
                <span>Debe {soles(d.totalDebe)}</span>
                <span>Haber {soles(d.totalHaber)}</span>
                <Cuadra ok={d.cuadra} diferencia={Math.abs(d.totalDebe - d.totalHaber)} />
              </span>
            </Bloque>
            <AvisosContables avisos={d.avisos} />
            {d.asientos.length === 0 ? (
              <Bloque className="px-4 py-4"><p className={FRASE_VACIA}>No hay asientos en {mesConAnio(mes)}. Cuando vendas, compres o gastes, aparecen solos aquí.</p></Bloque>
            ) : (
              <div className="space-y-3">
                {d.asientos.map((a) => <AsientoBloque key={a.id} asiento={a} onAnular={anular} />)}
              </div>
            )}
          </>
        )}
      </Cargador>
      <AsientoManualModal
        open={nuevo !== null}
        tipo={nuevo ?? "manual"}
        fecha={fechaDelAsiento(mes)}
        onClose={() => setNuevo(null)}
        onGuardado={() => { setNuevo(null); toast.success("Asiento guardado."); estado.recargar(); }}
      />
    </div>
  );
}
