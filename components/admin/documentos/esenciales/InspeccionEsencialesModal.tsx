"use client";

import { useMemo, useState } from "react";
import { Check, ClipboardCheck, Copy, Download, FileText, Loader2, Lock, Printer, RotateCcw } from "@buleje/design-system/icons";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { Casilla } from "@/components/ui-system/Casilla";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useMiRol } from "@/hooks/use-mi-rol";
import { MAX_CARPETAS_POR_ENLACE } from "@/lib/documentos/enlace-varias-carpetas";
import { contarHoja, indiceParaInspeccion, resumenDeLaHoja } from "@/lib/documentos/inspeccion-indice";
import { MAX_PAPELES_EXPEDIENTE } from "@/lib/documents/expediente-indice";
import { useHojaInspeccion, type PasoHoja } from "./use-hoja-inspeccion";

/**
 * «Para inspección» (Brandon 24-10): llega SERFOR/OSINFOR/SUNAT y se le entrega
 * una hoja con el membrete, el índice de las esenciales con su semáforo de
 * vencimiento y un QR que las abre en línea (enlace de 1 o 7 días, clave
 * opcional). Opcional: los papeles completos detrás del índice.
 */

type Dias = "1" | "7";
const OPCIONES_DIAS: { value: Dias; label: string }[] = [
  { value: "1", label: "1 día" },
  { value: "7", label: "7 días" },
];

const PASOS: Record<PasoHoja, string> = { enlace: "Creando el enlace…", papeles: "Juntando los papeles…", hoja: "Armando la hoja…" };

const CAJA = "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3";
const OPCION = "flex min-h-12 cursor-pointer items-center gap-2.5 text-sm font-bold text-[var(--text-primary)]";
const ETIQUETA = "mb-2 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]";

export default function InspeccionEsencialesModal({ carpetas, folders, docs, onClose }: {
  /** Las esenciales, en el orden en que se muestran. */
  carpetas: readonly DbDocumentFolder[];
  folders: readonly DbDocumentFolder[];
  docs: readonly DbDocument[];
  onClose: () => void;
}) {
  const rol = useMiRol();
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(carpetas.slice(0, MAX_CARPETAS_POR_ENLACE).map((c) => c.id)));
  const [dias, setDias] = useState<Dias>("1");
  const [conClave, setConClave] = useState(false);
  const [clave, setClave] = useState("");
  const [conPapeles, setConPapeles] = useState(false);
  const h = useHojaInspeccion();
  const [copiado, setCopiado] = useState(false);

  // Lo que el QR deja ver, carpeta por carpeta (sin subcarpetas; con candado sólo si quien lo crea los ve).
  const [ahora] = useState(() => Date.now());
  const indice = useMemo(
    () => indiceParaInspeccion({ elegidas: carpetas, carpetas: folders, docs, rol, ahora }),
    [carpetas, folders, docs, rol, ahora],
  );
  const porId = useMemo(() => new Map(indice.map((c) => [c.id, c])), [indice]);
  const enHoja = indice.filter((c) => elegidas.has(c.id));
  const cuenta = contarHoja(enHoja);
  const conCandado = enHoja.reduce((n, c) => n + c.conCandado, 0);
  const demasiados = cuenta.papeles > MAX_PAPELES_EXPEDIENTE;
  const lleno = elegidas.size >= MAX_CARPETAS_POR_ENLACE;
  const claveLimpia = clave.trim();
  const faltaClave = conClave && claveLimpia.length < 4;
  const ocupado = h.paso !== null;
  const puede = !ocupado && !h.lista && enHoja.length > 0 && !faltaClave;

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const sig = new Set(prev);
      if (sig.has(id)) sig.delete(id);
      else if (sig.size < MAX_CARPETAS_POR_ENLACE) sig.add(id);
      return sig;
    });

  const armar = () => {
    if (!puede) return;
    void h.armar({ carpetas: enHoja, dias: Number(dias), clave: conClave ? claveLimpia : undefined, conPapeles: conPapeles && !demasiados });
  };

  // Con la hoja lista el pie lleva 3 botones: la nota va arriba, en el cuerpo.
  const nota = h.lista ? undefined : `${enHoja.length} carpeta${enHoja.length === 1 ? "" : "s"} · ${resumenDeLaHoja(cuenta)}`;

  const copiar = (texto: string) => {
    void navigator.clipboard
      ?.writeText(texto)
      .then(() => setCopiado(true))
      .catch(() => setCopiado(false));
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Hoja para inspección"
      description="Índice con vencimientos y un QR"
      icon={ClipboardCheck}
      size="md"
      claveVentana="inspeccion-esenciales"
      footer={
        <ModalFooter error={h.error} aviso={h.aviso} nota={nota}>
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>Cerrar</button>
          {h.lista ? (
            <>
              <button type="button" onClick={() => { setCopiado(false); h.otra(); }} className={button({ variant: "secondary" })}>
                <RotateCcw className="h-4 w-4" /> Hacer otra
              </button>
              <a href={h.lista.url} target="_blank" rel="noopener" className={button({ variant: "primary" })} data-qa="inspeccion-abrir">
                <Printer className="h-4 w-4" /> Abrir para imprimir
              </a>
            </>
          ) : (
            <button type="button" onClick={armar} disabled={!puede} className={button({ variant: "primary" })} data-qa="inspeccion-armar">
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {h.paso ? PASOS[h.paso] : "Armar la hoja"}
            </button>
          )}
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {h.lista ? (
          <div className={CAJA} data-qa="inspeccion-lista">
            <div className={ETIQUETA}>Hoja lista</div>
            <p className="text-sm font-bold text-[var(--text-primary)]">{h.nota}</p>
            {conClave && <p className="mt-1 text-sm text-[var(--text-secondary)]">Con clave: díctasela al inspector, no sale en la hoja.</p>}
            <div className="mt-3 flex min-w-0 items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-[var(--surface-raised)] px-3 py-3 text-xs text-[var(--text-secondary)]" title={h.lista.enlace}>{h.lista.enlace}</code>
              <button type="button" onClick={() => copiar(h.lista?.enlace ?? "")} className={button({ variant: "secondary" })} title="Copiar el enlace">
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>
            <a href={h.lista.url} download={h.lista.nombreArchivo} className={`${button({ variant: "secondary" })} mt-2 w-full`} data-qa="inspeccion-bajar">
              <Download className="h-4 w-4" /> Bajar el PDF
            </a>
          </div>
        ) : (
        <fieldset disabled={ocupado} className="space-y-4 disabled:opacity-70">
          <div className={CAJA}>
            <div className={ETIQUETA}>
              Qué carpetas van
              <InfoTip
                what="La hoja lista los papeles de cada carpeta marcada con su vencimiento; el QR abre esas mismas carpetas."
                affects="Van los papeles sueltos de cada carpeta, no los de sus subcarpetas. Los que tienen candado van si tú puedes verlos (dueño y admin): el aviso de abajo te dice cuántos."
                example={`Para SERFOR: licencias, guías y plan de manejo. Máximo ${MAX_CARPETAS_POR_ENLACE} carpetas.`}
              />
            </div>
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {carpetas.map((c) => {
                const marcada = elegidas.has(c.id);
                const id = `inspeccion-${c.id}`;
                const info = porId.get(c.id);
                const n = info ? contarHoja([info]) : null;
                return (
                  <li key={c.id}>
                    <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-raised)]">
                      <Casilla id={id} checked={marcada} disabled={!marcada && lleno} onChange={() => alternar(c.id)} />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {n && (
                        <span className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">
                          {n.papeles} papel{n.papeles === 1 ? "" : "es"}
                          {n.vencidos > 0 && <span className="font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"> · {n.vencidos} vencido{n.vencidos === 1 ? "" : "s"}</span>}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
            {conCandado > 0 && (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" data-qa="inspeccion-con-candado">
                <Lock className="h-4 w-4 shrink-0" aria-hidden />
                {conCandado} papel{conCandado === 1 ? "" : "es"} con candado van en el QR
                <InfoTip
                  what="Tú los puedes ver, así que el enlace también los abre para quien escanee el QR."
                  affects="Si no quieres que salgan, desmarca esa carpeta o sácalos de ella antes de crear el enlace."
                  example="El contrato con candado de «Prueba demo» entra si marcas esa carpeta."
                />
              </p>
            )}
          </div>

          <div className={CAJA}>
            <div className={ETIQUETA}>
              El QR abre durante
              <InfoTip what="Pasado ese plazo el enlace deja de abrir; la hoja impresa queda solo como índice." example="1 día para la visita; 7 días si el inspector revisa después en su oficina." />
            </div>
            <SegmentedControl<Dias> value={dias} onChange={setDias} options={OPCIONES_DIAS} size="xl" label="Cuánto dura el enlace del QR" />
          </div>

          <div className={CAJA}>
            <div className="flex items-center gap-1.5">
              <label htmlFor="inspeccion-con-clave" className={OPCION}>
                <Casilla id="inspeccion-con-clave" checked={conClave} onChange={(e) => { setConClave(e.target.checked); setClave(""); }} />
                <Lock className="h-4 w-4" /> Pedir una clave para abrirlas
              </label>
              <InfoTip what="La clave no sale en la hoja: díctasela al inspector." />
            </div>
            {conClave && (
              <input
                type="text"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="Clave (mínimo 4 caracteres)"
                aria-label="Clave del enlace"
                autoComplete="off"
                className="mt-2 h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
              />
            )}
          </div>

          <div className={CAJA}>
            <div className="flex items-center gap-1.5">
              <label htmlFor="inspeccion-con-papeles" className={OPCION}>
                <Casilla id="inspeccion-con-papeles" checked={conPapeles && !demasiados} disabled={demasiados} onChange={(e) => setConPapeles(e.target.checked)} />
                Sumar los papeles completos
              </label>
              <InfoTip
                what="Detrás del índice van los papeles, uno tras otro, para imprimir todo junto."
                affects={`Usa el «Expediente PDF» de siempre: queda guardado en el Archivo. Hasta ${MAX_PAPELES_EXPEDIENTE} papeles.`}
              />
            </div>
            {demasiados && (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Son {cuenta.papeles} papeles: el expediente junta hasta {MAX_PAPELES_EXPEDIENTE}. Quita alguna carpeta.</p>
            )}
          </div>
        </fieldset>
        )}
      </div>
    </AdminModal>
  );
}
