"use client";

/**
 * El tablero de «Resumen» de Mi Plata.
 *
 * Vivía dentro de `FinanzasModule.tsx`, que llegó a 1.420 líneas y mezclaba la
 * navegación del hub con el dibujo de sus ocho KPIs y sus nueve gráficos. Acá
 * queda el tablero solo; el módulo queda con la navegación sola.
 *
 * 2026-09-28: el tablero llegó a 1.037 líneas. Los datos pasaron a
 * `hooks/use-resumen-plata.ts` y cada bloque a `./resumen/`; este archivo
 * decide qué se ve y en qué orden.
 *
 * 2026-10-09: medía 5,26 pantallas. Arriba queda lo de hoy (caja, deudas,
 * indicadores del mes y el gráfico); el resto son bloques plegables y
 * recordados (`./resumen/BloquePlegable`) que plegados dicen su cifra.
 *
 * 2026-10-11: la primera pantalla contesta cuánto entró, salió y quedó en el
 * mes y qué falta (te deben, debes, la caja) en una franja (`CifrasDelMes`).
 * Se fueron el selector de período que no cambiaba nada, los avisos que
 * repetían tarjetas, los ocho indicadores (cuatro eran parte de otra cifra) y
 * «Comparar meses» (la misma serie de seis meses que el gráfico de acá y que
 * Resultado › Ganancias, con su propia sección en Comparar períodos). El
 * gráfico, plegado como los demás bloques.
 *
 * 2026-10-11 (tarde, «todo parejo»): los nueve bloques plegables apilados
 * pasaron a SEIS SECCIONES (`./resumen/SeccionesDelResumen`, `?sub=`), una a la
 * vista a la vez; la cabecera va en una fila (mes · ⓘ · secciones ·
 * Indicadores · «⋯») y las cinco cifras se pliegan con «Indicadores». El
 * auto-refresco dejó de remontar todo cada 5 min: recarga en silencio.
 */

import { CardTitle } from "@buleje/design-system";
import { useCallback, useMemo, useState } from "react";
import { BarChart3 } from "@buleje/design-system/icons";
import { useFavoriteCharts } from "@/hooks/use-favorite-charts";
import { useResumenPlata } from "@/hooks/use-resumen-plata";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { useCajaAbierta, efectivoConocido, type UsoCajaAbierta } from "@/hooks/use-caja-abierta";
import { calcHealthScore } from "@/components/admin/finanzas/shared";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { CuerpoDeSeccion } from "@/components/admin/inventario/movimientos/CabeceraVista";
import { formatCurrency } from "@/lib/currency";
import { formatMonthYear } from "@/lib/format";
import CabeceraDelResumen from "./resumen/CabeceraDelResumen";
import CifrasDelMes from "./resumen/CifrasDelMes";
import GraficosAmpliados from "./resumen/GraficosAmpliados";
import EsqueletoResumen from "./resumen/EsqueletoResumen";
import CajaDelResumen from "./resumen/CajaDelResumen";
import TeDebenYDebes from "./resumen/TeDebenYDebes";
import { BloquesEnSeccion } from "./resumen/BloquePlegable";
import ContenidoDeSeccion, { CLAVES_RESUMEN, ID_PANEL_RESUMEN, SECCIONES_RESUMEN } from "./resumen/SeccionesDelResumen";
import { useAutoActualizar } from "./resumen/use-auto-actualizar";

/** Por qué la liquidez no se puede medir, en palabras del dueño. */
function motivoSinLiquidez({ caja, error }: UsoCajaAbierta): string {
  if (error || !caja) return "no se pudo leer la caja";
  if (!caja.abierta) return "no hay caja abierta";
  return "la caja espera un saldo negativo";
}

/** Las cinco cifras de la franja: el botón «Indicadores» las cuenta. */
const CIFRAS = ["Entró", "Salió", "Quedó", "Te deben", "Debes"];

const soles = (v: number) => `${v < 0 ? "−" : ""}${formatCurrency(Math.abs(v), { decimals: 0 })}`;

export default function FinanzasDashboard() {
  const {
    loading, kpis, monthlyData, expensesByCategory, paymentMethods, cashFlow,
    topPayables, topFiados, projection, fiscal, healthData, deudas, recargar,
  } = useResumenPlata();
  const caja = useCajaAbierta();
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  const finFavs = useFavoriteCharts("finanzas");
  const { vista: seccion, irA: irASeccion } = useSubvistaModulo("plata-resumen", CLAVES_RESUMEN, "meses");

  /* «Actualizar» vuelve a pedir el tablero sin remontarlo (no vuelve el
     esqueleto) y renueva los bloques que piden lo suyo (fugas, semana). */
  const [vuelta, setVuelta] = useState(0);
  const recargarCaja = caja.recargar;
  const actualizar = useCallback(() => {
    recargar();
    recargarCaja();
    setVuelta((v) => v + 1);
  }, [recargar, recargarCaja]);
  const { autoActivo, alternarAuto } = useAutoActualizar(actualizar);

  // El efectivo es el esperado de la caja abierta, o no se sabe. Antes:
  // `ingresos * 0.3`, un número que nadie contó.
  const efectivo = efectivoConocido(caja.caja);
  const healthScore = useMemo(
    () => healthData ? calcHealthScore({ ...healthData, efectivo }) : null,
    [healthData, efectivo],
  );

  /* Las cinco cifras son el Resumen: arrancan abiertas, y plegadas el botón
     sigue diciendo lo que entró y lo que quedó (plegar no es esconder). */
  const indicadores = useKpisPlegables({
    claveMemoria: "plata-resumen-cifras",
    tarjetas: CIFRAS,
    resumen: `Entró ${soles(kpis.ingresos ?? 0)} · Quedó ${soles(kpis.utilidad ?? 0)}`,
    abiertoPorDefecto: true,
    alto: "md",
    soloIcono: true,
  });

  /* Lo vencido de la lista de deudores, en la pestaña «Deudas»: dónde hay que mirar. */
  const secciones = useMemo(() => {
    const vencidos = topPayables.filter((p) => p.vencido).length + topFiados.filter((f) => f.vencido).length;
    return SECCIONES_RESUMEN.map((s) => (s.clave === "deudas" && vencidos > 0 ? { ...s, cuenta: vencidos } : s));
  }, [topPayables, topFiados]);

  if (loading) return <EsqueletoResumen />;

  const mesNombre = formatMonthYear(new Date(), { largo: true });
  const mesCapitalized = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);

  // Empty state
  if (Object.values(kpis).every(v => v === 0) && monthlyData.every(m => m.ingresos === 0 && m.gastos === 0)) {
    return (
      <div className="space-y-4">
        {caja.caja?.abierta && <CajaDelResumen {...caja} />}
        {/* Sin ventas ni gastos del mes puede haber deudas igual: no se esconden. */}
        <TeDebenYDebes deudas={deudas} />
        <div className="text-center py-16">
        <div className="h-16 w-16 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="h-8 w-8 text-[var(--text-tertiary)] dark:text-muted" />
        </div>
        <CardTitle className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)]">Sin datos financieros</CardTitle>
        <p className="text-sm text-muted mt-1">Registra tus primeras ventas y gastos para ver el dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CabeceraDelResumen
        mes={mesCapitalized}
        secciones={
          <BarraDeSecciones
            secciones={secciones}
            activa={seccion}
            onCambiar={irASeccion}
            etiqueta="Secciones del resumen"
            idPanel={ID_PANEL_RESUMEN}
          />
        }
        indicadores={indicadores.boton}
        autoActivo={autoActivo}
        alternarAuto={alternarAuto}
        actualizar={actualizar}
      />

      {indicadores.abierto && (
        <CifrasDelMes
          kpis={kpis}
          monthlyData={monthlyData}
          deudas={deudas}
          vencidos={{ fiados: healthData?.fiadosVencidos ?? 0, pagos: healthData?.payablesVencidos ?? 0 }}
        />
      )}

      <CajaDelResumen {...caja} />

      <CuerpoDeSeccion panel={{ id: ID_PANEL_RESUMEN, etiquetadoPor: idPestanaDeSeccion(ID_PANEL_RESUMEN, seccion) }}>
        <BloquesEnSeccion.Provider value>
          <ContenidoDeSeccion
            seccion={seccion}
            d={{
              monthlyData, expensesByCategory, paymentMethods, cashFlow, projection, fiscal,
              topPayables, topFiados, healthScore, motivoSinLiquidez: motivoSinLiquidez(caja),
              finFavs, setExpandedChart, vuelta,
            }}
          />
        </BloquesEnSeccion.Provider>
      </CuerpoDeSeccion>

      <GraficosAmpliados
        expandedChart={expandedChart}
        setExpandedChart={setExpandedChart}
        monthlyData={monthlyData}
        cashFlow={cashFlow}
        expensesByCategory={expensesByCategory}
      />
    </div>
  );
}
