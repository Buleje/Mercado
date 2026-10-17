"use client";

/**
 * Reportes comparativos (Mi Plata › Comparar) — un mes de Lima contra el
 * pasado o contra el mismo mes del año anterior.
 *
 * Bug 11-10: leía `/api/admin/dashboard?from&to`, que ignora el rango y trae
 * listas, no totales → todo S/ 0,00 y «NaN%» (Pedidos = `Number([…])`), con 1
 * venta real en octubre en `main`. Ahora lee `/api/finanzas/comparativo`, que
 * calcula todo en el servidor con la regla de ingresos de Mi Plata. Lo que no
 * se puede calcular llega `null` y se muestra «—»: nunca «NaN» ni «+100 %»
 * desde cero.
 *
 * Patrón del panel: el título lo pone `BloqueMudado` (no se repite acá); el
 * selector y «⋯» en una fila; «Cambio» y «Tendencia» decían el mismo % dos
 * veces y quedaron en una columna. El gráfico de barras ponía soles, pedidos y
 * % en el mismo eje (S/ 0,10 junto a 1 pedido): no comparaba nada y se fue —
 * la tabla dice lo mismo con su unidad.
 */

import { DataTable } from "@buleje/design-system";
import { useCallback, useEffect, useState } from "react";
import { Minus, MoreHorizontal, RefreshCw, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/format";
import { variacion, type Contra, type PeriodoComparativo } from "@/lib/finance/comparativo-periodos";

type Clave = Exclude<keyof PeriodoComparativo, "mes">;

const METRICAS: { key: Clave; label: string; tipo: "plata" | "numero" | "pct"; subirEsBueno: boolean }[] = [
  { key: "ventas", label: "Ventas", tipo: "plata", subirEsBueno: true },
  { key: "transacciones", label: "Ventas y pedidos", tipo: "numero", subirEsBueno: true },
  { key: "ticketPromedio", label: "Ticket promedio", tipo: "plata", subirEsBueno: true },
  { key: "margen", label: "Margen bruto", tipo: "pct", subirEsBueno: true },
  { key: "clientesNuevos", label: "Clientes nuevos", tipo: "numero", subirEsBueno: true },
  { key: "fiadoDado", label: "Fiado dado", tipo: "plata", subirEsBueno: false },
];

const OPCIONES: { value: Contra; label: string }[] = [
  { value: "mes_pasado", label: "vs. mes pasado" },
  { value: "mismo_mes_anyo", label: "vs. hace un año" },
];

/* Meses escritos a mano (`Intl` cambia por versión de ICU; en Perú, «setiembre»). */
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
function nombreMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const nombre = MESES[m - 1] ?? mes;
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${y}`;
}

function valor(tipo: "plata" | "numero" | "pct", v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (tipo === "plata") return formatCurrency(v);
  if (tipo === "pct") return `${v.toFixed(1)} %`;
  return formatNumber(v);
}

interface Respuesta {
  contra: Contra;
  actual: PeriodoComparativo;
  base: PeriodoComparativo;
}

function Cambio({ cambio, subirEsBueno }: { cambio: number | null; subirEsBueno: boolean }) {
  if (cambio == null) {
    return (
      <span className="text-sm text-[var(--text-tertiary)]" title="Sin base para comparar: el otro mes está en cero o sin dato">
        —
      </span>
    );
  }
  const quieto = Math.abs(cambio) < 0.5;
  const bueno = subirEsBueno ? cambio > 0 : cambio < 0;
  const Icono = quieto ? Minus : cambio > 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm font-bold tabular-nums",
        quieto ? "text-[var(--text-secondary)]" : bueno ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]",
      )}
    >
      <Icono className="h-4 w-4" aria-hidden />
      {cambio > 0 ? "+" : ""}
      {cambio.toFixed(1)} %
    </span>
  );
}

export default function ComparativeReportsTab() {
  const [contra, setContra] = useState<Contra>("mes_pasado");
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await fetch(`/api/finanzas/comparativo?contra=${contra}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDatos((await res.json()) as Respuesta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "sin conexión");
    } finally {
      setCargando(false);
    }
  }, [contra]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const vigente = datos?.contra === contra ? datos : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl value={contra} onChange={setContra} options={OPCIONES} size="lg" label="Comparar contra" />
        <InfoTip
          title="Reportes comparativos"
          what="El mes en curso contra el mes pasado o contra el mismo mes del año anterior. Ventas = ventas del mostrador + pedidos concretados, igual que el Resumen de Mi Plata."
          affects="El margen sólo cuenta las ventas que guardaron su costo. «—» = no hay con qué comparar (el otro mes está en cero)."
          example="Si en setiembre no vendiste nada y en octubre S/ 50, el cambio sale «—»: desde cero no hay porcentaje que diga algo."
        />
        <div className="ml-auto">
          <ActionMenu
            label="Más"
            icon={MoreHorizontal}
            soloIcono
            size="md"
            className="w-12 shrink-0"
            actions={[{ id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => void cargar() }]}
          />
        </div>
      </div>

      {error && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-error-ink)]">
          No se pudo cargar la comparación ({error}).
          <button type="button" onClick={() => void cargar()} className="min-h-12 rounded-xl px-3 underline">
            Reintentar
          </button>
        </p>
      )}

      {!error && cargando && !vigente && <p className="py-6 text-sm text-[var(--text-secondary)]">Cargando la comparación…</p>}

      {!error && vigente && (
        <DataTable zebra aria-busy={cargando}>
          <thead>
            <tr>
              <th>Métrica</th>
              <th className="text-right">{nombreMes(vigente.actual.mes)}</th>
              <th className="text-right">{nombreMes(vigente.base.mes)}</th>
              <th className="text-right">Cambio</th>
            </tr>
          </thead>
          <tbody>
            {METRICAS.map((m) => {
              const a = vigente.actual[m.key];
              const b = vigente.base[m.key];
              return (
                <tr key={m.key}>
                  <td className="font-semibold">{m.label}</td>
                  <td className="text-right font-bold tabular-nums">{valor(m.tipo, a)}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{valor(m.tipo, b)}</td>
                  <td className="text-right">
                    <Cambio cambio={variacion(a, b)} subirEsBueno={m.subirEsBueno} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
