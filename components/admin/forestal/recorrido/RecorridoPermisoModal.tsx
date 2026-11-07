"use client";

import { useMemo } from "react";
import { FolderOpen, Loader2, RefreshCw, Route, Save } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import type { DistribucionRegistro } from "@/lib/forestal/distribucion-registro";
import type { BloqueDistribuido } from "@/lib/forestal/cubicacion-reparto";
import { botonRegistrar, ESTADO_EN_PANTALLA, pasosEnOrden, textoEjecutados } from "@/lib/forestal/recorrido-pantalla";
import type { EstadoRecorrido } from "@/lib/forestal/recorrido-permiso";
import { useDatosParaSerfor } from "../hooks/use-datos-para-serfor";
import { useRecorridoPermiso } from "../hooks/use-recorrido-permiso";
import RecorridoAccionPaso, { tieneAccion, type AccionesDelRecorrido } from "./recorrido-accion-paso";
import RecorridoCabecera from "./recorrido-cabecera";
import RecorridoPaso from "./recorrido-paso";

/**
 * «Recorrido del permiso» de un bloque (ADR-519, fase 4): los 6 pasos del
 * permiso a la salida, con su estado DERIVADO del Libro (el servidor lo lee en
 * cada apertura; cerrar y volver sigue desde `siguiente`) y la acción de cada
 * uno. Sólo lote y jornadas los hace el servidor; el resto abre el flujo que
 * ya existe.
 */

type AccionesBase = Omit<AccionesDelRecorrido, "registrar" | "pasoDelBoton" | "ejecutando" | "onRegistrar" | "serfor" | "distribucionId" | "anexoGuardadoId">;

export default function RecorridoPermisoModal({
  bd,
  distribucionId,
  hoy,
  puedeDeclarar,
  acciones,
  guardarDistribucion,
  guardando,
  errorGuardar,
  buscandoGuardada,
  guardadaExistente,
  abrirGuardada,
  aboveModals,
  onEjecutado,
  onClose,
}: {
  bd: BloqueDistribuido;
  distribucionId: string | null;
  hoy: string;
  puedeDeclarar: boolean;
  acciones: AccionesBase;
  /** Sin distribución guardada no hay recorrido: el botón la guarda. */
  guardarDistribucion?: () => void;
  guardando?: boolean;
  /** El servidor rechazó el guardado (409 «se está registrando una jornada», duplicado…). */
  errorGuardar?: string | null;
  /** Buscando si el bloque ya está en una distribución guardada. */
  buscandoGuardada?: boolean;
  /** La guardada que ya tiene este bloque: se abre, nunca se guarda otra. */
  guardadaExistente?: DistribucionRegistro | null;
  abrirGuardada?: (d: DistribucionRegistro) => void;
  aboveModals?: boolean;
  /** El servidor escribió lote o jornadas: la pantalla trae lo escrito. */
  onEjecutado: (estado: EstadoRecorrido | null) => void;
  onClose: () => void;
}) {
  /* Lo que el bloque ampara y sus días, tal como los reparte la pantalla (los mismos de «Registrar jornadas»). */
  const r = useRecorridoPermiso(distribucionId, bd.bloque.id, { usadoM3: bd.usadoM3, porDia: bd.porDia });
  const serfor = useDatosParaSerfor(r.estado, acciones.piezas, Boolean(distribucionId));
  const pasos = useMemo(() => pasosEnOrden(r.estado), [r.estado]);
  const registrar = botonRegistrar(r.estado, puedeDeclarar);
  const lote = pasos.find((p) => p.paso === "lote");
  const pasoDelBoton = lote?.estado === "hecho" || lote?.estado === "no_aplica" ? "jornadas" : "lote";

  const onRegistrar = async () => {
    const e = await r.ejecutar("jornadas");
    onEjecutado(e);
  };

  const a: AccionesDelRecorrido | null = distribucionId
    ? {
        ...acciones,
        distribucionId,
        onCambio: () => {
          acciones.onCambio();
          void r.recargar();
        },
        registrar,
        pasoDelBoton,
        ejecutando: r.ejecutando,
        onRegistrar: () => void onRegistrar(),
        serfor,
        anexoGuardadoId: pasos.find((p) => p.paso === "anexo")?.ids[0],
      }
    : null;

  /* El resultado por paso: lo que quedó de lote y jornadas tras el POST. */
  const delServidor = pasos.filter((p) => p.paso === "lote" || p.paso === "jornadas");
  const resumen = r.resultado?.ok
    ? [textoEjecutados(r.resultado.ejecutados ?? []), delServidor.map((p) => `${p.titulo}: ${ESTADO_EN_PANTALLA[p.estado].etiqueta.toLowerCase()}`).join(" · ")]
        .filter(Boolean)
        .join(" ")
    : null;
  /* Con un paso en problema o que quedó pendiente no se celebra: va como nota neutra, el motivo está en su paso. */
  const conProblema = delServidor.some((p) => p.estado === "con_problema" || p.estado === "pendiente");
  const etiqueta = bd.bloque.etiqueta || "sin etiqueta";
  const permiso = r.estado?.permiso ?? bd.bloque.permiso ?? null;

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Recorrido del permiso"
      description={`${permiso ?? "Sin permiso"} · ${r.estado?.especie ?? bd.bloque.especie ?? ""} · bloque ${etiqueta}`}
      icon={Route}
      size="xl"
      aboveModals={aboveModals}
      footer={
        <ModalFooter
          error={r.resultado && !r.resultado.ok ? r.resultado.mensaje : r.estado ? r.error : null}
          aviso={resumen && !conProblema ? `Registrado en el Libro. ${resumen}` : undefined}
          nota={resumen && conProblema ? `Se registró hasta donde se pudo. ${resumen}` : undefined}
        >
          {distribucionId && (
            <button type="button" onClick={() => { void r.recargar(); serfor.recargar(); }} disabled={r.cargando || r.ejecutando} className={button({ variant: "secondary" })}>
              {r.cargando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              Volver a leer
            </button>
          )}
          <button type="button" onClick={onClose} disabled={r.ejecutando} className={button({ variant: "primary" })}>
            Cerrar
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`} data-recorrido-bloque={bd.bloque.id}>
        {!distribucionId ? (
          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            {buscandoGuardada ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando la distribución guardada…
              </span>
            ) : guardadaExistente && abrirGuardada ? (
              <>
                <span className="block">Este bloque ya está en la distribución guardada «{guardadaExistente.nombre}»: ábrela para ver su recorrido.</span>
                <button type="button" data-recorrido-abrir-guardada={guardadaExistente.id} onClick={() => abrirGuardada(guardadaExistente)} className={button({ variant: "primary" })}>
                  <FolderOpen className="h-4 w-4" aria-hidden /> Abrir la guardada
                </button>
              </>
            ) : (
              <>
                <span className="block">El recorrido se lee de la distribución guardada: guárdala y vuelve a abrir este bloque.</span>
                {guardarDistribucion && (
                  <button type="button" onClick={guardarDistribucion} disabled={guardando} className={button({ variant: "primary" })}>
                    {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} Guardar la distribución
                  </button>
                )}
              </>
            )}
            {errorGuardar && (
              <span role="alert" className="block font-bold text-[var(--data-error-ink)]">
                {errorGuardar}
              </span>
            )}
          </div>
        ) : !r.estado && r.cargando ? (
          <span className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo el Libro…
          </span>
        ) : !r.estado ? (
          <div className="space-y-3">
            <span role="alert" className="block text-sm font-bold text-[var(--data-error-ink)]">
              {r.error ?? "No se pudo leer el recorrido."}
            </span>
            <button type="button" onClick={() => void r.recargar()} className={button({ variant: "secondary" })}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Volver a intentar
            </button>
          </div>
        ) : (
          <>
            <RecorridoCabecera estado={r.estado} hoy={hoy} />
            <ol className="space-y-2" aria-label="Pasos del recorrido">
              {pasos.map((p) => (
                <RecorridoPaso key={p.paso} paso={p} actual={r.estado?.siguiente === p.paso}>
                  {a && tieneAccion(p, a) ? <RecorridoAccionPaso paso={p} a={a} /> : null}
                </RecorridoPaso>
              ))}
            </ol>
          </>
        )}
      </div>
    </AdminModal>
  );
}
