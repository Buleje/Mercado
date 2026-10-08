"use client";

/**
 * «Guardar en la cuenta» del cubicador de trozas (ADR-478).
 *
 * El patio sigue viviendo en el navegador; esto lo SUBE con dueño: la persona
 * de «Cuenta por persona» que trajo (o se lleva) la madera, la fecha y la guía
 * si vino con una. El servidor congela las medidas y le pone «CUB-2026-0003».
 * Valorizar y descontar del adelanto va aparte (`cubicador-trozas-valorizar`).
 *
 * Anti doble pago desde acá: el lote recuerda qué CUB salió de él. Guardar otra
 * vez ACTUALIZA esa misma si sigue en borrador; si ya se descontó, pide marcar
 * que son otras trozas antes de guardar una nueva.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Save } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useTenant } from "@/contexts/tenant-context";
import { formatCurrency } from "@/lib/currency";
import { cubicarEnServidor, fmtVolumen, MedidaFueraDeRangoError } from "@/lib/forestal/cubicacion-cuenta";
import { limaDateKey } from "@/lib/utils";
import { UNIDADES_FORMULA, totalesSegun, type DiametrosPorTroza, type FormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import type { FilaTroza } from "./cubicador-trozas-tabla";
import {
  guardarCubicacionTrozas, leerCubicacionTrozas, trozasParaGuardar, usePersonasDeLaCuenta,
  type CubicacionTrozas, type GuardarCubicacionInput, type PersonaCuenta, type SentidoCubicacion,
} from "./hooks/use-cubicaciones-trozas";

export const CAMPO_CUENTA =
  "h-12 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const ETIQUETA = "mb-1 block text-sm font-semibold text-[var(--text-secondary)]";

/** Lo que cada persona tiene abierto del lado que toca (compra paga lo DADO; venta, lo RECIBIDO). */
function abiertosDe(p: PersonaCuenta, sentido: SentidoCubicacion): { n: number; monto: number } {
  const a = p.adelantos;
  if (!a || !p.beneficiarioId) return { n: 0, monto: 0 };
  return sentido === "venta" ? { n: a.recibidosAbiertos, monto: a.recibidoPendiente } : { n: a.abiertos, monto: a.teDebe };
}

function etiquetaPersona(p: PersonaCuenta, sentido: SentidoCubicacion): string {
  if (!p.beneficiarioId) return `${p.nombre} · sólo directorio (no descuenta)`;
  if (p.adelantos === undefined) return p.nombre; // tu rol no ve la plata
  const { n, monto } = abiertosDe(p, sentido);
  if (!n) return `${p.nombre} · sin adelantos abiertos`;
  const quien = sentido === "venta" ? "le debes" : "te debe";
  return `${p.nombre} · ${n} ${n === 1 ? "adelanto" : "adelantos"} · ${quien} ${formatCurrency(monto)}`;
}

export default function GuardarEnLaCuentaModal({
  rows, formula, diametros, previaId, onGuardada, onCerrar,
}: {
  rows: FilaTroza[];
  formula: FormulaTrozas;
  diametros: DiametrosPorTroza;
  /** La CUB que ya salió de este lote, si salió alguna. */
  previaId: string | null;
  onGuardada: (c: CubicacionTrozas) => void;
  onCerrar: () => void;
}) {
  const { branding } = useTenant();
  const { personas, cargando, error: errorPersonas } = usePersonasDeLaCuenta(true);
  const [clave, setClave] = useState("");
  const [sentido, setSentido] = useState<SentidoCubicacion>("compra");
  const [fecha, setFecha] = useState(() => limaDateKey());
  const [gtf, setGtf] = useState("");
  const [notas, setNotas] = useState("");
  const [especieFaltante, setEspecieFaltante] = useState("");
  const [previa, setPrevia] = useState<CubicacionTrozas | null>(null);
  const [comoNueva, setComoNueva] = useState(false);
  const [sonOtras, setSonOtras] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* La CUB anterior de este lote: si sigue en borrador, se actualiza ella. */
  useEffect(() => {
    if (!previaId) return;
    let vivo = true;
    void leerCubicacionTrozas(previaId).then((r) => {
      if (!vivo || !r.ok || r.data.estado === "anulada") return;
      setPrevia(r.data);
      setSentido(r.data.sentido);
      setGtf(r.data.gtfNumber ?? "");
      if (r.data.beneficiarioId) setClave(`benef:${r.data.beneficiarioId}`);
      else if (r.data.parteId) setClave(`parte:${r.data.parteId}`);
    });
    return () => { vivo = false; };
  }, [previaId]);

  const ordenadas = useMemo(
    () => [...(personas ?? [])].sort((a, b) => abiertosDe(b, sentido).n - abiertosDe(a, sentido).n || a.nombre.localeCompare(b.nombre)),
    [personas, sentido],
  );
  const persona = ordenadas.find((p) => p.clave === clave) ?? null;
  const u = UNIDADES_FORMULA[formula];
  /* El volumen que va a congelar el servidor (misma función, ADR-478): re-cubicado
     desde las medidas con el Ø que se manda, no el PT que quedó en cada fila del
     patio (con 2 Ø cambiados a 1, o un lote viejo, no coinciden). Una medida que
     pasa del tope se avisa acá, antes del 422. */
  const cubicado = useMemo((): { volumen: number; fueraDeRango: string | null } => {
    try {
      return { volumen: cubicarEnServidor(formula, trozasParaGuardar(rows, diametros, ""), diametros).volumen, fueraDeRango: null };
    } catch (e) {
      return { volumen: totalesSegun(rows, formula).volumen, fueraDeRango: e instanceof MedidaFueraDeRangoError ? e.message : null };
    }
  }, [rows, formula, diametros]);
  const volumen = cubicado.volumen;
  const sinEspecie = rows.filter((r) => !r.especie?.trim()).length;
  const especies = useMemo(() => [...new Set(rows.map((r) => r.especie?.trim()).filter((e): e is string => !!e))], [rows]);
  const sospechosas = rows.filter((r) => r.sospechosa).length;
  const actualiza = !!previa && previa.estado === "borrador" && !comoNueva;
  const yaSeDescontoEste = !!previa && previa.estado === "aplicada";
  const listo =
    !!persona && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && (sinEspecie === 0 || !!especieFaltante.trim()) && (!yaSeDescontoEste || sonOtras) &&
    !cubicado.fueraDeRango;

  const guardar = async () => {
    if (!persona || !listo || enviando) return;
    setEnviando(true);
    setError(null);
    const input: GuardarCubicacionInput = {
      fecha, formula, diametros, sentido,
      trozas: trozasParaGuardar(rows, diametros, especieFaltante),
      ...(persona.beneficiarioId ? { beneficiarioId: persona.beneficiarioId } : {}),
      ...(persona.parteId ? { parteId: persona.parteId } : {}),
      ...(gtf.trim() ? { gtfNumber: gtf.trim() } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      ...(actualiza && previa ? { version: previa.version } : {}),
    };
    const r = await guardarCubicacionTrozas(input, actualiza && previa ? previa.id : undefined);
    setEnviando(false);
    if (r.ok) onGuardada(r.data);
    else setError(r.mensaje);
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Guardar en la cuenta"
      description={`${branding.name ?? "Este negocio"} · ${rows.length} ${rows.length === 1 ? "troza" : "trozas"} · ${fmtVolumen(volumen, formula)}`}
      icon={Save}
      claveVentana="cubicador-trozas-guardar"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar}>Cancelar</button>
          <button type="button" className={BOTON_PRIMARIO} disabled={!listo || enviando} onClick={() => void guardar()} data-accion="guardar-cubicacion">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {actualiza && previa ? `Actualizar ${previa.codigo}` : "Guardar"}
          </button>
        </div>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`} data-vista="cubicador-trozas-guardar">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 font-semibold text-[var(--text-secondary)]">{u.etiqueta}</span>
          {diametros === 1 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-50)] px-2.5 py-1 font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
              medido con 1 Ø
              <InfoTip what="Cada troza se midió con un solo diámetro al medio." affects="Con las dos puntas, como en la guía, el volumen sale hasta 21 % más bajo. Con esta medida se va a pagar." />
            </span>
          )}
          {sospechosas > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="h-4 w-4" /> {sospechosas} con medidas raras: revísalas antes
            </span>
          )}
          {cubicado.fueraDeRango && (
            <span role="alert" className="inline-flex items-center gap-1 font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              <AlertTriangle className="h-4 w-4" /> {cubicado.fueraDeRango}
            </span>
          )}
        </div>

        <div>
          <label htmlFor="cub-persona" className={ETIQUETA}>¿De quién es la madera?</label>
          <select id="cub-persona" className={CAMPO_CUENTA} value={clave} onChange={(e) => setClave(e.target.value)} disabled={cargando}>
            <option value="">{cargando ? "Cargando cuentas…" : "Elige la persona"}</option>
            {ordenadas.map((p) => <option key={p.clave} value={p.clave}>{etiquetaPersona(p, sentido)}</option>)}
          </select>
          {errorPersonas && <p className="mt-1 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{errorPersonas}</p>}
          {persona && !persona.beneficiarioId && (
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">Queda guardada a su nombre; para descontar, necesita un adelanto.</p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div role="radiogroup" aria-label="Quién entrega la madera">
            <span className={ETIQUETA}>La madera…</span>
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[var(--surface-sunken)] p-1">
              {(["compra", "venta"] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={sentido === s} onClick={() => setSentido(s)}
                  className={`h-10 rounded-xl text-sm font-bold transition-colors ${sentido === s ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}>
                  {s === "compra" ? "Te la trae" : "Se la entregas"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="cub-fecha" className={ETIQUETA}>Fecha</label>
            <input id="cub-fecha" type="date" className={CAMPO_CUENTA} value={fecha} max={limaDateKey()} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label htmlFor="cub-gtf" className={ETIQUETA}>Guía (si vino con una)</label>
            <input id="cub-gtf" className={CAMPO_CUENTA} value={gtf} maxLength={80} placeholder="N° de la GTF" onChange={(e) => setGtf(e.target.value)} />
          </div>
          {sinEspecie > 0 && (
            <div>
              <label htmlFor="cub-especie" className={ETIQUETA}>Especie de las {sinEspecie} sin especie</label>
              <input id="cub-especie" list="cub-especies" className={CAMPO_CUENTA} value={especieFaltante} maxLength={80} placeholder="Ej.: Tornillo" onChange={(e) => setEspecieFaltante(e.target.value)} />
              <datalist id="cub-especies">{especies.map((e) => <option key={e} value={e} />)}</datalist>
            </div>
          )}
          <div className="sm:col-span-2">
            <label htmlFor="cub-notas" className={ETIQUETA}>Nota (opcional)</label>
            <input id="cub-notas" className={CAMPO_CUENTA} value={notas} maxLength={500} placeholder="Ej.: llegó en la camioneta de Wilmer" onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        {previa && previa.estado === "borrador" && (
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={comoNueva} onChange={(e) => setComoNueva(e.target.checked)} />
            Este patio ya se guardó como <b className="font-mono text-[var(--text-primary)]">{previa.codigo}</b>: guardarlo como otra nueva
          </label>
        )}
        {yaSeDescontoEste && previa && (
          <label className="flex items-start gap-2 rounded-2xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--accent)]" checked={sonOtras} onChange={(e) => setSonOtras(e.target.checked)} />
            <span>
              Este patio ya se descontó como <b className="font-mono">{previa.codigo}</b> ({formatCurrency(previa.monto ?? 0)}). Marca sólo si son
              <b> otras trozas</b>: guardar las mismas las pagaría dos veces.
            </span>
          </label>
        )}

        {persona && (
          <p className="rounded-2xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            Se guarda en <b className="text-[var(--text-primary)]">{branding.name ?? "este negocio"}</b>, a la cuenta de{" "}
            <b className="text-[var(--text-primary)]">{persona.nombre}</b>. Todavía no mueve plata: eso es «Valorizar y descontar».
          </p>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
