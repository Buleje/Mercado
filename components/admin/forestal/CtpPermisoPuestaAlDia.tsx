"use client";

/**
 * «Para poner al día» — arriba del Volumen de la ficha del permiso.
 *
 * Brandon (2026-09-25): «para que el permiso cuadre hay que hacer 4 cosas en
 * orden y cada una vive en una pantalla distinta. Con esto: en la ficha aparece
 * una lista con cada paso, cuántos faltan y un botón que te lleva directo; cada
 * paso se tacha solo al terminarlo».
 *
 * Los cuatro arreglos ya existían (ADR-434, 435, el precio en tanda y ADR-432):
 * acá sólo se abren acotados a ESTE permiso. Después de cada uno, `invalidarCtp()`
 * + `onRecargar()` de la ficha: llega un volumen nuevo y la lista se recalcula
 * sola (`usePuestaAlDia`). La regla de cada paso vive en
 * `lib/forestal/puesta-al-dia-del-permiso.ts`, testeada.
 *
 * Se monta sólo si queda algo por hacer: un «todo bien» permanente enseña a no
 * mirar (mismo criterio que `CtpPermisoAvisos`). Si en esta visita se terminó
 * el último paso, queda una línea que lo dice.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ListChecks, RefreshCw } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useMiRol } from "@/hooks/use-mi-rol";
import { nTrozas } from "@/lib/forestal/acomodar-trozas";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { textoDelActual, type ClavePaso, type PasoPuestaAlDia } from "@/lib/forestal/puesta-al-dia-del-permiso";
import type { VolumenDelPermiso } from "@/lib/forestal/volumen-del-permiso";
import CtpAcomodarTrozasModal from "./CtpAcomodarTrozasModal";
import CtpCorregirRecepcionModal from "./CtpCorregirRecepcionModal";
import CtpDescontarMaderaModal from "./CtpDescontarMaderaModal";
import CtpPonerPrecioModal from "./CtpPonerPrecioModal";
import CtpPuestaAlDiaPaso from "./CtpPuestaAlDiaPaso";
import { usePuestaAlDia } from "./hooks/use-puesta-al-dia";

const HAY_TRABAJO = new Set<PasoPuestaAlDia["estado"]>(["pendiente", "espera", "revisar", "error"]);

export default function CtpPermisoPuestaAlDia({
  volumen,
  onRecargar,
}: {
  volumen: VolumenDelPermiso;
  /** Vuelve a sumar la ficha: la lista se rehace con el volumen nuevo. */
  onRecargar?: () => void;
}) {
  const { lista, aCorregir, actualizando, reintentar } = usePuestaAlDia(volumen);
  const rol = useMiRol();
  /* `null` = todavía no se sabe: el botón se muestra y el servidor decide (no es el gate). */
  const firma = rol == null || rol === "admin" || rol === "owner" || rol === "superadmin";
  const [abierto, setAbierto] = useState<ClavePaso | null>(null);
  /* Lo que acaba de pasar, con su tono: una corrección que falló no va en verde. */
  const [hecho, setHecho] = useState<{ ok: boolean; texto: string } | null>(null);
  const [huboTrabajo, setHuboTrabajo] = useState(false);
  const hayTrabajo = lista.pasos.some((p) => HAY_TRABAJO.has(p.estado));
  const alcance = useMemo(() => ({ contratoId: volumen.contratoId }), [volumen.contratoId]);

  /* Estado derivado de un render anterior (patrón de React, sin efecto): si en
     esta visita hubo algo que hacer, al terminar se dice «quedó al día». */
  if (hayTrabajo && !huboTrabajo) setHuboTrabajo(true);

  const recargar = () => {
    invalidarCtp();
    onRecargar?.();
  };
  const abrir = (clave: ClavePaso) => {
    setHecho(null);
    setAbierto(clave);
  };

  if (!hayTrabajo) {
    if (!lista.alDia || !huboTrabajo) return null;
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--data-success-ink)]" aria-hidden />
        Este permiso quedó al día: fechas, trozas, precio y descuento en orden.
      </p>
    );
  }

  const actual = lista.actual;
  const titular = textoDelActual(lista);

  return (
    <section
      aria-labelledby="puesta-al-dia-titulo"
      data-vista="ctp-puesta-al-dia"
      className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--rule-soft)] px-3 py-2.5 sm:px-4">
        <ListChecks className="h-5 w-5 shrink-0 text-[var(--accent-ink)]" aria-hidden />
        <CardTitle as="h3" id="puesta-al-dia-titulo" className="text-base">
          Para poner al día
        </CardTitle>
        {actual && (
          <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-sm font-bold tabular-nums text-[var(--text-primary)]">
            {actual.numero} de {lista.pasos.length}
          </span>
        )}
        <InfoTip
          title="Para poner al día"
          what="Los arreglos que le faltan a este permiso para que su saldo cuadre, en orden. Cada botón abre el arreglo sólo con lo de este permiso; al terminarlo, el paso se tacha solo."
          affects="1 → 2 → 4 van en cadena: una corrida sólo descuenta troza que ya había llegado ese día (paso 1) y que está en la fila de su especie (paso 2). El precio (paso 3) va aparte: se pone cuando quieras y no frena nada."
          example="Abres el permiso: «1 de 4: corrige la fecha de llegada de 8 guías». Lo haces y pasa a «2 de 4»."
          ancho="w-96"
        />
        {actualizando && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> Actualizando…
          </span>
        )}
        <span className="sr-only" aria-live="polite">
          {titular}
        </span>
      </header>

      {hecho && (
        <p
          role="status"
          className={`flex items-start gap-2 border-b border-[var(--rule-soft)] px-3 py-2 text-sm text-[var(--text-primary)] sm:px-4 ${
            hecho.ok ? "bg-[var(--data-success-500)]/10" : "bg-[var(--data-warning-500)]/10"
          }`}
        >
          {hecho.ok ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-ink)]" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
          )}
          {hecho.texto}
        </p>
      )}

      <ol className="divide-y divide-[var(--rule-soft)]">
        {lista.pasos.map((p) => (
          <CtpPuestaAlDiaPaso
            key={p.clave}
            paso={p}
            esActual={actual?.clave === p.clave}
            firma={firma}
            onAbrir={() => abrir(p.clave)}
            onReintentar={reintentar}
          />
        ))}
      </ol>

      {abierto === "fecha" && (
        <CtpCorregirRecepcionModal
          guias={aCorregir}
          onClose={() => setAbierto(null)}
          onListo={(r) => {
            setAbierto(null);
            if (r.corregidas.length > 0) recargar();
            const ok = r.corregidas.length;
            const mal = r.fallaron.length;
            const fallas = r.fallaron.map((f) => `${f.gtfNumber}: ${f.motivo}`).join(" · ");
            setHecho({
              ok: mal === 0,
              texto:
                ok === 0
                  ? `No se corrigió ${mal === 1 ? "la guía" : `ninguna de las ${mal} guías`}. ${fallas}`
                  : `${ok === 1 ? "Se corrigió 1 guía" : `Se corrigieron ${ok} guías`}${mal > 0 ? ` · ${mal} no: ${fallas}` : "."}`,
            });
          }}
        />
      )}
      {abierto === "trozas" && (
        <CtpAcomodarTrozasModal
          alcance={alcance}
          descripcion={`Las guías de ${volumen.codigo}`}
          onClose={() => setAbierto(null)}
          onAcomodado={(r) => {
            recargar();
            setHecho({ ok: true, texto: `${nTrozas(r.movidas)} ${r.movidas === 1 ? "pasó" : "pasaron"} a la fila de su especie.` });
          }}
        />
      )}
      {abierto === "precio" && (
        <CtpPonerPrecioModal
          permiso={volumen.codigo}
          onClose={() => setAbierto(null)}
          onGuardado={() => {
            recargar();
            setHecho({ ok: true, texto: "Precio guardado: la Plata del permiso ya lo suma." });
          }}
        />
      )}
      {abierto === "descontar" && (
        <CtpDescontarMaderaModal
          volumen={volumen}
          ids={volumen.avisos.corridasSinMateriaPrima.ids}
          onCerrar={() => setAbierto(null)}
          onRecargar={onRecargar}
        />
      )}
    </section>
  );
}
