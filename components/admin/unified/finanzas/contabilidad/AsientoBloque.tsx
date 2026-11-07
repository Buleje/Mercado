"use client";

/**
 * Un asiento del Libro diario: arriba su número, fecha, glosa e insignias; abajo
 * sus líneas (cuenta, nombre, debe, haber, tercero) y el total que cuadra. El
 * clic en «Ver original» abre el hecho que lo armó (la venta, el gasto, la guía)
 * con el mismo mecanismo que usa Resultado (`irAlOrigen`).
 */
import { DataTable } from "@buleje/design-system";
import { ChevronRight, Trash2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { diaConNombre } from "@/lib/forestal/plazo-de-apartado";
import type { Asiento, TipoAsiento } from "@/lib/contabilidad/tipos";
import { irAlOrigen } from "../resultado/ir-al-origen";
import { Bloque, Cuadra, Insignia, columna, soles } from "./compartido";

const TIPO: Record<TipoAsiento, { texto: string; tono: "neutro" | "ok" | "aviso" | "info" }> = {
  auto: { texto: "Automático", tono: "neutro" },
  manual: { texto: "Manual", tono: "info" },
  apertura: { texto: "Apertura", tono: "ok" },
  cierre: { texto: "Cierre", tono: "aviso" },
};

interface Props {
  asiento: Asiento;
  onAnular?: (a: Asiento) => void;
}

export default function AsientoBloque({ asiento: a, onAnular }: Props) {
  const tipo = TIPO[a.tipo];
  const cuadra = Math.abs(a.lineas.reduce((s, l) => s + l.debe - l.haber, 0)) < 0.005;
  return (
    <Bloque className={`overflow-hidden ${a.anulado ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-2">
        <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">N.° {a.numero}</span>
        <span className="text-sm text-[var(--text-secondary)]">{diaConNombre(a.fecha)}</span>
        <span className={`min-w-0 flex-1 basis-48 break-words text-sm font-semibold text-[var(--text-primary)] ${a.anulado ? "line-through" : ""}`}>
          {a.glosa}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Insignia tono={tipo.tono}>{tipo.texto}</Insignia>
          {a.certeza !== "medido" && (
            <span title="Parte del monto es estimado: se afina cuando llegue el dato real">
              <Insignia tono="aviso">≈ estimado</Insignia>
            </span>
          )}
          {a.anulado && <Insignia>Anulado</Insignia>}
          {a.enlace && (
            <button type="button" onClick={() => irAlOrigen(a.enlace!)} className={button({ variant: "link", size: "sm", className: "shrink-0 gap-1" })}>
              Ver original <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          {a.editable && !a.anulado && onAnular && (
            <button type="button" onClick={() => onAnular(a)} className={button({ variant: "ghost", size: "sm", className: "shrink-0 gap-1" })} aria-label={`Anular el asiento ${a.numero}`}>
              <Trash2 className="h-4 w-4" aria-hidden />Anular
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <DataTable>
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>Nombre</th>
              <th className="text-right">Debe</th>
              <th className="text-right">Haber</th>
              <th>Tercero</th>
            </tr>
          </thead>
          <tbody>
            {a.lineas.map((l, i) => (
              <tr key={`${l.cuenta}-${i}`}>
                <td className="whitespace-nowrap font-semibold tabular-nums">{l.cuenta}</td>
                <td>{l.nombreCuenta}{l.glosa && <span className="block text-xs text-[var(--text-secondary)]">{l.glosa}</span>}</td>
                <td className="whitespace-nowrap text-right tabular-nums">{columna(l.debe)}</td>
                <td className="whitespace-nowrap text-right tabular-nums">{columna(l.haber)}</td>
                <td className="text-[var(--text-secondary)]">{l.tercero ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="font-bold"><Cuadra ok={cuadra} /></td>
              <td className="whitespace-nowrap text-right font-extrabold tabular-nums">{soles(a.total)}</td>
              <td className="whitespace-nowrap text-right font-extrabold tabular-nums">{soles(a.total)}</td>
              <td />
            </tr>
          </tfoot>
        </DataTable>
      </div>
    </Bloque>
  );
}
