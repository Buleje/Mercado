"use client";

/**
 * TramitePermisoBloque — el permiso del oficio (Brandon 08-10: «un oficio por
 * permiso»). Se elige con `SelectorContrato` (el código que traen las guías o,
 * si no, el permiso activo del chip, como propuesta) y al elegirlo el titular,
 * el RUC y el representante salen del permiso (`datosDelPermiso`), no de la
 * Ficha CTP. Si al permiso le falta el titular o el RUC, lo dice y ofrece
 * completarlo en su ficha (en otra pestaña: lo llenado acá no se pierde).
 *
 * Sólo escribe cuando se ELIGE (o se propone) un permiso: al reabrir un oficio
 * guardado no pisa lo que se corrigió a mano.
 *
 * El N° de expediente del permiso (ADR-487) va al título de la carta. El
 * permiso no tiene casillero para él: se escribe acá una vez y las cartas
 * siguientes del mismo permiso lo traen solas (de su última carta guardada).
 */

import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { ExternalLink, TriangleAlert } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { DatosTramite } from "@/lib/forestal/tramites-catalogo";
import { datosDelPermiso, faltasDelPermiso, type FichaDelOficio } from "@/lib/forestal/tramites-permiso";
import { expedienteDelPermiso, type TramiteConDatos } from "@/lib/forestal/tramites-carta";
import SelectorContrato from "./SelectorContrato";
import { CTP_MODULE_TAB_ID, Field, I } from "./ctp-shared";
import { claseFalta } from "./TramiteRelacionGuiaFila";
import { PARAM_CONTRATO } from "./ficha-del-permiso-url";
import { useTramitePermiso } from "./hooks/use-tramite-permiso";

const FALTA_TEXTO = { titular: "titular confirmado", ruc: "RUC" } as const;

/** «Sin contrato» elegido a mano: se recuerda para que abrir el papel en grande (remonta el panel) no vuelva a proponer el del chip. */
const SIN_PERMISO = "sin";

export default function TramitePermisoBloque({
  datos,
  setDatos,
  ficha,
  editando,
  tramites,
  idActual,
  proponerActivo = true,
}: {
  datos: DatosTramite;
  setDatos: Dispatch<SetStateAction<DatosTramite>>;
  ficha: FichaDelOficio | null;
  /** Se reabrió un oficio guardado: el chip no propone (respeta un «sin permiso» de entonces). */
  editando: boolean;
  /** Las cartas guardadas: de la última del mismo permiso sale su N° de expediente. */
  tramites: readonly TramiteConDatos[];
  idActual: string | null;
  /** Proponer el permiso activo del chip si las guías no dicen ninguno (sólo la relación). */
  proponerActivo?: boolean;
}) {
  const elegido = datos.permisoContratoId?.trim() ?? "";
  const contratoId = elegido && elegido !== SIN_PERMISO ? elegido : null;
  const { contrato, parte, listo, error } = useTramitePermiso(contratoId);
  /** Se eligió (o se propuso) un permiso y falta volcarlo cuando termine de cargar. */
  const aplicar = useRef(false);
  /** El expediente que se puso solo: si se cambia de permiso, se reemplaza (uno tipeado a mano, no). */
  const expedienteAuto = useRef<string | null>(null);
  const sugerido = useMemo(
    () => expedienteDelPermiso(tramites, { contratoId, codigo: datos.permisoCodigo }, idActual),
    [tramites, contratoId, datos.permisoCodigo, idActual],
  );

  const onChange = useCallback(
    (id: string | null) => {
      aplicar.current = Boolean(id);
      setDatos((p) => (id ? { ...p, permisoContratoId: id } : { ...p, permisoContratoId: SIN_PERMISO, permisoCodigo: "" }));
    },
    [setDatos],
  );

  useEffect(() => {
    if (!aplicar.current || !contrato || !listo) return;
    aplicar.current = false;
    const exp = expedienteDelPermiso(tramites, { contratoId: contrato.id, codigo: contrato.codigo }, idActual);
    setDatos((p) => {
      const conPermiso = { ...p, ...datosDelPermiso(contrato, parte, ficha, p) };
      const actual = (p.expediente ?? "").trim();
      /* Vacío o puesto solo por el permiso anterior → el de este permiso (o vacío). Tipeado a mano → se respeta. */
      if (actual && actual !== expedienteAuto.current) return conPermiso;
      expedienteAuto.current = exp?.expediente ?? null;
      return { ...conPermiso, expediente: exp?.expediente ?? "" };
    });
  }, [contrato, parte, listo, ficha, setDatos, tramites, idActual]);

  const faltan = contrato && listo ? faltasDelPermiso(contrato, parte, ficha) : [];
  const expediente = (datos.expediente ?? "").trim();
  const enlace = contrato ? `/admin?tab=${CTP_MODULE_TAB_ID}&vista=contratos&${PARAM_CONTRATO}=${encodeURIComponent(contrato.id)}` : "";

  return (
    <div className="mb-4 space-y-2 sm:col-span-2">
      <SelectorContrato
        id="tramite-permiso"
        label="Permiso del oficio"
        value={contratoId}
        onChange={onChange}
        codigoSugerido={datos.permisoCodigo?.trim() || null}
        sugerirActivo={proponerActivo && !editando && elegido !== SIN_PERMISO}
        hint="Titular, RUC y representante salen de este permiso."
      />
      {error && <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
      {faltan.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          <span>Al permiso le falta: {faltan.map((f) => FALTA_TEXTO[f]).join(" y ")}.</span>
          <a
            href={enlace}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 font-bold text-[var(--accent-ink)] underline underline-offset-2 dark:text-[var(--accent)]"
          >
            Completarlo <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          <InfoTip
            title="Completar el permiso"
            what="Se abre la ficha del permiso en Libro CTP › Contratos, en otra pestaña: lo que llenaste acá no se pierde."
            affects="Mientras tanto, escribe el dato a mano en el casillero marcado."
          />
        </p>
      )}
      {(contratoId || datos.permisoCodigo?.trim()) && (
        <Field
          label="N° de expediente del permiso"
          hint={
            expediente && sugerido && expediente === sugerido.expediente
              ? `Sale de tu carta ${sugerido.desde}. Va en el título de la carta.`
              : expediente
                ? "Va en el título de la carta y en las próximas de este permiso."
                : "Falta: escríbelo acá una vez y las próximas cartas de este permiso lo traen solas."
          }
        >
          <input
            id="tramite-expediente-permiso"
            className={expediente ? I : claseFalta(I)}
            value={datos.expediente ?? ""}
            placeholder="Ej. 2025-0012345"
            onChange={(e) => {
              const v = e.target.value;
              expedienteAuto.current = null;
              setDatos((p) => ({ ...p, expediente: v }));
            }}
          />
        </Field>
      )}
    </div>
  );
}
