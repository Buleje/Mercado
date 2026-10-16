"use client";

/**
 * Lo de toda la carga (especie, largo, primer N°) y la tabla de «Medir por
 * foto» (16-10): una fila por testa con el N° que imprimirá la guía, D1 de la
 * foto (corregible), D2 a mano (vacío = pareja, ADR-492), el largo, el
 * volumen del libro y de dónde salió la medida. Tocar una fila elige su testa
 * en la foto.
 */
import { useState, type KeyboardEvent } from "react";
import { DataTable } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { volumenPorTroza } from "@/lib/forestal/loth-trozas-a-mano";
import type { CampoQueFalta, FilaPorFoto } from "@/lib/forestal/testas-medicion";
import type { CatalogoUI } from "./ctp-especie-campo";
import { I } from "./ctp-shared";
import { EspecieFijable } from "./especie-fijable";
import type { EspecieFijada } from "./hooks/use-especie-fijada";
import type { CampoCorregible, TrozasPorFoto } from "./hooks/use-trozas-por-foto";
import { MARCO, TD, TDR, TH, THR } from "./LothGuiaListaMovilizar";

const coma = (n: number | null): string => (n == null ? "" : String(n).replace(".", ","));
const PILDORA = "inline-block rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap";
const FOTO = "bg-[var(--accent-soft)] text-[var(--accent-ink)]";
const MANO = "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
const CAMPO_DE: Record<CampoCorregible, CampoQueFalta> = { d1Cm: "d1", d2Cm: "d2", largoM: "largo" };

/** Una medida de la fila: se tipea libre y se toma al salir (vacío = vuelve a lo de la foto o de la carga). */
function Celda(props: { valor: number | null; placeholder?: string; etiqueta: string; invalida: boolean; onTomar: (texto: string) => void }) {
  const [borrador, setBorrador] = useState<string | null>(null);
  const actual = coma(props.valor);
  const tomar = () => {
    if (borrador != null && borrador !== actual) props.onTomar(borrador);
    setBorrador(null);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={borrador ?? actual}
      placeholder={props.placeholder}
      aria-label={props.etiqueta}
      aria-invalid={props.invalida || undefined}
      onFocus={(e) => {
        setBorrador(actual);
        e.currentTarget.select();
      }}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={tomar}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && e.currentTarget.blur()}
      onClick={(e) => e.stopPropagation()}
      className={`h-11 w-full min-w-0 rounded-lg border-[1.5px] bg-[var(--surface-raised)] px-2 text-right font-mono text-sm font-bold tabular-nums text-[var(--text-primary)] outline-none placeholder:font-normal placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] ${
        props.invalida ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)]"
      }`}
    />
  );
}

export interface PropsTablaPorFoto {
  p: TrozasPorFoto;
  catalogo: CatalogoUI;
  fijacion: EspecieFijada;
  delPermiso: readonly string[] | null;
  /** Lo que falta o no va, por código (sólo tras intentar pasar). */
  faltan: ReadonlySet<string>;
  especieInvalida: boolean;
}

export default function LothTrozasPorFotoTabla({ p, catalogo, fijacion, delPermiso, faltan, especieInvalida }: PropsTablaPorFoto) {
  /* El primer N° mientras se tipea (vacío no es 1 hasta salir del campo). */
  const [desdeTexto, setDesdeTexto] = useState<string | null>(null);
  const mal = (f: FilaPorFoto, c: CampoCorregible) => faltan.has(`${f.codigo}:${CAMPO_DE[c]}`);
  const celda = (f: FilaPorFoto, c: CampoCorregible, etiqueta: string) => (
    <Celda
      valor={c === "d1Cm" ? f.d1Cm : c === "d2Cm" ? f.d2Cm : f.largoM}
      placeholder={c === "d2Cm" ? "= D1" : c === "largoM" ? "—" : undefined}
      etiqueta={`${etiqueta} de la ${f.codigo}`}
      invalida={mal(f, c)}
      onTomar={(texto) => f.testaAtras && p.corregir(c, f.testaAtras, texto)}
    />
  );
  const origen = (f: FilaPorFoto) => {
    const t = p.testas.find((x) => x.id === f.testaAtras);
    const foto = f.origenD1 === "foto";
    const texto = !foto ? "A mano" : t?.origen === "auto" ? "Foto" : "Foto ajustada";
    return <span className={`${PILDORA} ${foto ? FOTO : MANO}`}>{texto}</span>;
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="col-span-2 grid gap-1 sm:col-span-1">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Especie de la carga</span>
          <EspecieFijable
            value={p.especie}
            onChange={p.setEspecie}
            catalogo={catalogo}
            fijacion={fijacion}
            invalido={especieInvalida}
            ariaLabel="Especie de toda la carga"
            opciones={delPermiso?.map((nombre) => ({ nombre }))}
            etiquetaOpciones="Del permiso"
            etiquetaCatalogo="Otras (no están en el permiso)"
          />
        </div>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Largo de la carga (m)</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            value={p.largo}
            placeholder="3,20"
            onChange={(e) => p.setLargo(e.target.value)}
            data-qa="largo-carga"
            className={`${I} font-mono tabular-nums`}
          />
        </label>
        {/* div y no label: el ⓘ dentro de un <label> roba el clic del campo (test infotip-no-anidado). */}
        <div className="grid gap-1">
          <span className="flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]">
            <label htmlFor="trozas-foto-primer-n">Primer N°</label>
            <InfoTip
              title="Primer N° de las trozas a mano"
              what="El número con el que empiezan las trozas a mano de esta guía (las de la foto van detrás de lo que ya anotaste). Sale del último código numérico de este permiso en el libro, más uno."
              affects="Cambia la numeración de todas las trozas a mano de la guía, no sólo las de la foto."
              example="El permiso llegó a la 23 → empieza en 24"
              ariaLabel="Qué es el primer N°"
            />
          </span>
          <input
            inputMode="numeric"
            autoComplete="off"
            value={desdeTexto ?? String(p.desde)}
            onChange={(e) => {
              const texto = e.target.value.replace(/\D/g, "").slice(0, 5);
              setDesdeTexto(texto);
              if (Number(texto) >= 1) p.setDesde(Number(texto));
            }}
            onBlur={() => setDesdeTexto(null)}
            data-qa="primer-numero"
            id="trozas-foto-primer-n"
            className={`${I} font-mono tabular-nums`}
          />
        </div>
      </div>

      <div className={MARCO}>
        <DataTable className="w-full">
          <thead>
            <tr>
              <th className={TH}>N° guía</th>
              <th className={`${THR} hidden sm:table-cell`}>D1 cm</th>
              <th className={`${THR} hidden sm:table-cell`}>D2 cm</th>
              <th className={`${THR} hidden sm:table-cell`}>L m</th>
              <th className={`${THR} hidden sm:table-cell`}>m³</th>
              <th className={`${TH} hidden sm:table-cell`}>Medida</th>
            </tr>
          </thead>
          <tbody>
            {p.filas.map((f) => {
              const sel = f.testaAtras === p.seleccion;
              const v = f.d1Cm != null && f.largoM != null ? fmtM3(volumenPorTroza({ d1Cm: f.d1Cm, d2Cm: f.d2Cm ?? f.d1Cm, largoM: f.largoM })) : "—";
              return (
                <tr
                  key={f.testaAtras ?? f.codigo}
                  onClick={() => p.setSeleccion(f.testaAtras)}
                  aria-current={sel ? "true" : undefined}
                  data-qa="fila-por-foto"
                  className={`cursor-pointer ${sel ? "bg-[var(--accent-soft)]!" : ""}`}
                >
                  <td className={TD}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-mono font-bold">{f.codigo}</span>
                      <span className="whitespace-nowrap font-mono font-bold sm:hidden">{v} m³</span>
                    </span>
                    <span className="mt-0.5 flex gap-1 sm:hidden">{origen(f)}</span>
                    {/* A 400 px las tres medidas van debajo del N° (como «Anotar a mano»). */}
                    <span className="mt-1 grid grid-cols-3 gap-1 sm:hidden">
                      {(["d1Cm", "d2Cm", "largoM"] as const).map((c, j) => (
                        <span key={c} className="grid gap-0.5">
                          <span className="text-xs font-semibold text-[var(--text-tertiary)]">{["D1 cm", "D2 cm", "L m"][j]}</span>
                          {celda(f, c, ["D1", "D2", "Largo"][j])}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className={`${TDR} hidden w-24 sm:table-cell`}>{celda(f, "d1Cm", "D1")}</td>
                  <td className={`${TDR} hidden w-24 sm:table-cell`}>{celda(f, "d2Cm", "D2")}</td>
                  <td className={`${TDR} hidden w-24 sm:table-cell`}>{celda(f, "largoM", "Largo")}</td>
                  <td className={`${TDR} hidden font-bold sm:table-cell`}>{v}</td>
                  <td className={`${TD} hidden sm:table-cell`}>{origen(f)}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
