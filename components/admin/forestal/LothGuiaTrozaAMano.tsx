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
 * Cantidad, agrega; → y ← pasan entre las medidas como en el cubicador
 * (`useTecladoGrilla`) y ↑ sube a la lista de lo anotado: las dos son UNA
 * grilla (`GRILLA_A_MANO`), con la fila de alta como la última. Las medidas se revisan con los límites del Cubicador
 * (`revisarTrozaAMano`); el volumen es una vista previa: el servidor lo vuelve
 * a calcular con la misma fórmula al registrar, y valida la especie contra el
 * catálogo. Al lado, el ÁRBOL del censo de donde salió (opcional,
 * `ArbolDeTrozaAMano`): con él la troza numera como el trozado («001-TOR-A»).
 * La lista de lo anotado vive en `troza-a-mano-tabla`.
 */

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Plus } from "@buleje/design-system/icons";
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
import type { CatalogoUI } from "./ctp-especie-campo";
import { EspecieFijable } from "./especie-fijable";
import { useEspecieFijada } from "./hooks/use-especie-fijada";
import { ArbolDeTrozaAMano } from "./arbol-de-troza-a-mano";
import TrozaAManoTabla from "./troza-a-mano-tabla";
import { useTecladoGrilla } from "./celdas-excel";
import { COLUMNAS_A_MANO, GRILLA_A_MANO } from "./troza-a-mano-celda";

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
/** Al pie del campo, corto; el motivo entero (el de T7) va en la pastilla de la fila y en «Falta». */
const textoDelProblema = (p: ProblemaEspecieAMano, especie: string) =>
  p.tipo === "catalogo" ? p.motivo : `${especie.trim()} no está en el permiso de esta guía: elige una «Del permiso».`;

export default function LothGuiaTrozaAMano({ g, catalogo }: { g: DespachoGuiaLoth; catalogo: CatalogoUI }) {
  const fijacion = useEspecieFijada("loth-guia-a-mano");
  const [crudo, setCrudo] = useState<CrudoAMano>(() => ({ ...VACIO, especie: fijacion.fijada ?? "" }));
  /* El árbol del censo (opcional): se elige por troza, no se fija. */
  const [arbolId, setArbolId] = useState<string | null>(null);
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
  /* Y lo del árbol: plan y especie del censo (lo dice el selector) y T4 (lo dice el pie). */
  const arbolMal = g.arbolesAMano.revisar(arbolId, crudo.especie);
  const pasaLaTala = revision.ok && arbolMal?.ok ? g.arbolesAMano.exceso(arbolId, volumenDeFila(revision.troza)) : null;
  const errores: Partial<Record<CampoAMano, string>> = intentado
    ? { ...(problema ? { especie: textoDelProblema(problema, crudo.especie) } : {}), ...(revision.ok ? {} : revision.errores) }
    : {};
  const mensaje = excede
    ? `La guía lleva hasta ${TROZAS_POR_GUIA_MAX} trozas: quedan ${Math.max(0, restantes)}.`
    : (ORDEN.map((c) => errores[c]).find(Boolean) ?? (intentado ? pasaLaTala : null));
  const delPermiso = g.especiesAMano.delPermiso;
  const nombresDeEspecie = useMemo(() => [...(delPermiso ?? []), ...catalogo.nombres], [delPermiso, catalogo.nombres]);

  function agregar() {
    setIntentado(true);
    if (!revision.ok || problema) {
      const primero = revision.ok ? "especie" : ORDEN.find((c) => revision.errores[c]);
      if (primero) enfocar(primero);
      return;
    }
    if (excede) return refs.cantidad.current?.focus();
    /* El árbol que no va (plan, especie, tala) frena acá y no al registrar. */
    if ((arbolMal && !arbolMal.ok) || pasaLaTala) return;
    g.aMano.agregar({ ...revision.troza, arbolId });
    /* Fijada, la especie se queda y se sigue por D1; si no, se vuelve a pedir.
       El árbol se suelta siempre: atribuir a otro árbol sin querer es peor que un clic. */
    setCrudo({ ...VACIO, especie: fijacion.fijada ?? "" });
    setArbolId(null);
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

  /* La fila de alta es la última de la grilla: ↑ sube a lo anotado, ← desde D1 va a la Cantidad de arriba. */
  const filaAlta = g.aMano.filas.length;
  const teclas = useTecladoGrilla({ grilla: GRILLA_A_MANO, columnas: COLUMNAS_A_MANO, totalFilas: filaAlta + 1, envolver: true });
  const alTeclear = (c: Medida) => (e: KeyboardEvent<HTMLInputElement>) =>
    e.key === "Enter" ? alPresionar(c)(e) : teclas(e);

  const vista = revision.ok ? volumenDeFila(revision.troza) : null;
  const cadaUna = revision.ok && revision.troza.cantidad > 1 ? volumenPorTroza(revision.troza) : null;

  return (
    <div className="space-y-2 sm:col-span-12" data-testid="trozas-a-mano" data-grilla={GRILLA_A_MANO}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-bold text-[var(--text-primary)]">Anotar a mano</span>
        <InfoTip
          title="Trozas anotadas a mano"
          what="Para las trozas que no están en el Trozado: elige la especie del catálogo (fíjala si todas son de la misma) y, si sabes de qué árbol del censo salió, elígelo; anota D1, D2, largo y cantidad y el volumen se calcula solo (Smalian). Al registrar, cada troza queda en el Trozado del libro y sale en la guía con un número (1, 2, 3…) o, con árbol, con su código (001-TOR-A)."
          affects={
            g.planId
              ? "Van con el permiso de esta guía."
              : "Sin permiso por ahora: después de registrar, lo eliges en la tabla de guías (Asignar permiso)."
          }
          example="Tornillo (fijada) · árbol 001-TOR · D1 45 · D2 40 · largo 3,20 · cantidad 1 → 0,454 m³, sale como 001-TOR-A"
          ariaLabel="Qué es: anotar trozas a mano"
        />
        {!g.planId && (
          <span className="rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-xs font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
            Sin permiso: lo asignas después
          </span>
        )}
      </div>

      <TrozaAManoTabla g={g} />

      {/* La fila de alta: la especie (fijable), cuatro medidas, el volumen calculado y «Agregar». */}
      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.3fr)_auto]">
        {/* Especie y árbol en una fila: el árbol se filtra por la especie. */}
        <div className="col-span-2 grid gap-2 sm:col-span-full sm:grid-cols-2 sm:items-start lg:max-w-4xl">
          <div className="grid gap-1">
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
          <ArbolDeTrozaAMano
            g={g}
            arbolId={arbolId}
            onChange={setArbolId}
            especie={crudo.especie}
            onEspecie={(especie) => setCrudo((prev) => ({ ...prev, especie }))}
            nombres={nombresDeEspecie}
          />
        </div>
        {MEDIDAS.map((c, j) => (
          <label key={c} className="grid gap-1">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">{CAMPOS[c].label}</span>
            <input
              ref={refs[c]}
              inputMode={c === "cantidad" ? "numeric" : "decimal"}
              autoComplete="off"
              value={crudo[c]}
              placeholder={CAMPOS[c].placeholder}
              onChange={(e) => setCrudo((prev) => ({ ...prev, [c]: e.target.value }))}
              onKeyDown={alTeclear(c)}
              data-fila={filaAlta}
              data-col={COLUMNAS_A_MANO[j]}
              data-qa={`alta-${c}`}
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
