"use client";

/**
 * ADR-504 · Los dos «no» de la plata por permiso, dichos como aviso con salida
 * y no como error genérico:
 *
 * - `GUIA_SIN_PERMISO_FRENA`: el mismo N° entró también SIN permiso. Puede ser
 *   la misma guía y pagarse dos veces, así que nada se paga hasta asignarle su
 *   permiso. El botón abre «Declarar título» de esa guía (el mismo del libro:
 *   sólo llena los casilleros vacíos, los ingresos con permiso no se tocan).
 * - `GUIA_EN_OTRO_PERMISO`: choque con el índice viejo (ya hay un abono o una
 *   guía guardada con ese N° en otro permiso). Se habilita cuando la cuenta se
 *   separe por permiso; no hay nada que el usuario pueda corregir hoy.
 *
 * Con cualquier otro código no pinta nada: la pantalla muestra su error.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { Contrato } from "@/lib/forestal/contratos";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { logger } from "@/lib/logger";
import CtpTrozasDeclararTitulo from "./ctp-trozas-declarar-titulo";

export const FRENA_SIN_PERMISO = "GUIA_SIN_PERMISO_FRENA";
export const EN_OTRO_PERMISO = "GUIA_EN_OTRO_PERMISO";

/** ¿Este código del servidor es uno de los avisos de permiso? */
export const esAvisoDePermiso = (codigo: string | null | undefined): codigo is string =>
  codigo === FRENA_SIN_PERMISO || codigo === EN_OTRO_PERMISO;

export default function AvisoPlataPorPermiso({
  gtf,
  codigo,
  mensaje,
  onAsignado,
}: {
  gtf: string;
  codigo: string | null | undefined;
  /** El texto entero del servidor: va en el ⓘ. */
  mensaje: string;
  /** Se le asignó el permiso: la pantalla relee la plata (y su bandeja). */
  onAsignado: (aviso: string) => void;
}) {
  const [asignando, setAsignando] = useState(false);
  if (!esAvisoDePermiso(codigo)) return null;
  const frena = codigo === FRENA_SIN_PERMISO;

  return (
    <div
      role="status"
      data-aviso-plata-permiso={codigo}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 dark:bg-[var(--data-warning-500)]/10"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
      {/* Texto corrido (no flex): el ⓘ sigue a la última palabra en vez de bajar a su propia línea. */}
      <span className="flex-[1_1_14rem] text-sm font-bold text-[var(--data-warning-ink)]">
        {frena
          ? `La GTF ${gtf} sin permiso frena el pago: asígnale su permiso primero `
          : `La GTF ${gtf} ya está anotada con otro permiso: se habilita cuando la cuenta se separe por permiso `}
        <InfoTip
          title={frena ? "Una guía sin permiso con el mismo N°" : "El mismo N° ya anotado en otro permiso"}
          what={mensaje}
          affects={
            frena
              ? "Mientras haya una GTF con este N° sin permiso, ningún pago de ese N° se guarda: podría ser la misma guía y pagarse dos veces."
              : "La cuenta todavía guarda un abono o una guía por N°, sin permiso. Cuando se separe por permiso (ADR-504) podrás anotarla. Nada se perdió."
          }
          example={
            frena
              ? "La GTF 4 del permiso 017 y una GTF 4 sin permiso: le asignas el permiso a la segunda y ya puedes pagar."
              : undefined
          }
        />
      </span>
      {frena && (
        <button
          type="button"
          onClick={() => setAsignando(true)}
          className={button({ variant: "primary", className: "ml-auto" })}
          data-asignar-permiso
        >
          <ShieldAlert className="h-4 w-4" aria-hidden /> Asignar permiso
        </button>
      )}
      {asignando && (
        <AsignarPermiso
          gtf={gtf}
          onCerrar={() => setAsignando(false)}
          onDeclarado={(aviso) => {
            setAsignando(false);
            onAsignado(aviso);
          }}
        />
      )}
    </div>
  );
}

/** «Declarar título» de la guía sin permiso, sobre la ventana de la plata. */
function AsignarPermiso({
  gtf,
  onCerrar,
  onDeclarado,
}: {
  gtf: string;
  onCerrar: () => void;
  onDeclarado: (aviso: string) => void;
}) {
  /* Los permisos del negocio para elegir de la lista; si no se leen, queda el código a mano. */
  const [contratos, setContratos] = useState<Contrato[]>([]);
  useEffect(() => {
    ctpGet<{ contratos?: Contrato[] }>("/api/admin/forestal/contratos")
      .then((j) => setContratos(j.contratos ?? []))
      .catch((err) => logger.warn("[plata-permiso] no se pudo leer los permisos", { error: String(err) }));
  }, []);

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Asignar permiso"
      description={`GTF ${gtf} · la que entró sin permiso`}
      icon={ShieldAlert}
      size="md"
      aboveModals
    >
      <div className={MODAL_BODY}>
        <CtpTrozasDeclararTitulo gtf={gtf} contratos={contratos} onDeclarado={onDeclarado} onCancelar={onCerrar} />
      </div>
    </AdminModal>
  );
}
