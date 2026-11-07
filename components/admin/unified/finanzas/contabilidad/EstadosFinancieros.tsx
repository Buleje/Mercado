"use client";

/**
 * Mi Plata › Contabilidad › Estados financieros: el Estado de situación (lo que
 * tienes, lo que debes y lo que es tuyo), el Estado de resultados (lo que ganaste
 * en el mes y en el año) y el cruce con la pantalla Resultado.
 */
import { useState } from "react";
import { Download } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { useContabilidad } from "@/hooks/use-contabilidad-datos";
import { descargarExcelContable } from "@/hooks/use-contabilidad-acciones";
import { useMesContable } from "@/hooks/use-mes-contable";
import type { EstadoResultados, EstadoSituacion, RespuestaEstados } from "@/lib/contabilidad/tipos";
import { mesConAnio } from "../resultado/fuentes";
import { Bloque, Cargador, CabeceraConta, Cuadra, FRASE_VACIA, soles } from "./compartido";
import CruceConResultadoTarjeta from "./CruceConResultado";
import TablaRenglones from "./TablaRenglones";

const AYUDA = "Los estados financieros resumen todo en dos fotos: qué tienes y qué debes hoy (situación), y cuánto ganaste o perdiste en el periodo (resultados).";

type Vista = "situacion" | "mes" | "ejercicio";
const OPCIONES: { value: Vista; label: string }[] = [
  { value: "situacion", label: "Situación" },
  { value: "mes", label: "Resultados del mes" },
  { value: "ejercicio", label: "Resultados del año" },
];

function Situacion({ s }: { s: EstadoSituacion }) {
  return (
    <div className="space-y-3">
      <Bloque className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
        <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">Activo {soles(s.totalActivo)} = Pasivo {soles(s.totalPasivo)} + Patrimonio {soles(s.totalPatrimonio)}</span>
        <span className="ml-auto"><Cuadra ok={s.cuadra} diferencia={Math.abs(s.diferencia)} /></span>
      </Bloque>
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <TablaRenglones
          titulo="Lo que tienes (activo)"
          grupos={[{ subtitulo: "Corriente: se vuelve plata pronto", renglones: s.activoCorriente }, { subtitulo: "No corriente: maquinaria, local", renglones: s.activoNoCorriente }]}
          total={{ etiqueta: "Total activo", monto: s.totalActivo }}
        />
        <div className="space-y-3">
          <TablaRenglones
            titulo="Lo que debes (pasivo)"
            grupos={[{ subtitulo: "Corriente: a pagar pronto", renglones: s.pasivoCorriente }, { subtitulo: "No corriente: a largo plazo", renglones: s.pasivoNoCorriente }]}
            total={{ etiqueta: "Total pasivo", monto: s.totalPasivo }}
          />
          <TablaRenglones titulo="Lo que es tuyo (patrimonio)" grupos={[{ renglones: s.patrimonio }]} total={{ etiqueta: "Total patrimonio", monto: s.totalPatrimonio }} />
        </div>
      </div>
    </div>
  );
}

function Resultados({ titulo, e }: { titulo: string; e: EstadoResultados }) {
  if (e.renglones.length === 0) return <Bloque className="px-4 py-4"><p className={FRASE_VACIA}>No hay movimientos de ingresos ni gastos en este periodo.</p></Bloque>;
  return <TablaRenglones titulo={titulo} grupos={[{ renglones: e.renglones }]} total={{ etiqueta: e.utilidad >= 0 ? "Utilidad (ganancia)" : "Pérdida", monto: e.utilidad }} />;
}

export default function EstadosFinancieros() {
  const { mes, setMes } = useMesContable();
  const [vista, setVista] = useState<Vista>("situacion");
  const estado = useContabilidad<RespuestaEstados>(`estados?mes=${mes}`);
  return (
    <div className="space-y-4">
      <CabeceraConta
        titulo="Estados financieros"
        ayuda={AYUDA}
        mes={mes}
        onMes={setMes}
        onActualizar={estado.recargar}
        acciones={[{ id: "excel", label: "Descargar Excel", hint: `Los estados de ${mesConAnio(mes)}`, icon: Download, onSelect: () => void descargarExcelContable(mes, "estados") }]}
      />
      <Cargador estado={estado}>
        {(d) => (
          <>
            <CruceConResultadoTarjeta cruce={d.cruce} />
            <SegmentedControl<Vista> size="xl" label="Qué estado ver" value={vista} onChange={setVista} options={OPCIONES} />
            {vista === "situacion" && <Situacion s={d.situacion} />}
            {vista === "mes" && <Resultados titulo={`Resultados de ${mesConAnio(d.mes)}`} e={d.resultadosDelMes} />}
            {vista === "ejercicio" && <Resultados titulo={`Resultados de ${mesConAnio(d.desde)} a ${mesConAnio(d.mes)}`} e={d.resultadosDelEjercicio} />}
          </>
        )}
      </Cargador>
    </div>
  );
}
