"use client";

/**
 * Qué trato tiene el cliente elegido, en una línea (ADR-430).
 *
 * Va al lado del selector de cliente —Declarar producción, Cobrar aserrío,
 * el cubicador—: es lo que explica el importe ANTES de verlo. Sin trato se
 * dice qué rige en su lugar; leyendo o con error, se dice también, porque un
 * silencio ahí se lee como «no tiene precio».
 *
 * Si el trato de aserrío existe pero EMPIEZA DESPUÉS de esta fecha, se avisa
 * fuerte y con arreglo de un clic: así nacieron las 6 corridas de WASACO sin
 * precio (Blas, 23-09) — la línea decía en gris «no tiene precio pactado para
 * ese día» y se declaró igual. El botón adelanta el trato a esta fecha y cobra
 * lo que haya quedado sin cobrar desde ahí (`arreglarTrato`).
 *
 * Antes del clic se dice QUÉ más cobra y cuánto: la propuesta del servidor
 * para esa fecha (`GET …/vigencia?desde=`), la misma que cobra el POST. Sin
 * ella el botón no se habilita (revisión 23-09: cobraba y recotizaba a ciegas).
 * Si el trato no pone precio a la madera que se declara, no se ofrece.
 */
import { useState } from "react";
import { Loader2 } from "@buleje/design-system/icons";
import { arreglarTrato, useArregloTrato } from "@/hooks/use-arreglo-trato";
import { tarifaVigente, type GrupoEspecies, type ServicioPrecio } from "@/lib/forestal/precio-cliente";
import { esIsoValido, etiquetaLarga, hoyEnLima } from "@/lib/forestal/semana-de-registro";
import type { BloqueACobrar } from "@/lib/forestal/tarifa-aserrio";
import { tratoEnPalabras, vigenciaEnPalabras } from "@/lib/forestal/trato-en-palabras";
import {
  diaDelBoton,
  primeraVersion,
  textoDelAdelanto,
  textoDelResultado,
  tratoCubre,
} from "@/lib/forestal/trato-sin-cobrar";
import CtpCorridasDelArreglo from "./CtpCorridasDelArreglo";
import { Btn } from "./ctp-shared";
import type { TratoDelCliente } from "./hooks/use-trato-del-cliente";

/** Un mensaje de ESTE cliente: al elegir otro no queda bajo su trato. */
type DelCliente = { parteId: string; texto: string } | null;

export default function CtpLineaDelTrato({
  trato,
  servicio,
  fecha,
  grupos,
  nombre,
  parteId,
  bloques = [],
  queMadera = "esta madera",
}: {
  trato: Pick<TratoDelCliente, "tarifas" | "cargando" | "error">;
  servicio: ServicioPrecio;
  fecha: string;
  grupos: readonly GrupoEspecies[];
  nombre: string;
  /** El cliente elegido: los mensajes de un clic son suyos y la propuesta se pide para él. */
  parteId: string;
  /** Lo que se cobraría: decide si el trato pone precio a algo de esta madera. Vacío = no se sabe todavía. */
  bloques?: readonly BloqueACobrar[];
  /** Cómo se nombra lo que se cobra («esta madera», «la corrida más vieja»). */
  queMadera?: string;
}) {
  const [enviando, setEnviando] = useState(false);
  const [errorAdelanto, setErrorAdelanto] = useState<DelCliente>(null);
  /* Sobrevive a la relectura del trato: después del clic la línea pasa a
     «Precio pactado…» y esto dice qué más se cobró. */
  const [hecho, setHecho] = useState<DelCliente>(null);

  const leido = !trato.cargando && !trato.error;
  const vigente = leido ? tarifaVigente(trato.tarifas, servicio, fecha) : null;
  const primera = leido && !vigente && servicio === "aserrio" ? primeraVersion(trato.tarifas, "aserrio") : null;
  const empiezaDespues =
    primera != null && primera.parteId === parteId && esIsoValido(fecha) && fecha < primera.vigenteDesde;
  const ofrecer = primera != null && empiezaDespues && tratoCubre(primera, bloques, grupos);
  const arreglo = useArregloTrato(ofrecer ? parteId : null, { desde: fecha });
  /* La propuesta de ESTE cliente y ESTA fecha, nunca la del pedido anterior. */
  const propuesta =
    arreglo.propuesta && arreglo.propuesta.parteId === parteId && arreglo.propuesta.desde === fecha
      ? arreglo.propuesta
      : null;
  const hoy = hoyEnLima();

  const clase = "text-xs leading-snug";
  if (trato.cargando) {
    return <p className={`${clase} text-[var(--text-tertiary)]`}>Leyendo el precio pactado con {nombre}…</p>;
  }
  if (trato.error) {
    return (
      <p className={`${clase} font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}>
        No se pudo leer el precio pactado con {nombre}.{servicio === "aserrio" ? " Pon el precio a mano." : ""}
      </p>
    );
  }
  if (!vigente) {
    if (primera && empiezaDespues && !ofrecer) {
      return (
        <p className={`${clase} text-[var(--text-tertiary)]`}>
          El trato con {nombre} empieza el {etiquetaLarga(primera.vigenteDesde)} y no pone precio a la especie de{" "}
          {queMadera}: rige la tarifa de la planta.
        </p>
      );
    }
    if (primera && ofrecer) {
      const adelantar = async () => {
        setEnviando(true);
        setErrorAdelanto(null);
        try {
          const r = await arreglarTrato({ parteId, tarifaId: primera.id, desde: fecha });
          const { cobros } = textoDelResultado(r);
          setHecho({
            parteId,
            texto:
              `Listo: el trato con ${nombre} rige desde el ${etiquetaLarga(fecha)}.` +
              (cobros ? ` Además${cobros.startsWith("se ") ? "" : ","} ${cobros}.` : ""),
          });
        } catch (e) {
          setErrorAdelanto({ parteId, texto: e instanceof Error ? e.message : String(e) });
        } finally {
          setEnviando(false);
        }
      };
      const errorVisible = errorAdelanto?.parteId === parteId ? errorAdelanto.texto : arreglo.error;
      return (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-2.5 py-1.5 dark:bg-[var(--data-warning-500)]/12"
        >
          <div className={`${clase} min-w-0 grow basis-56 space-y-0.5`}>
            <p className="font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              El trato con {nombre} empieza el {etiquetaLarga(primera.vigenteDesde)} y {queMadera} es del{" "}
              {etiquetaLarga(fecha)}: con él no se cobra.
            </p>
            <p className="text-[var(--text-secondary)]">
              {propuesta
                ? textoDelAdelanto(propuesta.arreglo, hoy)
                : arreglo.error
                  ? null
                  : "Revisando qué más cobraría adelantarlo…"}
            </p>
            {propuesta?.arreglo && <CtpCorridasDelArreglo a={propuesta.arreglo} hoy={hoy} />}
            {errorVisible && (
              <p className="font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{errorVisible}</p>
            )}
          </div>
          <Btn size="sm" disabled={enviando || !propuesta} onClick={() => void adelantar()}>
            {(enviando || (arreglo.cargando && !propuesta)) && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Empezar el trato el {diaDelBoton(fecha, hoy)}
          </Btn>
        </div>
      );
    }
    return (
      <p className={`${clase} text-[var(--text-tertiary)]`}>
        {nombre} no tiene precio pactado de {servicio === "aserrio" ? "aserrío" : "venta"} para ese día
        {servicio === "aserrio" ? ": rige la tarifa de la planta." : "."}
      </p>
    );
  }
  return (
    <>
      <p className={`${clase} text-[var(--text-secondary)]`}>
        <b className="text-[var(--text-primary)]">Precio pactado</b> ({vigenciaEnPalabras(vigente)}):{" "}
        <span className="font-medium tabular-nums">{tratoEnPalabras(vigente, grupos)}</span>.{" "}
        {servicio === "aserrio" ? "Se usa donde no haya precio a mano." : "Se sugiere en cada especie."}
      </p>
      {hecho?.parteId === parteId && (
        <p role="status" className={`${clase} font-medium text-[var(--data-success-700)] dark:text-[var(--data-success-500)]`}>
          {hecho.texto}
        </p>
      )}
    </>
  );
}
