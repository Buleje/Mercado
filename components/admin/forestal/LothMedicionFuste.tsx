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
 *
 * Dos formas de anotar el Ø (28-09): «D1 y D2 promediados» o «Varias medidas
 * por Ø». La elegida queda fijada en el equipo; ver `loth-forma-medicion.ts`.
 */

import { useMemo } from "react";
import { Ruler, Plus, X, AlertTriangle } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  MODOS_UI,
  obligatoriedadTala,
  obligatoriedadTrozado,
  calcularLongitud,
  TIPOS_DESCUENTO,
  type TipoDescuento,
} from "@/lib/forestal/loth-tala";
import { cambiarForma, derivarTala, type FormaMedicion, type MedidasTala } from "@/lib/forestal/loth-forma-medicion";
import {
  CampoMedida,
  CampoMetros,
  DiametrosPromediados,
  INPUT_MEDIDA as INPUT,
  Resultado,
  SeccionDiametro,
  SelectorFormaMedicion,
} from "./LothMedicionPartes";
import { moverEntreMedidas } from "./navegar-medidas";

/** Lo mismo que dice el ⓘ, para el lector de pantalla al entrar al bloque. */
export const AYUDA_TECLADO = "Con el teclado: flechas o Enter para pasar al campo vecino; Shift+Enter vuelve al anterior.";

export default function LothMedicionFuste({
  medidas,
  onChange,
  forma,
  onForma,
  seccion = "tala",
  alTerminar,
}: {
  medidas: MedidasTala;
  onChange: (m: MedidasTala) => void;
  /** «D1 y D2 promediados» o «Varias medidas por Ø» (fijada en el equipo). */
  forma: FormaMedicion;
  onForma: (f: FormaMedicion) => void;
  /**
   * Trozado mide la misma cruz pero no elige modo ni descuenta aletas: eso ya
   * se hizo sobre el fuste, en Tala. Ver `obligatoriedadTrozado`.
   */
  seccion?: "tala" | "trozado";
  /**
   * Enter en el último campo: adónde va (el botón de guardar, si ya se puede).
   * Devuelve `false` para seguir al bloque de abajo.
   */
  alTerminar?: () => boolean;
}) {
  const esTala = seccion === "tala";
  const oblig = esTala ? obligatoriedadTala(medidas.modo) : obligatoriedadTrozado();
  const d = useMemo(() => derivarTala(medidas, forma), [medidas, forma]);
  const largo = calcularLongitud(Number(medidas.totalM) || null, medidas.descuentos);

  const setMedida = (campo: "mayor" | "menor", i: number, v: string) => {
    const arr = [...medidas[campo]];
    arr[i] = v;
    // Tocar una medida a mano es medir: el aviso del censo deja de aplicar.
    onChange({ ...medidas, [campo]: arr, origenCenso: false });
  };
  const setPromedio = (campo: "d1" | "d2", v: string) => onChange({ ...medidas, [campo]: v, origenCenso: false });
  const elegirForma = (f: FormaMedicion) => {
    onChange(cambiarForma(medidas, f));
    onForma(f);
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
      /* Flechas y Enter entre los campos de medida, como en una planilla. */
      onKeyDown={(e) => moverEntreMedidas(e, alTerminar)}
      className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3"
    >
      <p className="sr-only">{AYUDA_TECLADO}</p>
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
            affects={`${forma === "promedio" ? "D1 y D2 ya promediados van tal cual al libro." : "Dos medidas cruzadas por sección: el libro consigna el promedio."} ${esTala ? "La longitud aprovechable es la total menos los descuentos." : ""}`.trim()}
            body={AYUDA_TECLADO}
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

      {/* Arriba del bloque: cambia qué se tipea, no qué va al libro. */}
      {oblig.diametros && <SelectorFormaMedicion forma={forma} onForma={elegirForma} />}

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

      {/* Diámetros: ya promediados (D1/D2) o dos medidas cruzadas por sección */}
      {oblig.diametros && forma === "promedio" && (
        <DiametrosPromediados d1={medidas.d1} d2={medidas.d2} onD1={(v) => setPromedio("d1", v)} onD2={(v) => setPromedio("d2", v)} />
      )}
      {oblig.diametros && forma === "cruzadas" && (
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
          <CampoMedida
            valor={medidas.totalM}
            onValor={(v) => onChange({ ...medidas, totalM: v, origenCenso: false })}
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
            <CampoMetros
              metros={dd.metros}
              onMetros={(m) => setDescuento(i, m)}
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
