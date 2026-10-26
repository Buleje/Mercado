"use client";

/**
 * PanelEntradaVoz — el panel de dictado por voz + carga manual del cubicador
 * de madera. Extraído para poder mostrarlo DOS veces en la misma pantalla
 * (arriba y al final de la tabla, mismo pedido de Brandon 2026-08-17): sin
 * esto, duplicar el JSX a mano habría duplicado también sus bugs.
 *
 * Todo el estado (voz, fijas, especie, carga manual) vive en el padre y se
 * comparte entre las dos instancias — es EL MISMO lote, sólo dos vistas de
 * entrada a la misma cosa. Lo único que cambia por instancia es `grillaId`:
 * la navegación por teclado (`useTecladoGrilla`) se scopea por ese id — con
 * el mismo id en las dos copias, las flechas saltarían a la copia equivocada.
 *
 * Sus tres partes viven en su archivo (Brandon 24-10, «Cargar compacta»: con
 * las Últimas al lado el panel había crecido a 840 px a 1280):
 * `cubicador-caja-dictado` (micrófono + Excel + voz), `cubicador-lo-que-se-pega`
 * (especie, dueño, fijas, observación) y `cubicador-carga-mano` (la fila).
 */
import { Calculator, Check, ChevronUp, RotateCcw, Trees } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { ESPECIES_MADERA, type PiezaCubicada, type MedidasFijas } from "@/lib/forestal/cubicacion";
import type { CubicadorConfig } from "@/lib/forestal/cubicador-config";
import { NumeroDeBloque } from "./cubicador-indice";
import CacaoChartPresent from "@/components/admin/cacao/CacaoChartPresent";
import type { TrozaParaCodigo } from "@/lib/forestal/codigo-de-troza";
import type { CampoObservacionProps } from "./cubicador-observacion";
import CajaDictado from "./cubicador-caja-dictado";
import LoQueSePega from "./cubicador-lo-que-se-pega";
import CargaAMano, { type Manual } from "./cubicador-carga-mano";

export type { Manual };
export { Tecla } from "./cubicador-caja-dictado";

const ESPECIES = ESPECIES_MADERA;

interface PanelEntradaVozProps {
  grillaId: string;
  onPresent?: () => void;
  /** Pliega el panel entero. Sin esto, el botón «Ocultar» no se dibuja. */
  onPlegar?: () => void;
  /** Número del bloque en el índice del cubicador (Brandon 23-10); sin él, el título va solo. */
  numero?: number;
  onImportar: () => void;
  onPegarExcel: () => void;
  showAjustes: boolean;
  onToggleAjustes: () => void;
  config: CubicadorConfig;
  onUpdateConfig: (patch: Partial<CubicadorConfig>) => void;
  voices: SpeechSynthesisVoice[];
  onProbarVoz: () => void;
  supported: boolean;
  listening: boolean;
  onToggleListen: () => void;
  paused: boolean;
  /**
   * Alterna pausa/reanudar — mismo efecto exacto que la voz «pausa»/«continúa»
   * (Brandon, 2026-09-23). El botón sólo se dibuja mientras escucha; la tecla
   * Espacio pasa por acá desde `CubicadorMadera` (listener en window).
   */
  onTogglePausa: () => void;
  fijas: MedidasFijas;
  onAplicarFijas: (next: MedidasFijas) => void;
  especie: string;
  onEspecieChange: (v: string) => void;
  /**
   * Las especies que se ofrecen — el catálogo del aserradero (ADR-410). Por
   * defecto las de fábrica, para que un llamador que todavía no lo pasa siga
   * viendo la lista de siempre.
   */
  especies?: readonly string[];
  /** Abre el gestor del catálogo: crear, renombrar, quitar. */
  onAbrirEspecies?: () => void;
  /** De quién es lo que se va a dictar — se aplica a lo que sigue, igual que especie. */
  dueno: string;
  /** El dueño salió del Directorio (ADR-430): sus piezas toman su precio pactado. */
  duenoDelDirectorio?: boolean;
  onDuenoChange: (v: string) => void;
  /** Los dueños que se pueden elegir (guardados + los del lote actual). */
  duenosConocidos: string[];
  /** Abre el modal de gestión: crear/guardar/borrar/elegir un dueño de la lista. */
  onAbrirDuenos: () => void;
  liveGroups: { triples: number[][]; resto: number[] } | null;
  errMsg: string | null;
  lastAdded: PiezaCubicada | null;
  addedFlash: number;
  onDeshacer: () => void;
  fmtPt: (v: number) => string;
  manual: Manual;
  onManualChange: (v: Manual) => void;
  onConfirmarCarga: (grillaId: string) => void;
  /**
   * El «Código» de la troza (sólo «Producir sin lote»). Sin esto el campo no
   * se dibuja y el panel es el de siempre. Es interno: ver
   * `lib/forestal/codigo-de-troza.ts`.
   */
  codigoTroza?: {
    valor: string;
    onValor: (v: string) => void;
    onElegir: (troza: TrozaParaCodigo) => void;
    trozas: readonly TrozaParaCodigo[];
    cargando: boolean;
    error: string | null;
  };
  /** La observación que se le pega a lo que sigue: con candado, a todas; sin él, a la próxima. */
  observacion: CampoObservacionProps;
}

export default function PanelEntradaVoz({
  grillaId, onPresent, onPlegar, numero, onImportar, onPegarExcel, showAjustes, onToggleAjustes,
  config, onUpdateConfig, voices, onProbarVoz,
  supported, listening, onToggleListen, paused, onTogglePausa,
  fijas, onAplicarFijas, especie, onEspecieChange, especies = ESPECIES, onAbrirEspecies,
  dueno, duenoDelDirectorio = false, onDuenoChange, duenosConocidos, onAbrirDuenos,
  liveGroups, errMsg, lastAdded, addedFlash, onDeshacer, fmtPt,
  manual, onManualChange, onConfirmarCarga, codigoTroza, observacion,
}: PanelEntradaVozProps) {
  return (
    <div className="@container/voz min-w-0 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          {numero != null && <NumeroDeBloque n={numero} />}
          <Calculator className="h-4 w-4 text-[var(--accent)]" /> Dictar y cargar
        </CardTitle>
        {/* En la barra del título queda lo que es del PANEL: el catálogo, la
            presentación y plegar. Importar Excel, la voz y sus ajustes viven
            adentro de la caja de dictado (Brandon, 2026-09-14): son maneras de
            ENTRAR piezas y van donde se entran. */}
        <div className="flex items-center gap-2">
          {onAbrirEspecies && (
            <button type="button" onClick={onAbrirEspecies} title="Especies del aserradero: crear, renombrar, quitar" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]">
              <Trees className="h-3.5 w-3.5" /> Especies
            </button>
          )}
          {onPresent && <CacaoChartPresent title="Cubicador de madera" onClick={onPresent} />}
          {/* Plegar el panel entero: cargando desde la tabla —o revisando un
              lote ya medido— el micrófono y la fila de carga no se usan. */}
          {onPlegar && (
            <button
              type="button"
              onClick={onPlegar}
              title="Ocultar el panel de carga"
              aria-label="Ocultar el panel de carga"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]"
            >
              <ChevronUp className="h-3.5 w-3.5" /> Ocultar
            </button>
          )}
        </div>
      </div>

      {/* 1. DICTAR: lo primero del panel, con sus herramientas adentro. */}
      <CajaDictado
        supported={supported} listening={listening} onToggleListen={onToggleListen}
        paused={paused} onTogglePausa={onTogglePausa} fijas={fijas} onImportar={onImportar} onPegarExcel={onPegarExcel}
        config={config} onUpdateConfig={onUpdateConfig} voices={voices} onProbarVoz={onProbarVoz}
        showAjustes={showAjustes} onToggleAjustes={onToggleAjustes} liveGroups={liveGroups} errMsg={errMsg}
      />

      {/* 2. Lo que se le pega + 3. cárgala a mano. En la misma fila cuando el
          PANEL mide 56rem o más (Brandon 2026-09-11); se apilan por debajo, no
          por la pantalla: en el cubicador por secciones el panel comparte la
          fila con las Últimas desde 1280 px (24-10). «Lo que se le pega» vive
          fuera del `supported` de la voz: sin dictado, la carga a mano tiene
          igual dónde elegir la especie. */}
      <div className={`mt-3 grid items-start gap-3 ${codigoTroza ? "@4xl/voz:grid-cols-[minmax(17rem,36rem)_minmax(0,1fr)]" : "@4xl/voz:grid-cols-[minmax(17rem,24rem)_minmax(0,1fr)]"}`}>
        <LoQueSePega
          codigoTroza={codigoTroza}
          especie={especie} onEspecieChange={onEspecieChange} especies={especies} onAbrirEspecies={onAbrirEspecies}
          dueno={dueno} duenoDelDirectorio={duenoDelDirectorio} onDuenoChange={onDuenoChange}
          duenosConocidos={duenosConocidos} onAbrirDuenos={onAbrirDuenos}
          fijas={fijas} onAplicarFijas={onAplicarFijas} observacion={observacion}
        />
        <CargaAMano
          grillaId={grillaId} manual={manual} onManualChange={onManualChange} onConfirmarCarga={onConfirmarCarga}
          fijas={fijas} onAplicarFijas={onAplicarFijas}
          speakOn={config.speak} onToggleSpeak={() => onUpdateConfig({ speak: !config.speak })}
        />
      </div>

      {/* Última agregada + deshacer. Vale igual para el dictado y para la carga
          a mano: en un navegador sin dictado también se tiene que poder deshacer. */}
      {lastAdded && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-100)] px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-700)]">
            <Check className="h-4 w-4" />
            {addedFlash > 1 ? `${addedFlash} piezas · última: ` : "Agregada: "}
            {lastAdded.espesor}&Prime; × {lastAdded.ancho}&Prime; × {lastAdded.largo} pies{lastAdded.especie ? ` · ${lastAdded.especie}` : ""}{lastAdded.codigo ? ` · cód. ${lastAdded.codigo}` : ""}{lastAdded.observacion ? ` · «${lastAdded.observacion}»` : ""}
            <span className="font-mono">= {fmtPt(lastAdded.pieTablar)} PT</span>
          </span>
          <button type="button" onClick={onDeshacer} className="inline-flex items-center gap-1 rounded-lg border border-[var(--data-success-500)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)] hover:brightness-95">
            <RotateCcw className="h-3.5 w-3.5" /> Deshacer
          </button>
        </div>
      )}
    </div>
  );
}
