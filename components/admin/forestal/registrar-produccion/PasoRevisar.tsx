"use client";

/**
 * Paso 3 de «Registrar producción»: revisar y guardar. Lo que se va a guardar
 * en cifras, el rendimiento contra la materia prima, lo que falta para poder
 * guardar, los avisos (avisan, no impiden), el reparto entre títulos y el
 * cobro del aserrío. El botón de guardar sigue en el pie, igual que antes.
 */
import { AlertCircle, AlertTriangle, Gauge } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { RENDIMIENTO_PLAUSIBLE_MAX, RENDIMIENTO_PLAUSIBLE_MIN } from "@/lib/forestal/loctp-catalogos";
import CtpCobroAserrio from "../CtpCobroAserrio";
import { Bloque, Dato } from "./campos";
import type { RegistrarProduccionProps } from "./tipos";
import type { RegistrarProduccion } from "./use-registrar-produccion";

export default function PasoRevisar({
  r,
  p,
  montarCobro,
}: {
  r: RegistrarProduccion;
  p: RegistrarProduccionProps;
  /**
   * El cobro se monta la primera vez que se abre este paso y queda montado. En
   * la ventana vieja vivía dentro de «La corrida», plegada: su chequeo (tarifa
   * del dueño, trato) sólo corría al abrirla. Montarlo siempre podría trabar
   * el guardar por una tarifa que nadie miró.
   */
  montarCobro: boolean;
}) {
  const { fechaCorridaFija, cobroInicial } = p;
  const {
    totales,
    previo,
    acumulado,
    rendimientoPct,
    veredicto,
    paquetes,
    motivos,
    avisosDeCifras,
    reparto,
    dia,
    bloquesAserrio,
    aserrio,
    setAserrio,
    setAserrioValido,
    setDuenoTocado,
    setPrecioTocado,
  } = r;
  return (
    <div className="space-y-3">
      <Bloque titulo="Lo que se guarda">
        <div className="grid grid-cols-2 gap-3 @lg:grid-cols-4">
          <Dato label="Paquetes" valor={String(totales.paquetes)} />
          <Dato label="Piezas" valor={String(totales.piezas)} />
          <Dato
            label={previo > 0 ? "Volumen (se agrega)" : "Volumen"}
            valor={`${fmtM3(totales.volumen)} m³${previo > 0 ? ` · total ${fmtM3(acumulado)}` : ""}`}
          />
            <div className="text-sm">
              <span className="mb-1 block font-bold text-[var(--text-secondary)]">
                Rendimiento
              </span>
              <p
                className={`flex h-11 items-center gap-1.5 rounded-xl px-2.5 font-mono font-bold tabular-nums ${
                  veredicto.tono === "ok"
                    ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                    : veredicto.tono === "neutro"
                      ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                      : "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                }`}
              >
                <Gauge className="h-4 w-4" aria-hidden />
                {rendimientoPct != null ? `${rendimientoPct} %` : "—"}
              </p>
            </div>
        </div>

        {/* Lo que todavía impide guardar, completo: el pie sólo muestra el primero. */}
        {motivos.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-xl bg-[var(--data-error-500)]/10 px-3 py-2 text-sm font-semibold text-[var(--data-error-ink)]">
            {motivos.map((m) => (
              <li key={m} className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{m}</span>
              </li>
            ))}
          </ul>
        )}

        {/**
         * El tope avisa por ARRIBA; por abajo no avisaba nadie (D2).
         *
         * Un 22 % no rompe ninguna regla —se puede declarar— pero casi siempre
         * significa que falta cargar un paquete, y eso se descubría al mes
         * siguiente mirando el libro. El veredicto es el MISMO
         * `juzgarRendimientoConsumo` que usan los KPI y la tarjeta del lote: no
         * se inventa acá un segundo umbral.
         */}
        {paquetes.length > 0 &&
          rendimientoPct != null &&
          veredicto.tono !== "ok" &&
          veredicto.tono !== "neutro" && (
            <p
              className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
                veredicto.tono === "malo"
                  ? "bg-[var(--data-error-500)]/12 font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                  : "bg-[var(--data-warning-500)]/12 font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              }`}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {veredicto.tono === "malo"
                  ? `Rendimiento ${rendimientoPct} %: por encima del ${RENDIMIENTO_PLAUSIBLE_MAX} % que se ve en aserrío. Revisa que ningún paquete esté cargado de más.`
                  : `Rendimiento ${rendimientoPct} %: por debajo del ${RENDIMIENTO_PLAUSIBLE_MIN} % habitual en aserrío. ¿Falta declarar algún paquete? Se puede guardar igual — es un aviso, no un bloqueo.`}
              </span>
            </p>
          )}

        {/**
         * Cifras que no pueden ser: piezas contra volumen.
         *
         * El rendimiento de arriba mira el TOTAL contra la materia prima; esto
         * mira cada paquete contra sus propias piezas, que es donde la coma
         * corrida se esconde — declarar de menos nunca cruza un techo.
         *
         * Mismo cartel que el aviso de rendimiento (avisa, no impide) y el
         * mismo lugar: debajo de la tabla que se acaba de cargar.
         */}
        {avisosDeCifras.map((a, i) => (
          <p
            /* Con el índice: dos paquetes todavía sin código darían la misma
               clave y React dejaría de repintar el segundo aviso. */
            key={`${a.motivo}-${a.paquete ?? i}`}
            className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
              a.tono === "error"
                ? "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                : "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
            }`}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <b>{a.texto}</b>{" "}
              <span className="font-normal opacity-90">
                {a.sugerencia} Se puede guardar igual — es un aviso, no un bloqueo.
              </span>
            </span>
          </p>
        ))}

        {/* Reparto entre títulos habilitantes (ADR-358). */}
        {reparto.length > 1 && (
          <div className="mt-3 overflow-hidden rounded-xl border border-[var(--rule-base)]">
            <div className="flex items-center gap-1.5 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Cómo se reparte entre los títulos habilitantes
              <InfoTip
                title="Reparto entre títulos"
                what="Proporcional al volumen que puso cada uno: de una tabla no se puede decir de qué árbol salió."
                affects="Pero sí en qué proporción entró cada título."
              />
            </div>
            <ul className="divide-y divide-[var(--rule-soft)]">
              {reparto.map((o) => (
                <li
                  key={o.permiso ?? "sin"}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-1.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <b className="font-mono text-[var(--text-primary)]">
                      {o.permiso ?? "sin título declarado"}
                    </b>
                    <span className="ml-2 text-[var(--text-tertiary)]">
                      {o.piezas} pza · {fmtM3(o.volumenM3)} m³ de materia prima (
                      {o.pctMateriaPrima} %)
                    </span>
                  </span>
                  <span className="shrink-0 font-mono font-bold tabular-nums text-[var(--text-primary)]">
                    {fmtM3(o.produccionM3)} m³
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Bloque>

      {montarCobro && (
        <Bloque titulo="Cobro del aserrío">
        {/* De quién es esta madera y a qué precio se le asierra (ADR-412).
        Sobre TODOS los bloques declarados, no sólo los de esta tanda: es
        lo mismo que mide el rendimiento acumulado de arriba. */}
          <CtpCobroAserrio
            fecha={fechaCorridaFija ?? dia}
            bloques={bloquesAserrio}
            valor={aserrio}
            nombreGuardado={cobroInicial?.nombreGuardado}
            onValidez={setAserrioValido}
            onChange={(v, tocado) => {
              setAserrio(v);
              if (tocado.dueno) setDuenoTocado(true);
              if (tocado.precio) setPrecioTocado(true);
            }}
          />
        </Bloque>
      )}
    </div>
  );
}
