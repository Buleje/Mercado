"use client";

import { useEffect, useRef, useState } from "react";
import { FolderArchive, Loader2, Download, MessageCircle, Maximize2, RotateCw } from "@buleje/design-system/icons";
import { ErrorAlert, LoadingState, SuccessAlert, WarningAlert } from "@buleje/design-system";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { formatNumber } from "@/lib/format";
import type { DbDocument } from "@/lib/types/documents";
import { SendWhatsAppModal } from "./SendWhatsAppModal";
import { ListaDelExpediente } from "./expediente/ListaDelExpediente";
import { useExpediente, type FuenteDelModal } from "./expediente/use-expediente";

/**
 * «Armar expediente» (22-10, pedido de Brandon para el fiscalizador de
 * OSINFOR/SERFOR): de una carpeta, una selección o la ficha de una entidad
 * sale UN PDF con portada, índice y pie de página. Primero muestra qué entra
 * (con los permisos de quien arma), después arma y deja ver el resultado con
 * «Descargar» y «Enviar por WhatsApp». El WhatsApp se abre EN LUGAR de esta
 * ventana (no encima): así no hay modal dentro de modal.
 */

/** «850 KB» o «12.4 MB»: con papeles chicos, «0 MB» no dice nada. */
const peso = (b: number) =>
  b < 1024 * 1024 ? `${formatNumber(Math.max(1, Math.round(b / 1024)))} KB` : `${formatNumber(b / (1024 * 1024), { max: 1 })} MB`;

export function ExpedienteModal({
  fuente,
  onClose,
  onListo,
  onVer,
  aboveModals = false,
}: {
  fuente: FuenteDelModal;
  /** Se abre desde otro modal (la ficha de un colaborador, un proveedor). */
  aboveModals?: boolean;
  onClose: () => void;
  /** El PDF quedó guardado: refrescar la lista de quien abrió el modal. */
  onListo?: (doc: DbDocument) => void;
  /** Abrirlo en el visor grande del Archivo (si quien abre lo tiene). */
  onVer?: (doc: DbDocument) => void;
}) {
  const [incluirSub, setIncluirSub] = useState(true);
  const ex = useExpediente(fuente, incluirSub);
  const [titulo, setTitulo] = useState(fuente.nombre ?? "");
  const tocado = useRef(false);
  const [enviando, setEnviando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  // El título por defecto es el nombre de la carpeta (o lo que sugiera el servidor) hasta que lo edites.
  useEffect(() => {
    if (!tocado.current && ex.plan && !fuente.nombre) setTitulo(ex.plan.tituloSugerido);
  }, [ex.plan, fuente.nombre]);

  // Reloj mientras arma: un expediente de 60 papeles tarda, y sin nada que se mueva parece colgado.
  useEffect(() => {
    if (!ex.armando) return;
    setSegundos(0);
    const id = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [ex.armando]);

  const papeles = ex.plan?.papeles ?? [];
  const fuera = papeles.filter((p) => p.tipo === "no-imprimible").length;
  const vencidos = papeles.filter((p) => p.vencido).length;
  const entran = papeles.length - fuera;

  const armar = async () => {
    const r = await ex.armar(titulo);
    if (r) onListo?.(r.document);
  };

  if (enviando && ex.listo) {
    return <SendWhatsAppModal docs={[ex.listo.document]} onClose={() => setEnviando(false)} />;
  }

  const listo = ex.listo;
  const sinPagina = listo?.indice.filter((f) => f.pagina === null) ?? [];

  const pie = listo ? (
    <ModalFooter nota={<span className="tabular-nums">{listo.paginas} páginas</span>}>
      <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>
        Cerrar
      </button>
      <button type="button" onClick={() => setEnviando(true)} className={button({ variant: "secondary" })}>
        <MessageCircle className="h-4 w-4" aria-hidden /> Enviar por WhatsApp
      </button>
      <a
        href={`/api/admin/documents/${encodeURIComponent(listo.document.id)}/raw?download=1`}
        download={listo.document.originalName}
        className={button({ variant: "primary" })}
      >
        <Download className="h-4 w-4" aria-hidden /> Descargar
      </a>
    </ModalFooter>
  ) : (
    <ModalFooter
      error={ex.errorArmar}
      nota={ex.plan ? <span className="tabular-nums">{entran} de {papeles.length} entran al PDF</span> : undefined}
    >
      <button type="button" onClick={onClose} className={button({ variant: "secondary" })} disabled={ex.armando}>
        Cancelar
      </button>
      <button
        type="button"
        onClick={() => void armar()}
        disabled={!ex.plan || ex.cargando || ex.armando || entran === 0}
        className={button({ variant: "primary" })}
      >
        {ex.armando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FolderArchive className="h-4 w-4" aria-hidden />}
        {ex.armando ? "Armando…" : "Armar expediente"}
      </button>
    </ModalFooter>
  );

  return (
    <AdminModal
      open
      onClose={ex.armando ? () => undefined : onClose}
      title={listo ? listo.document.name : "Armar expediente"}
      description={listo ? "Listo: quedó guardado en el Archivo" : "Un solo PDF con portada, índice y todos los papeles en orden"}
      icon={FolderArchive}
      size="lg"
      claveVentana="armar-expediente"
      aboveModals={aboveModals}
      footer={pie}
    >
      <div className={`flex flex-col gap-4 ${MODAL_BODY}`}>
        {listo ? (
          <>
            {sinPagina.length > 0 ? (
              <WarningAlert
                title={`${sinPagina.length} ${sinPagina.length === 1 ? "papel quedó" : "papeles quedaron"} sólo en el índice`}
                description={`${sinPagina.map((f) => f.nombre).join(", ")}: pide el original.`}
              />
            ) : (
              <SuccessAlert title={`${listo.indice.length} papeles en ${listo.paginas} páginas`} />
            )}
            {ex.vistaPrevia ? (
              <iframe
                src={ex.vistaPrevia}
                title={`Vista previa de ${listo.document.name}`}
                className="h-[min(60vh,36rem)] w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]"
              />
            ) : (
              <div className="flex h-40 items-center justify-center gap-2 rounded-xl bg-[var(--surface-sunken)] text-sm text-[var(--text-secondary)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando la vista previa…
              </div>
            )}
            {onVer && (
              <button type="button" onClick={() => onVer(listo.document)} className={button({ variant: "ghost", className: "self-start" })}>
                <Maximize2 className="h-4 w-4" aria-hidden /> Abrir en el visor del Archivo
              </button>
            )}
          </>
        ) : ex.armando ? (
          <div>
            {/* El reloj cambia cada segundo: el lector de pantalla sólo anuncia el arranque. */}
            <p className="sr-only" role="status">
              Armando el expediente
            </p>
            <LoadingState
              size="lg"
              message={`Uniendo ${entran} ${entran === 1 ? "papel" : "papeles"} en un PDF… ${segundos} s · no cierres esta ventana`}
            />
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Título del expediente</span>
              <input
                value={titulo}
                onChange={(e) => {
                  tocado.current = true;
                  setTitulo(e.target.value);
                }}
                maxLength={120}
                placeholder="Ej.: CCNN Santa Rosa de Chivis"
                className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]"
              />
              <span className="text-xs text-[var(--text-tertiary)]">Sale en la portada y en el pie de cada hoja.</span>
            </label>
            {fuente.tipo === "carpeta" && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={incluirSub}
                  onChange={(e) => setIncluirSub(e.target.checked)}
                  className="h-5 w-5 accent-[var(--accent)]"
                />
                Incluir subcarpetas
              </label>
            )}
            {ex.cargando && !ex.plan ? (
              <div className="space-y-2" aria-busy="true" aria-label="Buscando los papeles">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--surface-sunken)] motion-reduce:animate-none" />
                ))}
              </div>
            ) : ex.errorPlan ? (
              <ErrorAlert
                title="No se pudo preparar el expediente"
                description={ex.errorPlan}
                action={
                  <button type="button" onClick={() => void ex.recargar()} className={button({ variant: "secondary", size: "sm" })}>
                    <RotateCw className="h-4 w-4" aria-hidden /> Reintentar
                  </button>
                }
              />
            ) : ex.plan ? (
              <>
                <p className={`text-sm text-[var(--text-secondary)] ${ex.cargando ? "opacity-60" : ""}`}>
                  <span className="font-semibold tabular-nums text-[var(--text-primary)]">{papeles.length} papeles</span>
                  {" · "}
                  <span className="tabular-nums">{peso(ex.plan.bytesImprimibles)}</span>
                  {fuera > 0 && ` · ${fuera} no ${fuera === 1 ? "imprimible" : "imprimibles"} (van sólo en el índice)`}
                  {vencidos > 0 && ` · ${vencidos} ${vencidos === 1 ? "vencido" : "vencidos"}`}
                </p>
                <ListaDelExpediente papeles={papeles} />
              </>
            ) : null}
          </>
        )}
      </div>
    </AdminModal>
  );
}
