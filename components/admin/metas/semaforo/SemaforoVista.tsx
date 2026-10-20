"use client";

/**
 * SemaforoVista — `?tab=metas-logros&vista=semaforo` (ADR-508).
 *
 * El tablero de una mirada: cada indicador del negocio en verde, amarillo o
 * rojo con lo que hay que hacer en una línea. Las cifras se miden en el
 * servidor (`GET /api/admin/semaforo`); acá sólo se dibujan y se eligen el
 * período y los umbrales (Ajustes).
 *
 * Antes del día de lanzamiento lo que hay son ventas de prueba: el aviso lo
 * dice y el chip «Desde el lanzamiento» mide desde ese día cuando ya pasó
 * (antes de esa fecha el chip mide los últimos 90 días).
 */
import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { FlaskConical, Gauge, RefreshCw, Settings2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { AvisoDeCarga } from "@/components/admin/metas/AvisoDeCarga";
import { claseChip, TEXTO_TONO } from "@/components/admin/metas/clases-meta";
import { button } from "@/components/ui-system/button-variants";
import { contarColores, diaMes, type PeriodoId } from "@/lib/semaforo/evaluar";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSemaforo } from "./use-semaforo";
import { TarjetaIndicador } from "./TarjetaIndicador";
import { AjustesSemaforoModal } from "./AjustesSemaforoModal";

const BOTON_ICONO = button({ variant: "ghost", size: "icon", className: "shrink-0 rounded-xl" });

export function SemaforoVista() {
  const [periodo, setPeriodo] = useState<PeriodoId>("semana");
  const [ajustes, setAjustes] = useState(false);
  const { datos, cargando, error, sinPermiso, recargar, guardar } = useSemaforo(periodo);
  const indicadores = datos?.indicadores ?? [];
  const n = contarColores(indicadores);
  const lanzamiento = datos?.lanzamiento ?? null;
  const yaLanzo = !!lanzamiento && !!datos && lanzamiento <= datos.hoy;
  const chips: Array<{ id: PeriodoId; label: string }> = [
    { id: "semana", label: "7 días" },
    { id: "mes", label: "30 días" },
    { id: "lanzamiento", label: yaLanzo ? "Desde el lanzamiento" : "90 días" },
  ];
  const resumen = [
    n.verde && `${n.verde} en verde`,
    n.amarillo && `${n.amarillo} amarillo${n.amarillo > 1 ? "s" : ""}`,
    n.rojo && `${n.rojo} en rojo`,
    n.sin_meta + n.sin_dato > 0 && `${n.sin_meta + n.sin_dato} en gris`,
  ].filter(Boolean);

  return (
    <div data-semaforo-vista className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Gauge aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" />
        <CardTitle className="text-sm font-bold tabular-nums">
          {datos && resumen.length > 0 ? resumen.join(" · ") : "Semáforo del negocio"}
        </CardTitle>
        <InfoTip
          title="Semáforo del negocio"
          what="Tus números de siempre con un color: verde va bien, amarillo hay que mirarlo esta semana, rojo hay que actuar ya. Cada tarjeta dice qué hacer."
          body="Se mide con lo que el sistema ya registra: ventas y pedidos, costo, gastos, stock, bajas y celulares de clientes. Gris = falta tu meta (ponla en Ajustes) o no hay datos en el período."
          example="«Ticket promedio S/ 72 · Rojo: ofrecer combos siempre». Toca el ⓘ de cada tarjeta para ver su regla."
        />
        {datos && (
          <span className="text-sm text-[var(--text-secondary)] tabular-nums">
            {diaMes(datos.desde)} – {diaMes(datos.hasta)}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            className={BOTON_ICONO}
            aria-label="Ajustes del semáforo"
            title="Ajustes: metas, lanzamiento, caja y productos A"
            disabled={!datos || sinPermiso}
            onClick={() => setAjustes(true)}
          >
            <Settings2 aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={BOTON_ICONO}
            aria-label="Volver a medir"
            title={datos ? `Volver a medir (medido a las ${formatTime(datos.medidoEn)})` : "Volver a medir"}
            disabled={cargando || sinPermiso}
            onClick={() => void recargar(true)}
          >
            <RefreshCw aria-hidden="true" className={cn("h-4 w-4", cargando && "animate-spin motion-reduce:animate-none")} />
          </button>
        </span>
      </div>

      {!sinPermiso && (
        <div role="group" aria-label="Período" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={periodo === c.id}
              className={cn(claseChip(periodo === c.id), "h-12 px-3")}
              onClick={() => setPeriodo(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {datos?.antesDelLanzamiento && lanzamiento && (
        <p role="status" className={cn("flex flex-wrap items-center gap-1.5 text-sm font-semibold", TEXTO_TONO.aviso)}>
          <FlaskConical aria-hidden="true" className="h-4 w-4 shrink-0" />
          Datos de prueba: el negocio arranca el {diaMes(lanzamiento)}.
          <InfoTip
            title="Antes del lanzamiento"
            what="Las ventas de antes de ese día son pruebas (cajas, mercadería sin recibir): los colores todavía no dicen cómo va el negocio."
            affects="Desde el día del lanzamiento, el chip «Desde el lanzamiento» mide sólo lo real."
            example="Cambia el día en Ajustes si arrancas antes o después."
          />
        </p>
      )}
      {datos?.configInvalida && (
        <p role="status" className={cn("text-sm font-semibold", TEXTO_TONO.error)}>
          Tus ajustes guardados no se pudieron leer: se ven los valores por defecto. Guárdalos de nuevo en Ajustes.
        </p>
      )}

      <AvisoDeCarga error={error} sinPermiso={sinPermiso} onReintentar={() => void recargar(true)} que="el semáforo del negocio" />

      {datos && indicadores.length === 0 && <p className="text-sm text-[var(--text-secondary)]">Todos los indicadores están apagados.</p>}
      {indicadores.length > 0 && (
        <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3", cargando && "opacity-70 transition-opacity")}>
          {indicadores.map((ind) => (
            <TarjetaIndicador key={ind.id} ind={ind} />
          ))}
        </div>
      )}

      {datos && ajustes && (
        <AjustesSemaforoModal
          abierto={ajustes}
          guardada={datos.config}
          hoy={datos.hoy}
          onCerrar={() => setAjustes(false)}
          onGuardar={guardar}
        />
      )}
    </div>
  );
}

export default SemaforoVista;
