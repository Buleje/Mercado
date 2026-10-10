"use client";

/**
 * «Cubicación comercial» de un despacho del Libro CTP (ADR-483, contrato K7 §8-A).
 *
 * La cubicación OFICIAL (la del libro y la GTF) no se toca. Ésta es la que se
 * cobra —o se paga— con descuentos, ligada a la cuenta de la persona:
 *   1. arriba, lo que dice el libro del despacho y su valor de venta (sólo lectura, D9);
 *   2. «Uno por uno» (una guardada del Cubicador de madera) o «Rápida» (PT por especie);
 *   3. descuentos por especie y general, bruto → neto en vivo;
 *   4. persona, «Le vendo / Me vende», fecha → guardar → valorizar con precio
 *      por especie o general (`ValorizarCubicacionModal`, el de ADR-478).
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Save, Scale } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useMiRol } from "@/hooks/use-mi-rol";
import { formatCurrency } from "@/lib/currency";
import { fmtVolumen } from "@/lib/forestal/cubicacion-cuenta";
import { etiquetaPersonaCubicacion } from "@/lib/forestal/cubicacion-a-cuenta";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { fechaConDia } from "@/lib/forestal/loth-tablero-reporte";
import { limaDateKey } from "@/lib/utils";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import DescuentosDelLote from "./cubicacion-comercial-descuentos";
import RapidaPorTotales from "./cubicacion-comercial-rapida";
import ElegirGuardada from "./cubicacion-comercial-uno-por-uno";
import { CAMPO_CUENTA } from "./cubicador-trozas-guardar";
import ValorizarCubicacionModal from "./cubicador-trozas-valorizar";
import {
  aDescuentoLote, cuerpoComercial, guardarCubicacionComercial, useFormularioComercial, useGuardadasDelCubicador, useMedidasDelModo,
  usePrefillDespacho, vistaComercial, type ModoComercial,
} from "./hooks/use-cubicacion-comercial-despacho";
import { ESTADO_CUB, usePersonasDeLaCuenta } from "./hooks/use-cubicaciones-trozas";

const ETIQUETA = "mb-1 block text-sm font-semibold text-[var(--text-secondary)]";
const ERROR = "flex items-start gap-1.5 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const MODOS: { value: ModoComercial; label: string }[] = [
  { value: "pieza", label: "Uno por uno" },
  { value: "total", label: "Rápida" },
];

export default function CtpCubicacionComercialModal({
  despachoId, onClose, onCambio,
}: {
  despachoId: string;
  onClose: () => void;
  /** Se guardó, se valorizó o se anuló una: la vista puede recargar. */
  onCambio?: () => void;
}) {
  const rol = useMiRol();
  const puedeAplicar = rol === "admin" || rol === "owner" || rol === "superadmin";
  const { prefill, cargando, recargando, error: errorCarga, recargar } = usePrefillDespacho(despachoId);
  const f = useFormularioComercial(prefill);
  const registros = useGuardadasDelCubicador(despachoId, f.modo === "pieza", prefill);
  const medidas = useMedidasDelModo(f.modo, f.lineas, f.refId, registros);
  const descuento = useMemo(() => aDescuentoLote(f.descuentos), [f.descuentos]);
  const vista = useMemo(() => vistaComercial(medidas, f.modo, descuento), [medidas, f.modo, descuento]);
  const { personas, cargando: cargandoPersonas, error: errorPersonas } = usePersonasDeLaCuenta(true);
  const [clave, setClave] = useState("");
  const [sugerida, setSugerida] = useState(false);
  /** Una cubicación abierta en el modal de valorizar; `alCerrar` dice si se vuelve acá o se cierra todo. */
  const [abierta, setAbierta] = useState<{ id: string; alCerrar: "volver" | "cerrar" } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* El destinatario del despacho, si está en «Cuenta por persona», queda elegido (una sola vez). */
  useEffect(() => {
    if (sugerida || !personas?.length || !prefill) return;
    setSugerida(true);
    const k = claveEspecie(prefill.destinatario);
    const p = k ? personas.find((x) => claveEspecie(x.nombre) === k) : undefined;
    if (p) setClave((c) => c || p.clave);
  }, [personas, prefill, sugerida]);

  const ordenadas = useMemo(
    () => [...(personas ?? [])].sort((a, b) => Number(!!b.beneficiarioId) - Number(!!a.beneficiarioId) || a.nombre.localeCompare(b.nombre)),
    [personas],
  );
  const persona = ordenadas.find((p) => p.clave === clave) ?? null;
  const aplicada = prefill?.existentes.find((e) => e.estado === "aplicada") ?? null;
  /* El libro ya tenía su valor y no salió de la cubicación aplicada: cuánto difieren (ADR-484). */
  const diferencia =
    prefill?.valorVentaLibro != null && aplicada?.monto != null && !prefill.valorVentaDe && Math.abs(aplicada.monto - prefill.valorVentaLibro) >= 0.005
      ? Math.round((aplicada.monto - prefill.valorVentaLibro) * 100) / 100
      : null;
  const neto = vista && "netas" in vista ? vista.neto : null;
  const listo = !!prefill && !!persona && neto != null && neto > 0 && (f.modo === "total" || !!f.refId) && !enviando;

  const guardar = async () => {
    if (!listo || !prefill) return;
    setEnviando(true);
    setError(null);
    const r = await guardarCubicacionComercial(
      cuerpoComercial({
        despachoId, modo: f.modo, refId: f.refId, lineas: f.lineas, descuentos: descuento,
        persona, sentido: f.sentido, fecha: f.fecha, notas: f.notas,
      }),
    );
    setEnviando(false);
    if (!r.ok) { setError(r.mensaje); return; }
    onCambio?.();
    setAbierta({ id: r.data.id, alCerrar: "cerrar" });
  };

  if (abierta) {
    return (
      <ValorizarCubicacionModal
        id={abierta.id}
        puedeAplicar={puedeAplicar}
        onCambio={() => onCambio?.()}
        onCerrar={() => {
          if (abierta.alCerrar === "cerrar") { onClose(); return; }
          setAbierta(null);
          recargar();
        }}
      />
    );
  }

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Cubicación comercial"
      description="Aparte de la oficial: con descuentos, la que cobras o pagas."
      icon={Scale}
      variant="wide"
      claveVentana="ctp-cubicacion-comercial"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={BOTON_SECUNDARIO} onClick={onClose}>Cerrar</button>
          <button type="button" className={BOTON_PRIMARIO} disabled={!listo} onClick={() => void guardar()} data-accion="guardar-cubicacion-comercial">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {puedeAplicar ? "Guardar y valorizar" : "Guardar"}
          </button>
        </div>
      }
    >
      <div className={`space-y-5 ${MODAL_BODY}`} data-vista="cubicacion-comercial">
        {cargando ? (
          <p className="flex items-center gap-2 py-8 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando el despacho…</p>
        ) : errorCarga || !prefill ? (
          <p role="alert" className={ERROR}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {errorCarga ?? "No se encontró el despacho."}</p>
        ) : (
          <>
            <section className="space-y-2 rounded-2xl border border-[var(--rule-soft)] p-3" aria-label="Lo que dice el libro">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-[var(--text-secondary)]">GTF de salida <b className="font-mono text-[var(--text-primary)]">{prefill.gtfNumber ?? "sin guía"}</b></span>
                <span className="font-semibold text-[var(--text-primary)]">{prefill.destinatario ?? "Sin destinatario"}</span>
                <span className="text-[var(--text-tertiary)]">{fechaConDia(prefill.fecha.slice(0, 10))}</span>
                <span className="ml-auto inline-flex items-center gap-1 text-[var(--text-secondary)]" data-dato="valor-venta-libro">
                  Valor de venta del libro: <b className="tabular-nums text-[var(--text-primary)]">{prefill.valorVentaLibro != null ? formatCurrency(prefill.valorVentaLibro) : "sin valor"}</b>
                  {prefill.valorVentaDe && <span className="text-[var(--text-tertiary)]">· salió de {prefill.valorVentaDe}</span>}
                  {diferencia != null && <span className="font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">· la cubicación da {formatCurrency(Math.abs(diferencia))} {diferencia > 0 ? "más" : "menos"}</span>}
                  <InfoTip
                    what="Lo que anotaste como venta en el libro."
                    affects="Al aplicar una venta, si el libro no tenía valor, se llena con el total de la cubicación; si ya tenía, no se toca y aquí ves la diferencia. Al anularla se vacía, salvo que alguien lo haya cambiado."
                  />
                </span>
              </div>
              {prefill.lineas.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 text-sm">
                  {prefill.lineas.map((l) => (
                    <li key={l.id} className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 tabular-nums text-[var(--text-secondary)]">
                      <b className="text-[var(--text-primary)]">{l.especie}</b>
                      {l.m3 != null && ` · ${String(Math.round(l.m3 * 1000) / 1000).replace(".", ",")} m³`}
                      {l.piezas != null && ` · ${l.piezas} pzs`}
                      {l.ptLibro != null && ` · ${fmtVolumen(l.ptLibro, "tablar")}`}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {prefill.existentes.length > 0 && (
              <section className="space-y-1.5" aria-label="Cubicaciones de este despacho">
                <ul className="space-y-1.5">
                  {prefill.existentes.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--rule-soft)] px-3 py-2 text-sm">
                      <span className="font-mono font-bold text-[var(--text-primary)]">{e.codigo}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ESTADO_CUB[e.estado].clase}`}>{ESTADO_CUB[e.estado].label}</span>
                      <span className="text-[var(--text-tertiary)]">{e.personaNombre ?? "sin persona"}</span>
                      <span className="ml-auto font-bold tabular-nums text-[var(--text-primary)]">{e.monto != null ? formatCurrency(e.monto) : "—"}</span>
                      <button type="button" className="text-sm font-semibold text-[var(--accent-dark)] hover:underline dark:text-[var(--accent)]"
                        onClick={() => setAbierta({ id: e.id, alCerrar: "volver" })}>
                        Abrir
                      </button>
                    </li>
                  ))}
                </ul>
                {aplicada && (
                  <p className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Este despacho ya se valorizó con {aplicada.codigo}: para hacer otra, anúlala primero.
                  </p>
                )}
              </section>
            )}

            <section className="space-y-3">
              <SegmentedControl value={f.modo} onChange={f.setModo} options={modosConCuenta(prefill.guardadas.length)} label="Cómo cubicar" size="lg" />
              {f.modo === "pieza" ? (
                <ElegirGuardada guardadas={prefill.guardadas} refId={f.refId} onRefId={f.setRefId} despachoId={despachoId} recargando={recargando} onRecargar={recargar} />
              ) : (
                <RapidaPorTotales lineas={f.lineas} onLineas={f.setLineas} libro={prefill.lineas} />
              )}
              {f.modo === "pieza" && f.refId && registros === null && (
                <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo sus piezas…</p>
              )}
            </section>

            <DescuentosDelLote vista={vista} form={f.descuentos} onForm={f.setDescuentos} />

            <section className="grid gap-3 sm:grid-cols-2" aria-label="Cuenta de la persona">
              <div className="sm:col-span-2">
                <label htmlFor="cubc-persona" className={ETIQUETA}>¿A quién le vendes (o quién te vende)?</label>
                <select id="cubc-persona" className={CAMPO_CUENTA} value={clave} onChange={(e) => setClave(e.target.value)} disabled={cargandoPersonas}>
                  <option value="">{cargandoPersonas ? "Cargando cuentas…" : "Elige la persona"}</option>
                  {ordenadas.map((p) => (
                    <option key={p.clave} value={p.clave}>{etiquetaPersonaCubicacion(p, f.sentido)}</option>
                  ))}
                </select>
                {errorPersonas && <p className={`mt-1 ${ERROR}`}>{errorPersonas}</p>}
              </div>
              <div role="radiogroup" aria-label="Le vendes o te vende">
                <span className={ETIQUETA}>La madera…</span>
                <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[var(--surface-sunken)] p-1">
                  {(["venta", "compra"] as const).map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={f.sentido === s} onClick={() => f.setSentido(s)}
                      className={`h-10 rounded-xl text-sm font-bold transition-colors ${f.sentido === s ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"}`}>
                      {s === "venta" ? "Le vendo" : "Me vende"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="cubc-fecha" className={ETIQUETA}>Fecha</label>
                <input id="cubc-fecha" type="date" className={CAMPO_CUENTA} value={f.fecha} max={limaDateKey()} onChange={(e) => f.setFecha(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="cubc-notas" className={ETIQUETA}>Notas</label>
                <input id="cubc-notas" className={CAMPO_CUENTA} value={f.notas} maxLength={500} placeholder="Ej.: castigo por rajaduras, acordado con el cliente" onChange={(e) => f.setNotas(e.target.value)} />
              </div>
            </section>
            {error && <p role="alert" className={ERROR}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}
          </>
        )}
      </div>
    </AdminModal>
  );
}

/** «Uno por uno (3)»: cuántas guardadas hay para elegir. */
function modosConCuenta(guardadas: number) {
  return MODOS.map((m) => (m.value === "pieza" && guardadas > 0 ? { ...m, badge: guardadas } : m));
}
