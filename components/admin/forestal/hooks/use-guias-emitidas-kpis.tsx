"use client";

/**
 * Las cifras plegables de Guías emitidas y los filtros que las gobiernan
 * (ADR-400): especie, producto y destino recortan a la vez las tarjetas y la
 * lista. Salió de `CtpGuiasEmitidasView` para que la vista quepa en 300 líneas
 * (compactación del Libro CTP, 2026-10-17).
 */

import { useMemo, useState } from "react";
import { StatCard } from "@buleje/design-system";
import { AlertTriangle, Check, FileText } from "@buleje/design-system/icons";
import { resumirGuias, type GuiaEmitida } from "@/lib/forestal/guias-emitidas";
import CtpKpiFiltros from "../CtpKpiFiltros";
import { useKpisPlegables } from "../ctp-shared";

export function useGuiasEmitidasKpis(guias: GuiaEmitida[], etiquetaPeriodo: string) {
  /**
   * Los filtros que gobiernan las cifras de arriba (ADR-400).
   *
   * `soloIncompletas` NO entra acá: es el desglose que las propias tarjetas
   * ofrecen, y recortarlas con lo que se elige EN ellas las dejaría en cero.
   */
  /* Listas: dos especies o dos destinos a la vez (Brandon, 2026-09-10). */
  const [especie, setEspecie] = useState<string[]>([]);
  const [producto, setProducto] = useState<string[]>([]);
  const [destino, setDestino] = useState<string[]>([]);

  /**
   * Las guías que describen las cifras: todas, recortadas por especie, producto
   * y destino. Antes el resumen contaba SIEMPRE el período entero mientras la
   * lista de abajo mostraba otra cosa.
   */
  const delFiltro = useMemo(
    () =>
      /* OR adentro de cada filtro, AND entre filtros. */
      guias.filter(
        (g) =>
          (especie.length === 0 || especie.includes(g.especie ?? "")) &&
          (producto.length === 0 || producto.includes(g.producto ?? "")) &&
          (destino.length === 0 || destino.includes(g.destino ?? "")),
      ),
    [guias, especie, producto, destino],
  );
  /* Las opciones salen del período ENTERO: de lo ya filtrado, quitar un filtro
     no se podría hacer desde el propio desplegable. */
  const opciones = useMemo(() => {
    const contar = (get: (g: GuiaEmitida) => string | null) => {
      const m = new Map<string, number>();
      for (const g of guias) {
        const v = (get(g) ?? "").trim();
        if (!v) continue;
        m.set(v, (m.get(v) ?? 0) + 1);
      }
      return [...m.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    };
    return {
      especies: contar((g) => g.especie),
      productos: contar((g) => g.producto),
      destinos: contar((g) => g.destino),
    };
  }, [guias]);

  const resumen = useMemo(() => resumirGuias(delFiltro), [delFiltro]);

  /* Los filtros y las cifras, plegables (Brandon 05-10): el botón va en la fila
     del título; con el período en cero queda sólo la tarjeta del total. */
  const filtros = (
    <CtpKpiFiltros
        campos={[
          {
            key: "especie",
            label: "Especie",
            todos: "Todas las especies",
            valor: especie,
            opciones: opciones.especies.map((o) => ({ value: o.value, label: o.value, hint: `${o.count} guía${o.count === 1 ? "" : "s"}` })),
            onChange: setEspecie,
          },
          {
            key: "producto",
            label: "Producto",
            todos: "Todos los productos",
            valor: producto,
            opciones: opciones.productos.map((o) => ({ value: o.value, label: o.value, hint: `${o.count} guía${o.count === 1 ? "" : "s"}` })),
            onChange: setProducto,
          },
          {
            key: "destino",
            label: "Destino",
            todos: "Todos los destinos",
            valor: destino,
            opciones: opciones.destinos.map((o) => ({ value: o.value, label: o.value, hint: `${o.count} guía${o.count === 1 ? "" : "s"}` })),
            onChange: setDestino,
          },
        ]}
        onLimpiar={() => { setEspecie([]); setProducto([]); setDestino([]); }}
        nota={
          [especie, producto, destino].some((v) => v.length > 0)
            ? `Las cifras y la lista muestran sólo ${[
                especie.length > 0 ? `especie: ${especie.join(" o ")}` : "",
                producto.length > 0 ? `producto: ${producto.join(" o ")}` : "",
                destino.length > 0 ? `destino: ${destino.join(" o ")}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}`
            : null
        }
      />
  );
  const kpis = useKpisPlegables({
    claveMemoria: "ctp-guias",
    filtros,
    filtrosActivos: [especie, producto, destino].filter((v) => v.length > 0).length,
    resumen:
      resumen.total === 0
        ? "Sin guías emitidas en el período"
        : `${resumen.total} guía${resumen.total === 1 ? "" : "s"} · ${resumen.incompletas} a medio llenar · ${resumen.sinVerificar} sin verificar${resumen.sinOrigen > 0 ? ` · ${resumen.sinOrigen} sin origen` : ""}`,
    tarjetas: [
        <StatCard key="total" density="compact" label="Guías emitidas" value={String(resumen.total)} subValue={etiquetaPeriodo} icon={FileText} emphasis="neutral" />,
      ...(resumen.total > 0
        ? [
          <StatCard key="listas"
            density="compact"
            label="Listas para imprimir"
            value={String(resumen.completas)}
            subValue={resumen.completas === resumen.total - resumen.anuladas ? "todas completas" : "con todos sus datos"}
            icon={Check}
            emphasis="success"
          />,
          <StatCard key="medio"
            density="compact"
            label="A medio llenar"
            value={String(resumen.incompletas)}
            subValue={resumen.incompletas > 0 ? "no se pueden imprimir así" : "ninguna pendiente"}
            icon={AlertTriangle}
            emphasis={resumen.incompletas > 0 ? "warning" : "neutral"}
          />,
          <StatCard key="verificar"
            density="compact"
            label="Sin verificar en SERFOR"
            value={String(resumen.sinVerificar)}
            subValue={resumen.sinVerificar > 0 ? "lo primero que mira un control" : "todas verificadas"}
            icon={AlertTriangle}
            emphasis={resumen.sinVerificar > 0 ? "warning" : "success"}
          />,
          <StatCard key="origen"
            density="compact"
            label="Amparan madera sin origen"
            value={String(resumen.sinOrigen)}
            subValue={resumen.sinOrigen > 0 ? "el documento ya salió" : "todas con origen declarado"}
            icon={AlertTriangle}
            emphasis={resumen.sinOrigen > 0 ? "warning" : "success"}
          />,
          ]
        : []),
    ],
  });

  return { kpis, delFiltro, resumen };
}
