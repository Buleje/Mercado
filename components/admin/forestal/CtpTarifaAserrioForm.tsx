"use client";

/**
 * El formulario de UNA versión de la tarifa de aserrío (ADR-412).
 *
 * Tres tablas cortas —no una grilla especie × tipo × largo— porque un
 * casillero vacío en una grilla cobraría cero sin que nadie lo haya decidido.
 * El ejemplo en vivo usa la MISMA `cotizarAserrio` que el servidor: lo que se
 * ve acá es lo que se va a cobrar, no una cuenta aparte.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Plus, Save, Trash2 } from "@buleje/design-system/icons";
import { ORDEN_TIPO, tipoCorto, type TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import {
  cotizarAserrio,
  explicarPrecio,
  revisarVersion,
  type BaseDelBorrador,
  type BloqueACobrar,
  type VersionTarifa,
  type VersionTarifaInput,
} from "@/lib/forestal/tarifa-aserrio";
import { Btn, Field, CampoGrid, formatDate, ModalFooter } from "./ctp-shared";
import { borradorDesde, borradorDesdeProduccion, inputDesde, tiposDelBorrador, type BorradorTarifa } from "./ctp-tarifa-aserrio-shared";
import { formatNumber } from "@/lib/format";

const I =
  "h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

/** Un bloque de 1 m³ de una pieza comercial de 10 pies — lo que se muestra en
 *  el ejemplo en vivo. No es una pieza real: es la vara con la que se explica
 *  cualquier tarifa que se esté armando. */
function bloqueDeEjemplo(especie: string | null): BloqueACobrar {
  return {
    etiqueta: "Ejemplo",
    especie,
    volumenM3: 1,
    productType: "MADERA ASERRADA (COMERCIAL)",
    espesorCm: 5, // ~2" — junto con el ancho y el largo clasifica como "Comercial"
    anchoCm: 20, // ~8"
    largoM: 3.05, // ~10 pies
  };
}

export default function CtpTarifaAserrioForm({
  version,
  nombresCatalogo,
  vigenteDesdeInicial,
  comoNueva,
  borradorProduccion,
  guardando,
  onGuardar,
  onCancelar,
}: {
  /** `null` = versión en blanco (nueva sin ninguna vigente todavía que copiar). */
  version: VersionTarifa | null;
  nombresCatalogo: readonly string[];
  vigenteDesdeInicial: string;
  /**
   * «Nueva tarifa desde hoy»: `version` trae los VALORES de la vigente como
   * plantilla, pero esto tiene que guardarse con un `id` nuevo, nunca el de
   * `version` (ALTO, revisión 2026-09-14 — ver `borradorDesde`).
   */
  comoNueva?: boolean;
  /**
   * El borrador armado con la producción real (ADR-412, «Armar con tu
   * producción»): sólo las especies y los tipos que este aserradero trabaja,
   * todos con precio en 0. Cuando viene, MANDA sobre `version`/`nombresCatalogo`
   * — es un punto de partida distinto, no una versión existente.
   */
  borradorProduccion?: { borrador: VersionTarifaInput; base: BaseDelBorrador };
  guardando: boolean;
  /** Devuelve el `message` del 422 tal cual, o `null` si guardó bien. */
  onGuardar: (input: ReturnType<typeof inputDesde>) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [b, setB] = useState<BorradorTarifa>(() =>
    borradorProduccion
      ? borradorDesdeProduccion(borradorProduccion.borrador)
      : borradorDesde(version, nombresCatalogo, vigenteDesdeInicial, comoNueva),
  );
  const [error, setError] = useState<string | null>(null);
  /* Con el borrador de producción TODO arranca vacío a propósito — resaltar
     esos casilleros es lo que evita que se lean como "ya está, no hace falta
     tocarlos". Sin `borradorProduccion` (editar una versión de verdad) un
     precio vacío es normal —esa especie usa la base general— y resaltarlo
     sería ruido. */
  const resaltarVacios = Boolean(borradorProduccion);
  const tiposVisibles: readonly TipoComercial[] = borradorProduccion
    ? tiposDelBorrador(borradorProduccion.borrador)
    : ORDEN_TIPO;
  const avisoVacio = "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/5";

  const setTipo = (t: (typeof ORDEN_TIPO)[number], v: string) =>
    setB((p) => ({ ...p, tipos: { ...p.tipos, [t]: v } }));
  const setEspecie = (i: number, v: string) =>
    setB((p) => ({ ...p, especies: p.especies.map((e, j) => (j === i ? { ...e, precioPt: v } : e)) }));
  const setLargo = (id: string, cambios: Partial<Omit<BorradorTarifa["largos"][number], "id">>) =>
    setB((p) => ({ ...p, largos: p.largos.map((l) => (l.id === id ? { ...l, ...cambios } : l)) }));
  const agregarLargo = () =>
    setB((p) => ({
      ...p,
      largos: [...p.largos, { id: crypto.randomUUID(), desdePies: "", hastaPies: "", ajustePt: "" }],
    }));
  const quitarLargo = (id: string) => setB((p) => ({ ...p, largos: p.largos.filter((l) => l.id !== id) }));

  /* La MISMA revisión que hace el servidor al guardar (`revisarVersion` es
     pura): sirve para el ejemplo en vivo Y para no dejar tocar "Guardar" con
     un borrador que el 422 iba a rechazar igual — la pantalla lo dice ANTES,
     no después de errar contra el servidor. */
  const revision = useMemo(() => revisarVersion(inputDesde(b)), [b]);
  const ejemplo = useMemo(() => {
    if (!revision.ok) return null;
    const especiePrimera =
      b.especies.find((e) => e.precioPt.trim() !== "")?.nombre ?? nombresCatalogo[0] ?? null;
    const cot = cotizarAserrio(
      { ...revision.version, id: "preview", creadoPor: null, creadoEn: null },
      [bloqueDeEjemplo(especiePrimera)],
    );
    return { especiePrimera, cot };
  }, [b, nombresCatalogo, revision]);

  async function guardar() {
    setError(null);
    const motivo = await onGuardar(inputDesde(b));
    if (motivo) setError(motivo);
  }

  return (
    <div className="space-y-4">
      {borradorProduccion && (
        <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          Armado con tu producción: <b className="text-[var(--text-primary)]">{borradorProduccion.base.corridas}</b>{" "}
          {borradorProduccion.base.corridas === 1 ? "corrida" : "corridas"} ·{" "}
          <b className="text-[var(--text-primary)]">{Number(borradorProduccion.base.m3).toFixed(2)} m³</b>
          {borradorProduccion.base.especies.length > 0 && (
            <>
              {" · "}
              {borradorProduccion.base.especies
                .map((e) => `${e.nombre} ${Number(e.m3).toFixed(2)} m³`)
                .join(" · ")}
            </>
          )}
          . Los precios abajo están en blanco: ponlos tú.
        </p>
      )}

      {borradorProduccion?.base.desdeCorrida && (
        <p className="text-xs text-[var(--text-tertiary)]">
          Rige desde el <b className="text-[var(--text-secondary)]">{formatDate(borradorProduccion.base.desdeCorrida.fecha)}</b>, la fecha de la
          corrida N° {borradorProduccion.base.desdeCorrida.lineNo ?? "—"}, la más vieja del borrador: así esa corrida y
          las siguientes se pueden cobrar con esta tarifa.
        </p>
      )}

      <CampoGrid>
        <Field label="Vigente desde" span={4} hint="Rige hasta que empiece la siguiente">
          <input
            type="date"
            value={b.vigenteDesde}
            onChange={(e) => setB((p) => ({ ...p, vigenteDesde: e.target.value }))}
            className={I}
          />
        </Field>
        <Field label="Precio general" span={4} hint="S/ por pie tablar, para lo que no tiene precio propio">
          <input
            type="number"
            min={0}
            step="0.01"
            value={b.basePt}
            onChange={(e) => setB((p) => ({ ...p, basePt: e.target.value }))}
            /* Con el borrador de producción NADIE sugirió 0.30 — es sólo un
               ejemplo de formato en la tarifa en blanco de siempre; con el
               borrador se leía como el precio ya elegido (revisión
               2026-09-14). */
            placeholder={resaltarVacios ? "sin precio" : "0.30"}
            className={`${I} font-mono ${resaltarVacios && !b.basePt.trim() ? avisoVacio : ""}`}
          />
        </Field>
        <Field label="Nota" span={4} hint="Opcional — por qué cambió, a quién se le avisó">
          <input
            value={b.nota}
            onChange={(e) => setB((p) => ({ ...p, nota: e.target.value }))}
            maxLength={300}
            className={I}
          />
        </Field>
      </CampoGrid>

      {/* Precios por especie: una fila por cada especie del catálogo. Vacío =
          usa el precio general — no hace falta tocar la especie que no varía. */}
      <div>
        <p className="mb-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          Precio por especie (S/ por PT)
        </p>
        {b.especies.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">
            Todavía no hay especies en el catálogo del aserradero.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {b.especies.map((e, i) => (
              <label key={e.nombre} className="block text-sm">
                <span className="mb-1 block truncate text-[var(--text-secondary)]">{e.nombre}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={e.precioPt}
                  onChange={(ev) => setEspecie(i, ev.target.value)}
                  placeholder="general"
                  className={`${I} font-mono ${resaltarVacios && !e.precioPt.trim() ? avisoVacio : ""}`}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Ajuste por tipo de pieza: siete filas fijas (el mismo orden que el
          cubicador), vacío = sin ajuste. Puede ser negativo. */}
      <div>
        <p className="mb-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          Ajuste por tipo (S/ por PT, puede ser negativo)
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {tiposVisibles.map((t) => (
            <label key={t} className="block text-sm">
              <span className="mb-1 block truncate text-[var(--text-secondary)]">{tipoCorto(t)}</span>
              <input
                type="number"
                step="0.01"
                value={b.tipos[t]}
                onChange={(e) => setTipo(t, e.target.value)}
                placeholder={resaltarVacios ? "sin ajuste" : "0"}
                className={`${I} font-mono ${resaltarVacios && !b.tipos[t].trim() ? avisoVacio : ""}`}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Tramos de largo: lista libre, se arma con lo que este aserradero
          realmente distingue — no todos cobran distinto por largo. */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Ajuste por tramo de largo (pies)
          </p>
          <button
            type="button"
            onClick={agregarLargo}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Agregar tramo
          </button>
        </div>
        {b.largos.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">Sin tramos: el largo no cambia el precio.</p>
        ) : (
          <div className="space-y-1.5">
            {b.largos.map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--text-secondary)]">Desde</span>
                  <input type="number" min={0} value={l.desdePies} onChange={(e) => setLargo(l.id, { desdePies: e.target.value })} className={`${I} font-mono`} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--text-secondary)]">Hasta</span>
                  <input type="number" min={0} value={l.hastaPies} onChange={(e) => setLargo(l.id, { hastaPies: e.target.value })} placeholder="sin tope" className={`${I} font-mono`} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--text-secondary)]">Ajuste</span>
                  <input type="number" step="0.01" value={l.ajustePt} onChange={(e) => setLargo(l.id, { ajustePt: e.target.value })} className={`${I} font-mono`} />
                </label>
                <button
                  type="button"
                  onClick={() => quitarLargo(l.id)}
                  aria-label="Quitar este tramo"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-500)]"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* El ejemplo en vivo: la MISMA cuenta que va a correr el servidor. */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          Ejemplo en vivo
        </p>
        {ejemplo && ejemplo.cot.lineas[0] ? (
          <>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              1 m³ ({formatNumber(ejemplo.cot.pt)} PT) de{" "}
              <b>{ejemplo.especiePrimera ?? "la especie general"}</b> comercial de 10 pies → S/{" "}
              <b className="font-mono tabular-nums">{Number(ejemplo.cot.importe).toFixed(2)}</b>
            </p>
            <p className="mt-0.5 font-mono text-xs text-[var(--text-tertiary)]">
              {explicarPrecio(ejemplo.cot.lineas[0])}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            Pon al menos el precio general o el de una especie para ver el ejemplo.
          </p>
        )}
      </div>

      {!revision.ok && (
        <p className="flex items-start gap-1.5 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {revision.motivo}
        </p>
      )}

      <ModalFooter error={error}>
        <Btn variant="secondary" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Btn>
        <Btn variant="primary" onClick={() => void guardar()} disabled={guardando || !revision.ok}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Guardar tarifa
        </Btn>
      </ModalFooter>
    </div>
  );
}
