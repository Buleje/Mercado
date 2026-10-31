"use client";

/**
 * El cálculo del mes + sus Indicadores plegables. Los Indicadores muestran DE
 * DÓNDE sale el monto (ingresos, IGV de ventas y de gastos, acumulado del año);
 * el resultado (IGV a pagar, Renta, total) va en la tarjeta «A pagar»: ninguna
 * cifra dos veces.
 */
import { useMemo } from "react";
import { StatCard } from "@buleje/design-system";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import type { RegimenTributario } from "@/lib/tax/obligaciones-peru";
import { calcularImpuestosDelMes, type ImpuestosDelMes } from "./impuestos-del-mes";
import { useIgvDelMes, useIngresosDelAnio } from "./use-impuestos";

interface Tarjeta { rotulo: string; valor: string; ayuda: string }

export function useImpuestosDelMes(mes: string, regimen: RegimenTributario, tick: number) {
  const ingresos = useIngresosDelAnio(mes, tick);
  const { cargando: cargandoIgv, igv } = useIgvDelMes(mes, tick);

  const calculo = useMemo<ImpuestosDelMes | null>(() => {
    if (ingresos.fase !== "lista" || cargandoIgv) return null;
    const delMes = ingresos.datos.find((f) => f.month === mes)?.ingresos ?? 0;
    const acum = ingresos.datos.filter((f) => f.month.slice(0, 4) === mes.slice(0, 4)).reduce((s, f) => s + f.ingresos, 0);
    return calcularImpuestosDelMes({ regimen, igv, ingresosMes: delMes, ingresosAcumAnio: acum });
  }, [ingresos, cargandoIgv, igv, regimen, mes]);

  const lectura = calculo?.lecturaIgv;
  const registrado = lectura?.tipo === "registrado" ? lectura : null;
  const ingresosMes = ingresos.fase === "lista" ? ingresos.datos.find((f) => f.month === mes)?.ingresos ?? 0 : 0;
  const acumulado = ingresos.fase === "lista" ? ingresos.datos.reduce((s, f) => s + f.ingresos, 0) : 0;

  const tarjetas: Tarjeta[] = [
    { rotulo: "Ingresos del mes", valor: formatCurrency(ingresosMes), ayuda: "Ventas del mostrador más pedidos confirmados, en camino o entregados: el mismo número del Resumen de Mi Plata." },
    {
      rotulo: "IGV de tus ventas",
      valor: registrado ? formatCurrency(registrado.debito) : "Sin registro",
      ayuda: registrado ? `De ${registrado.comprobantes} comprobantes electrónicos (menos notas de crédito).` : "Aparece al emitir boletas y facturas electrónicas desde el sistema. No se estima con el 18 %.",
    },
    {
      rotulo: "IGV de tus gastos",
      valor: registrado ? formatCurrency(registrado.credito) : "Sin registro",
      ayuda: registrado ? `De ${registrado.conIgv} de ${registrado.gastos} gastos con su factura.` : "Sale de la factura que anotas en cada gasto (Compras › Gasto nuevo).",
    },
    { rotulo: "Ingresos del año", valor: formatCurrency(acumulado), ayuda: "De enero a este mes. En el Régimen MYPE, pasando 300 UIT la Renta sube de 1 % a 1.5 %." },
  ];

  const kpis = useKpisPlegables({
    claveMemoria: "plata-impuestos-mes",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: calculo == null,
    resumen: `Ingresos ${formatCurrency(ingresosMes)}`,
    tarjetas: tarjetas.map((t) => <StatCard key={t.rotulo} density="compact" label={t.rotulo} value={t.valor} info={<InfoTip what={t.ayuda} />} />),
  });

  return { calculo, cargando: calculo == null && ingresos.fase === "cargando", error: ingresos.fase === "error", kpis };
}
