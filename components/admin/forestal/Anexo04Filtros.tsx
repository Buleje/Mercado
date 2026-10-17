"use client";

/**
 * Anexo04Filtros — la tira pegada a la hoja con los filtros (tipo × especie) y
 * el formato de la cantidad del ANEXO N° 04 (Brandon, 2026-10-03: «poder sacar
 * sólo lo comercial», «3 piezas de 3×3×12 o cada una en su línea»).
 *
 * Con filtro, una línea dice qué lleva el papel y cuánto deja afuera: un
 * anexo filtrado es un documento incompleto A PROPÓSITO, y eso tiene que
 * leerse antes de descargar.
 */
import { Filter, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  FILTRO_ANEXO_VACIO,
  FORMATOS_CANTIDAD,
  especieLegible,
  type OpcionFiltro,
} from "@/lib/forestal/anexo04-vista";
import type { VistaAnexo04 } from "./hooks/use-anexo04-vista";

const CHIP = "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50";
const CHIP_ON = "border-[var(--accent)] bg-primary/12 text-[var(--accent-ink)] dark:text-[var(--accent)]";
const CHIP_OFF = "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]";
const ROTULO = "text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]";

const alternar = <T,>(lista: readonly T[], v: T): T[] => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

function Chips<T extends string>({ rotulo, opciones, leer, onAlternar, sinPiezas }: {
  rotulo: string;
  opciones: OpcionFiltro<T>[];
  leer: (v: T) => string;
  onAlternar: (v: T) => void;
  /** Por qué una opción sin piezas está apagada. */
  sinPiezas: string;
}) {
  return (
    <div role="group" aria-label={`Filtrar por ${rotulo.toLowerCase()}`} className="flex flex-wrap items-center gap-1">
      <span className={ROTULO}>{rotulo}</span>
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onAlternar(o.valor)}
          aria-pressed={o.elegida}
          disabled={!o.elegida && o.piezas === 0}
          title={!o.elegida && o.piezas === 0 ? sinPiezas : `${o.elegida ? "Quitar" : "Sólo"} ${leer(o.valor)}`}
          className={`${CHIP} ${o.elegida ? CHIP_ON : CHIP_OFF}`}
        >
          {leer(o.valor)}
          <span className="font-mono font-semibold tabular-nums">{o.piezas}</span>
        </button>
      ))}
    </div>
  );
}

export default function Anexo04Filtros({ vista, piezasPapel }: {
  vista: VistaAnexo04;
  /** Σ piezas que imprime el papel (`anexo.totalPiezas`). */
  piezasPapel: number;
}) {
  const { filtro, setFiltro, formato, setFormato, opciones } = vista;
  /* Un filtro con una sola opción no filtra nada: se muestra sólo si hay
     entre qué elegir (o si quedó algo elegido, para poder quitarlo). */
  const verTipos = opciones.tipos.length > 1 || filtro.tipos.length > 0;
  const verEspecies = opciones.especies.length > 1 || filtro.especies.length > 0;

  return (
    <div className="mb-2 space-y-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {verTipos && (
          <Chips
            rotulo="Tipo"
            opciones={opciones.tipos}
            leer={(t) => t}
            onAlternar={(t) => setFiltro({ ...filtro, tipos: alternar(filtro.tipos, t) })}
            sinPiezas="Sin piezas de este tipo en las especies elegidas"
          />
        )}
        {verEspecies && (
          <Chips
            rotulo="Especie"
            opciones={opciones.especies}
            leer={especieLegible}
            onAlternar={(e) => setFiltro({ ...filtro, especies: alternar(filtro.especies, e) })}
            sinPiezas="Sin piezas de esta especie en los tipos elegidos"
          />
        )}
        {(verTipos || verEspecies) && (
          <InfoTip
            title="Filtrar el anexo"
            what="Saca un anexo con sólo los tipos y especies que elijas. Puedes elegir varios de cada uno y combinarlos."
            affects="Las hojas, el PDF, el Excel, el registro del emitido y la comparación llevan sólo lo filtrado. Al cerrar el modal, el filtro se borra."
            example="Comercial + Tornillo: todas las hojas sólo con comercial de tornillo. Larga angosta + Pashaco: sólo esas."
          />
        )}
        <div role="radiogroup" aria-label="Formato de la cantidad" className="ml-auto flex flex-wrap items-center gap-1">
          <span className={ROTULO}>Cantidad</span>
          <span className="inline-flex items-center gap-0.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-0.5">
            {FORMATOS_CANTIDAD.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={formato === f.id}
                onClick={() => setFormato(f.id)}
                title={f.ejemplo}
                className={`h-6 rounded-md px-2 text-xs font-bold transition ${formato === f.id ? "bg-[var(--surface-raised)] text-[var(--accent-ink)] shadow-[var(--shadow-sm)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              >
                {f.label}
              </button>
            ))}
          </span>
          <InfoTip
            title="Cómo se escribe la cantidad"
            what="«Como se cargó» deja cada fila del lote tal cual. «Sumada» junta las medidas iguales en una línea con su contador. «Una por pieza» pone cada pieza en su línea."
            affects="Cambian los renglones y las hojas; las piezas, el PT y el m³ no se mueven."
            example="3 piezas de 3×3×12 → Sumada: una línea con 3. Una por pieza: tres líneas con 1."
            side="left"
          />
        </div>
      </div>

      {vista.filtrado && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-primary/10 px-2 py-1 text-xs font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-live="polite">
          <Filter className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Este anexo lleva sólo {vista.rotulo}:{" "}
            <span className="font-mono font-bold tabular-nums">{piezasPapel} de {vista.piezasTotal}</span> piezas
          </span>
          <button
            type="button"
            onClick={() => setFiltro(FILTRO_ANEXO_VACIO)}
            className="ml-auto inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-bold underline-offset-2 hover:underline"
          >
            <X className="h-3 w-3" aria-hidden /> Quitar filtros
          </button>
        </p>
      )}
      {!vista.editable && (
        <p className="text-xs text-[var(--text-tertiary)]">
          Para editar medidas, vuelve a «Como se cargó».
        </p>
      )}
    </div>
  );
}
