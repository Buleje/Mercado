"use client";

/**
 * «Esta guía ya la guardaste» — el aviso del alta de ingreso (ADR-442).
 *
 * Brandon (2026-09-27): guardar la guía antes de que llegue el camión y que,
 * «al realizar el ingreso de madera, se pongan automáticos los documentos pre
 * guardados según el N° de registro». Los papeles se enlazan solos en el
 * servidor (documentos del Drive etiquetados con la GTF); lo que le toca al
 * formulario es que la persona VEA que sus papeles ya están y no vuelva a
 * tipear lo que guardó.
 *
 * Dos piezas:
 *   · `useGuiaGuardadaPorClave` reconoce la guía mientras se tipea el N° de
 *     registro o el N° de GTF (espera 400 ms, ignora respuestas viejas);
 *   · `CtpAvisoGuiaGuardada` es la línea compacta junto al campo, con ⓘ y
 *     «Usar sus datos». Si la guía ya entró al libro, avisa en ámbar:
 *     registrarla de nuevo duplicaría la madera.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Check, FolderOpen } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { claveGtf, claveRegistro, type GuiaGuardadaDetalle } from "@/lib/forestal/guias-guardadas";
import { formatDateNumeric, formatWeekday, SIN_DATO } from "@/lib/format";

/** Casilleros de papeles de una guía guardada (factura, remisión, trozas, GTF…). */
const CASILLEROS = 6;
/** Menos que esto no es un número todavía: no se pregunta por cada tecla. */
const MIN_CARACTERES = 3;
const ESPERA_MS = 400;

/** ¿Lo tipeado es el N° de registro o el N° de GTF de esta guía? */
export function coincideConGuia(g: GuiaGuardadaDetalle, texto: string): boolean {
  const r = claveRegistro(texto);
  if (r && claveRegistro(g.numeroRegistro) === r) return true;
  const gtf = claveGtf(texto);
  return Boolean(gtf && claveGtf(g.gtfNumber) === gtf);
}

/**
 * «sábado 26/09» de un instante (cuándo se guardó), en la hora de Lima. Si es
 * de otro año, con el año corto. Para fechas del libro (sin hora) va
 * `fechaDelLibro`, que las lee en UTC.
 */
export function diaDeLima(iso: string | null | undefined): string {
  const numero = formatDateNumeric(iso);
  if (numero === SIN_DATO) return SIN_DATO;
  const dia = formatWeekday(iso, { largo: true }).toLowerCase();
  const [dd, mm, aaaa] = numero.split("/");
  const esteAnio = formatDateNumeric(new Date()).slice(-4);
  return aaaa === esteAnio ? `${dia} ${dd}/${mm}` : `${dia} ${dd}/${mm}/${aaaa.slice(2)}`;
}

/** Lo que respondió el servidor, con el texto que lo pidió y en qué vuelta. */
type Hallada = { q: string; vuelta: number; guia: GuiaGuardadaDetalle | null };

/**
 * La guía guardada que corresponde a lo tipeado, o null.
 *
 * `desdeFuera` es la que llegó con el modal (la vista de Ingresos la pasa al
 * tocar «Ingresar»): se reconoce sin preguntar. Tampoco se vuelve a preguntar
 * por la última encontrada mientras lo tipeado siga siendo suya — al pasar de
 * la GTF (carga manual) al N° de registro (SERFOR) es la misma guía.
 *
 * Respuestas viejas: cada una vuelve con el texto que la pidió y sólo cuenta
 * si ése sigue siendo el del campo; además, la anterior se aborta.
 *
 * `registrados` = ingresos registrados con este modal abierto («Guardar y
 * otro»). Al registrar, lo sabido queda viejo: la guía que era «por ingresar»
 * ya entró, y si se vuelve a tipear su número el aviso tiene que decirlo.
 */
export function useGuiaGuardadaPorClave(
  clave: string,
  desdeFuera: GuiaGuardadaDetalle | null | undefined,
  registrados: number,
): GuiaGuardadaDetalle | null {
  const q = clave.trim();
  const [hallada, setHallada] = useState<Hallada | null>(null);
  const vigente = hallada?.vuelta === registrados ? hallada : null;

  const conocida =
    [registrados === 0 ? (desdeFuera ?? null) : null, vigente?.guia ?? null].find(
      (g): g is GuiaGuardadaDetalle => g != null && coincideConGuia(g, q),
    ) ?? null;
  const yaSabida = conocida != null || vigente?.q === q;

  useEffect(() => {
    if (yaSabida || q.length < MIN_CARACTERES) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/admin/forestal/guias/guardadas?buscar=${encodeURIComponent(q)}`, {
        credentials: "include",
        signal: ctrl.signal,
      })
        // Sin permiso, sin la ruta o con error: no hay aviso. Nunca traba el alta.
        .then((r) => (r.ok ? (r.json() as Promise<{ guia?: GuiaGuardadaDetalle | null }>) : null))
        .then((j) => setHallada({ q, vuelta: registrados, guia: j?.guia ?? null }))
        .catch((err: unknown) => {
          if (!ctrl.signal.aborted) console.warn("[wood-form] búsqueda de guía guardada falló", err);
        });
    }, ESPERA_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, yaSabida, registrados]);

  if (conocida) return conocida;
  return vigente?.q === q ? vigente.guia : null;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

interface Props {
  guia: GuiaGuardadaDetalle;
  /** Sus datos ya están en el formulario: vino con el modal, se tocó «Usar sus datos» o es la guía consultada. */
  puesta: boolean;
  onUsar: () => void;
}

export default function CtpAvisoGuiaGuardada({ guia, puesta, onUsar }: Props) {
  const identidad = [
    guia.numeroRegistro && `N° de registro ${guia.numeroRegistro}`,
    guia.gtfNumber && `GTF ${guia.gtfNumber}`,
    guia.titularNombre,
    guia.permisoCodigo && `permiso ${guia.permisoCodigo}`,
  ]
    .filter(Boolean)
    .join(" · ");

  if (guia.ingreso) {
    const { en, asientos } = guia.ingreso;
    return (
      <div
        role="status"
        className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-2.5 py-2 text-sm font-medium text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/12"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 grow basis-48">
          Esta guía ya entró al libro el {diaDeLima(en)} — registrarla de nuevo la duplicaría
        </span>
        <InfoTip
          title="Esta guía ya está en el libro"
          ariaLabel="Por qué no conviene registrarla otra vez"
          what={<span>Entró el {diaDeLima(en)} como {plural(asientos, "asiento", "asientos")}. La guía guardada se queda con sus papeles.</span>}
          affects={<span>Registrarla otra vez pondría la misma madera dos veces en el libro. Si el ingreso quedó mal, corrígelo en Ingresos.</span>}
          example={<span>{identidad}</span>}
        />
      </div>
    );
  }

  const faltan = Math.max(0, CASILLEROS - guia.docsLlenos);
  return (
    <div
      role="status"
      className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2.5 py-2 text-sm text-[var(--text-primary)]"
    >
      <FolderOpen className="h-4 w-4 shrink-0 text-[var(--accent-dark)] dark:text-[var(--accent)]" aria-hidden="true" />
      <span className="min-w-0 grow basis-48">
        <strong className="font-semibold">Guía guardada</strong> · {guia.docsLlenos} de {CASILLEROS} documentos — se enlazan
        solos al registrar
      </span>
      <InfoTip
        title="Guía guardada"
        ariaLabel="Qué pasa con los papeles de la guía guardada"
        what={
          <span>
            La guardaste antes de que llegue el camión
            {guia.carpeta.length > 0 ? <>, con sus papeles en Documentos › {guia.carpeta.join(" › ")}</> : null}.
          </span>
        }
        affects={
          <span>
            Al registrar este ingreso con la GTF {guia.gtfNumber}, sus papeles aparecen solos en el ingreso: no hay que
            volver a subirlos.
            {faltan > 0 ? ` Le ${faltan === 1 ? "falta 1" : `faltan ${faltan}`}: súbelos cuando lleguen.` : ""}
            {guia.verificadaEnSerfor ? " La guía se vuelve a pedir a SERFOR al registrar; si no responde, vale la ficha guardada." : ""}
          </span>
        }
        example={<span>{identidad}</span>}
      />
      {puesta ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--data-success-ink)]">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Datos puestos
        </span>
      ) : (
        <button
          type="button"
          onClick={onUsar}
          className="inline-flex h-9 shrink-0 items-center rounded-lg border border-[var(--accent)] px-3 text-sm font-semibold text-[var(--accent-dark)] transition-colors hover:bg-[var(--surface-raised)] dark:text-[var(--accent)]"
        >
          Usar sus datos
        </button>
      )}
    </div>
  );
}
