"use client";

/**
 * «Anotar a mano» en la lista de trozas del despacho con guía (Brandon 15-10:
 * «poner D1, D2, largo, cantidad y que el volumen salga solo; crear y agregar
 * esas trozas sin vincularlas todavía a un permiso»).
 *
 * Una fila de alta (especie, D1, D2, largo, cantidad; el volumen se calcula
 * solo) y la lista de lo anotado. La especie sale del catálogo del aserradero y
 * se puede FIJAR (15-10): fijada, cada troza nueva la toma y el foco empieza en
 * D1; suelta, se vuelve a pedir. Teclado: Enter pasa al campo siguiente y, en
 * Cantidad, agrega. Las medidas se revisan con los límites del Cubicador
 * (`revisarTrozaAMano`); el volumen es una vista previa: el servidor lo vuelve
 * a calcular con la misma fórmula al registrar, y valida la especie contra el
 * catálogo.
 */

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { DataTable } from "@buleje/design-system";
import { Plus, Trash2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  TROZAS_POR_GUIA_MAX,
  revisarTrozaAMano,
  volumenDeFila,
  volumenPorTroza,
  type CampoAMano,
  type CrudoAMano,
  type ProblemaEspecieAMano,
} from "@/lib/forestal/loth-trozas-a-mano";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { Btn, I } from "./ctp-shared";
import { MARCO, TD, TDR, TH, THR, dec } from "./LothGuiaListaMovilizar";
import type { CatalogoUI } from "./ctp-especie-campo";
import { EspecieFijable } from "./especie-fijable";
import { useEspecieFijada } from "./hooks/use-especie-fijada";

type Medida = Exclude<CampoAMano, "especie">;
const VACIO: CrudoAMano = { especie: "", d1: "", d2: "", largo: "", cantidad: "1" };
const MEDIDAS: readonly Medida[] = ["d1", "d2", "largo", "cantidad"];
const ORDEN: readonly CampoAMano[] = ["especie", ...MEDIDAS];
const CAMPOS: Record<Medida, { label: string; placeholder: string }> = {
  d1: { label: "D1 (cm)", placeholder: "45" },
  d2: { label: "D2 (cm)", placeholder: "40" },
  largo: { label: "Largo (m)", placeholder: "3,20" },
  cantidad: { label: "Cantidad", placeholder: "1" },
};
const cm = (m: number) => Math.round(m * 1000) / 10;
const PASTILLA: Record<ProblemaEspecieAMano["tipo"], string> = {
  catalogo: "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]",
  permiso: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]",
};
/** Al pie del campo, corto; el motivo entero (el de T7) va en la pastilla de la fila y en «Falta». */
const textoDelProblema = (p: ProblemaEspecieAMano, especie: string) =>
  p.tipo === "catalogo" ? p.motivo : `${especie.trim()} no está en el permiso de esta guía: elige una «Del permiso».`;

/** Los códigos que imprime la guía para una fila: «4», «4 y 5», «4 a 9». */
function codigosDeFila(codigos: readonly string[]): string {
  if (codigos.length <= 1) return codigos[0] ?? "—";
  if (codigos.length === 2) return codigos.join(" y ");
  return `${codigos[0]} a ${codigos[codigos.length - 1]}`;
}

export default function LothGuiaTrozaAMano({ g, catalogo }: { g: DespachoGuiaLoth; catalogo: CatalogoUI }) {
  const fijacion = useEspecieFijada("loth-guia-a-mano");
  const [crudo, setCrudo] = useState<CrudoAMano>(() => ({ ...VACIO, especie: fijacion.fijada ?? "" }));
  /* Los errores se muestran recién al intentar agregar: mientras se tipea, no se grita. */
  const [intentado, setIntentado] = useState(false);
  const refEspecie = useRef<HTMLSelectElement>(null);
  const refD1 = useRef<HTMLInputElement>(null);
  const refD2 = useRef<HTMLInputElement>(null);
  const refLargo = useRef<HTMLInputElement>(null);
  const refCantidad = useRef<HTMLInputElement>(null);
  const refs: Record<Medida, typeof refD1> = { d1: refD1, d2: refD2, largo: refLargo, cantidad: refCantidad };
  const enfocar = (c: CampoAMano) => {
    if (c === "especie") return refEspecie.current?.focus();
    refs[c].current?.focus();
    refs[c].current?.select();
  };
  const revision = useMemo(() => revisarTrozaAMano(crudo), [crudo]);
  const restantes = TROZAS_POR_GUIA_MAX - g.piezas.length;
  const excede = revision.ok && revision.troza.cantidad > restantes;
  /* Lo que el servidor rechazaría (catálogo, T7), dicho al agregar y no al registrar. */
  const problema = g.especiesAMano.problemaDe(crudo.especie);
  const errores: Partial<Record<CampoAMano, string>> = intentado
    ? { ...(problema ? { especie: textoDelProblema(problema, crudo.especie) } : {}), ...(revision.ok ? {} : revision.errores) }
    : {};
  const mensaje = excede
    ? `La guía lleva hasta ${TROZAS_POR_GUIA_MAX} trozas: quedan ${Math.max(0, restantes)}.`
    : ORDEN.map((c) => errores[c]).find(Boolean);
  const delPermiso = g.especiesAMano.delPermiso;

  /* Qué código imprime cada fila: `piezasManuales` sale en el orden de las filas. */
  const filas = useMemo(() => {
    let i = 0;
    return g.aMano.filas.map((f) => {
      const piezas = g.piezasManuales.slice(i, i + f.cantidad);
      i += f.cantidad;
      return { f, piezas, volumen: volumenDeFila(f) };
    });
  }, [g.aMano.filas, g.piezasManuales]);
  const totalTrozas = g.piezasManuales.length;
  const totalVolumen = filas.reduce((a, x) => a + x.volumen, 0);

  function agregar() {
    setIntentado(true);
    if (!revision.ok || problema) {
      const primero = revision.ok ? "especie" : ORDEN.find((c) => revision.errores[c]);
      if (primero) enfocar(primero);
      return;
    }
    if (excede) return refs.cantidad.current?.focus();
    g.aMano.agregar(revision.troza);
    /* Fijada, la especie se queda y se sigue por D1; si no, se vuelve a pedir. */
    setCrudo({ ...VACIO, especie: fijacion.fijada ?? "" });
    setIntentado(false);
    enfocar(fijacion.fijada ? "d1" : "especie");
  }

  function alPresionar(campo: CampoAMano) {
    return (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const sig = ORDEN[ORDEN.indexOf(campo) + 1];
      if (sig) enfocar(sig);
      else agregar();
    };
  }

  const vista = revision.ok ? volumenDeFila(revision.troza) : null;
  const cadaUna = revision.ok && revision.troza.cantidad > 1 ? volumenPorTroza(revision.troza) : null;

  return (
    <div className="space-y-2 sm:col-span-12" data-testid="trozas-a-mano">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-bold text-[var(--text-primary)]">Anotar a mano</span>
        <InfoTip
          title="Trozas anotadas a mano"
          what="Para las trozas que no están en el Trozado: elige la especie del catálogo (fíjala si todas son de la misma) y anota D1, D2, largo y cantidad; el volumen se calcula solo con la fórmula SERFOR (Smalian). Al registrar, cada troza queda en el Trozado del libro y sale en la guía con un número (1, 2, 3…)."
          affects={
            g.planId
              ? "Van con el permiso de esta guía."
              : "Sin permiso por ahora: después de registrar, lo eliges en la tabla de guías (Asignar permiso)."
          }
          example="Tornillo (fijada) · D1 45 · D2 40 · largo 3,20 · cantidad 1 → 0,454 m³"
          ariaLabel="Qué es: anotar trozas a mano"
        />
        {!g.planId && (
          <span className="rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
            Sin permiso: lo asignas después
          </span>
        )}
      </div>

      {filas.length > 0 && (
        <div className={MARCO}>
          <DataTable className="w-full">
            <thead>
              <tr>
                <th className={TH}>En la guía</th>
                {/* A 400 px las medidas y la cantidad van debajo del código: con 7 columnas,
                    m³ y «quitar» quedaban tras un scroll lateral (450 px en 330). */}
                <th className={`${THR} hidden sm:table-cell`}>D1 cm</th>
                <th className={`${THR} hidden sm:table-cell`}>D2 cm</th>
                <th className={`${THR} hidden sm:table-cell`}>L m</th>
                <th className={`${THR} hidden sm:table-cell`}>Cant.</th>
                <th className={THR}>m³</th>
                <th className={TH}>
                  <span className="sr-only">Quitar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ f, piezas, volumen }) => {
                const p = piezas[0];
                const codigos = codigosDeFila(piezas.map((x) => x.codigo));
                const malEspecie = g.especiesAMano.problemaDe(f.especie);
                return (
                  <tr key={f.key}>
                    <td className={TD}>
                      <span className="whitespace-nowrap font-mono font-bold">{codigos}</span>
                      {f.especie && <span className="block text-xs font-semibold text-[var(--text-secondary)]">{f.especie}</span>}
                      {malEspecie && (
                        <span title={malEspecie.motivo} data-qa="especie-con-problema" className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${PASTILLA[malEspecie.tipo]}`}>
                          {malEspecie.tipo === "catalogo" ? "Ya no está en el catálogo" : "Fuera del permiso"}
                        </span>
                      )}
                      {p && (
                        <span className="block font-mono text-xs tabular-nums text-[var(--text-secondary)] sm:hidden">
                          {dec(cm(p.diamMayorM ?? 0), 1)} · {dec(cm(p.diamMenorM ?? 0), 1)} cm · {dec(p.lengthM, 2)} m
                          {f.cantidad > 1 && ` · ×${f.cantidad}`}
                        </span>
                      )}
                    </td>
                    <td className={`${TDR} hidden sm:table-cell`}>{p ? dec(cm(p.diamMayorM ?? 0), 1) : "—"}</td>
                    <td className={`${TDR} hidden sm:table-cell`}>{p ? dec(cm(p.diamMenorM ?? 0), 1) : "—"}</td>
                    <td className={`${TDR} hidden sm:table-cell`}>{p ? dec(p.lengthM, 2) : "—"}</td>
                    <td className={`${TDR} hidden sm:table-cell`}>{f.cantidad}</td>
                    <td className={`${TDR} font-bold`}>{fmtM3(volumen)}</td>
                    <td className={`${TD} w-px`}>
                      <button
                        type="button"
                        onClick={() => g.aMano.quitar(f.key)}
                        aria-label={`Quitar la troza ${codigos}`}
                        title="Quitar de la guía"
                        className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)] dark:hover:bg-[var(--data-error-500)]/12 dark:hover:text-[var(--data-error-500)]"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--rule-base)]">
                <td className={`${TD} font-bold text-[var(--text-secondary)] sm:hidden`}>
                  {totalTrozas} {totalTrozas === 1 ? "troza" : "trozas"} a mano
                </td>
                <td colSpan={4} className={`${TD} hidden text-right font-bold uppercase tracking-wide text-[var(--text-secondary)] sm:table-cell`}>
                  A mano
                </td>
                <td className={`${TDR} hidden font-bold sm:table-cell`}>{totalTrozas}</td>
                <td className={`${TDR} font-bold`}>{fmtM3(totalVolumen)}</td>
                <td className={TD} />
              </tr>
            </tfoot>
          </DataTable>
        </div>
      )}

      {/* La fila de alta: la especie (fijable), cuatro medidas, el volumen calculado y «Agregar». */}
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.3fr)_auto]">
        <div className="col-span-2 grid gap-1 sm:col-span-full sm:max-w-xl">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Especie</span>
          <EspecieFijable
            value={crudo.especie}
            onChange={(especie) => setCrudo((prev) => ({ ...prev, especie }))}
            catalogo={catalogo}
            fijacion={fijacion}
            selectRef={refEspecie}
            onKeyDown={alPresionar("especie")}
            invalido={Boolean(errores.especie)}
            ariaLabel="Especie de las trozas a mano"
            opciones={delPermiso?.map((nombre) => ({ nombre }))}
            etiquetaOpciones="Del permiso"
            etiquetaCatalogo="Otras (no están en el permiso)"
          />
        </div>
        {MEDIDAS.map((c) => (
          <label key={c} className="grid gap-1">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">{CAMPOS[c].label}</span>
            <input
              ref={refs[c]}
              inputMode={c === "cantidad" ? "numeric" : "decimal"}
              autoComplete="off"
              value={crudo[c]}
              placeholder={CAMPOS[c].placeholder}
              onChange={(e) => setCrudo((prev) => ({ ...prev, [c]: e.target.value }))}
              onKeyDown={alPresionar(c)}
              aria-invalid={errores[c] || (c === "cantidad" && excede) ? true : undefined}
              className={`${I} font-mono tabular-nums ${
                errores[c] || (c === "cantidad" && excede) ? "border-[var(--data-error-500)]" : ""
              }`}
            />
          </label>
        ))}
        <div className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">Volumen (m³)</span>
          <output
            aria-live="polite"
            className="flex h-11 items-center justify-end gap-1.5 rounded-xl border-[1.5px] border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]"
          >
            {vista == null ? <span className="text-[var(--text-tertiary)]">—</span> : fmtM3(vista)}
            {cadaUna != null && <span className="text-xs font-normal text-[var(--text-tertiary)]">({fmtM3(cadaUna)} c/u)</span>}
          </output>
        </div>
        <Btn variant="primary" onClick={agregar} disabled={restantes <= 0} className="col-span-2 sm:col-span-1">
          <Plus className="h-4 w-4" aria-hidden="true" /> Agregar
        </Btn>
      </div>
      {mensaje && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {mensaje}
        </p>
      )}
    </div>
  );
}
