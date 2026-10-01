"use client";

/**
 * CtpRecibirGuiaThModal — recibir en el Libro CTP la guía que emitió tu Libro
 * TH, con sus trozas, sin tipear (Brandon 28-09-2026: «cuando se va a emitir
 * la guía quiero que ese registro pase a libro CTP de mi sistema para luego
 * poner recepcionarla»).
 *
 * Lo que se pone acá es lo que la guía no puede saber: el día en que la madera
 * bajó en el patio y CUÁLES bajaron (ADR-450 «Contar al bajar»). Lo demás —un
 * renglón por especie, cada troza con su código, D1, D2, largo y m³— lo arma
 * el servidor con la guía del bosque y se muestra ANTES de registrar.
 *
 * Estados: leyendo · error al leer · contando · confirmar faltantes (la
 * casilla «la que no conté no llegó») · vencida · enviando · la guía cambió
 * (409) · recibida.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, RefreshCw, TreePine } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatDateShort } from "@/lib/format";
import { MAX_TEXTO_RECIBIR, type RecibidaTh } from "@/lib/forestal/guia-th-al-ctp";
import { ConteoSchema, planearConteo } from "@/lib/forestal/conteo-guia-th";
import { MIN_MOTIVO_VENCIDA } from "@/lib/forestal/fecha-de-llegada";
import { limaDateKey } from "@/lib/utils";
import { useRecibirGuiaTh } from "./hooks/use-recibir-guia-th";
import { useConteoGuiaTh } from "./hooks/use-conteo-guia-th";
import ContarAlBajar from "./ctp-recibir-guia-th-conteo";
import { Cuenta, Dato, GuiaRecibida, ListaDeAvisos, ResumenPorEspecie } from "./ctp-recibir-guia-th-partes";
import { Btn, I } from "./ctp-shared";

export interface CtpRecibirGuiaThModalProps {
  guardadaId: string;
  /** Para el título mientras llega el detalle. */
  gtfNumber: string;
  /** Se abre desde otro modal (el listado de guías guardadas). */
  aboveModals?: boolean;
  onClose: () => void;
  /** Quedó registrada: la pantalla de atrás se refresca; el modal sigue abierto con el resultado. */
  onRecibida: (r: RecibidaTh) => void;
}

const dia = (iso: string | null) => (iso ? formatDateShort(iso, { soloFecha: true }) : "—");
const trozas = (n: number) => (n === 1 ? "troza" : "trozas");

export default function CtpRecibirGuiaThModal({
  guardadaId,
  gtfNumber,
  aboveModals = false,
  onClose,
  onRecibida,
}: CtpRecibirGuiaThModalProps) {
  const { preparado: p, cargando, errorCarga, recibir, enviando, recargar } = useRecibirGuiaTh(guardadaId);
  const conteo = useConteoGuiaTh(p?.lineas ?? null, p?.huella ?? null);
  const { resumen, envio } = conteo;
  const hoy = limaDateKey();
  const [llegada, setLlegada] = useState(hoy);
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** El servidor dijo que llegó después del vencimiento: se confirma con motivo. */
  const [vencida, setVencida] = useState<string | null>(null);
  const [motivoVencida, setMotivoVencida] = useState("");
  /** 409 GUIA_CAMBIO: lo contado era de otra lista. Se vuelve a abrir. */
  const [cambio, setCambio] = useState(false);
  const [recibida, setRecibida] = useState<RecibidaTh | null>(null);

  /* Los avisos que el servidor va a dejar, calculados con SU función sobre lo que se manda. */
  const avisosDelConteo = useMemo(() => {
    if (!p || !envio) return [];
    const c = ConteoSchema.safeParse(envio.conteo);
    const plan = c.success ? planearConteo(p.lineas, c.data, envio.confirmaFaltantes) : null;
    return plan?.ok ? plan.avisos : [];
  }, [p, envio]);

  const llegaran = envio ? envio.conteo.filter((c) => c.llego).length : (resumen?.llegaron ?? 0);
  const faltaMotivo = vencida != null && motivoVencida.trim().length < MIN_MOTIVO_VENCIDA;
  const puede = Boolean(p) && !cargando && !enviando && !cambio && Boolean(llegada) && !faltaMotivo && envio != null && llegaran > 0;

  const enviar = async () => {
    if (!puede || !p || !envio) return;
    setError(null);
    const r = await recibir({
      fechaLlegada: llegada,
      observacion: observacion.trim() || undefined,
      ...(vencida != null ? { aceptaVencida: true, motivoVencida: motivoVencida.trim() } : {}),
      huella: p.huella,
      conteo: envio.conteo,
      ...(envio.confirmaFaltantes ? { confirmaFaltantes: true } : {}),
      ...(conteo.sobrantes.length > 0 ? { sobrantes: [...conteo.sobrantes] } : {}),
    });
    if (r.ok) {
      setRecibida(r.recibida);
      onRecibida(r.recibida);
      return;
    }
    if (r.codigo === "GUIA_VENCIDA") {
      setVencida(r.vencimiento ?? p.vencimiento ?? "");
      return;
    }
    if (r.codigo === "GUIA_CAMBIO") setCambio(true);
    setError(r.mensaje);
  };

  const volverAAbrir = () => {
    setCambio(false);
    setError(null);
    recargar();
  };

  const total = resumen?.total ?? p?.trozas ?? 0;
  const rotulo = enviando
    ? "Recibiendo…"
    : total > 0 && llegaran === total
      ? `Recibir ${total === 1 ? "la troza" : `las ${total} trozas`}`
      : `Recibir ${llegaran} de ${total} ${trozas(total)}`;
  /* Por qué el botón está apagado, dicho en el pie (no un botón mudo). */
  const pista =
    !resumen || recibida ? null
    : resumen.llegaron === 0 && resumen.sinContar === resumen.total ? "Cuenta las trozas que bajaron del camión."
    : envio == null && conteo.filas.some((f) => f.errorMedida) ? "Corrige la medida en planta que está mal escrita."
    : envio == null ? `Cuenta ${resumen.sinContar === 1 ? "la que falta" : `las ${resumen.sinContar} que faltan`} o marca que no llegó.`
    : llegaran === 0 ? "No llegó ninguna: así no se recibe."
    : null;

  return (
    <AdminModal
      open
      onClose={onClose}
      title={`Recibir la guía ${p?.gtfNumber ?? gtfNumber}`}
      description={recibida ? "Quedó en tu Libro CTP" : "Viene de tu Libro TH: cuenta lo que bajó y entra con sus trozas"}
      icon={TreePine}
      variant="wide"
      /* 60rem: a 1280 cada troza entra en UNA fila (código, medidas, estado y
         botones); el `wide` de 42rem la partía en dos. */
      className="sm:max-w-[60rem]"
      aboveModals={aboveModals}
      claveVentana="ctp-recibir-guia-th"
      footer={
        recibida ? (
          <ModalFooter>
            <Btn variant="primary" onClick={onClose}>Listo</Btn>
          </ModalFooter>
        ) : (
          <ModalFooter
            error={error ?? errorCarga}
            nota={
              resumen ? (
                <span className="flex flex-col">
                  <span className="font-bold tabular-nums text-[var(--text-primary)]" data-testid="recibir-th-pie">
                    {resumen.llegaron} de {resumen.total} {trozas(resumen.total)} · {fmtM3(resumen.m3Recibido)} de {fmtM3(resumen.m3Declarado)} m³
                  </span>
                  {pista && <span>{pista}</span>}
                </span>
              ) : cargando ? "Leyendo la guía de tu Libro TH…" : null
            }
          >
            {resumen && resumen.sinContar > 0 && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-[var(--text-primary)] sm:min-h-9">
                <input
                  type="checkbox"
                  checked={conteo.restoNoLlego}
                  onChange={(e) => conteo.setRestoNoLlego(e.target.checked)}
                  className="h-5 w-5 accent-[var(--accent)]"
                  data-testid="recibir-th-resto-no-llego"
                />
                {resumen.sinContar === 1 ? "La que no conté no llegó" : `Las ${resumen.sinContar} que no conté no llegaron`}
              </label>
            )}
            <Btn variant="secondary" onClick={onClose} disabled={enviando}>
              Cancelar
            </Btn>
            <Btn variant="primary" onClick={() => void enviar()} disabled={!puede} data-testid="recibir-th-enviar">
              {rotulo}
            </Btn>
          </ModalFooter>
        )
      }
    >
      <div className={`${MODAL_BODY} flex flex-col gap-4`} data-testid="recibir-guia-th">
        {recibida && <GuiaRecibida r={recibida} />}
        {!recibida && p && (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 sm:grid-cols-4">
              <Dato label="Titular" valor={p.titular ?? "—"} />
              <Dato label="Permiso" valor={p.permiso ?? "—"} mono />
              <Dato label="Guía del" valor={dia(p.gtfDate)} />
              <Dato label="Vence" valor={p.vencimiento ? dia(p.vencimiento) : "sin fecha"} />
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5">
                <label htmlFor="recibir-th-llegada" className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                  <CalendarClock className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
                  Llegó al patio el
                </label>
                <InfoTip
                  title="Fecha de llegada"
                  ariaLabel="Qué fecha va en la llegada"
                  what="El día en que la madera bajó del camión en tu patio."
                  affects="Queda como la llegada de la guía y de cada troza que llegó: desde ese día se pueden aserrar."
                  example="La guía salió del bosque el lunes y el camión llegó el miércoles: pones el miércoles."
                />
              </span>
              <input
                id="recibir-th-llegada"
                type="date"
                value={llegada}
                min={p.gtfDate ?? undefined}
                max={hoy}
                onChange={(e) => {
                  setLlegada(e.target.value);
                  setVencida(null);
                }}
                className={`${I} max-w-48`}
              />
            </div>

            {vencida != null && (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] p-3 dark:bg-[var(--data-warning-500)]/10"
              >
                <p className="flex items-start gap-2 text-sm font-bold text-[var(--data-warning-ink)]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  La guía venció el {dia(vencida || null)} y la madera llega el {dia(llegada)}. Si de verdad llegó así, escribe por qué.
                </p>
                <input
                  aria-label="Por qué llegó después del vencimiento"
                  aria-describedby="recibir-th-motivo-cuenta"
                  value={motivoVencida}
                  onChange={(e) => setMotivoVencida(e.target.value)}
                  placeholder="Ej.: el camión se quedó en el puesto de control por lluvia"
                  maxLength={MAX_TEXTO_RECIBIR}
                  className={I}
                />
                <Cuenta id="recibir-th-motivo-cuenta" n={motivoVencida.length} />
              </div>
            )}

            {cambio && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 dark:bg-[var(--data-error-500)]/10" data-testid="recibir-th-cambio">
                <p className="flex min-w-0 flex-1 items-start gap-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  La guía cambió en tu Libro TH, vuelve a abrirla: lo que contaste era de la lista anterior.
                </p>
                <Btn variant="secondary" onClick={volverAAbrir} disabled={cargando}>
                  <RefreshCw className="h-4 w-4" aria-hidden /> Volver a abrirla
                </Btn>
              </div>
            )}

            <ContarAlBajar conteo={conteo} />
            {resumen && <ResumenPorEspecie resumen={resumen} />}
            <ListaDeAvisos avisos={[...p.avisos, ...avisosDelConteo]} id="recibir-th-avisos" />

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold text-[var(--text-primary)]">
                Observación <span className="font-normal text-[var(--text-tertiary)]">(opcional)</span>
              </span>
              <input
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Lo que viste al descargar: la troza rajada, el transportista…"
                maxLength={MAX_TEXTO_RECIBIR}
                aria-describedby="recibir-th-obs-cuenta"
                className={I}
              />
              <Cuenta id="recibir-th-obs-cuenta" n={observacion.length} />
            </label>
          </>
        )}
        {cargando && !p && <p className="text-sm text-[var(--text-tertiary)]">Leyendo la guía de tu Libro TH…</p>}
        {!cargando && !p && errorCarga && (
          <div className="flex flex-col items-start gap-2">
            <p role="alert" className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{errorCarga}</p>
            <Btn variant="secondary" onClick={recargar}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
            </Btn>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
