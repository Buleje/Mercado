"use client";
/** Indicadores plegables de Categorías: cuántas hay, cuántas tienen productos, ocultas y SEO completo. */
import type { ReactNode } from "react";
import { EyeOff, Layers, ListChecks, Package } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { puntajeSeo, type FilaCategoria } from "./tipos";

interface Tarjeta { rotulo: string; valor: string; icono: typeof Layers; ayuda?: ReactNode }

export function useIndicadoresCategorias(cats: FilaCategoria[], cargando: boolean) {
  const conProductos = cats.filter((c) => c.productos > 0).length;
  const ocultas = cats.filter((c) => !c.visible).length;
  const seoCompleto = cats.filter((c) => puntajeSeo(c) === "good").length;
  const tarjetas: Tarjeta[] = [
    { rotulo: "Categorías", valor: String(cats.length), icono: Layers },
    { rotulo: "Con productos", valor: String(conProductos), icono: Package, ayuda: "Tienen al menos un producto, activo o inactivo." },
    { rotulo: "Ocultas", valor: String(ocultas), icono: EyeOff, ayuda: "No se ofrecen para elegir al cargar productos nuevos." },
    { rotulo: "SEO completo", valor: `${seoCompleto}/${cats.length}`, icono: ListChecks, ayuda: "Título de 30 a 60 letras, descripción de 120 a 160 y 3 palabras clave o más." },
  ];
  return useKpisPlegables({
    claveMemoria: "inventario-categorias",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: cargando,
    resumen: `${conProductos} de ${cats.length} en uso`,
    tarjetas: tarjetas.map(({ rotulo, valor, icono: Icono, ayuda }) => (
      <div key={rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <Icono className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
          {ayuda && <InfoTip what={ayuda} />}
        </div>
        <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{valor}</p>
      </div>
    )),
  });
}
