"use client";

/**
 * Una fila del editor de especies registradas (`LothPlanFormPlantacion`):
 * especie, científico con su CITES, árboles, m³, año, hectáreas y —si se
 * prendió— el precio. Salió del editor tal cual (24-10) para que el editor
 * entre en 300 líneas y lo pueda usar cada bloque o zona del alta.
 */

import { ScanText, Trash2 } from "@buleje/design-system/icons";
import { CitesToggle, cls } from "./loth-plan-ui";
import { conCites, filaEnBlanco, problemaDeFila, type FilaEspecie } from "./loth-plan-especies-api";

/* Las dos plantillas van escritas enteras: Tailwind sólo genera las clases que
   encuentra literales en el código. */
export const COLUMNAS_SIN_PRECIO = "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_5.5rem_7.5rem_5.5rem_6rem_2.75rem]";
export const COLUMNAS_CON_PRECIO = "sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_5rem_7rem_5rem_5.5rem_6rem_2.75rem]";

const ROTULO = "mb-1 block text-xs font-medium text-[var(--text-secondary)] sm:sr-only";

/** Los rótulos de columna, una vez. En el celular cada campo lleva el suyo. */
export function RotulosDeColumnas({ columnas, conPrecio }: { columnas: string; conPrecio: boolean }) {
  return (
    <div aria-hidden="true" className={`hidden gap-2 px-1 text-xs font-semibold text-[var(--text-secondary)] sm:grid ${columnas}`}>
      <span>Especie *</span>
      <span>Nombre científico</span>
      <span className="text-right">N° árboles</span>
      <span className="text-right">Volumen (m³) *</span>
      <span className="text-right">Año inst.</span>
      <span className="text-right">Sup. (ha)</span>
      {conPrecio && <span className="text-right">S/ por m³</span>}
      <span />
    </div>
  );
}

export function FilaDeEspecie({
  f,
  i,
  columnas,
  lista,
  conPrecio,
  mostrarErrores,
  leida,
  onCambiar,
  onNombre,
  onQuitar,
}: {
  f: FilaEspecie;
  i: number;
  columnas: string;
  /** El `id` del `<datalist>` con las especies del catálogo. */
  lista: string;
  conPrecio: boolean;
  mostrarErrores: boolean;
  /** Entró leyendo la constancia: se marca para revisarla contra el papel. */
  leida: boolean;
  onCambiar: (uid: string, cambio: (f: FilaEspecie) => FilaEspecie) => void;
  onNombre: (f: FilaEspecie, nombre: string) => void;
  onQuitar: (uid: string) => void;
}) {
  const problema = mostrarErrores && !filaEnBlanco(f) ? problemaDeFila(f) : null;
  const errorId = `${f.uid}-error`;
  const nombreFila = f.speciesCommon.trim() || `fila ${i + 1}`;
  const cambiar = (cambio: (x: FilaEspecie) => FilaEspecie) => onCambiar(f.uid, cambio);
  return (
    <li className={`rounded-xl border p-2 sm:border-0 sm:p-0 ${problema ? "border-[var(--data-error-500)]/60" : "border-[var(--rule-base)]"}`}>
      <div className={`grid grid-cols-2 items-start gap-2 ${columnas}`}>
        <label className="col-span-2 block sm:col-span-1">
          <span className={ROTULO}>Especie *</span>
          <span className="relative block">
            <input
              id={`${f.uid}-especie`}
              list={lista}
              value={f.speciesCommon}
              onChange={(e) => onNombre(f, e.target.value)}
              placeholder="Ej. Bolaina"
              autoComplete="off"
              aria-invalid={problema === "Falta la especie" || undefined}
              aria-describedby={problema ? errorId : undefined}
              className={`${cls} ${leida ? "pr-8" : ""}`}
            />
            {/* Leída de la constancia: la cifra la puso la IA, se revisa contra el papel. */}
            {leida && (
              <span
                title="Leída de la constancia: revisa los m³ contra el papel"
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
              >
                <ScanText className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Leída de la constancia</span>
              </span>
            )}
          </span>
        </label>
        <label className="col-span-2 block sm:col-span-1">
          <span className={ROTULO}>Nombre científico</span>
          <span className="relative block">
            <input
              value={f.speciesScientific}
              onChange={(e) => cambiar((x) => ({ ...x, speciesScientific: e.target.value, cientificoAuto: false }))}
              placeholder="Se completa solo"
              className={`${cls} italic pr-20`}
            />
            <CitesToggle
              activo={f.cites}
              onCambiar={(v) => cambiar((x) => conCites(x, v))}
              especie={f.speciesCommon}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            />
          </span>
        </label>
        <Numero rotulo="N° de árboles" valor={f.arboles} paso="1" ejemplo="0" onCambio={(v) => cambiar((x) => ({ ...x, arboles: v }))} />
        <Numero
          rotulo="Volumen (m³) *"
          valor={f.volumenM3}
          paso="0.001"
          ejemplo="0.000"
          invalido={problema != null && /volumen/i.test(problema)}
          describe={problema ? errorId : undefined}
          onCambio={(v) => cambiar((x) => ({ ...x, volumenM3: v }))}
        />
        <Numero rotulo="Año de instalación" valor={f.anioInstalacion} paso="1" ejemplo="aaaa" onCambio={(v) => cambiar((x) => ({ ...x, anioInstalacion: v }))} />
        <Numero rotulo="Superficie (ha)" valor={f.superficieHa} paso="0.01" ejemplo="0.00" onCambio={(v) => cambiar((x) => ({ ...x, superficieHa: v }))} />
        {conPrecio && (
          <Numero rotulo="Precio S/ por m³" valor={f.precioM3} paso="0.01" ejemplo="0.00" onCambio={(v) => cambiar((x) => ({ ...x, precioM3: v }))} />
        )}
        <button
          type="button"
          onClick={() => onQuitar(f.uid)}
          aria-label={`Quitar ${nombreFila}`}
          title={`Quitar ${nombreFila}`}
          className="col-span-2 inline-flex h-12 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold text-[var(--data-error-700)] transition-colors hover:bg-[var(--data-error-50)] dark:text-[var(--data-error-500)] dark:hover:bg-[var(--data-error-500)]/12 sm:col-span-1"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <span className="sm:sr-only">Quitar</span>
        </button>
      </div>
      {problema && (
        <p id={errorId} className="mt-1 px-1 text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {problema}
        </p>
      )}
    </li>
  );
}

function Numero({ rotulo, valor, paso, ejemplo, onCambio, invalido, describe }: {
  rotulo: string;
  valor: string;
  paso: string;
  ejemplo: string;
  onCambio: (v: string) => void;
  invalido?: boolean;
  describe?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className={ROTULO}>{rotulo}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step={paso}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={ejemplo}
        aria-invalid={invalido || undefined}
        aria-describedby={describe}
        className={`${cls} text-right font-mono tabular-nums`}
      />
    </label>
  );
}
