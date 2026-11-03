"use client";

/** Un cuadro de renglones de un estado financiero: etiqueta y monto; los totales (`nivel 0`) en negrita. */
import { DataTable } from "@buleje/design-system";
import { CardTitle } from "@buleje/design-system";
import type { RenglonEstado } from "@/lib/contabilidad/tipos";
import { Bloque, soles } from "./compartido";

interface Grupo {
  subtitulo?: string;
  renglones: RenglonEstado[];
}

export default function TablaRenglones({ titulo, grupos, total }: { titulo: string; grupos: Grupo[]; total?: { etiqueta: string; monto: number } }) {
  return (
    <Bloque className="overflow-hidden">
      <div className="border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2">
        <CardTitle>{titulo}</CardTitle>
      </div>
      <div className="overflow-x-auto">
        <DataTable>
          <thead className="sr-only">
            <tr><th>Concepto</th><th>Monto</th></tr>
          </thead>
          <tbody>
            {grupos.map((g, gi) => (
              <GrupoFilas key={g.subtitulo ?? gi} grupo={g} />
            ))}
          </tbody>
          {total && (
            <tfoot>
              <tr>
                <td className="font-extrabold">{total.etiqueta}</td>
                <td className="whitespace-nowrap text-right font-extrabold tabular-nums">{soles(total.monto)}</td>
              </tr>
            </tfoot>
          )}
        </DataTable>
      </div>
    </Bloque>
  );
}

function GrupoFilas({ grupo }: { grupo: Grupo }) {
  return (
    <>
      {grupo.subtitulo && grupo.renglones.length > 0 && (
        <tr className="bg-[var(--surface-sunken)]"><td colSpan={2} className="text-sm font-bold text-[var(--text-secondary)]">{grupo.subtitulo}</td></tr>
      )}
      {grupo.renglones.map((r) => (
        <tr key={r.clave}>
          <td className={r.nivel === 0 ? "font-bold" : "pl-6"} title={r.cuentas.length ? `Cuentas: ${r.cuentas.join(", ")}` : undefined}>{r.etiqueta}</td>
          <td className={`whitespace-nowrap text-right tabular-nums ${r.nivel === 0 ? "font-bold" : ""} ${r.monto < 0 ? "text-[var(--data-error-ink)]" : ""}`}>{soles(r.monto)}</td>
        </tr>
      ))}
    </>
  );
}
