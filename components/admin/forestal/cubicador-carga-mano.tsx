"use client";

/**
 * «O cárgala a mano»: la fila de carga tipo planilla del cubicador — se tipea,
 * se pasa con → y se cierra con Enter. Salió de `cubicador-entrada-voz.tsx`
 * (Brandon 24-10, «Cargar compacta»: la carga a mano en UNA línea).
 *
 * Desde tablet, Cant. · Espesor · Ancho · Largo · Agregar van en una sola fila
 * aun con el panel a 436 px (1280 con las Últimas al lado): el candado de cada
 * medida va DENTRO de su campo y las dos herramientas de la fila (la voz que
 * repite y el Comercial mínimo) son íconos con su tooltip en el renglón del
 * título. En celular, grilla fija de 2 columnas (predecible, no depende del
 * ancho de cada etiqueta) con el candado al lado, del tamaño de un dedo.
 */
import { Kicker } from "@buleje/design-system";
import { Lock, Plus, Unlock, Volume2, VolumeX, Wand2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { IconAction } from "@/components/admin/shared/module-primitives";
import { button } from "@/components/ui-system/button-variants";
import type { MedidasFijas } from "@/lib/forestal/cubicacion";
import { CeldaNum, useTecladoGrilla } from "./celdas-excel";
import { Tecla } from "./cubicador-caja-dictado";

const COL_CANT = 0, COL_ESPESOR = 1, COL_ANCHO = 2, COL_LARGO = 3;
/** La fila de carga es SIEMPRE una sola fila (0) con estas 4 columnas — ver
 *  `totalFilas`/`columnas` en `celdas-excel.tsx`. */
const CARGA_COLUMNAS = [COL_CANT, COL_ESPESOR, COL_ANCHO, COL_LARGO] as const;

export type Manual = { cantidad: string; espesor: string; ancho: string; largo: string };
type Medida = "espesor" | "ancho" | "largo";

export interface CargaAManoProps {
  grillaId: string;
  manual: Manual;
  onManualChange: (v: Manual) => void;
  onConfirmarCarga: (grillaId: string) => void;
  fijas: MedidasFijas;
  onAplicarFijas: (next: MedidasFijas) => void;
  /** La voz que repite cada pieza (`config.speak`). */
  speakOn: boolean;
  onToggleSpeak: () => void;
}

const MEDIDAS: { campo: Medida; col: number; nombre: string; unidad: string; etiqueta: string }[] = [
  { campo: "espesor", col: COL_ESPESOR, nombre: "Espesor", unidad: "″", etiqueta: "Espesor en pulgadas" },
  { campo: "ancho", col: COL_ANCHO, nombre: "Ancho", unidad: "″", etiqueta: "Ancho en pulgadas" },
  { campo: "largo", col: COL_LARGO, nombre: "Largo", unidad: "pies", etiqueta: "Largo en pies" },
];

export default function CargaAMano({
  grillaId, manual, onManualChange, onConfirmarCarga, fijas, onAplicarFijas, speakOn, onToggleSpeak,
}: CargaAManoProps) {
  const teclasCarga = useTecladoGrilla({
    grilla: grillaId,
    onConfirmar: () => onConfirmarCarga(grillaId),
    enterSiempreConfirma: true,
    totalFilas: 1,
    columnas: CARGA_COLUMNAS,
  });
  const alternarFija = (campo: Medida) => {
    if (fijas[campo] != null) {
      const n = { ...fijas };
      delete n[campo];
      onAplicarFijas(n);
    } else {
      onAplicarFijas({ ...fijas, [campo]: Number(manual[campo]) || 0 });
    }
  };
  return (
    <div data-grilla={grillaId} className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5">
        <Kicker as="p" className="font-bold">O cárgala a mano</Kicker>
        {/* Sólo tiene sentido con teclado físico: en celular es ruido. */}
        <span className="hidden sm:inline-flex">
          <InfoTip
            side="bottom"
            icono="ayuda"
            title="Cargar con el teclado"
            ariaLabel="Atajos de teclado de la fila de carga"
            body={
              <span className="block space-y-1.5 text-xs font-normal leading-snug text-[var(--text-secondary)]">
                <span className="block"><Tecla>→</Tecla> <Tecla>←</Tecla> cambian de campo</span>
                <span className="block"><Tecla>Enter</Tecla> registra la pieza y vuelve al espesor</span>
                <span className="block">El candado de cada campo deja esa medida fija: no se vuelve a escribir hasta que lo sueltes.</span>
              </span>
            }
          />
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {/* La voz que repite, también acá: cargando a mano la vista suele
              estar lejos del micrófono, y apagarla (más rápido para cargar
              seguido) tiene que estar donde están los ojos. */}
          <IconAction
            icon={speakOn ? Volume2 : VolumeX}
            label={`Voz: ${speakOn ? "sí" : "no"}`}
            title={speakOn ? "Voz: sí — apaga la voz que repite cada pieza (más rápido para cargar)" : "Voz: no — prende la voz que repite cada pieza"}
            tone={speakOn ? "muted" : "accent"}
            aria-pressed={speakOn}
            onClick={onToggleSpeak}
          />
          {/* Precarga la medida típica del Comercial mínimo (2×8×10, Brandon
              2026-09-01): NO agrega nada sola, sólo llena los campos para que
              se confirme la cantidad real. Un piso automático sin pieza real
              detrás falsearía el Anexo 04. */}
          <IconAction
            icon={Wand2}
            label="Comercial mínimo"
            title="Comercial mínimo: precarga 2×8×10 — confirma la cantidad real que sacaste y toca «Agregar»"
            onClick={() => onManualChange({ cantidad: "1", espesor: "2", ancho: "8", largo: "10" })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end sm:gap-1.5">
        <CeldaCarga
          nombre="Cant." col={COL_CANT} valor={manual.cantidad}
          onValor={(v) => onManualChange({ ...manual, cantidad: v })}
          onKeyDown={teclasCarga} etiqueta="Cantidad de piezas" columna="sm:w-12"
        />
        {MEDIDAS.map((m) => {
          const fijo = fijas[m.campo] != null;
          return (
            <CeldaCarga
              key={m.campo}
              nombre={m.nombre} unidad={m.unidad} col={m.col}
              valor={fijo ? String(fijas[m.campo]) : manual[m.campo]}
              onValor={(v) => onManualChange({ ...manual, [m.campo]: v })}
              onKeyDown={teclasCarga} etiqueta={m.etiqueta} columna="sm:w-[4.75rem]"
              fijo={fijo}
              onFijar={() => alternarFija(m.campo)}
            />
          );
        })}
        <button
          type="button"
          onClick={() => onConfirmarCarga(grillaId)}
          aria-label="Agregar a mano"
          title="Agregar la pieza al lote (Enter)"
          className={button({ variant: "secondary", className: "col-span-2 shrink-0 rounded-xl px-4 sm:col-auto" })}
        >
          <Plus className="h-4 w-4" aria-hidden /> Agregar
        </button>
      </div>
    </div>
  );
}

/**
 * Celda de la fila de carga manual. Se tipea el número directo (antes era un
 * `<select>`, que obligaba a soltar el teclado en cada pieza).
 *
 * El candado fija esa medida: queda puesta acá y deja de pedirse en el dictado
 * (es el mismo estado que usa el comando de voz). Desde tablet va dentro del
 * campo, a la derecha, para que la fila entre en una línea.
 */
function CeldaCarga({ nombre, unidad, col, valor, onValor, onKeyDown, etiqueta, columna, fijo, onFijar }: {
  nombre: string; unidad?: string; col: number; valor: string; onValor: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  etiqueta: string; columna: string;
  fijo?: boolean; onFijar?: () => void;
}) {
  return (
    <label className={`flex w-full min-w-0 flex-col gap-0.5 ${columna}`} title={etiqueta}>
      <span className="flex items-baseline gap-1 whitespace-nowrap">
        <Kicker>{nombre}</Kicker>
        {unidad && <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)]">{unidad}</span>}
      </span>
      <span className="relative flex items-center gap-1">
        <CeldaNum
          valor={valor}
          onValor={onValor}
          fila={0}
          col={col}
          onKeyDown={onKeyDown}
          etiqueta={etiqueta}
          ancho="w-full min-w-0"
          alto="h-11 sm:h-10"
          className={`${fijo ? "border-[var(--accent)]" : ""} ${onFijar ? "sm:pr-7" : ""}`}
        />
        {onFijar && (
          <button
            type="button"
            onClick={onFijar}
            disabled={!fijo && !valor}
            aria-pressed={!!fijo}
            aria-label={fijo ? `Soltar ${nombre}` : `Fijar ${nombre}`}
            title={fijo ? "Soltar esta medida" : "Fijar esta medida (no se dicta más)"}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-30 sm:absolute sm:right-1 sm:top-1/2 sm:h-7 sm:w-6 sm:-translate-y-1/2 sm:rounded-md sm:border-0 ${fijo ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}
          >
            {fijo ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
        )}
      </span>
    </label>
  );
}
