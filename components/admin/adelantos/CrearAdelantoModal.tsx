"use client";

/**
 * Nuevo adelanto — el formulario donde sale la plata.
 *
 * Sale de `AdelantosModule` (1600+ líneas) porque acá se decide un desembolso y
 * la pantalla tiene que responder, sin salir, las tres preguntas que uno se hace
 * con el billete en la mano:
 *
 *   · ¿esta persona ya está cargada?      → se crea acá mismo
 *   · ¿cuánto me debe hoy?                → ficha bajo el selector
 *   · ¿cómo se portó las veces anteriores? → historial desplegable
 *
 * Antes había que salir a la pestaña Personas, crear, volver, y adivinar el
 * resto de memoria.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Camera, ChevronDown, FileText, Plus, UserPlus } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { estadoDeCredito, requiereAtencion } from "@/lib/adelantos/limite-credito";
import type { AdelantoModalidad, DbAdelanto, DbBeneficiario } from "@/lib/db/adelantos.db";
import CapturaFoto from "./CapturaFoto";
import { Field, ModalActions, ModalShell, fmtMon, inputCls } from "./shared";

const MONEDAS = ["PEN", "USD"] as const;

/**
 * De dónde sale la plata. Decide si se anota un egreso en la caja del día.
 *
 * «No mover la caja» existe porque no todo adelanto sale del cajón: una
 * transferencia desde el banco no toca el efectivo, y a veces se carga un
 * adelanto de ayer, cuando esa caja ya cerró. Anotarlo igual descuadraría el
 * arqueo de hoy — que es el problema que esto vino a resolver.
 */
const ORIGENES_CAJA = [
  { id: "efectivo", label: "Efectivo de caja" },
  { id: "yape", label: "Yape" },
  { id: "plin", label: "Plin" },
  { id: "transferencia", label: "Transferencia" },
  { id: "", label: "No mover la caja" },
] as const;

/**
 * Las tres modalidades. `DESCUENTO_PLANILLA` (ADR-329) es el adelanto de sueldo,
 * de los más comunes acá: hasta ahora había que forzarlo como cuenta corriente
 * y el motivo se perdía. La mecánica de liquidación es la misma; lo que cambia
 * es de dónde sale la entrega — del pago del mes, no de un producto.
 */
const MODALIDADES = [
  { id: "CUENTA_CORRIENTE", label: "Cuenta corriente", hint: "Se liquida con lo que vaya entregando" },
  { id: "ENTREGAS_PACTADAS", label: "Entregas pactadas", hint: "Plan fijo de entregas con fecha" },
  { id: "DESCUENTO_PLANILLA", label: "Descuento por planilla", hint: "Adelanto de sueldo: se descuenta del pago" },
] as const;

/**
 * Notas rápidas: los motivos que se repiten, a un toque.
 *
 * Escribir el motivo a mano en cada adelanto termina en notas vacías o en tres
 * formas distintas de decir lo mismo, que después no se pueden buscar. Se
 * guardan en el navegador porque son de quien atiende, no del negocio: cada
 * bodega usa las suyas y no vale la pena una tabla para esto.
 */
const NOTAS_KEY = "buleje:adelantos-notas-rapidas";
const NOTAS_POR_DEFECTO = [
  "Adelanto de sueldo",
  "Compra de insumos",
  "Emergencia familiar",
  "Adelanto por cosecha",
  "Pago de flete",
];

function leerNotasRapidas(): string[] {
  if (typeof window === "undefined") return NOTAS_POR_DEFECTO;
  try {
    const raw = window.localStorage.getItem(NOTAS_KEY);
    if (!raw) return NOTAS_POR_DEFECTO;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.every((x) => typeof x === "string") ? arr : NOTAS_POR_DEFECTO;
  } catch {
    return NOTAS_POR_DEFECTO;
  }
}

export type BeneficiarioConSaldo = DbBeneficiario & {
  totalAdelantado: number;
  saldoPendiente: number;
  adelantosAbiertos: number;
};

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });
const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });

export default function CrearAdelantoModal({
  beneficiarios,
  adelantos,
  initialBeneficiarioId,
  onClose,
  onCreated,
  onPersonaCreada,
}: {
  beneficiarios: BeneficiarioConSaldo[];
  /** Todos los adelantos del tenant: de acá sale el historial de la persona. */
  adelantos: DbAdelanto[];
  initialBeneficiarioId?: string;
  onClose: () => void;
  onCreated: () => void;
  /** Para que el módulo recargue la lista de personas cuando se crea una acá. */
  onPersonaCreada?: () => void;
}) {
  const [beneficiarioId, setBeneficiarioId] = useState(initialBeneficiarioId ?? beneficiarios[0]?.id ?? "");
  const [modalidad, setModalidad] = useState<AdelantoModalidad>("CUENTA_CORRIENTE");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<"PEN" | "USD">("PEN");
  const [notas, setNotas] = useState("");
  const [reciboManual, setReciboManual] = useState("");
  /** De dónde sale la plata; "" = no anotar movimiento de caja. */
  const [metodoCaja, setMetodoCaja] = useState<string>("efectivo");
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [notasRapidas, setNotasRapidas] = useState<string[]>(leerNotasRapidas);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** Alta de persona sin salir del formulario. */
  const [creandoPersona, setCreandoPersona] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [conCamara, setConCamara] = useState(false);

  const persona = beneficiarios.find((b) => b.id === beneficiarioId);
  const credito = estadoDeCredito(persona?.limiteCredito, persona?.saldoPendiente, Number(monto) || 0);

  /** Lo que esta persona ya sacó antes, de lo más reciente a lo más viejo. */
  const historial = useMemo(
    () =>
      adelantos
        .filter((a) => a.beneficiarioId === beneficiarioId)
        .sort((x, y) => new Date(y.fechaAdelanto).getTime() - new Date(x.fechaAdelanto).getTime()),
    [adelantos, beneficiarioId],
  );

  const submit = async () => {
    setErr(null);
    const m = Number(monto);
    if (!beneficiarioId || !m || m <= 0) {
      setErr("Elegí una persona y un monto válido.");
      return;
    }
    /**
     * Saltarse el tope es una decisión, no un descuido: se confirma acá y recién
     * entonces viaja `forzarLimite`. El backend sigue rechazando por defecto —si
     * este flag no va, el guard de siempre actúa— y deja anotado en el adelanto
     * que se autorizó por encima, para que dentro de un mes se pueda explicar.
     */
    const forzarLimite = credito.estado === "excede";
    if (forzarLimite && !window.confirm(`${credito.aviso}\n\n¿Registrar el adelanto igual? Va a quedar anotado que se autorizó por encima del tope.`)) return;
    setSaving(true);
    const res = await fetch("/api/adelantos", {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify({
        beneficiarioId,
        modalidad,
        montoAdelantado: m,
        moneda,
        notas: notas.trim() || undefined,
        reciboManual: reciboManual.trim() || undefined,
        metodoCaja: metodoCaja || undefined,
        comprobanteUrl: comprobante || undefined,
        forzarLimite: forzarLimite || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) onCreated();
    else {
      const j = await res.json().catch(() => null);
      setErr(j?.error ?? "No se pudo crear el adelanto.");
    }
  };

  return (
    <ModalShell title="Nuevo adelanto" onClose={onClose} wide>
      {/* ── A quién ─────────────────────────────────────────────────────── */}
      <Field label="Persona">
        <div className="flex gap-2">
          <select
            value={beneficiarioId}
            onChange={(e) => { setBeneficiarioId(e.target.value); setVerHistorial(false); }}
            className={`${inputCls} flex-1`}
          >
            {beneficiarios.length === 0 && <option value="">— todavía no hay personas —</option>}
            {beneficiarios.map((b) => (
              <option key={b.id} value={b.id}>{b.nombre}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setCreandoPersona((v) => !v)}
            title="Crear una persona nueva sin salir de acá"
            className={`inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl border-2 px-4 text-base font-bold transition-colors ${
              creandoPersona
                ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-primary hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
            }`}
          >
            <UserPlus className="h-5 w-5" /> Nueva
          </button>
        </div>
      </Field>

      {creandoPersona && (
        <NuevaPersonaInline
          onCancelar={() => setCreandoPersona(false)}
          onCreada={(id) => {
            setCreandoPersona(false);
            setBeneficiarioId(id);
            onPersonaCreada?.();
          }}
        />
      )}

      {/* ── Cómo viene esta persona ─────────────────────────────────────── */}
      {persona && <FichaPersona persona={persona} credito={credito} />}

      {persona && historial.length > 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)]">
          <button
            type="button"
            onClick={() => setVerHistorial((v) => !v)}
            aria-expanded={verHistorial}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <span>
              Historial · {historial.length} adelanto{historial.length === 1 ? "" : "s"} anterior
              {historial.length === 1 ? "" : "es"}
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${verHistorial ? "rotate-180" : ""}`} />
          </button>
          {verHistorial && (
            <ul className="max-h-56 divide-y divide-[var(--rule-soft)] overflow-y-auto border-t border-[var(--rule-soft)]">
              {historial.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-16 shrink-0 tabular-nums text-[var(--text-tertiary)]">{fecha(a.fechaAdelanto)}</span>
                  <span className="flex-1 truncate text-[var(--text-secondary)]">
                    {a.modalidad === "ENTREGAS_PACTADAS" ? "Entregas pactadas" : "Cuenta corriente"}
                  </span>
                  <span className="shrink-0 tabular-nums font-bold text-[var(--text-primary)]">
                    {fmtMon(a.montoAdelantado, a.moneda)}
                  </span>
                  <span
                    className={`w-24 shrink-0 text-right tabular-nums font-semibold ${
                      a.saldoPendiente > 0 ? "text-[var(--data-warning)]" : "text-[var(--data-success)]"
                    }`}
                  >
                    {a.saldoPendiente > 0 ? `debe ${fmtMon(a.saldoPendiente, a.moneda)}` : "liquidado"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── El adelanto ─────────────────────────────────────────────────── */}
      <Field label="Modalidad">
        <div className="grid gap-2 sm:grid-cols-3">
          {MODALIDADES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModalidad(m.id)}
              /* La pista debajo del nombre: «entregas pactadas» y «descuento por
                 planilla» no se distinguen por el título si es la primera vez. */
              className={`flex flex-col items-start gap-0.5 rounded-2xl border-2 px-3 py-2.5 text-left transition-colors ${
                modalidad === m.id
                  ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-primary/50"
              }`}
            >
              <span className="text-base font-bold">{m.label}</span>
              <span className="text-xs font-medium opacity-70">{m.hint}</span>
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field label="Monto adelantado">
            <input
              type="number"
              min={1}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="500.00"
              className={`${inputCls} tabular-nums`}
            />
          </Field>
        </div>
        <Field label="Moneda">
          <select value={moneda} onChange={(e) => setMoneda(e.target.value as "PEN" | "USD")} className={inputCls}>
            {MONEDAS.map((m) => (
              <option key={m} value={m}>{m === "PEN" ? "S/ Soles" : "$ Dólares"}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="De dónde sale la plata">
        <select value={metodoCaja} onChange={(e) => setMetodoCaja(e.target.value)} className={inputCls}>
          {ORIGENES_CAJA.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <p className="mt-1.5 text-sm text-[var(--text-tertiary)]">
          {metodoCaja
            ? "Se anota el egreso en la caja abierta, para que el arqueo cuadre."
            : "No se anota nada en la caja. Elegilo así si la plata no salió del cajón de hoy."}
        </p>
      </Field>

      {/* El N° del talonario, al lado del monto: es lo que se escribe en el
          papel en ese mismo momento. Buscar por él funciona igual que por el
          código de operación. */}
      <Field label="N° de recibo manual (opcional)">
        <input
          value={reciboManual}
          onChange={(e) => setReciboManual(e.target.value)}
          placeholder="Ej. 001-04578"
          aria-label="Número de recibo manual"
          className={`${inputCls} tabular-nums`}
        />
      </Field>

      <Field label="Notas (opcional)">
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={`${inputCls} py-3`} />
      </Field>
      <NotasRapidas
        opciones={notasRapidas}
        onElegir={(t) => setNotas((n) => (n.trim() ? `${n.trim()} · ${t}` : t))}
        onCambiarOpciones={(nuevas) => {
          setNotasRapidas(nuevas);
          try {
            window.localStorage.setItem(NOTAS_KEY, JSON.stringify(nuevas));
          } catch {
            // sin persistencia, sin bug: la sesión igual las usa
          }
        }}
      />

      <Field label="Comprobante (opcional)">
        <Comprobante
          url={comprobante}
          onChange={setComprobante}
          onAbrirCamara={() => setConCamara(true)}
        />
      </Field>

      {err && <p className="text-base font-semibold text-[var(--data-error)]">{err}</p>}
      <ModalActions onClose={onClose} onSubmit={submit} saving={saving} label="Crear adelanto" />

      {conCamara && <CapturaFoto onSubida={setComprobante} onCerrar={() => setConCamara(false)} />}
    </ModalShell>
  );
}

/**
 * Los motivos que se repiten, a un toque — y editables.
 *
 * Escribir el motivo a mano en cada adelanto termina en notas vacías o en tres
 * formas distintas de decir lo mismo, que después no se pueden buscar. Suma al
 * texto en vez de reemplazarlo: se pueden encadenar («Adelanto de sueldo ·
 * Emergencia familiar») sin perder lo ya escrito.
 */
function NotasRapidas({
  opciones,
  onElegir,
  onCambiarOpciones,
}: {
  opciones: string[];
  onElegir: (texto: string) => void;
  onCambiarOpciones: (nuevas: string[]) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nueva, setNueva] = useState("");

  const agregar = () => {
    const t = nueva.trim();
    if (!t || opciones.includes(t)) return;
    onCambiarOpciones([...opciones, t]);
    setNueva("");
  };

  return (
    <div className="-mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {opciones.map((t) => (
          <span key={t} className="inline-flex items-center">
            <button
              type="button"
              onClick={() => onElegir(t)}
              className="rounded-full border border-[var(--rule-base)] px-3 py-1 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
            >
              {t}
            </button>
            {editando && (
              <button
                type="button"
                onClick={() => onCambiarOpciones(opciones.filter((x) => x !== t))}
                aria-label={`Quitar la nota rápida ${t}`}
                className="-ml-1 rounded-full px-1.5 text-sm font-bold text-[var(--data-error)] hover:underline"
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          className="rounded-full px-2 py-1 text-sm font-bold text-[var(--text-tertiary)] underline-offset-2 hover:underline"
        >
          {editando ? "Listo" : "Personalizar"}
        </button>
      </div>

      {editando && (
        <div className="mt-2 flex gap-2">
          <input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }}
            placeholder="Agregar una nota rápida…"
            aria-label="Nueva nota rápida"
            className={`${inputCls} h-10`}
          />
          <button
            type="button"
            onClick={agregar}
            className="h-10 shrink-0 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary-dark"
          >
            Agregar
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Cómo viene la persona elegida, en una línea de datos.
 *
 * Es lo que antes había que ir a buscar a la pestaña Personas —o recordar de
 * memoria— justo cuando se está por dar más plata.
 */
function FichaPersona({
  persona,
  credito,
}: {
  persona: BeneficiarioConSaldo;
  credito: ReturnType<typeof estadoDeCredito>;
}) {
  return (
    <div className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <Dato
          label="Debe hoy"
          valor={formatCurrency(persona.saldoPendiente)}
          tono={persona.saldoPendiente > 0 ? "warning" : "ok"}
        />
        <Dato
          label="Adelantos abiertos"
          valor={String(persona.adelantosAbiertos)}
          tono={persona.adelantosAbiertos > 0 ? "warning" : "ok"}
        />
        <Dato
          label="Disponible"
          valor={credito.estado === "sin-limite" ? "sin tope" : formatCurrency(Math.max(0, credito.disponible))}
          tono={credito.estado === "sin-limite" ? "neutro" : requiereAtencion(credito) ? "alerta" : "ok"}
        />
        {persona.telefono && <Dato label="Teléfono" valor={persona.telefono} tono="neutro" />}
      </div>
      {requiereAtencion(credito) && (
        <p className="mt-2 flex items-start gap-1.5 text-sm font-semibold text-[var(--data-warning)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {credito.aviso}
        </p>
      )}
    </div>
  );
}

function Dato({ label, valor, tono }: { label: string; valor: string; tono: "ok" | "warning" | "alerta" | "neutro" }) {
  const color =
    tono === "warning"
      ? "text-[var(--data-warning)]"
      : tono === "alerta"
        ? "text-[var(--data-error)]"
        : tono === "ok"
          ? "text-[var(--text-primary)]"
          : "text-[var(--text-secondary)]";
  return (
    <span className="flex flex-col">
      <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
      <span className={`text-base font-extrabold tabular-nums ${color}`}>{valor}</span>
    </span>
  );
}

/**
 * Alta de persona sin salir del formulario.
 *
 * Sólo lo mínimo para poder adelantarle hoy: el resto (documento, notas, tope)
 * se completa después en su ficha. Pedir seis campos acá haría que la gente
 * cierre el modal y no cargue el adelanto.
 */
function NuevaPersonaInline({
  onCancelar,
  onCreada,
}: {
  onCancelar: () => void;
  onCreada: (id: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [limite, setLimite] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const crear = async () => {
    if (!nombre.trim()) {
      setErr("Poné al menos el nombre.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/adelantos/beneficiarios", {
        method: "POST",
        headers: jsonHeaders(),
        credentials: "include",
        body: JSON.stringify({
          nombre: nombre.trim(),
          telefono: telefono.trim() || undefined,
          limiteCredito: Number(limite) > 0 ? Number(limite) : undefined,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.id) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onCreada(j.id);
    } catch (e) {
      logger.error("[adelantos] no se pudo crear la persona", { error: String(e) });
      setErr(e instanceof Error ? e.message : "No se pudo crear la persona.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-4">
      <p className="text-sm font-bold text-[var(--text-secondary)]">
        Nueva persona — lo mínimo para adelantarle hoy. El resto se completa después en su ficha.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre y apellido"
          aria-label="Nombre de la persona"
          className={`${inputCls} sm:col-span-2`}
        />
        <input
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Teléfono"
          inputMode="tel"
          aria-label="Teléfono"
          className={inputCls}
        />
      </div>
      <input
        value={limite}
        onChange={(e) => setLimite(e.target.value)}
        placeholder="Tope de crédito (opcional)"
        type="number"
        min={0}
        aria-label="Tope de crédito"
        className={`${inputCls} tabular-nums`}
      />
      {err && <p className="text-sm font-semibold text-[var(--data-error)]">{err}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="h-11 flex-1 rounded-2xl border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void crear()}
          disabled={saving}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {saving ? "Creando…" : "Crear y elegir"}
        </button>
      </div>
    </div>
  );
}

/** Comprobante: se toma con la cámara o se elige un archivo ya guardado. */
function Comprobante({
  url,
  onChange,
  onAbrirCamara,
}: {
  url: string | null;
  onChange: (u: string | null) => void;
  onAbrirCamara: () => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const adjuntar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setSubiendo(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", "media");
    const res = await fetch("/api/upload", { method: "POST", headers: csrfHeaders(), credentials: "include", body: fd });
    setSubiendo(false);
    const j = await res.json().catch(() => null);
    if (res.ok && j?.url) onChange(j.url);
    else setErr(j?.error ?? "No se pudo subir la imagen.");
  };

  if (url) {
    return (
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail desde Supabase Storage */}
        <img src={url} alt="Comprobante del adelanto" className="h-12 w-12 rounded-lg border border-[var(--rule-base)] object-cover" />
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-primary hover:underline">Ver</a>
        <button type="button" onClick={() => onChange(null)} className="text-sm font-bold text-[var(--data-error)] hover:underline">Quitar</button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {/* La cámara primero: el adelanto se registra con el recibo en la mano,
            y mandar a buscar el archivo termina en «después la subo». */}
        <button
          type="button"
          onClick={onAbrirCamara}
          className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-primary px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 dark:text-[var(--accent)]"
        >
          <Camera className="h-4 w-4" /> Tomar foto
        </button>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary">
          <FileText className="h-4 w-4" /> {subiendo ? "Subiendo…" : "Adjuntar archivo"}
          <input type="file" accept="image/*" className="hidden" onChange={adjuntar} />
        </label>
      </div>
      {err && <p className="mt-1.5 text-sm font-semibold text-[var(--data-error)]">{err}</p>}
    </div>
  );
}
