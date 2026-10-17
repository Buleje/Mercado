"use client";

/**
 * RendimientoAserradero — Herramientas › Rendimiento (plan 08-10, e1-e6).
 *
 * Una vista, un título, cuatro pestañas internas:
 *   · Por especie  — ponderado, rango PROPIO aprendido, regla y tendencia (e1, e2).
 *   · Por corrida  — estado contra las otras de su especie, plata, salto al Libro (e1, e3, e4, e6).
 *   · Simulador    — lote del cubicador → PT aserrado esperado (e5).
 *   · Calculadora  — el coeficiente a mano, como siempre.
 * Excel y PDF en el menú «⋯» (e6). Todo sale de UNA lectura
 * (`GET /api/admin/forestal/ctp/rendimiento`): los totales los arma el servidor.
 *
 * Lo que no hay se dice: corridas de un lote en proceso salen «parcial»
 * (Blas, 08-10: 5 de 5 con fin 01-11) y la plata que falta sale «falta …»,
 * nunca S/ 0.
 */
import { useMemo } from "react";
import { FileSpreadsheet, FileText, Gauge, Loader2, RefreshCw } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { logger } from "@/lib/logger";
import { fechaConDia } from "@/lib/forestal/loth-plan-costeo";
import { exportarRendimientoExcel, imprimirRendimiento } from "@/lib/forestal/rendimiento-export";
import { TOPE_GUIAS_PLATA, TOPE_PLATA_CORRIDAS, textoPlataNoLeida } from "@/lib/forestal/rendimiento-especie";
import CalculadoraRendimiento from "./CalculadoraRendimiento";
import RendimientoPorEspecie from "./rendimiento-por-especie";
import RendimientoPorCorrida from "./rendimiento-por-corrida";
import RendimientoSimulador from "./rendimiento-simulador";
import { CeldaPlata, fmtPct } from "./rendimiento-compartido";
import { useRendimientoAserradero } from "./hooks/use-rendimiento-aserradero";

type Vista = "especie" | "corrida" | "simulador" | "calculadora";
const VISTAS: { value: Vista; label: string }[] = [
  { value: "especie", label: "Por especie" },
  { value: "corrida", label: "Por corrida" },
  { value: "simulador", label: "Simulador" },
  { value: "calculadora", label: "Calculadora" },
];

export default function RendimientoAserradero() {
  const [guardada, setVista] = useLocalStorage<Vista>("forestal-rendimiento-vista", "especie");
  /* Una vista recordada que ya no existe abre «Por especie», no una pantalla vacía. */
  const vista: Vista = VISTAS.some((v) => v.value === guardada) ? guardada : "especie";
  const { datos, cargando, error, recargar } = useRendimientoAserradero({ plata: true });
  const t = datos?.total;
  const finParcial = useMemo(
    () => datos?.corridas.filter((c) => c.parcial && c.finProceso).map((c) => c.finProceso as string).sort().at(-1) ?? null,
    [datos],
  );

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      {/* Cabecera en una fila: título, pestañas internas y el menú. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="order-1 flex items-center gap-1.5">
          <Gauge className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">Rendimiento del aserradero</CardTitle>
          <InfoTip
            title="Rendimiento del aserradero"
            what="m³ aserrados ÷ m³ de troza de cada corrida del Libro CTP, por especie y por corrida, contra TU rango de cada especie."
            affects="Las corridas de un lote en proceso salen «parcial»: no se juzgan ni enseñan rango."
          />
        </span>
        {/* En el celular el «⋯» queda en la fila del título y las pestañas bajan enteras. */}
        <SegmentedControl value={vista} onChange={setVista} options={VISTAS} size="sm" label="Vista del rendimiento" className="order-3 w-full sm:order-2 sm:ml-auto sm:w-auto" />
        <span className="order-2 ml-auto sm:order-3 sm:ml-0">
          <ActionMenu
            label="Opciones del rendimiento"
            soloIcono
            actions={[
              { id: "excel", label: "Descargar Excel", icon: FileSpreadsheet, disabled: !datos, onSelect: () => {
                  if (datos) exportarRendimientoExcel(datos).catch((err: unknown) => logger.error("[rendimiento] no se pudo armar el Excel", { error: String(err) }));
                } },
              { id: "pdf", label: "Imprimir o guardar PDF", icon: FileText, disabled: !datos, onSelect: () => datos && imprimirRendimiento(datos) },
              { id: "recargar", label: "Volver a leer el Libro", icon: RefreshCw, onSelect: recargar },
            ]}
          />
        </span>
      </div>

      {/* Las cifras en una línea: el ponderado manda, el resto lo acompaña. */}
      {t && (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-[var(--text-secondary)]">
          <span className="inline-flex items-baseline gap-1">
            <b className="font-mono text-xl font-extrabold tabular-nums text-[var(--text-primary)]">{fmtPct(t.ponderadoPct, 2)}</b>
            ponderado{t.enProceso > 0 ? " · parcial" : ""}
            <InfoTip
              title="Ponderado, no promedio"
              what={`Σ m³ aserrados ÷ Σ m³ de troza: ${t.m3Salida.toLocaleString("es-PE")} ÷ ${t.m3Entrada.toLocaleString("es-PE")} m³.`}
              affects={`El promedio simple de los % da ${fmtPct(t.promedioSimplePct, 2)}: pesa igual una corrida de 6 m³ que una de 29 m³. No es un error de unidades.`}
            />
          </span>
          <span>
            {t.corridas} {t.corridas === 1 ? "corrida" : "corridas"}
            {t.enProceso > 0 && <> · {t.enProceso} en proceso{finParcial && datos ? ` hasta el ${fechaConDia(finParcial, datos.hoy)}` : ""}</>}
          </span>
          {datos?.plataVisible && t.plata && (
            <>
              <span className="inline-flex items-baseline gap-1">
                Comercial <CeldaPlata plata={t.plata} campo="comercial" />
                <InfoTip
                  title="Rendimiento comercial"
                  what="PT aserrado ÷ PT Oxapampa pagado: cuánto de lo que pagaste salió como tabla."
                  affects="«≈» = el PT pagado (m³ × 424 × 0,624, factor Oxapampa) o el PT aserrado (m³ × 424, paquete sin PT medido) salen de un m³, no de lo medido."
                />
              </span>
              <span className="inline-flex items-baseline gap-1">
                Costo por PT <CeldaPlata plata={t.plata} campo="costo" />
              </span>
            </>
          )}
        </div>
      )}

      {t && t.enProceso > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--rule-strong)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">
          {t.enProceso === t.corridas ? `Las ${t.corridas} corridas son` : `${t.enProceso} de ${t.corridas} corridas son`} de lotes en proceso: su rendimiento es parcial.
          <InfoTip
            title="Rendimiento parcial"
            what="Entró toda la troza programada del lote y salió lo declarado hasta hoy: el número sube a medida que declaras la producción."
            affects="No es el rendimiento de la sierra. No se marca «bajo», no entra al rango de la especie ni al radar."
          />
        </p>
      )}

      {datos?.plataVisible && datos.plataTruncada && (
        <p className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--rule-strong)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">
          {textoPlataNoLeida(datos.plataTruncada)}
          <InfoTip
            title="Plata no leída"
            what={`Para no frenar la pantalla, la plata se arma con las ${TOPE_PLATA_CORRIDAS} corridas más recientes y hasta ${TOPE_GUIAS_PLATA} guías por lectura. Lo que queda fuera dice «No leída».`}
            affects="El costo total queda sin calcular: sumar sólo lo leído daría el costo de una parte presentado como el de todo."
          />
        </p>
      )}

      {cargando && !datos && vista !== "calculadora" && (
        <p className="flex items-center gap-2 py-8 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo el Libro CTP…
        </p>
      )}
      {error && vista !== "calculadora" && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--data-error-500)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
          <button type="button" onClick={recargar} className="font-bold underline">Reintentar</button>
        </p>
      )}

      {datos && vista === "especie" && <RendimientoPorEspecie datos={datos} />}
      {datos && vista === "corrida" && <RendimientoPorCorrida datos={datos} onCambio={recargar} />}
      {datos && vista === "simulador" && <RendimientoSimulador especies={datos.especies} />}
      {vista === "calculadora" && (
        <CalculadoraRendimiento
          libro={t ? { ponderadoPct: t.ponderadoPct, corridas: t.corridas, enProceso: t.enProceso } : null}
          libroError={!!error}
        />
      )}
    </section>
  );
}
