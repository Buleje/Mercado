"use client";

/**
 * Anexo04Campos — los datos que el emisor llena en el ANEXO N° 04: cabecera
 * (logo, razón social, N°, GTF), observaciones y el firmante (13)-(16).
 *
 * Dos ayudas pensadas para el aserradero, donde se emite guía tras guía:
 * el **correlativo** avanza solo desde el último usado, y los **emisores**
 * quedan guardados por tenant para elegirlos de una lista en vez de re-tipear
 * nombre, DNI y cargo cada vez.
 *
 * ── 2026-09-09: en TRES pestañas, no en una columna de dos metros ───────────
 * Todo esto vivía apilado en una sola columna: razón social, N°, GTF, un
 * textarea de observaciones, el detalle por especie, el firmante, tres cajas de
 * imágenes, los emisores guardados y las dos preferencias de armado. Para
 * cambiar el cargo del firmante había que scrollear por encima de la papelería
 * (Brandon: «está muy alargado y mal hecho»).
 *
 * Ahora se agrupa por MOMENTO: lo que se llena en cada guía (Emisión), quién
 * firma (Firmante) y lo que se carga una vez en la vida (Papelería). Las
 * observaciones —un texto largo que se escribe una vez y se relee poco— salen
 * de la columna y se escriben en su propio modal, con el detalle por especie al
 * lado para poder copiarlo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ImageIcon, List, MessageSquare, Trash2, UserPlus, X } from "@buleje/design-system/icons";
import {
  fmtAnexo, siguienteCorrelativo, type Anexo04, type DatosAnexo04, type EmisorGuardado,
} from "@/lib/forestal/anexo04-serfor";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { claveTenant } from "@/hooks/use-anexo04-datos";

/**
 * Junta los bloques de una MISMA especie·tipo aunque el lote haya pasado de
 * 35 piezas y sigan en un bloque de continuación en otra hoja — para "más
 * detalles" el operario quiere UNA línea por especie·tipo, no una por
 * recuadro impreso.
 */
function resumenPorEspecieTipo(anexo: Anexo04) {
  const filas = new Map<string, { especie: string; tipo: string; piezas: number; pt: number; m3: number }>();
  for (const hoja of anexo.hojas) {
    for (const b of hoja.bloques) {
      const key = `${b.especie}||${b.tipo}`;
      const pt = anexo.unidadV === "pt" ? b.subtotal : b.m3 * PT_POR_M3;
      const prev = filas.get(key) ?? { especie: b.especie, tipo: b.tipo, piezas: 0, pt: 0, m3: 0 };
      prev.piezas += b.filas.reduce((a, f) => a + f.cantidad, 0);
      prev.pt += pt;
      prev.m3 += b.m3;
      filas.set(key, prev);
    }
  }
  return [...filas.values()];
}

const INPUT = "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const LABEL = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const MINI = "inline-flex h-11 shrink-0 items-center gap-1 rounded-xl border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]";

/** Lado máximo del logo guardado: entra nítido en la hoja sin inflar localStorage. */
const LOGO_MAX_PX = 320;
const LOGO_MAX_BYTES = 5_000_000;

/** Lee el archivo, lo reduce a `LOGO_MAX_PX` y devuelve dataURL + proporción. */
async function leerLogo(file: File): Promise<{ src: string; aspect: number }> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error("no se pudo leer el archivo"));
    fr.readAsDataURL(file);
  });
  const img = new window.Image();
  img.src = dataUrl;
  await img.decode();
  const escala = Math.min(1, LOGO_MAX_PX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * escala));
  const h = Math.max(1, Math.round(img.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
  return { src: canvas.toDataURL("image/png"), aspect: img.width / img.height };
}

/**
 * Una imagen del emisor en el apartado: preview grande, dónde se imprime y el
 * botón de quitarla. La caja es alta a propósito —un logo de 14 px de alto no
 * se puede juzgar— y dice si ya está guardada.
 */
function ImagenGuardada({ src, label, donde, onArchivo, onQuitar }: {
  src?: string; label: string; donde: string;
  onArchivo: (f?: File) => void; onQuitar: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1">
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { onArchivo(e.target.files?.[0]); e.target.value = ""; }} />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        title={src ? `Cambiar ${label.toLowerCase()}` : `Subir ${label.toLowerCase()}`}
        aria-label={`${src ? "Cambiar" : "Subir"} ${label.toLowerCase()}`}
        className={`flex h-20 w-full items-center justify-center overflow-hidden rounded-xl border-2 bg-[var(--surface-raised)] p-1 transition ${src ? "border-[var(--data-success-500)]/50" : "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}
      >
        {src
          // eslint-disable-next-line @next/next/no-img-element -- dataURL local, no pasa por el optimizador
          ? <img src={src} alt={label} className="max-h-full max-w-full object-contain" />
          : <span className="flex flex-col items-center gap-1 text-[length:var(--ts-2xs)] font-bold"><ImageIcon className="h-5 w-5" /> Subir</span>}
      </button>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)]">{label}</span>
        {src && (
          <button type="button" onClick={onQuitar} className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] underline hover:text-[var(--data-error-700)]">
            Quitar
          </button>
        )}
      </div>
      <p className="text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)]">{donde}</p>
    </div>
  );
}

/** Pestañas del panel: se agrupan por MOMENTO de llenado, no por número de casillero. */
type Pestana = "emision" | "firmante" | "papeleria" | "resumen";
const PESTANAS: { id: Pestana; label: string; ayuda: string }[] = [
  { id: "emision", label: "Emisión", ayuda: "Lo que cambia en cada guía: N°, GTF, razón social" },
  { id: "firmante", label: "Firmante", ayuda: "Quién firma el anexo (13)-(16)" },
  { id: "papeleria", label: "Papelería", ayuda: "Logo, firma y sello — se cargan una vez" },
  { id: "resumen", label: "Resumen", ayuda: "Qué sale del anexo entero, por especie y tipo" },
];

/**
 * (12) Observaciones en su propio modal.
 *
 * Es el único campo largo del anexo y estaba empujando cuatro apartados hacia
 * abajo en una columna angosta. Acá se escribe con lugar —y con el detalle por
 * especie al lado, para copiarlo si el emisor quiere dejarlo en el papel—.
 *
 * El `Escape` se corta en el contenedor: el modal del anexo escucha Escape en
 * `window` y sin esto cerraría el anexo entero mientras se escribe.
 */
function ObservacionesModal({
  valor, onChange, resumen, unidadPt, onCerrar,
}: {
  valor: string;
  onChange: (v: string) => void;
  resumen: { especie: string; tipo: string; piezas: number; pt: number; m3: number }[];
  unidadPt: boolean;
  onCerrar: () => void;
}) {
  /* Foco al abrir, con ref: `autoFocus` en un textarea lo marca la regla de
     a11y (y en un modal es exactamente lo que se quiere). */
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { areaRef.current?.focus(); }, []);
  const detalle = resumen
    .map((r) => `${r.especie} · ${r.tipo}: ${r.piezas} pzas · ${fmtAnexo(r.pt)} PT · ${fmtAnexo(r.m3)} m³`)
    .join("\n");
  return (
    <div
      className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onCerrar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Observaciones del anexo"
        className="w-full max-w-2xl rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
              <MessageSquare className="h-4 w-4 text-[var(--accent)]" /> (12) Observaciones
            </h4>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
              Es una declaración jurada: lo que dice acá lo escribe quien firma. Vacío no imprime nada.
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar observaciones"
            className="rounded-xl p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <textarea
          ref={areaRef}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          rows={7}
          placeholder="Ej.: procede íntegro de la GTF, sin discrepancias con lo aserrado. Fecha de aserrío, destino, o cualquier aclaración del lote."
          className="mt-3 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm font-semibold leading-relaxed text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />

        {/* El detalle por especie · tipo NO se imprime solo: es un texto que el
            emisor puede copiar al casillero si quiere dejarlo escrito. */}
        {resumen.length > 0 && (
          <div className="mt-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={LABEL}>Detalle por especie · tipo{unidadPt ? "" : ""}</span>
              <button
                type="button"
                onClick={() => onChange(valor ? `${valor}\n${detalle}` : detalle)}
                title="Agrega este detalle al texto de (12) Observaciones — queda editable, se puede borrar después"
                className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] hover:underline"
              >
                <List className="h-3 w-3" /> Agregar al texto
              </button>
            </div>
            <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
              {resumen.map((r) => (
                <li key={`${r.especie}||${r.tipo}`} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs">
                  <span className="font-semibold text-[var(--text-primary)]">{r.especie} · {r.tipo}</span>
                  <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                    {r.piezas} pzas · {fmtAnexo(r.pt)} PT · {fmtAnexo(r.m3)} m³
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={!valor}
            className="inline-flex h-10 items-center rounded-xl border border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            Borrar
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="inline-flex h-10 items-center rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:brightness-95"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Anexo04Campos({

  datos, onChange, ficha, onError, anexo,
}: {
  datos: DatosAnexo04;
  onChange: (patch: Partial<DatosAnexo04>) => void;
  /** Identidad legal del CTP, para llenar la cabecera con lo registrado. */
  ficha?: { razonSocial?: string; representante?: string; representanteDni?: string } | null;
  onError?: (msg: string) => void;
  /** Para el resumen por especie·tipo debajo de Observaciones. */
  anexo: Anexo04;
}) {
  const [emisores, setEmisores] = useState<EmisorGuardado[]>([]);
  const [tab, setTab] = useState<Pestana>("emision");
  const [verObs, setVerObs] = useState(false);
  const resumen = useMemo(() => resumenPorEspecieTipo(anexo), [anexo]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(claveTenant("emisores-"));
      if (raw) setEmisores(JSON.parse(raw) as EmisorGuardado[]);
    } catch { /* json corrupto → lista vacía */ }
  }, []);

  const persistirEmisores = (next: EmisorGuardado[]) => {
    setEmisores(next);
    try { localStorage.setItem(claveTenant("emisores-"), JSON.stringify(next)); } catch { /* quota */ }
  };

  /** Guarda (o actualiza por nombre) el firmante que está cargado ahora. */
  const guardarEmisor = () => {
    const nuevo: EmisorGuardado = { firmante: datos.firmante.trim(), documento: datos.documento.trim(), cargo: datos.cargo.trim() };
    if (!nuevo.firmante) { onError?.("Escribí el nombre del emisor antes de guardarlo."); return; }
    persistirEmisores([nuevo, ...emisores.filter((e) => e.firmante.toLowerCase() !== nuevo.firmante.toLowerCase())].slice(0, 8));
  };

  /** Sube logo, firma o sello: mismo camino (validar → reducir → guardar). */
  const subirImagen = async (file: File | undefined, campo: "logo" | "firma" | "sello", campoAspecto: "logoAspect" | "firmaAspect" | "selloAspect") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { onError?.("Tiene que ser una imagen."); return; }
    if (file.size > LOGO_MAX_BYTES) { onError?.("La imagen pesa demasiado (máx 5 MB)."); return; }
    try {
      const { src, aspect } = await leerLogo(file);
      onChange({ [campo]: src, [campoAspecto]: aspect } as Partial<DatosAnexo04>);
    } catch { onError?.("No se pudo leer la imagen."); }
  };

  const obs = datos.observaciones.trim();

  return (
    <div className="space-y-2.5">
      {/* Las tres pestañas: lo de cada guía, quién firma, y lo que se carga una
          vez. Alto fijo de 11 (h-11) para que se toque con el dedo. */}
      <div
        role="tablist"
        aria-label="Datos del anexo"
        className="grid grid-cols-4 gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-1"
      >
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={tab === p.id}
            onClick={() => setTab(p.id)}
            title={p.ayuda}
            className={`h-9 rounded-lg text-xs font-bold transition ${
              tab === p.id
                ? "bg-[var(--surface-raised)] text-[var(--accent-ink)] shadow-[var(--shadow-xs)] dark:text-[var(--accent)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── EMISIÓN: lo que cambia guía a guía ──────────────────────────── */}
      {tab === "emision" && (
        <>
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className={LABEL}>Razón social del emisor</span>
              {ficha && (ficha.razonSocial || ficha.representante) && (
                <button
                  type="button"
                  onClick={() => onChange({
                    ...(ficha.razonSocial ? { empresa: ficha.razonSocial } : {}),
                    ...(ficha.representante ? { firmante: ficha.representante } : {}),
                    ...(ficha.representanteDni ? { documento: ficha.representanteDni } : {}),
                  })}
                  title="Traer razón social, representante y DNI de la Ficha legal del CTP"
                  className="text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] hover:underline"
                >
                  Traer de la ficha
                </button>
              )}
            </div>
            <div className="mt-1">
              <input value={datos.empresa} onChange={(e) => onChange({ empresa: e.target.value })} placeholder="Razón social" className={INPUT} />
            </div>
          </div>

          {/* (1) N° con correlativo automático + (2) GTF */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className={LABEL}>(1) N°</span>
              <div className="mt-1 flex gap-1.5">
                <input value={datos.numero} onChange={(e) => onChange({ numero: e.target.value })} placeholder="2-19-0461363" className={INPUT} />
                <button
                  type="button"
                  onClick={() => onChange({ numero: siguienteCorrelativo(datos.numero) })}
                  disabled={!datos.numero}
                  title="Siguiente correlativo (el N° avanza solo)"
                  aria-label="Siguiente correlativo"
                  className={`${MINI} w-10 justify-center px-0 disabled:opacity-40`}
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </label>
            <label className="block"><span className={LABEL}>(2) GTF N°</span>
              <input value={datos.gtf} onChange={(e) => onChange({ gtf: e.target.value })} placeholder="19-001-0000052" className={`mt-1 ${INPUT}`} />
            </label>
          </div>

          {/* (12) Observaciones: un botón, no un textarea de tres renglones que
              empujaba todo lo demás fuera de la pantalla. El botón dice si el
              campo tiene algo escrito — un botón mudo no se abre nunca. */}
          <button
            type="button"
            onClick={() => setVerObs(true)}
            className={`flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-left text-sm font-bold transition ${
              obs
                ? "border-[var(--accent)] bg-primary/8 text-[var(--text-primary)]"
                : "border-dashed border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            }`}
            title={obs || "Escribir las observaciones del anexo (12)"}
          >
            <MessageSquare className="h-4 w-4 shrink-0 text-[var(--accent)]" />
            <span className="shrink-0">(12) Observaciones</span>
            <span className="ml-auto min-w-0 truncate text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">
              {obs ? obs.replace(/\s+/g, " ").slice(0, 42) + (obs.length > 42 ? "…" : "") : "en blanco"}
            </span>
          </button>

          {/* Cómo se arma la hoja */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="block"><span className={LABEL}>Columna (10) V</span>
              <select value={datos.unidadV} onChange={(e) => onChange({ unidadV: e.target.value as DatosAnexo04["unidadV"] })} className={`mt-1 ${INPUT}`}>
                <option value="pt">Pie tablar</option>
                <option value="m3">m³</option>
              </select>
            </label>
            <label className="block"><span className={LABEL}>Filas por bloque</span>
              <select value={datos.modo} onChange={(e) => onChange({ modo: e.target.value as DatosAnexo04["modo"] })} className={`mt-1 ${INPUT}`}>
                <option value="oficial">35 (oficial)</option>
                <option value="compacto">Solo las usadas</option>
              </select>
            </label>
          </div>
          <p className="text-[length:var(--ts-2xs)] leading-relaxed text-[var(--text-tertiary)]">
            Un bloque por especie + tipo de producto, sin mezclarse. Si una combinación pasa de 35 piezas, sigue en el bloque siguiente.
          </p>
        </>
      )}

      {/* ── FIRMANTE (13)-(16) ──────────────────────────────────────────── */}
      {tab === "firmante" && (
        <>
          <label className="block"><span className={LABEL}>(14) Nombres y apellidos</span>
            <div className="mt-1 flex gap-1.5">
              <input value={datos.firmante} onChange={(e) => onChange({ firmante: e.target.value })} placeholder="Del emisor" className={INPUT} />
              <button type="button" onClick={guardarEmisor} title="Guardar este emisor para las próximas guías" className={MINI}>
                <UserPlus className="h-3.5 w-3.5" /> Guardar
              </button>
            </div>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className={LABEL}>(15) Documento</span>
              <input value={datos.documento} onChange={(e) => onChange({ documento: e.target.value })} inputMode="numeric" placeholder="DNI" className={`mt-1 ${INPUT}`} />
            </label>
            <label className="block"><span className={LABEL}>(16) Cargo</span>
              <input value={datos.cargo} onChange={(e) => onChange({ cargo: e.target.value })} placeholder="Regente / Jefe de planta" className={`mt-1 ${INPUT}`} />
            </label>
          </div>
          {emisores.length > 0 && (
            <div>
              <span className={LABEL}>Guardados en este equipo</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {emisores.map((e) => {
                  const activo = e.firmante === datos.firmante && e.documento === datos.documento && e.cargo === datos.cargo;
                  return (
                    <span key={e.firmante} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[length:var(--ts-2xs)] font-bold transition ${activo ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)]"}`}>
                      <button type="button" onClick={() => onChange({ firmante: e.firmante, documento: e.documento, cargo: e.cargo })} title={`${e.cargo || "sin cargo"}${e.documento ? ` · ${e.documento}` : ""}`} className="max-w-[10rem] truncate">
                        {activo && <Check className="mr-1 inline h-3 w-3" />}{e.firmante}
                      </button>
                      <button type="button" onClick={() => persistirEmisores(emisores.filter((x) => x.firmante !== e.firmante))} aria-label={`Quitar ${e.firmante}`} className="text-[var(--text-tertiary)] hover:text-[var(--data-error-700)]">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── PAPELERÍA: lo que se carga una vez y queda ──────────────────── */}
      {tab === "papeleria" && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className={LABEL}>Logo, firma y sello del emisor</span>
            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              {[datos.logo, datos.firma, datos.sello].filter(Boolean).length}/3 guardados
            </span>
          </div>
          <p className="mt-0.5 text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)]">
            Se guardan en este equipo y salen en todos los anexos que emitas. PNG con fondo transparente es lo que mejor imprime.
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <ImagenGuardada
              src={datos.logo}
              label="Logo"
              donde="Arriba a la izquierda, al lado de la razón social"
              onArchivo={(f) => void subirImagen(f, "logo", "logoAspect")}
              onQuitar={() => onChange({ logo: undefined, logoAspect: undefined })}
            />
            <ImagenGuardada
              src={datos.firma}
              label="Firma"
              donde="Sobre la línea (13), a la derecha"
              onArchivo={(f) => void subirImagen(f, "firma", "firmaAspect")}
              onQuitar={() => onChange({ firma: undefined, firmaAspect: undefined })}
            />
            <ImagenGuardada
              src={datos.sello}
              label="Sello"
              donde="A la izquierda de la firma"
              onArchivo={(f) => void subirImagen(f, "sello", "selloAspect")}
              onQuitar={() => onChange({ sello: undefined, selloAspect: undefined })}
            />
          </div>
        </div>
      )}

      {/* ── RESUMEN: qué sale del anexo ENTERO, por especie y tipo ───────
          Brandon, 2026-09-09: «que se vea el resumen por tipo y especie del
          anexo, general de todo el anexo». El papel se lee bloque por bloque
          —35 filas cada uno— y la pregunta de negocio («de tornillo, cuánta
          paquetería sale») se contestaba sumando a mano. */}
      {tab === "resumen" && (
        resumen.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-6 text-center text-sm text-[var(--text-tertiary)]">
            El anexo todavía no tiene piezas.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
            <table className="w-full text-sm">
              <caption className="sr-only">Resumen del anexo por especie y tipo</caption>
              <thead className="bg-[var(--surface-sunken)]">
                <tr>
                  <th scope="col" className={`${LABEL} px-2 py-1.5 text-left`}>Especie · tipo</th>
                  {/* Piezas · m³ · PT, la convención del módulo. */}
                  <th scope="col" className={`${LABEL} px-2 py-1.5 text-right`}>Pzas</th>
                  <th scope="col" className={`${LABEL} px-2 py-1.5 text-right`}>m³</th>
                  <th scope="col" className={`${LABEL} px-2 py-1.5 text-right`}>PT</th>
                  <th scope="col" className={`${LABEL} px-2 py-1.5 text-right`}>%</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r) => (
                  <tr key={`${r.especie}||${r.tipo}`} className="border-t border-[var(--rule-soft)]">
                    <td className="px-2 py-1.5">
                      <span className="font-bold text-[var(--text-primary)]">{r.tipo}</span>
                      <span className="block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{r.especie}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{r.piezas}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtAnexo(r.m3)}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtAnexo(r.pt, 0)}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
                      {anexo.totalM3 > 0 ? Math.round((r.m3 / anexo.totalM3) * 1000) / 10 : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  <th scope="row" className="px-2 py-1.5 text-left">
                    Todo el anexo · {resumen.length} {resumen.length === 1 ? "línea" : "líneas"}
                  </th>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{anexo.totalPiezas}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtAnexo(anexo.totalM3)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtAnexo(anexo.totalPt, 0)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">100</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}

      {verObs && (
        <ObservacionesModal
          valor={datos.observaciones}
          onChange={(v) => onChange({ observaciones: v })}
          resumen={resumen}
          unidadPt={anexo.unidadV === "pt"}
          onCerrar={() => setVerObs(false)}
        />
      )}
    </div>
  );
}
