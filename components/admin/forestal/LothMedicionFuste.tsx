"use client";

/**
 * Medición del fuste — el bloque de la Sección 1 (Tala) del LO-TH.
 *
 * Antes eran tres inputs sueltos (Ø mayor, Ø menor, Longitud) y un volumen que
 * se autocompletaba. El problema no era el cálculo: era que los tres números
 * que pedía **no son los que se miden en el monte**. La RDE 264-2019 dice que
 * el diámetro se consigna como promedio de dos medidas cruzadas y que la
 * longitud es la aprovechable, ya descontadas las aletas y los defectos. El
 * formulario pedía el resultado de dos cuentas que el motosierrista hacía de
 * memoria al costado del árbol.
 *
 * Acá se capturan las medidas crudas y el libro se queda con lo que el formato
 * oficial pide. La aritmética la hace `lib/forestal/loth-tala.ts`.
 */

import { useMemo } from "react";
import { Ruler, Plus, X, AlertTriangle } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  MODOS_UI,
  obligatoriedadTala,
  obligatoriedadTrozado,
  promedioCruzado,
  fusteIrregular,
  calcularLongitud,
  volumenDeMedidas,
  TIPOS_DESCUENTO,
  type DescuentoLongitud,
  type ModoAprovechamiento,
  type TipoDescuento,
} from "@/lib/forestal/loth-tala";

export interface MedidasTala {
  modo: ModoAprovechamiento | null;
  /** Las dos (o más) medidas cruzadas de la sección mayor. */
  mayor: string[];
  /** Ídem sección menor. */
  menor: string[];
  /** Longitud total del fuste, antes de descuentos. */
  totalM: string;
  descuentos: DescuentoLongitud[];
  /**
   * Los números vinieron del censo, no de la forcípula. El DAP es del árbol EN
   * PIE y la altura comercial es una estimación: sirven para arrancar, pero el
   * libro consigna lo que se midió en el tocón. Mientras esté en true, la
   * pantalla lo dice en vez de disfrazar un estimado de medición.
   */
  origenCenso?: boolean;
}

export interface DerivadosTala {
  diamMayorM: number | null;
  diamMenorM: number | null;
  longitudM: number | null;
  volumenM3: number | null;
  excedeDescuento: boolean;
}

export function derivarTala(m: MedidasTala): DerivadosTala {
  const num = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const mayor = promedioCruzado(m.mayor.map(num));
  const menor = promedioCruzado(m.menor.map(num));
  const largo = calcularLongitud(num(m.totalM), m.descuentos);
  return {
    diamMayorM: mayor,
    diamMenorM: menor,
    longitudM: largo.aprovechableM,
    volumenM3: volumenDeMedidas(m.mayor.map(num), m.menor.map(num), largo.aprovechableM),
    excedeDescuento: largo.excede,
  };
}

/**
 * Sin `w-full`: dos utilidades de ancho en el mismo elemento las resuelve el
 * orden del CSS, no el del string, así que `${INPUT} w-24` quedaba en ancho
 * completo y empujaba fuera la etiqueta del descuento. El ancho lo pone cada
 * uso.
 */
const INPUT =
  "h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-mono tabular-nums text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--data-success-500)]";

export default function LothMedicionFuste({
  medidas,
  onChange,
  seccion = "tala",
}: {
  medidas: MedidasTala;
  onChange: (m: MedidasTala) => void;
  /**
   * Trozado mide la misma cruz pero no elige modo ni descuenta aletas: eso ya
   * se hizo sobre el fuste, en Tala. Ver `obligatoriedadTrozado`.
   */
  seccion?: "tala" | "trozado";
}) {
  const esTala = seccion === "tala";
  const oblig = esTala ? obligatoriedadTala(medidas.modo) : obligatoriedadTrozado();
  const d = useMemo(() => derivarTala(medidas), [medidas]);
  const largo = calcularLongitud(Number(medidas.totalM) || null, medidas.descuentos);

  const setMedida = (campo: "mayor" | "menor", i: number, v: string) => {
    const arr = [...medidas[campo]];
    arr[i] = v;
    // Tocar una medida a mano es medir: el aviso del censo deja de aplicar.
    onChange({ ...medidas, [campo]: arr, origenCenso: false });
  };

  const addDescuento = (tipo: TipoDescuento) =>
    onChange({ ...medidas, descuentos: [...medidas.descuentos, { tipo, metros: 0 }] });

  const setDescuento = (i: number, metros: number) => {
    const arr = [...medidas.descuentos];
    arr[i] = { ...arr[i], metros };
    onChange({ ...medidas, descuentos: arr });
  };

  const quitarDescuento = (i: number) =>
    onChange({ ...medidas, descuentos: medidas.descuentos.filter((_, j) => j !== i) });

  const volumenTexto = d.volumenM3 != null ? `${Number(d.volumenM3).toFixed(4)} m³` : "—";

  return (
    <section
      aria-label={esTala ? "Medición del fuste" : "Medición de la troza"}
      className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Ruler className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" strokeWidth={1.75} />
            {esTala ? "Medición del fuste" : "Medición de la troza"}
          </CardTitle>
          {/* Lo que antes eran tres párrafos a la vista: qué pide la norma en
              este modo, cómo se mide el Ø y de dónde sale el volumen. */}
          <InfoTip
            icono="ayuda"
            title={esTala ? "Medición del fuste" : "Medición de la troza"}
            what={oblig.razon}
            affects="Dos medidas cruzadas por sección: el libro consigna el promedio. La longitud aprovechable es la total menos los descuentos."
            example="Volumen (Smalian) = 0.7854 × ((Ø mayor + Ø menor)/2)² × longitud aprovechable"
          />
        </div>
        {esTala && (
        <div role="group" aria-label="Modo de aprovechamiento" className="flex gap-1.5">
          {MODOS_UI.map((m) => {
            const activo = medidas.modo === m.key;
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={activo}
                title={m.ayuda}
                onClick={() => onChange({ ...medidas, modo: m.key })}
                className={`min-h-9 rounded-lg border px-3 text-xs font-bold transition-colors ${
                  activo
                    ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        )}
      </header>

      {medidas.origenCenso && (
        <p className="flex items-start gap-2 rounded-lg border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0">Números del censo: reemplázalos con lo que mediste en el tocón.</span>
          <InfoTip
            title="Medidas del censo"
            what="El DAP es del árbol en pie y la altura comercial es estimada. Sirven para arrancar, pero el libro consigna lo medido."
          />
        </p>
      )}

      {/* Diámetros: dos medidas cruzadas por sección, el promedio lo hace el libro */}
      {oblig.diametros && (
        <div className="grid gap-2 sm:grid-cols-2">
          <SeccionDiametro
            titulo="Ø sección mayor"
            medidas={medidas.mayor}
            promedio={d.diamMayorM}
            onMedida={(i, v) => setMedida("mayor", i, v)}
            onAgregar={() => onChange({ ...medidas, mayor: [...medidas.mayor, ""] })}
          />
          <SeccionDiametro
            titulo="Ø sección menor"
            medidas={medidas.menor}
            promedio={d.diamMenorM}
            onMedida={(i, v) => setMedida("menor", i, v)}
            onAgregar={() => onChange({ ...medidas, menor: [...medidas.menor, ""] })}
          />
        </div>
      )}

      {/* Longitud (item 8) y lo que sale de ella, en una fila */}
      <div className={`grid grid-cols-2 gap-2 ${esTala ? "sm:grid-cols-3" : ""}`}>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
            {esTala ? "Longitud total (m)" : "Longitud de la troza (m)"}
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={medidas.totalM}
            onChange={(e) => onChange({ ...medidas, totalM: e.target.value, origenCenso: false })}
            placeholder="15.00"
            className={`${INPUT} w-full`}
          />
        </label>
        {esTala && (
          <Resultado rotulo="Aprovechable" valor={d.longitudM != null ? `${Number(d.longitudM).toFixed(2)} m` : "—"} />
        )}
        {oblig.volumen && (
          <Resultado
            rotulo="Volumen (Smalian)"
            valor={volumenTexto}
            destacado
            className={esTala ? "col-span-2 sm:col-span-1" : ""}
          />
        )}
      </div>

      {esTala && medidas.descuentos.map((dd, i) => {
        const tipo = TIPOS_DESCUENTO.find((t) => t.key === dd.tipo);
        return (
          <div key={`${dd.tipo}-${i}`} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)]" title={tipo?.ayuda}>
              − {tipo?.label ?? dd.tipo}
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={dd.metros || ""}
              onChange={(e) => setDescuento(i, Number(e.target.value))}
              aria-label={`Metros descontados por ${tipo?.label ?? dd.tipo}`}
              placeholder="0.00"
              className={`${INPUT} h-9 w-24 text-right`}
            />
            <button
              type="button"
              onClick={() => quitarDescuento(i)}
              aria-label={`Quitar descuento por ${tipo?.label ?? dd.tipo}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-700)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      {esTala && (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-[var(--text-tertiary)]">Descontar:</span>
        {TIPOS_DESCUENTO.filter((t) => !medidas.descuentos.some((x) => x.tipo === t.key)).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => addDescuento(t.key)}
            title={t.ayuda}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-dashed border-[var(--rule-base)] px-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
          >
            <Plus className="h-3 w-3" />
            {t.label}
          </button>
        ))}
      </div>
      )}

      {esTala && largo.excede && (
        <p className="flex items-start gap-2 rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Los descuentos ({Number(largo.descontadoM).toFixed(2)} m) igualan o superan el fuste entero. Revisa la medida
          antes de guardar.
        </p>
      )}
    </section>
  );
}

/** Un número que sale de la cuenta, no que se tipea: misma altura que el input de al lado. */
function Resultado({
  rotulo,
  valor,
  destacado = false,
  className = "",
}: {
  rotulo: string;
  valor: string;
  destacado?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">{rotulo}</span>
      <output
        aria-label={rotulo}
        className={`flex h-10 items-center justify-end rounded-lg px-3 font-mono tabular-nums text-[var(--text-primary)] ${
          destacado ? "bg-primary/10 text-base font-bold dark:bg-primary/20" : "bg-[var(--surface-sunken)] text-sm font-semibold"
        }`}
      >
        {valor}
      </output>
    </div>
  );
}

/** Una sección del fuste: N medidas cruzadas y el promedio que va al libro. */
function SeccionDiametro({
  titulo,
  medidas,
  promedio,
  onMedida,
  onAgregar,
}: {
  titulo: string;
  medidas: string[];
  promedio: number | null;
  onMedida: (i: number, v: string) => void;
  onAgregar: () => void;
}) {
  const irregular = fusteIrregular(medidas.map((m) => Number(m) || null));
  return (
    <div className="space-y-1.5 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">{titulo}</span>
        <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]" title="Promedio que va al libro">
          {promedio != null ? `${promedio.toFixed(3)} m` : "—"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {medidas.map((v, i) => (
          <input
            key={i}
            type="number"
            step="0.001"
            min="0"
            inputMode="decimal"
            value={v}
            onChange={(e) => onMedida(i, e.target.value)}
            aria-label={`${titulo} — medida cruzada ${i + 1}`}
            placeholder={i === 0 ? "1.30" : "1.10"}
            className={`${INPUT} w-24`}
          />
        ))}
        {medidas.length < 4 && (
          <button
            type="button"
            onClick={onAgregar}
            className="grid h-10 w-10 place-items-center rounded-lg border border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
            aria-label={`Agregar otra medida cruzada a ${titulo}`}
            title="Agregar otra medida cruzada"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      {irregular && (
        <p className="text-xs font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
          Las medidas difieren mucho: toma una tercera para el promedio.
        </p>
      )}
    </div>
  );
}
