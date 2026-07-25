"use client";

/**
 * Anexo04Modal — vista previa del PDF antes de descargarlo. Muestra el lote
 * cubicado ya maquetado en el ANEXO N° 04 de SERFOR ("Lista de productos
 * transformados"): 4 bloques por hoja, un bloque por especie + tipo de producto.
 * Lo que se ve es lo que se descarga: el preview y el PDF comparten geometría
 * (`geometriaHoja`) y datos (`construirAnexo04`).
 *
 * Los datos de cabecera/pie (N°, GTF, emisor, firmante) quedan guardados por
 * tenant en localStorage: en el aserradero se emite guía tras guía y nadie
 * quiere re-tipear la razón social ni el DNI del responsable.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Download, FileText, Minus, Plus, Printer, X } from "@buleje/design-system/icons";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  construirAnexo04, fmtAnexo, DATOS_ANEXO04_DEFAULT, type DatosAnexo04,
} from "@/lib/forestal/anexo04-serfor";
import { exportarAnexo04PDF } from "@/lib/forestal/anexo04-pdf";
import Anexo04Hoja, { ANEXO04_CSS } from "./Anexo04Hoja";

const A4_PX = 794; // ancho de una hoja A4 a 96 dpi
const claveDatos = () => {
  let slug = "main";
  try { slug = localStorage.getItem("active-tenant-slug") ?? "main"; } catch { /* ignore */ }
  return `buleje-anexo04-${slug}`;
};

const INPUT = "h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const LABEL = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const BTN = "inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]";

/** Imprime un HTML independiente vía iframe oculto (sin popup). */
function imprimirHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) { iframe.remove(); return; }
  doc.open(); doc.write(html); doc.close();
  iframe.contentWindow?.focus();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1500);
  }, 400);
}

export default function Anexo04Modal({
  rows, especieGlobal, onPdfDetallado, onCerrar, onAviso,
}: {
  rows: PiezaCubicada[];
  especieGlobal?: string;
  /** Descarga el PDF interno detallado (el de siempre, con precios y tipos). */
  onPdfDetallado: () => void;
  onCerrar: () => void;
  onAviso?: (msg: string, tono: "success" | "error") => void;
}) {
  const [datos, setDatos] = useState<DatosAnexo04>(DATOS_ANEXO04_DEFAULT);
  const [factor, setFactor] = useState(1);      // multiplica el ajuste automático
  const [fit, setFit] = useState(0.9);          // escala para que la hoja entre a lo ancho
  const [generando, setGenerando] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const hojasRef = useRef<HTMLDivElement>(null);

  // Cabecera guardada por tenant (se re-usa en cada guía).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(claveDatos());
      if (raw) setDatos({ ...DATOS_ANEXO04_DEFAULT, ...(JSON.parse(raw) as Partial<DatosAnexo04>) });
    } catch { /* json corrupto → defaults */ }
  }, []);
  const set = (patch: Partial<DatosAnexo04>) => {
    setDatos((d) => {
      const next = { ...d, ...patch };
      try { localStorage.setItem(claveDatos(), JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  // La hoja entra siempre a lo ancho del panel; el ± sólo la agranda desde ahí.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const medir = () => setFit(Math.min(1, (el.clientWidth - 24) / A4_PX));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ojo con las deps: sólo lo ESTRUCTURAL. Si dependiera de `datos` entero, cada
  // tecla en la razón social devolvería hojas nuevas y tiraría abajo el memo de
  // la grilla (840 celdas por hoja).
  const anexo = useMemo(
    () => construirAnexo04(rows, { unidadV: datos.unidadV, modo: datos.modo }, { especieGlobal }),
    [rows, datos.unidadV, datos.modo, especieGlobal],
  );
  const escala = Math.max(0.25, fit * factor);

  const descargar = () => {
    setGenerando(true);
    exportarAnexo04PDF(rows, datos, { especieGlobal })
      .then(() => onAviso?.("Anexo N° 04 descargado", "success"))
      .catch(() => onAviso?.("No se pudo generar el PDF.", "error"))
      .finally(() => setGenerando(false));
  };

  const imprimir = () => {
    const hojas = [...(hojasRef.current?.querySelectorAll(".anx-hoja") ?? [])].map((n) => n.outerHTML).join("");
    imprimirHtml(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Anexo N° 04</title><style>${ANEXO04_CSS}
      @page { size: A4 portrait; margin: 0 }
      body { margin: 0 }
      /* break-BEFORE en las hojas siguientes: con "after" el navegador imprime
         una página en blanco al final. */
      .anx-hoja + .anx-hoja { page-break-before: always; }
    </style></head><body>${hojas}</body></html>`);
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 pt-[3vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
    >
      <div role="dialog" aria-modal="true" aria-label="Vista previa del Anexo N° 04" className="w-full max-w-[76rem] rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-lg)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <CardTitle as="h3" className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
              <FileText className="h-5 w-5 text-[var(--accent)]" /> Vista previa · ANEXO N° 04
            </CardTitle>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
              Lista de productos transformados · {anexo.hojas.length} hoja{anexo.hojas.length === 1 ? "" : "s"} ·{" "}
              {anexo.totalPiezas} piezas · {fmtAnexo(anexo.totalM3)} m³
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[19rem_1fr]">
          {/* Datos del formato */}
          <div className="space-y-2.5 lg:max-h-[74vh] lg:overflow-y-auto lg:pr-1">
            <label className="block"><span className={LABEL}>Empresa / CTP emisor</span>
              <input value={datos.empresa} onChange={(e) => set({ empresa: e.target.value })} placeholder="Razón social" className={`mt-1 ${INPUT}`} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className={LABEL}>(1) N°</span>
                <input value={datos.numero} onChange={(e) => set({ numero: e.target.value })} placeholder="2-19-0461363" className={`mt-1 ${INPUT}`} />
              </label>
              <label className="block"><span className={LABEL}>(2) GTF N°</span>
                <input value={datos.gtf} onChange={(e) => set({ gtf: e.target.value })} placeholder="19-001-0000052" className={`mt-1 ${INPUT}`} />
              </label>
            </div>
            <label className="block"><span className={LABEL}>(12) Observaciones</span>
              <textarea value={datos.observaciones} onChange={(e) => set({ observaciones: e.target.value })} rows={2} placeholder="—" className="mt-1 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
            </label>
            <label className="block"><span className={LABEL}>(14) Nombres y apellidos</span>
              <input value={datos.firmante} onChange={(e) => set({ firmante: e.target.value })} placeholder="Del emisor" className={`mt-1 ${INPUT}`} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className={LABEL}>(15) Documento</span>
                <input value={datos.documento} onChange={(e) => set({ documento: e.target.value })} inputMode="numeric" placeholder="DNI" className={`mt-1 ${INPUT}`} />
              </label>
              <label className="block"><span className={LABEL}>(16) Cargo</span>
                <input value={datos.cargo} onChange={(e) => set({ cargo: e.target.value })} placeholder="Regente / Jefe de planta" className={`mt-1 ${INPUT}`} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <label className="block"><span className={LABEL}>Columna (10) V</span>
                <select value={datos.unidadV} onChange={(e) => set({ unidadV: e.target.value as DatosAnexo04["unidadV"] })} className={`mt-1 ${INPUT}`}>
                  <option value="pt">Pie tablar</option>
                  <option value="m3">m³</option>
                </select>
              </label>
              <label className="block"><span className={LABEL}>Filas por bloque</span>
                <select value={datos.modo} onChange={(e) => set({ modo: e.target.value as DatosAnexo04["modo"] })} className={`mt-1 ${INPUT}`}>
                  <option value="oficial">35 (oficial)</option>
                  <option value="compacto">Solo las usadas</option>
                </select>
              </label>
            </div>
            <p className="text-[length:var(--ts-2xs)] leading-relaxed text-[var(--text-tertiary)]">
              Un bloque por especie + tipo de producto, sin mezclarse. Si una combinación pasa de 35 piezas, sigue en el bloque siguiente.
            </p>
          </div>

          {/* Preview del papel */}
          <div ref={areaRef} className="min-w-0 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Así se va a ver</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setFactor((f) => Math.max(0.5, f - 0.25))} aria-label="Alejar" className="rounded-lg border border-[var(--rule-base)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><Minus className="h-3.5 w-3.5" /></button>
                <span className="w-12 text-center font-mono text-xs font-bold text-[var(--text-secondary)]">{Math.round(escala * 100)}%</span>
                <button type="button" onClick={() => setFactor((f) => Math.min(3, f + 0.25))} aria-label="Acercar" className="rounded-lg border border-[var(--rule-base)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <style>{ANEXO04_CSS}</style>
            <div className="max-h-[64vh] overflow-auto">
              <div ref={hojasRef} style={{ width: A4_PX * escala }}>
                {anexo.hojas.map((hoja, i) => (
                  <div key={i} className="mb-3 shadow-[var(--shadow-md)]" style={{ width: A4_PX * escala, height: 1123 * escala }}>
                    <div style={{ transform: `scale(${escala})`, transformOrigin: "top left" }}>
                      <Anexo04Hoja hoja={hoja} datos={datos} anexo={anexo} nro={i + 1} total={anexo.hojas.length} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onPdfDetallado} title="El PDF interno de siempre: tipos, precios y subtotales" className={BTN}>
            <FileText className="h-4 w-4" /> PDF detallado (interno)
          </button>
          <button type="button" onClick={imprimir} className={BTN}>
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button type="button" onClick={descargar} disabled={generando} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-60">
            <Download className="h-4 w-4" /> {generando ? "Generando…" : "Descargar PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
