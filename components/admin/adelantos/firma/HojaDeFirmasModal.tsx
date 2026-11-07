"use client";

/**
 * Hoja de firmas del sábado (25-10). En el aserradero la gente firma en papel:
 * 1) eliges qué adelantos van, 2) «Imprimir hoja» (A4 apaisado con el membrete,
 * una fila por adelanto y casilleros grandes de firma y huella), 3) «Subir la
 * foto de la hoja firmada»: queda en el Archivo y atada a CADA adelanto de la
 * hoja. No crea una firma digital: el recibo dirá «Firmado en hoja (foto)».
 */

import { useRef, useState } from "react";
import { Camera, CheckCircle2, FileText, Printer, Upload } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Casilla } from "@/components/ui-system/Casilla";
import { button } from "@/components/ui-system/button-variants";
import { MAX_ADELANTOS_POR_HOJA } from "@/lib/adelantos/hoja-firmas";
import CapturaFoto from "../CapturaFoto";
import { fmtMon } from "../shared";
import { fechaCorta } from "./hoja-firmas-pdf";
import { useHojaFirmas } from "./use-hoja-firmas";

export function HojaDeFirmasModal({ open, onClose, onListo }: { open: boolean; onClose: () => void; onListo?: () => void }) {
  const h = useHojaFirmas(open, onListo);
  const archivo = useRef<HTMLInputElement>(null);
  const [camara, setCamara] = useState(false);
  const ocupado = h.trabajando !== null;
  const n = h.elegidos.size;

  const deArchivo = (f: File | undefined) => {
    if (f) void h.subirFoto(f, f.name);
    if (archivo.current) archivo.current.value = "";
  };
  const deCamara = async (dataUrl: string) => {
    setCamara(false);
    const blob = await (await fetch(dataUrl)).blob();
    await h.subirFoto(blob, "hoja.jpg");
  };

  return (
    <>
      <AdminModal
        open={open && !camara}
        onClose={ocupado ? () => undefined : onClose}
        title="Hoja de firmas"
        description="Imprime una hoja para que firmen en papel y sube su foto"
        icon={FileText}
        size="xl"
        claveVentana="adelantos-hoja-firmas"
        footer={
          <ModalFooter error={h.error}>
            <button type="button" onClick={onClose} disabled={ocupado} className={button({ variant: "secondary" })}>
              Cerrar
            </button>
            <button type="button" onClick={() => void h.imprimir()} disabled={ocupado || n === 0} className={button({ variant: "primary" })} data-imprimir-hoja>
              <Printer className="h-4 w-4" aria-hidden />
              {h.trabajando === "imprimiendo" ? "Armando…" : "Imprimir hoja"}
            </button>
          </ModalFooter>
        }
      >
        <div className={`${MODAL_BODY} space-y-4`}>
          {h.subida && (
            <p role="status" className="flex items-start gap-2 rounded-xl bg-[var(--data-success-50)] px-3 py-3 text-sm font-medium text-[var(--data-success-700)]" data-hoja-subida>
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Guardada la hoja {h.subida.codigo}: quedó unida a {h.subida.n} {h.subida.n === 1 ? "adelanto" : "adelantos"} como «Firmado en hoja (foto)».
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-[var(--text-secondary)]">
              Sin firma: {h.lista.length} · van en la hoja: {n}
            </p>
            <InfoTip
              title="Hoja de firmas"
              what="Los adelantos que diste y siguen abiertos, sin firma en pantalla ni foto de hoja. Marca los que van; la hoja trae casilleros de firma y huella por persona."
              affects="La foto que subes se guarda en el Archivo (Adelantos › Hojas de firmas, solo dueño y administrador) y queda unida a cada adelanto de la hoja. No cuenta como firma digital: sirve de constancia."
              example="El sábado imprimes la hoja con los 5 adelantos, cada quien firma y pone su huella, tomas la foto de la hoja y la subes: los 5 pasan a «Firmado en hoja (foto)»."
            />
            {h.lista.length > 0 && (
              <button type="button" onClick={() => h.todos(n < Math.min(h.lista.length, MAX_ADELANTOS_POR_HOJA))} className={button({ variant: "ghost", className: "ml-auto" })} disabled={ocupado}>
                {n < Math.min(h.lista.length, MAX_ADELANTOS_POR_HOJA) ? "Marcar todos" : "Quitar todos"}
              </button>
            )}
          </div>

          {h.carga === "cargando" && <p className="text-sm text-[var(--text-secondary)]">Buscando los adelantos sin firma…</p>}
          {h.carga === "error" && (
            <p className="text-sm text-[var(--data-error-700)]">
              No se pudo leer la lista.{" "}
              <button type="button" onClick={h.cargar} className={button({ variant: "ghost" })}>Reintentar</button>
            </p>
          )}
          {h.carga === "listo" && h.lista.length === 0 && (
            <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-4 text-sm text-[var(--text-secondary)]">Todos los adelantos abiertos ya tienen su firma. No hay nada que imprimir.</p>
          )}

          {h.lista.length > 0 && (
            <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]" data-hoja-lista>
              {h.lista.map((a) => (
                <li key={a.id}>
                  <label className="flex min-h-14 cursor-pointer items-start gap-3 px-3 py-2.5">
                    <Casilla checked={h.elegidos.has(a.id)} onChange={() => h.alternar(a.id)} disabled={ocupado} className="mt-1" aria-label={`Incluir a ${a.persona}`} />
                    <span className="grid min-w-0 flex-1 gap-x-3 gap-y-0.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_auto]">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{a.persona}</span>
                        <span className="block text-sm text-[var(--text-secondary)]">
                          DNI {a.documento ?? "—"} · {fechaCorta(new Date(a.fecha))}
                        </span>
                      </span>
                      <span className="min-w-0 truncate text-sm text-[var(--text-secondary)]">{a.concepto}</span>
                      <span className="text-sm tabular-nums text-[var(--text-primary)] sm:text-right">
                        <span className="font-bold">{fmtMon(a.monto, a.moneda)}</span>
                        <span className="block text-[var(--text-secondary)]">Saldo {fmtMon(a.saldo, a.moneda)}</span>
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {h.lista.length > 0 && (
            <section className="space-y-2 rounded-xl bg-[var(--surface-sunken)] p-3" aria-label="Foto de la hoja firmada">
              <p className="text-sm font-bold text-[var(--text-primary)]">Hoja firmada {h.impresa ? `(${h.codigo})` : ""}</p>
              <p className="text-sm text-[var(--text-secondary)]">
                {!h.puedeSubir
                  ? "Sólo el dueño o el administrador sube la hoja firmada."
                  : h.impresa
                  ? `Cuando firmen, toma la foto de la hoja ${h.codigo}: se une a los ${n} adelantos marcados.`
                  : "Primero imprime la hoja; luego podrás subir su foto."}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setCamara(true)} disabled={ocupado || !h.impresa || !h.puedeSubir || n === 0} className={button({ variant: "secondary" })} data-hoja-camara>
                  <Camera className="h-4 w-4" aria-hidden /> Tomar la foto
                </button>
                <button type="button" onClick={() => archivo.current?.click()} disabled={ocupado || !h.impresa || !h.puedeSubir || n === 0} className={button({ variant: "secondary" })} data-hoja-archivo>
                  <Upload className="h-4 w-4" aria-hidden /> {h.trabajando === "subiendo" ? "Subiendo…" : "Subir la foto de la hoja firmada"}
                </button>
                <input ref={archivo} type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => deArchivo(e.target.files?.[0])} data-hoja-input />
              </div>
            </section>
          )}
        </div>
      </AdminModal>
      {camara && <CapturaFoto onCerrar={() => setCamara(false)} onFoto={(d) => void deCamara(d)} />}
    </>
  );
}
