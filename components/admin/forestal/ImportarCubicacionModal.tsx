"use client";

/**
 * ImportarCubicacionModal — trae piezas desde un Excel/CSV o desde una FOTO
 * de la planilla escrita a mano, y las suma al lote. Los dos caminos
 * terminan en el MISMO preview: el operario ve qué se va a agregar —y en el
 * caso de la foto, la foto misma al lado para cotejar letra por letra— y
 * recién ahí confirma. Nada se agrega a ciegas.
 */
import { useRef, useState } from "react";
import { AlertTriangle, Camera, Check, ClipboardPaste, Download, FileSpreadsheet, Loader2, Mic, Sparkles, Upload } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { Btn, MODAL_BODY, ModalFooter } from "./ctp-shared";
import type { PiezaImportada } from "@/lib/forestal/cubicacion-import";
import { formatNumber } from "@/lib/format";
import type { PlanillaId } from "@/lib/forestal/planillas/tipos";
import SelectorPlanilla from "./planillas/SelectorPlanilla";
import AyudaDelOrigen, { type OrigenImport } from "./cubicador-importar-ayuda";
import VistaPreviaImportacion from "./cubicador-importar-vista-previa";
import TablaParaPegar from "./cubicador-pegar-tabla";
import { olvidarBorradorPegar } from "./hooks/use-tabla-pegar";
import { useLeerImportacion } from "./hooks/use-leer-importacion";
import type { ResumenPegado } from "@/lib/forestal/cubicacion-pegar";
import { fmtM3, fmtPiezas, fmtPt as fmtPtEntero } from "@/lib/forestal/cubicacion-formato";

const fmtPt = (v: number) => formatNumber(v, 2);

export default function ImportarCubicacionModal({
  onAgregar, onCerrar, filasActuales = 0, duenos = [], planillaInicial = null, modoInicial, textoPegado = null, especies = [],
}: {
  /** Suma las piezas leídas al lote del cubicador. */
  onAgregar: (piezas: PiezaImportada[], origen: OrigenImport) => void;
  onCerrar: () => void;
  /** Filas que YA tiene el lote — se muestra que la importación se suma a ellas. */
  filasActuales?: number;
  /** Los dueños que ya existen: «dueño X» en un audio sólo elige entre ellos. */
  duenos?: readonly string[];
  /** Llegó desde Herramientas › Planillas de campo: abre en «Foto» con esa hoja elegida. */
  planillaInicial?: PlanillaId | null;
  /** «Pegar de Excel» o un Ctrl+V de una tabla en la vista Cargar: abre en la tabla para pegar. */
  modoInicial?: "pegar";
  /** Lo pegado con Ctrl+V fuera de un campo: la tabla abre ya llena. */
  textoPegado?: string | null;
  /** Las especies del negocio, para la tabla para pegar. */
  especies?: readonly string[];
}) {
  const [modo, setModo] = useState<OrigenImport>(modoInicial ?? (planillaInicial ? "foto" : "excel"));
  /* La tabla para pegar queda montada (escondida) una vez vista: ir a «Desde
     Excel» y volver no pierde lo pegado ni su Ctrl+Z. */
  const [pegarVisto, setPegarVisto] = useState(modoInicial === "pegar");
  const [resumenPegado, setResumenPegado] = useState<ResumenPegado | null>(null);
  /** La planilla de la foto: con una elegida, la IA la lee con su prompt (el del negocio si lo guardó). */
  const [planilla, setPlanilla] = useState<PlanillaId | null>(planillaInicial);
  const {
    resultado, setResultado, nombreArchivo, setNombreArchivo, cargando, errorGeneral, setErrorGeneral,
    fotoUrl, setFotoUrl, advertenciaIA, setAdvertenciaIA, transcript, setTranscript,
    procesar, procesarFoto, procesarAudio, bajando, descargarPlantilla,
  } = useLeerImportacion({ planilla, duenos });
  const inputRef = useRef<HTMLInputElement>(null);

  const totalPt = resultado?.piezas.reduce((a, p) => a + p.pieTablar, 0) ?? 0;
  const totalPiezas = resultado?.piezas.reduce((a, p) => a + p.cantidad, 0) ?? 0;
  const raras = resultado?.piezas.filter((p) => p.sospechosa).length ?? 0;
  /** Lo que hay para agregar, ya leído: `null` mientras no haya nada. */
  const listas =
    modo === "pegar"
      ? (resumenPegado && resumenPegado.piezas.length > 0 ? resumenPegado.piezas : null)
      : resultado && !cargando && resultado.piezas.length > 0 ? resultado.piezas : null;
  const piezasPegadas = resumenPegado?.totalPiezas ?? 0;
  const notaPegar = resumenPegado && listas
    ? `${fmtPiezas(piezasPegadas)} piezas · ${fmtPtEntero(resumenPegado.pt)} PT · ${fmtM3(resumenPegado.m3)} m³${resumenPegado.filasConError > 0 ? ` · ${resumenPegado.filasConError} ${resumenPegado.filasConError === 1 ? "fila en rojo queda" : "filas en rojo quedan"} fuera` : ""}`
    : undefined;

  const META = {
    excel: { title: "Importar cubicación desde Excel", description: "Especie · Cantidad · Espesor · Ancho · Largo", icon: FileSpreadsheet },
    pegar: { title: "Pegar desde Excel", description: "Copia una o varias columnas de tu Excel y pégalas en la tabla", icon: ClipboardPaste },
    foto: { title: "Escanear planilla de cubicación", description: "Foto de la planilla llenada a mano, leída con IA", icon: Camera },
    audio: { title: "Importar dictado de audio", description: "Un archivo de audio con las medidas dictadas seguidas, transcrito y clasificado", icon: Mic },
  } as const;

  return (
    // AdminModal (Radix): trae Escape, focus trap, scroll lock y bottom-sheet en
    // móvil — este modal no tenía ninguno de los cuatro.
    <AdminModal
      /* El cubicador vive DENTRO de otro modal («Producir sin lote», que se
         pinta en z-60): sin esto se monta detrás, invisible, y como Radix apaga
         los clics del resto de la página la pantalla parece colgada. */
      aboveModals
      open
      onClose={onCerrar}
      variant="wide"
      size={modo === "pegar" ? "planilla" : undefined}
      title={META[modo].title}
      description={META[modo].description}
      icon={META[modo].icon}
      // El pie vivía `sticky` DENTRO del scroll con un `-mx-5` calzado a mano al
      // padding del cuerpo: cualquier cambio de padding lo descuadraba. Con la
      // prop `footer` de AdminModal queda fuera del scroll y sin compensaciones.
      footer={
        <ModalFooter
          error={errorGeneral}
          nota={
            modo === "pegar" ? notaPegar : listas
              ? `${listas.length} fila(s) · ${totalPiezas} piezas · ${fmtPt(totalPt)} PT${raras > 0 ? ` · ${raras} con medidas raras` : ""}`
              : undefined
          }
        >
          <Btn variant="ghost" onClick={onCerrar}>Cancelar</Btn>
          {/* Sólo se ofrece agregar cuando hay algo que agregar; el pie existe
              igual para que "Cancelar" no dependa de que el archivo se leyera. */}
          {listas && (
            <Btn variant="dark" onClick={() => { if (modo === "pegar") olvidarBorradorPegar(); onAgregar(listas, modo); onCerrar(); }}>
              <Check className="h-4 w-4" />
              {modo === "pegar"
                ? ` Agregar ${fmtPiezas(piezasPegadas)} ${piezasPegadas === 1 ? "pieza" : "piezas"} al lote${(resumenPegado?.filasConError ?? 0) > 0 ? ` (saltando ${resumenPegado?.filasConError} en rojo)` : ""}`
                : ` Agregar ${listas.length} al lote`}
              {filasActuales > 0 ? ` (quedará con ${filasActuales + listas.length})` : ""}
            </Btn>
          )}
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY}>
        <SegmentedControl
          value={modo}
          onChange={(v) => { setModo(v); if (v === "pegar") setPegarVisto(true); setResultado(null); setErrorGeneral(null); setAdvertenciaIA(null); setFotoUrl(null); setTranscript(null); setNombreArchivo(""); }}
          label="Origen de las piezas"
          className="mb-3"
          /* Cortos: con «Pegar» los cuatro «Desde …» medían 397 px y a 400 la última opción quedaba cortada. */
          options={[
            { value: "excel", label: "Excel", icon: <FileSpreadsheet className="h-4 w-4" /> },
            { value: "pegar", label: "Pegar", icon: <ClipboardPaste className="h-4 w-4" /> },
            { value: "foto", label: "Foto", icon: <Camera className="h-4 w-4" /> },
            { value: "audio", label: "Audio", icon: <Mic className="h-4 w-4" /> },
          ]}
        />

        <AyudaDelOrigen modo={modo} />

        {filasActuales > 0 && (
          <p className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-[var(--accent)]">
            <Check className="h-4 w-4 shrink-0" />
            Ya tienes <b>{filasActuales}</b> {filasActuales === 1 ? "fila" : "filas"} en el lote. Lo que importes se <b>suma</b> — no se borra nada de lo anterior.
          </p>
        )}

        {/* Elegir archivo */}
        {modo === "excel" ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void procesar(f); e.target.value = ""; }}
            className="hidden"
          />
          <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:brightness-95">
            <Upload className="h-4 w-4" /> Elegir archivo
          </button>
          <button type="button" onClick={descargarPlantilla} disabled={bajando} className="inline-flex h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50">
            {bajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Descargar plantilla (Excel)
          </button>
          {nombreArchivo && <span className="truncate text-xs text-[var(--text-tertiary)]">{nombreArchivo}</span>}
        </div>
        ) : modo === "foto" ? (
          <div className="space-y-3">
          <div className="sm:max-w-sm">
            <SelectorPlanilla destino="cubicador-madera" value={planilla} onChange={setPlanilla} disabled={cargando} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className={`inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:brightness-95 ${cargando ? "pointer-events-none opacity-70" : ""}`}>
              {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Tomar o elegir foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={cargando}
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void procesarFoto(f); e.target.value = ""; }}
              />
            </label>
            {nombreArchivo && <span className="truncate text-xs text-[var(--text-tertiary)]">{nombreArchivo}</span>}
          </div>
          </div>
        ) : modo === "audio" ? (
          <div className="flex flex-wrap items-center gap-3">
            <label className={`inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:brightness-95 ${cargando ? "pointer-events-none opacity-70" : ""}`}>
              {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Subir archivo de audio
              <input
                type="file"
                accept="audio/*"
                disabled={cargando}
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void procesarAudio(f); e.target.value = ""; }}
              />
            </label>
            {nombreArchivo && <span className="truncate text-xs text-[var(--text-tertiary)]">{nombreArchivo}</span>}
          </div>
        ) : null}

        {pegarVisto && (
          <div hidden={modo !== "pegar"}>
            <TablaParaPegar textoInicial={textoPegado} especies={especies} onCambio={setResumenPegado} />
          </div>
        )}

        {cargando && (
          <p className="mt-4 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> {modo === "excel" ? "Leyendo el archivo…" : modo === "foto" ? "Leyendo la foto con IA…" : "Transcribiendo el audio…"}
          </p>
        )}
        {/* El error del archivo va en el pie (fijo): repetirlo acá lo dejaba
            fuera de vista justo cuando la vista previa empujaba el scroll. */}

        {modo === "foto" && fotoUrl && !cargando && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL local, no vale la pena Next/Image */}
            <img src={fotoUrl} alt="Foto de la planilla escaneada" className="h-28 w-28 shrink-0 rounded-lg border border-[var(--rule-base)] object-cover" />
            <p className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
              Coteja cada fila de abajo contra esta foto antes de confirmar.
            </p>
          </div>
        )}

        {modo === "audio" && transcript && !cargando && (
          <div className="mt-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              <Mic className="h-3.5 w-3.5 shrink-0" /> Lo que se escuchó
            </p>
            <p className="max-h-24 overflow-y-auto text-sm text-[var(--text-secondary)]">{transcript}</p>
          </div>
        )}

        {advertenciaIA && !cargando && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {advertenciaIA}
          </p>
        )}

        {resultado && !cargando && <VistaPreviaImportacion resultado={resultado} modo={modo} />}
      </div>
    </AdminModal>
  );
}
