"use client";

/**
 * «Datos listos» del grupo que se lleva al cubicador (ADR-519, fase 0).
 *
 * El lote por bloque rechaza lo que no llegó o no tiene permiso, y hasta hoy
 * el dueño se enteraba al fallar (Blas, 27-10: 14 guías, 7 con permiso, 0 con
 * recepción). Acá se cuenta ANTES, con un botón por problema que abre el modal
 * que ya existe: «Recibir la madera» (propone la fecha de cada guía y se puede
 * cambiar) y «Corregir ingreso» (código de origen = el permiso).
 *
 * Autocontenido para que la fase 4 lo use de paso 0 del recorrido: entra el
 * grupo (`trozaIds`) y el patio; avisa con `onCambio` para que se relea.
 */

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { datosListosDelGrupo, type FaltanteDelGrupo } from "@/lib/forestal/datos-listos-grupo";
import { faltaRecibirMadera } from "@/lib/forestal/recepcion-guias";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { logger } from "@/lib/logger";
import type { GuiaParaBloque } from "../CtpRecepcionBloqueModal";
import { leerGuias, paraBloque } from "../hooks/use-abrir-arreglo";
import type { WoodEntry } from "../ctp-shared";

const CtpRecepcionBloqueModal = dynamic(() => import("../CtpRecepcionBloqueModal"), { ssr: false });
const CtpIngresoEditModal = dynamic(() => import("../CtpIngresoEditModal"), { ssr: false });

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const MUESTRA = 4;

function guiasEnPocas(guias: readonly string[]): string {
  return guias.length <= MUESTRA ? guias.join(", ") : `${guias.slice(0, MUESTRA).join(", ")} y ${guias.length - MUESTRA} más`;
}

function Fila({
  titulo,
  f,
  ayuda,
  boton,
  ocupado,
  onClick,
}: {
  titulo: string;
  f: FaltanteDelGrupo;
  ayuda: { what: string; affects: string; example?: string };
  boton: string;
  ocupado: boolean;
  onClick: () => void;
}) {
  return (
    <li className="grid gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0 text-sm text-[var(--text-secondary)]">
        <p className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
          {titulo}
          <InfoTip icono="ayuda" title={titulo} {...ayuda} />
        </p>
        <p className="tabular-nums">
          {plural(f.guias.length, "guía", "guías")} · {plural(f.trozas, "troza", "trozas")} · {fmtM3(f.m3)} m³
          {f.guias.length > 0 && <span className="text-[var(--text-tertiary)]"> · {guiasEnPocas(f.guias)}</span>}
        </p>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={ocupado || f.guias.length === 0}
        className={button({ variant: "secondary" })}
      >
        {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {ocupado ? "Abriendo…" : boton}
      </button>
    </li>
  );
}

export default function DatosListosDelGrupo({
  trozaIds,
  patio,
  onCambio,
}: {
  /** Las trozas del grupo que se lleva (de los candidatos: patio y por recepcionar). */
  trozaIds: readonly string[];
  /** El patio que ya trajo Capacidad. */
  patio: readonly TrozaConsumible[];
  /** Algo se arregló: que Capacidad vuelva a leer. */
  onCambio: () => void;
}) {
  const datos = useMemo(() => datosListosDelGrupo(trozaIds, patio), [trozaIds, patio]);
  const [abriendo, setAbriendo] = useState<"recibir" | "permiso" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aRecibir, setARecibir] = useState<GuiaParaBloque[] | null>(null);
  const [cola, setCola] = useState<WoodEntry[]>([]);
  const [total, setTotal] = useState(0);

  if (trozaIds.length === 0) return null;

  const abrir = async (que: "recibir" | "permiso") => {
    setError(null);
    setAbriendo(que);
    try {
      if (que === "recibir") {
        const guias = (await leerGuias(datos.sinRecepcion.guias)).filter((g) => faltaRecibirMadera(g)).map(paraBloque);
        if (guias.length === 0) setError("Esas guías ya figuran recibidas: se vuelve a revisar.");
        else setARecibir(guias);
      } else {
        const asientos = (await leerGuias(datos.sinPermiso.guias))
          .flatMap((g) => g.lineas)
          .filter((l) => !String(l.originCode ?? "").trim());
        if (asientos.length === 0) setError("Esas guías ya tienen permiso en el libro: se vuelve a revisar.");
        else {
          setCola(asientos);
          setTotal(asientos.length);
        }
      }
    } catch (e) {
      logger.warn("[datos-listos] no se pudo abrir el arreglo", { error: String(e) });
      setError("No se pudo abrir: vuelve a intentar.");
    } finally {
      setAbriendo(null);
    }
  };

  const cambio = () => {
    invalidarCtp("wood-entries");
    onCambio();
  };

  return (
    <>
      {datos.listo ? (
        <p className="flex items-center gap-2 rounded-xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2 text-sm font-bold text-[var(--text-primary)]">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden />
          Datos listos
          <InfoTip
            icono="ayuda"
            title="Datos listos"
            what={`Las ${plural(datos.trozas, "troza", "trozas")} de este grupo ya llegaron y tienen permiso.`}
            affects="Con eso el bloque puede armar su lote en el Libro."
          />
        </p>
      ) : (
        <div className="rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
            Faltan datos para armar el lote
            <InfoTip
              icono="ayuda"
              title="Por qué se pide antes"
              what="El lote del bloque rechaza la madera que no llegó al patio o que no dice de qué permiso sale."
              affects="Puedes llevarlo igual: el bloque se arma, pero esas trozas no entrarán al lote hasta arreglarlo."
            />
          </p>
          <ul className="space-y-3">
            {datos.sinRecepcion.trozas > 0 && (
              <Fila
                titulo="Guías sin recibir"
                f={datos.sinRecepcion}
                ayuda={{
                  what: "Sin fecha de recepción la troza figura «por recepcionar» y no se puede aserrar.",
                  affects: "Se propone la fecha de cada guía y la puedes cambiar antes de guardar.",
                  example: "Guía 0000006 salió el 02/09: se propone esa fecha, no la de hoy.",
                }}
                boton="Recibir la madera"
                ocupado={abriendo === "recibir"}
                onClick={() => void abrir("recibir")}
              />
            )}
            {datos.sinPermiso.trozas > 0 && (
              <Fila
                titulo="Guías sin permiso"
                f={datos.sinPermiso}
                ayuda={{
                  what: "Sin permiso no se sabe qué título ampara esa madera ni en qué bloque entra.",
                  affects: "Se corrige el ingreso de cada guía: pones el código del permiso y queda en el historial.",
                }}
                boton="Poner el permiso"
                ocupado={abriendo === "permiso"}
                onClick={() => void abrir("permiso")}
              />
            )}
          </ul>
          {datos.noEncontradas > 0 && (
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              {plural(datos.noEncontradas, "troza ya no está", "trozas ya no están")} en el patio de este período.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              {error}
            </p>
          )}
        </div>
      )}

      {aRecibir && (
        <CtpRecepcionBloqueModal
          aboveModals
          guias={aRecibir}
          preseleccion={aRecibir.map((g) => g.clave)}
          onClose={() => setARecibir(null)}
          onListo={() => {
            setARecibir(null);
            cambio();
          }}
        />
      )}

      {cola.length > 0 && (
        <CtpIngresoEditModal
          key={cola[0].id}
          aboveModals
          entry={cola[0]}
          onClose={() => {
            const huboAvance = cola.length < total;
            setCola([]);
            if (huboAvance) cambio();
          }}
          onSaved={() => {
            const resto = cola.slice(1);
            setCola(resto);
            if (resto.length === 0) cambio();
          }}
        />
      )}
    </>
  );
}
