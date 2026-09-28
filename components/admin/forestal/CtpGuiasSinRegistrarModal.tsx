"use client";

/**
 * «Guías sin registrar» (ADR-446): las guías que salieron con su Anexo 04 y el
 * libro no tiene en Despacho. El servidor propone de qué corrida salió cada
 * grupo (mejor ajuste, con `≤`); el dueño lo mira, puede cambiarlo o dejarlo
 * sin origen, y registra GUÍA POR GUÍA — o las listas en fila, de a una.
 *
 * Los datos y los pedidos viven en `useGuiasSinRegistrar`, que monta quien abre
 * el modal (`CtpGuiasSinRegistrarEntrada`): cerrar no pierde lo elegido.
 */
import { useState } from "react";
import { AlertTriangle, Check, FileStack, Loader2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { EstadoGuiasSinRegistrar } from "@/hooks/use-guias-sin-registrar";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import CtpGuiaSinRegistrar, { BOTON_PRIMARIO, BOTON_SECUNDARIO, Faltan, Segundos } from "./CtpGuiaSinRegistrar";
import { SIN_ORIGEN_SUAVE } from "./CtpGuiaGrupoOrigen";
import CtpGuiasSobrante from "./CtpGuiasSobrante";
import { haySinOrigen, listasEnFila, ptDeGuia, textoDeResultado } from "./guias-sin-registrar-pantalla";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function CtpGuiasSinRegistrarModal({
  open,
  onClose,
  estado,
  aviso,
  onAnotarProduccion,
}: {
  open: boolean;
  onClose: () => void;
  estado: EstadoGuiasSinRegistrar;
  /** Una línea de quien lo abrió (p. ej. «se anotó la producción»). */
  aviso?: string | null;
  /** Sin esto, la guía bloqueada explica dónde se anota en vez de abrirlo. */
  onAnotarProduccion?: (especie: string) => void;
}) {
  /** La guía abierta; `""` = el operador las cerró todas. Sin elegir, la que sigue. */
  const [abierta, setAbierta] = useState<string | null>(null);
  const [confirmarFila, setConfirmarFila] = useState(false);
  const d = estado.datos;
  const guias = d?.tanda.guias ?? [];
  const abiertaReal = abierta ?? estado.siguiente ?? guias[0]?.anexoId ?? "";
  const ocupado = estado.registrando != null || estado.fila != null || estado.simulando || estado.cargando;
  const enFila = listasEnFila(guias, estado.resultados);
  const bloqueadas = guias.filter((g) => !g.registrable).length;
  const pendientes = new Set(guias.map((g) => g.anexoId));
  /* Registradas en esta sesión: ya no vienen en la lista, pero se dice qué pasó. */
  const hechas = Object.values(estado.resultados).filter((r) => !pendientes.has(r.anexoId));
  const gtfDe = (id: string) => guias.find((g) => g.anexoId === id)?.gtf ?? "la guía";
  const r = d?.tanda.resumen;

  const pie = estado.fila
    ? estado.fila.deteniendo
      ? `Se detiene al terminar la guía en curso (${estado.fila.hechas} de ${estado.fila.total}).`
      : null
    : !d
      ? ""
      : guias.length === 0
        ? "Nada pendiente."
        : [plural(enFila.length, "lista", "listas"), bloqueadas > 0 ? plural(bloqueadas, "bloqueada", "bloqueadas") : ""].filter(Boolean).join(" · ");

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Guías sin registrar"
      icon={FileStack}
      variant="wide"
      aboveModals
      claveVentana="ctp-guias-sin-registrar"
      className="sm:max-w-[48rem]"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" aria-live="polite" className="min-w-0 text-xs tabular-nums text-[var(--text-secondary)]">
            {estado.fila?.espera ? (
              <span className="inline-flex items-center gap-1.5 text-[var(--data-warning-ink)]">
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                {estado.fila.espera.motivo || "Esperando"} · vuelve a intentar en <Faltan hasta={estado.fila.espera.hasta} />
              </span>
            ) : estado.registrando ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                {estado.fila ? `${estado.fila.hechas + 1} de ${estado.fila.total}: ` : "Registrando "}
                {gtfDe(estado.registrando.anexoId)} · <Segundos desde={estado.registrando.desde} />
              </span>
            ) : (
              pie
            )}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {confirmarFila && !estado.fila ? (
              <>
                <span className="text-xs font-semibold text-[var(--text-primary)]">¿Registrar {plural(enFila.length, "guía", "guías")}, de a una?</span>
                <button type="button" onClick={() => setConfirmarFila(false)} className={BOTON_SECUNDARIO}>No</button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmarFila(false);
                    void estado.registrarListas();
                  }}
                  className={BOTON_PRIMARIO}
                >
                  Sí, registrar
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
                  Cerrar
                </button>
                {estado.fila ? (
                  <button type="button" onClick={estado.detener} disabled={estado.fila.deteniendo} className={BOTON_SECUNDARIO}>
                    Detener
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmarFila(true)}
                    disabled={ocupado || enFila.length === 0}
                    title="Registra en orden todas las que están listas, una por una: si una falla, las demás siguen"
                    className={BOTON_SECUNDARIO}
                  >
                    Registrar las listas{enFila.length > 0 ? ` (${enFila.length})` : ""}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-3 px-5 py-4 sm:px-6">
        {r && guias.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm tabular-nums text-[var(--text-secondary)]">
            <span className="font-bold text-[var(--text-primary)]">{plural(r.guias, "guía", "guías")}</span>
            <span className="font-semibold text-[var(--text-primary)]">{fmtPt(guias.reduce((a, g) => a + ptDeGuia(g), 0))} pt</span>
            <span>{fmtM3(r.totalM3)} m³</span>
            <span>{fmtM3(r.atribuidoM3)} con origen</span>
            {haySinOrigen(r.sinAtribuirM3) && <span className={SIN_ORIGEN_SUAVE}>{fmtM3(r.sinAtribuirM3)} sin origen</span>}
            <InfoTip
              title="Guías sin registrar"
              what="Guías que salieron con su Anexo 04 y que el libro todavía no tiene en Despacho. El sistema propone de qué corrida salió cada especie y tipo."
              affects="Revisa una por una y regístrala: entra a Despacho con su origen. Lo que ninguna corrida cubre queda «sin origen», nunca se inventa. Van en orden, la más vieja primero."
              example="La 054 del 07/08 sale del inventario del 1 de agosto; si sabes que salió de otra corrida, elígela en su fila."
            />
            {(estado.simulando || (estado.cargando && d)) && <Loader2 aria-label="Actualizando" className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />}
          </div>
        )}

        {estado.error && (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-ink)]">
            <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{estado.error}</span>
            <button type="button" onClick={() => void estado.cargar()} disabled={ocupado} className={BOTON_SECUNDARIO}>
              Reintentar
            </button>
          </div>
        )}

        {aviso && (
          <p role="status" className="flex items-start gap-1.5 text-sm text-[var(--data-success-ink)]">
            <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> <span>{aviso}</span>
          </p>
        )}

        {!d && estado.cargando && (
          <div aria-busy="true" className="space-y-2">
            <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Buscando las guías que faltan en el libro…
            </p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
            ))}
          </div>
        )}

        {hechas.length > 0 && (
          <ul aria-label="Hecho en esta sesión" className="space-y-1">
            {hechas.map((h) => (
              <li key={h.anexoId} className="flex items-start gap-1.5 text-sm tabular-nums text-[var(--data-success-ink)]">
                <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <b>{h.gtf}</b> · {textoDeResultado(h)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {d && guias.length === 0 && !estado.error && (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-4 text-center text-sm text-[var(--text-secondary)]">
            No hay guías sin registrar: cada Anexo 04 con guía ya está en Despacho.
          </p>
        )}

        {guias.length > 0 && (
          <ul className="space-y-2">
            {guias.map((p) => (
              <CtpGuiaSinRegistrar
                key={p.anexoId}
                p={p}
                abierta={abiertaReal === p.anexoId}
                onAlternar={() => setAbierta(abiertaReal === p.anexoId ? "" : p.anexoId)}
                resultado={estado.resultados[p.anexoId]}
                esSiguiente={estado.siguiente === p.anexoId}
                siguienteGtf={estado.siguiente ? gtfDe(estado.siguiente) : null}
                elecciones={estado.elecciones[p.anexoId]}
                ocupado={ocupado}
                registrandoDesde={estado.registrando?.anexoId === p.anexoId ? estado.registrando.desde : null}
                onElegir={(g, corridas) => estado.elegir(p.anexoId, g, corridas)}
                onRevisar={() => void estado.revisar()}
                onRegistrar={() => void estado.registrar(p.anexoId)}
                onAnotarProduccion={onAnotarProduccion}
              />
            ))}
          </ul>
        )}

        {d && (
          <CtpGuiasSobrante
            usadasConResto={d.tanda.usadasConResto}
            usadasSinGuia={d.tanda.usadasSinGuia}
            liberar={estado.liberar}
            liberadas={estado.liberadas}
            bloqueado={ocupado}
            onAlternar={estado.alternarLiberar}
          />
        )}

        {d && (d.reemplazados.length > 0 || d.sinGuia.length > 0 || d.registrados.length > 0) && (
          <ul className="space-y-0.5 text-xs text-[var(--text-tertiary)]">
            {d.reemplazados.map((x) => (
              <li key={x.anexoId}>
                El Anexo {x.numero || "s/n"} de la {x.gtf} queda reemplazado por el {x.porNumero || "más nuevo"}: no se borra ni se registra.
              </li>
            ))}
            {d.sinGuia.length > 0 && <li>{plural(d.sinGuia.length, "anexo sin N° de guía", "anexos sin N° de guía")}: no hay salida que registrar.</li>}
            {d.registrados.length > 0 && <li>{plural(d.registrados.length, "guía ya está", "guías ya están")} en Despacho desde su anexo.</li>}
          </ul>
        )}
      </div>
    </AdminModal>
  );
}
