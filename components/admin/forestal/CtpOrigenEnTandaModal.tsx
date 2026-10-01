"use client";

/**
 * «¿De qué trozas salió?» EN TANDA (ADR-447): las corridas ya declaradas que
 * tienen madera de su especie y su permiso en el patio, agrupadas por especie y
 * permiso, cada una con SU propuesta de trozas (ninguna en dos). El dueño la
 * mira, desmarca lo que no entró o deja una corrida sin origen, y vincula grupo
 * por grupo — o todas en fila, con el avance a la vista.
 *
 * El patrón es el de «Guías sin registrar» (ADR-446). Los datos y los pedidos
 * viven en `useOrigenEnTanda`, que monta la bandeja: cerrar no pierde lo
 * elegido.
 */
import { useState } from "react";
import { AlertTriangle, Check, Link2, Loader2, RefreshCw } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { EstadoOrigenEnTanda } from "@/hooks/use-origen-en-tanda";
import { useTeclasQuedanAdentro } from "@/hooks/use-teclas-quedan-adentro";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, Faltan } from "./CtpGuiaSinRegistrar";
import CtpOrigenEnTandaGrupo from "./CtpOrigenEnTandaGrupo";
import { de } from "./ctp-sin-origen-comun";
import { gruposEnFila, loQueVa, textoDeResultado, yaTieneOrigen } from "./origen-en-tanda-pantalla";

export default function CtpOrigenEnTandaModal({
  open,
  onClose,
  estado,
  firma,
  onElegirAMano,
}: {
  open: boolean;
  onClose: () => void;
  estado: EstadoOrigenEnTanda;
  /** Vincula el dueño o un administrador (el servidor lo exige igual). */
  firma: boolean;
  /** Abre el vinculador de siempre para esa corrida (cierra éste). */
  onElegirAMano?: (corridaId: string) => void;
}) {
  /** El grupo abierto; `""` = el dueño los cerró todos. Sin elegir, el primero que falta. */
  const [abierto, setAbierto] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  useTeclasQuedanAdentro(open);

  const d = estado.datos;
  const grupos = d?.propuesta.grupos ?? [];
  const ocupado = estado.vinculando != null || estado.fila != null || estado.cargando;
  const enFila = d ? gruposEnFila(d.propuesta, estado.elecciones, estado.resultados) : [];
  const va = d ? loQueVa(d.propuesta, estado.elecciones, estado.resultados) : null;
  const primeroQueFalta = grupos.find((g) => g.corridas.some((c) => !yaTieneOrigen(estado.resultados[c.corridaId])))?.clave;
  const abiertoReal = abierto ?? primeroQueFalta ?? grupos[0]?.clave ?? "";
  const grupoEnCurso = grupos.find((g) => g.clave === estado.vinculando?.clave);
  const sim = d?.simulacion;

  const pie = estado.fila?.deteniendo
    ? `Se detiene al terminar el grupo en curso (${estado.fila.hechos} de ${estado.fila.total}).`
    : !d
      ? ""
      : va && va.corridas > 0
        ? `${de(va.corridas, "corrida", "corridas")} · ${de(va.trozas, "troza", "trozas")} · ${fmtM3(va.m3Trozas)} m³ de troza`
        : "Nada por vincular.";

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Vincular en tanda"
      description="Las corridas que ya tienen madera de su especie y su permiso en el patio"
      icon={Link2}
      variant="wide"
      aboveModals
      claveVentana="ctp-origen-en-tanda"
      className="sm:max-w-[48rem]"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" aria-live="polite" className="min-w-0 text-xs tabular-nums text-[var(--text-secondary)]">
            {estado.fila?.espera ? (
              <span className="inline-flex items-center gap-1.5 text-[var(--data-warning-ink)]">
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                {estado.fila.espera.motivo} · vuelve a intentar en <Faltan hasta={estado.fila.espera.hasta} />
              </span>
            ) : estado.vinculando && estado.fila ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                {estado.fila.hechos + 1} de {estado.fila.total}: {grupoEnCurso?.especie ?? "grupo"}
              </span>
            ) : (
              pie
            )}
          </p>
          <div className="ml-auto flex items-center gap-2">
            {confirmar && !estado.fila ? (
              <>
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  ¿Vincular {de(va?.corridas ?? 0, "corrida", "corridas")}, grupo por grupo?
                </span>
                <button type="button" onClick={() => setConfirmar(false)} className={BOTON_SECUNDARIO}>
                  No
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmar(false);
                    void estado.vincularTodas();
                  }}
                  className={BOTON_PRIMARIO}
                >
                  Sí, vincular
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                >
                  Cerrar
                </button>
                {estado.fila ? (
                  <button type="button" onClick={estado.detener} disabled={estado.fila.deteniendo} className={BOTON_SECUNDARIO}>
                    Detener
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void estado.cargar()}
                      disabled={ocupado}
                      title="Vuelve a armar la propuesta con el libro de ahora; lo que desmarcaste se respeta"
                      className={BOTON_SECUNDARIO}
                    >
                      <RefreshCw aria-hidden className="h-4 w-4" /> Revisar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmar(true)}
                      disabled={ocupado || !firma || enFila.length === 0}
                      title={!firma ? "Las vincula el dueño o un administrador" : "Vincula en orden, grupo por grupo: si una corrida falla, las demás siguen"}
                      className={BOTON_PRIMARIO}
                    >
                      {!va || va.corridas === 0 ? "Vincular" : va.corridas === 1 ? "Vincular la corrida" : `Vincular las ${va.corridas}`}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-3 px-5 py-4 sm:px-6">
        {d && va && grupos.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm tabular-nums text-[var(--text-secondary)]">
            <span className="font-bold text-[var(--text-primary)]">{de(va.corridas, "corrida", "corridas")}</span>
            <span className="font-semibold text-[var(--text-primary)]">{fmtPt(va.pt)} pt</span>
            <span>{fmtM3(va.m3Producido)} m³</span>
            <span>
              de {de(va.trozas, "troza", "trozas")} · {fmtM3(va.m3Trozas)} m³
            </span>
            {va.sobreElTope > 0 && (
              <span className="rounded-md bg-[var(--data-warning-500)]/10 px-1.5 text-xs font-semibold text-[var(--data-warning-ink)]">
                {de(va.sobreElTope, "pasa", "pasan")} el 56 %
              </span>
            )}
            <InfoTip
              title="Vincular en tanda"
              what="Cada corrida con las trozas de su especie y su permiso que estaban en el patio ese día. Ninguna troza va a dos corridas; lo que no alcanza queda sin origen, nunca se inventa."
              affects="Desmarca las trozas que no entraron o deja una corrida sin origen. Se vincula grupo por grupo, la más vieja primero: si una falla, las demás siguen."
              example="Copal del permiso 2026-007: la N.º 34 con la troza C-12 rinde 46 %. Si la C-12 no entró, desmárcala."
              ancho="w-96"
            />
            {estado.cargando && d && <Loader2 aria-label="Actualizando" className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />}
          </div>
        )}

        {(estado.error || estado.aviso) && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-ink)]"
          >
            <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{estado.error ?? estado.aviso}</span>
            {estado.error && (
              <button type="button" onClick={() => void estado.cargar()} disabled={ocupado} className={BOTON_SECUNDARIO}>
                Reintentar
              </button>
            )}
          </div>
        )}

        {!d && estado.cargando && (
          <div aria-busy="true" className="space-y-2">
            <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Armando la propuesta con el patio de hoy…
            </p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />
            ))}
          </div>
        )}

        {estado.hechas.length > 0 && (
          <ul aria-label="Vinculadas en esta sesión" className="space-y-1">
            {estado.hechas.map((h) => (
              <li key={h.corridaId} className="flex items-start gap-1.5 text-sm tabular-nums text-[var(--data-success-ink)]">
                <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <b>N.º {h.lineNo ?? "—"}</b> {h.especie} · {etiquetaLarga(h.fecha)} · {textoDeResultado(h.resultado)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {d && grupos.length === 0 && !estado.error && (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-4 text-center text-sm text-[var(--text-secondary)]">
            {sim && sim.trasLlegada.listas > 0
              ? `Todavía no hay corridas listas. Corrige las llegadas y quedan ${sim.trasLlegada.listas}.`
              : "No hay corridas listas para vincular."}
          </p>
        )}

        {grupos.length > 0 && (
          <ul className="space-y-2">
            {grupos.map((g) => (
              <CtpOrigenEnTandaGrupo
                key={g.clave}
                g={g}
                abierto={abiertoReal === g.clave}
                onAlternar={() => setAbierto(abiertoReal === g.clave ? "" : g.clave)}
                elecciones={estado.elecciones}
                resultados={estado.resultados}
                ocupado={ocupado}
                vinculandoDesde={estado.vinculando?.clave === g.clave ? estado.vinculando.desde : null}
                firma={firma}
                onAlternarTroza={estado.alternarTroza}
                onMarcarTodas={estado.marcarTodas}
                onSinOrigen={estado.dejarSinOrigen}
                onVincular={() => void estado.vincularGrupo(g.clave)}
                onElegirAMano={onElegirAMano}
              />
            ))}
          </ul>
        )}
      </div>
    </AdminModal>
  );
}
