"use client";

/**
 * Mi Plata › Contabilidad › Balance de comprobación: el cuadro de 8 columnas
 * del contador (sumas, saldos, inventario y resultados por naturaleza),
 * acumulado del año hasta el mes elegido.
 */
import { DataTable } from "@buleje/design-system";
import { Download } from "@buleje/design-system/icons";
import { useContabilidad } from "@/hooks/use-contabilidad-datos";
import { descargarExcelContable } from "@/hooks/use-contabilidad-acciones";
import { useMesContable } from "@/hooks/use-mes-contable";
import type { ColumnasComprobacion, RespuestaComprobacion } from "@/lib/contabilidad/tipos";
import { mesConAnio } from "../resultado/fuentes";
import { Bloque, Cargador, CabeceraConta, Cuadra, FRASE_VACIA, columna, soles } from "./compartido";

const AYUDA = "El balance de comprobación es la prueba de que todo está bien anotado: lo que suma el Debe tiene que ser igual a lo que suma el Haber, cuenta por cuenta.";

const COLUMNAS: { clave: keyof ColumnasComprobacion; titulo: string }[] = [
  { clave: "sumasDebe", titulo: "Sumas Debe" },
  { clave: "sumasHaber", titulo: "Sumas Haber" },
  { clave: "saldoDeudor", titulo: "Saldo deudor" },
  { clave: "saldoAcreedor", titulo: "Saldo acreedor" },
  { clave: "activo", titulo: "Activo" },
  { clave: "pasivo", titulo: "Pasivo y patrimonio" },
  { clave: "perdidas", titulo: "Pérdidas" },
  { clave: "ganancias", titulo: "Ganancias" },
];

export default function BalanceComprobacion() {
  const { mes, setMes } = useMesContable();
  const estado = useContabilidad<RespuestaComprobacion>(`comprobacion?mes=${mes}`);
  return (
    <div className="space-y-4">
      <CabeceraConta
        titulo="Balance de comprobación"
        ayuda={AYUDA}
        mes={mes}
        onMes={setMes}
        onActualizar={estado.recargar}
        acciones={[{ id: "excel", label: "Descargar Excel", hint: `El balance de ${mesConAnio(mes)}`, icon: Download, onSelect: () => void descargarExcelContable(mes, "comprobacion") }]}
      />
      <Cargador estado={estado}>
        {(d) => (
          <>
            <Bloque className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <span className="text-sm text-[var(--text-secondary)]">De {mesConAnio(d.desde)} a {mesConAnio(d.mes)}</span>
              <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold tabular-nums text-[var(--text-primary)]">
                <span>{d.resultadoDelEjercicio >= 0 ? "Ganancia" : "Pérdida"} del ejercicio {soles(Math.abs(d.resultadoDelEjercicio))}</span>
                <Cuadra ok={d.cuadra} />
              </span>
            </Bloque>
            {d.filas.length === 0 ? (
              <Bloque className="px-4 py-4"><p className={FRASE_VACIA}>Todavía no hay movimientos para armar el balance.</p></Bloque>
            ) : (
              <Bloque className="overflow-x-auto">
                <DataTable>
                  <thead>
                    <tr>
                      <th>Cuenta</th><th>Nombre</th>
                      {COLUMNAS.map((c) => <th key={c.clave} className="text-right">{c.titulo}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {d.filas.map((f) => (
                      <tr key={f.codigo}>
                        <td className="font-semibold tabular-nums">{f.codigo}</td>
                        <td className="min-w-[14rem]">{f.nombre}</td>
                        {COLUMNAS.map((c) => <td key={c.clave} className="whitespace-nowrap text-right tabular-nums">{columna(f[c.clave])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="font-bold">Totales</td>
                      {COLUMNAS.map((c) => <td key={c.clave} className="whitespace-nowrap text-right font-extrabold tabular-nums">{soles(d.totales[c.clave])}</td>)}
                    </tr>
                  </tfoot>
                </DataTable>
              </Bloque>
            )}
          </>
        )}
      </Cargador>
    </div>
  );
}
