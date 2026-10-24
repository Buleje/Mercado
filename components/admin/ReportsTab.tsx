"use client";

/**
 * Mi Plata › Impuestos y reportes › Para el contador: LO QUE SE DESCARGA PARA
 * ÉL. La vista son los libros del mes (registro de ventas 14.1, de compras 8.1
 * y kardex 13.1, armados en el servidor: `components/contabilidad`); los
 * reportes sueltos de antes (ventas, inventario, financiero…) van al «⋯».
 *
 * Antes (medido 11-10): ocho tarjetas con dos botones cada una, el PDF con
 * texto blanco sobre turquesa al 10 % (no se leía) y un «Informe Mensual de
 * Gestión» que repetía «Reporte mensual». Los libros, ya construidos, no
 * estaban montados en ninguna pantalla.
 */
import { useState } from "react";
import { toast } from "sonner";
import { FileText } from "@buleje/design-system/icons";
import LibrosContador from "@/components/contabilidad/LibrosContador";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { useStockMinimoGlobal } from "@/lib/inventario/use-stock-minimo-global";
import { REPORTS, generarCSV, generarPDF, type ReportType } from "./reportes-contador/generar-reportes";

export default function ReportsTab() {
  // Un solo stock mínimo (09-10): el propio o el del negocio.
  const minimoGlobal = useStockMinimoGlobal();
  const [generando, setGenerando] = useState<string | null>(null);

  const correr = async (clave: string, fn: () => Promise<void>) => {
    setGenerando(clave);
    try {
      await fn();
    } catch {
      toast.error("No se pudo armar el reporte. Intenta de nuevo.");
    } finally {
      setGenerando(null);
    }
  };

  const reportes: MenuAccion[] = REPORTS.flatMap((r) => {
    const tipo: ReportType = r.type;
    const conPdf = tipo !== "metricas-completas";
    const csv: MenuAccion = {
      id: `${tipo}-csv`,
      label: `${r.label}${conPdf ? " · CSV" : ""}`,
      hint: r.desc,
      icon: r.icon,
      seccion: "Otros reportes",
      busy: generando === `${tipo}-csv`,
      disabled: generando !== null,
      onSelect: () => void correr(`${tipo}-csv`, () => generarCSV(tipo, minimoGlobal)),
    };
    if (!conPdf) return [csv];
    return [
      csv,
      {
        id: `${tipo}-pdf`,
        label: `${r.label} · PDF`,
        hint: "Se abre lista para imprimir o guardar en PDF",
        icon: r.icon,
        seccion: "Otros reportes",
        busy: generando === `${tipo}-pdf`,
        disabled: generando !== null,
        onSelect: () => void correr(`${tipo}-pdf`, () => generarPDF(tipo, minimoGlobal)),
      },
    ];
  });

  return (
    <LibrosContador
      titulo="Para el contador"
      masAcciones={[
        { id: "hoja", label: "El mes en una hoja", hint: "Reporte mensual: ingresos, gastos y utilidad en PDF", icon: FileText, seccion: "Ver", onSelect: () => irAEnlace("/admin?tab=plata&vista=reportes") },
        ...reportes,
      ]}
    />
  );
}
