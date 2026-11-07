"use client";

/**
 * Mi Plata › Contabilidad › Libro mayor. Una cuenta por fila con su saldo
 * inicial, lo que entró al Debe, lo que salió al Haber y el saldo final. Al
 * elegir una cuenta se ven sus movimientos con el saldo que va quedando.
 */
import { useMemo, useState } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { ArrowLeft, Download } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { useContabilidad } from "@/hooks/use-contabilidad-datos";
import { descargarExcelContable } from "@/hooks/use-contabilidad-acciones";
import { useMesContable } from "@/hooks/use-mes-contable";
import { diaConNombre } from "@/lib/forestal/plazo-de-apartado";
import type { CuentaMayor, RespuestaMayor } from "@/lib/contabilidad/tipos";
import { mesConAnio } from "../resultado/fuentes";
import { Bloque, Cargador, CabeceraConta, FRASE_VACIA, columna, soles } from "./compartido";
import { CAMPO } from "./campos";

const AYUDA = "El libro mayor junta todos los movimientos de una misma cuenta (Caja, Banco, Ventas…) para ver cuánto tenía al empezar el mes y cuánto le queda.";
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function DetalleDeCuenta({ mes, codigo, onVolver }: { mes: string; codigo: string; onVolver: () => void }) {
  const estado = useContabilidad<RespuestaMayor>(`mayor?mes=${mes}&cuenta=${encodeURIComponent(codigo)}`);
  return (
    <Cargador estado={estado}>
      {(d) => {
        const c = d.cuentas.find((x) => x.codigo === codigo) ?? d.cuentas[0];
        if (!c) return <p className={FRASE_VACIA}>Esa cuenta no tiene movimientos en {mesConAnio(mes)}.</p>;
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={onVolver} className={button({ variant: "secondary", className: "gap-2 rounded-xl px-4" })}>
                <ArrowLeft className="h-4 w-4" aria-hidden />Todas las cuentas
              </button>
              <CardTitle>{c.codigo} · {c.nombre}</CardTitle>
              <span className="ml-auto text-sm font-bold tabular-nums text-[var(--text-primary)]">Saldo final {soles(c.saldoFinal)}</span>
            </div>
            <Bloque className="overflow-x-auto">
              <DataTable>
                <thead>
                  <tr><th>Fecha</th><th>N.°</th><th>Glosa</th><th>Tercero</th><th className="text-right">Debe</th><th className="text-right">Haber</th><th className="text-right">Saldo</th></tr>
                </thead>
                <tbody>
                  <tr className="bg-[var(--surface-sunken)]">
                    <td colSpan={6} className="font-semibold">Saldo al empezar el mes</td>
                    <td className="text-right font-bold tabular-nums">{soles(c.saldoInicial)}</td>
                  </tr>
                  {c.movimientos.map((m, i) => (
                    <tr key={`${m.asientoId}-${i}`}>
                      <td className="whitespace-nowrap">{diaConNombre(m.fecha)}</td>
                      <td className="tabular-nums">{m.numero}</td>
                      <td>{m.glosa}</td>
                      <td className="text-[var(--text-secondary)]">{m.tercero ?? "—"}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{columna(m.debe)}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{columna(m.haber)}</td>
                      <td className="whitespace-nowrap text-right font-semibold tabular-nums">{soles(m.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="font-bold">Totales del mes</td>
                    <td className="text-right font-extrabold tabular-nums">{soles(c.debe)}</td>
                    <td className="text-right font-extrabold tabular-nums">{soles(c.haber)}</td>
                    <td className="text-right font-extrabold tabular-nums">{soles(c.saldoFinal)}</td>
                  </tr>
                </tfoot>
              </DataTable>
            </Bloque>
          </div>
        );
      }}
    </Cargador>
  );
}

function ResumenDeCuentas({ cuentas, onElegir }: { cuentas: CuentaMayor[]; onElegir: (c: string) => void }) {
  const [q, setQ] = useState("");
  const vistas = useMemo(() => {
    const t = sinTildes(q.trim());
    return t ? cuentas.filter((c) => c.codigo.startsWith(t) || sinTildes(c.nombre).includes(t)) : cuentas;
  }, [q, cuentas]);
  return (
    <div className="space-y-3">
      <input type="search" className={`${CAMPO} sm:max-w-sm`} placeholder="Buscar cuenta (caja, 1011, ventas…)" aria-label="Buscar cuenta" value={q} onChange={(e) => setQ(e.target.value)} />
      <Bloque className="overflow-x-auto">
        <DataTable>
          <thead>
            <tr><th>Cuenta</th><th>Nombre</th><th className="text-right">Saldo inicial</th><th className="text-right">Debe</th><th className="text-right">Haber</th><th className="text-right">Saldo final</th></tr>
          </thead>
          <tbody>
            {vistas.length === 0 && <tr><td colSpan={6} className={FRASE_VACIA}>Ninguna cuenta con movimiento coincide.</td></tr>}
            {vistas.map((c) => (
              <tr key={c.codigo}>
                <td>
                  <button type="button" onClick={() => onElegir(c.codigo)} className="min-h-11 font-bold tabular-nums text-[var(--accent-dark)] underline-offset-4 hover:underline" aria-label={`Ver los movimientos de la cuenta ${c.codigo}`}>
                    {c.codigo}
                  </button>
                </td>
                <td>{c.nombre}</td>
                <td className="whitespace-nowrap text-right tabular-nums">{soles(c.saldoInicial)}</td>
                <td className="whitespace-nowrap text-right tabular-nums">{columna(c.debe)}</td>
                <td className="whitespace-nowrap text-right tabular-nums">{columna(c.haber)}</td>
                <td className="whitespace-nowrap text-right font-semibold tabular-nums">{soles(c.saldoFinal)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Bloque>
    </div>
  );
}

export default function LibroMayor() {
  const { mes, setMes } = useMesContable();
  const [cuenta, setCuenta] = useState<string | null>(null);
  const resumen = useContabilidad<RespuestaMayor>(cuenta ? null : `mayor?mes=${mes}`);
  return (
    <div className="space-y-4">
      <CabeceraConta
        titulo="Libro mayor"
        ayuda={AYUDA}
        mes={mes}
        onMes={(m) => { setMes(m); }}
        onActualizar={resumen.recargar}
        acciones={[{ id: "excel", label: "Descargar Excel", hint: `El libro mayor de ${mesConAnio(mes)}`, icon: Download, onSelect: () => void descargarExcelContable(mes, "mayor") }]}
      />
      {cuenta ? (
        <DetalleDeCuenta mes={mes} codigo={cuenta} onVolver={() => setCuenta(null)} />
      ) : (
        <Cargador estado={resumen}>
          {(d) => d.cuentas.length === 0
            ? <Bloque className="px-4 py-4"><p className={FRASE_VACIA}>No hay movimientos en {mesConAnio(mes)}.</p></Bloque>
            : <ResumenDeCuentas cuentas={d.cuentas} onElegir={setCuenta} />}
        </Cargador>
      )}
    </div>
  );
}
