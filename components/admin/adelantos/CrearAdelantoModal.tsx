"use client";

/**
 * Nuevo adelanto — el formulario donde sale la plata.
 *
 * Está en tres columnas y no en una sola tira porque las tres preguntas que uno
 * se hace con el billete en la mano son simultáneas, no secuenciales:
 *
 *   · ¿a quién?      → buscador + su saldo + cómo se portó antes (columna 1)
 *   · ¿cuánto y de dónde sale? → monto, fecha, caja, modalidad (columna 2)
 *   · ¿con qué queda respaldado? → recibo, notas, foto (columna 3)
 *
 * Antes era una columna de 672 px: había que scrollear para llegar al botón de
 * crear, y el selector de personas era un `<select>` nativo con la lista entera
 * del negocio. El pie es fijo y dice cómo queda la cuenta DESPUÉS de guardar,
 * que es la única cifra que no estaba en ninguna parte de la pantalla.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Circle, CreditCard, Info, Landmark, RotateCcw, Tag } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { estadoDeCredito, requiereAtencion } from "@/lib/adelantos/limite-credito";
import type { AdelantoModalidad, DbAdelanto } from "@/lib/db/adelantos.db";
import CapturaFoto from "./CapturaFoto";
import { Field, ModalShell, fmtMon, inputCls } from "./shared";
import SelectorPersona from "./crear-adelanto/SelectorPersona";
import PlanDeEntregas from "./crear-adelanto/PlanDeEntregas";
import Vencimiento from "./crear-adelanto/Vencimiento";
import { plazoHabitualDe, sugerirRepetir, yaTuvoAdelantoHoy } from "@/lib/adelantos/sugerencias";
import {
  Comprobante,
  FechaAdelanto,
  FichaPersona,
  HistorialPersona,
  HOY,
  MontoRapido,
  NotasRapidas,
  OrigenCaja,
} from "./crear-adelanto/campos";
import type { BeneficiarioConSaldo, CuotaBorrador } from "./crear-adelanto/tipos";

export type { BeneficiarioConSaldo } from "./crear-adelanto/tipos";

const MONEDAS = ["PEN", "USD"] as const;

/**
 * Las tres modalidades. `DESCUENTO_PLANILLA` (ADR-329) es el adelanto de sueldo,
 * de los más comunes acá: hasta ahora había que forzarlo como cuenta corriente
 * y el motivo se perdía. La mecánica de liquidación es la misma; lo que cambia
 * es de dónde sale la entrega — del pago del mes, no de un producto.
 */
const MODALIDADES = [
  { id: "CUENTA_CORRIENTE", label: "Cuenta corriente", hint: "Se liquida con lo que vaya entregando", Icon: CreditCard },
  { id: "ENTREGAS_PACTADAS", label: "Entregas pactadas", hint: "Plan fijo de entregas con fecha", Icon: CalendarDays },
  { id: "DESCUENTO_PLANILLA", label: "Descuento por planilla", hint: "Adelanto de sueldo: se descuenta del pago", Icon: Tag },
] as const;

/**
 * Notas rápidas: los motivos que se repiten, a un toque.
 *
 * Se guardan en el navegador porque son de quien atiende, no del negocio: cada
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

const jsonHeaders = () => csrfHeaders({ "Content-Type": "application/json" });

/**
 * Una fecha suelta («2026-08-03») se parsea como medianoche UTC: en Lima eso es
 * el día ANTERIOR a las 19:00. Al mediodía local el día es el correcto en toda
 * zona horaria del país.
 */
const aIsoLocal = (dia: string) => new Date(`${dia}T12:00:00`).toISOString();

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
  const [fecha, setFecha] = useState(HOY);
  /** (332) Cuándo se acordó devolverlo; "" = sin fecha acordada. */
  const [vencimiento, setVencimiento] = useState("");
  const [notas, setNotas] = useState("");
  const [reciboManual, setReciboManual] = useState("");
  /** De dónde sale la plata; "" = no anotar movimiento de caja. */
  const [metodoCaja, setMetodoCaja] = useState<string>("efectivo");
  const [comprobante, setComprobante] = useState<string | null>(null);
  const [cuotas, setCuotas] = useState<CuotaBorrador[]>([]);
  const [notasRapidas, setNotasRapidas] = useState<string[]>(leerNotasRapidas);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Segunda pulsación cuando el monto pasa el tope de la persona. */
  const [confirmandoTope, setConfirmandoTope] = useState(false);
  const [conCamara, setConCamara] = useState(false);

  const persona = beneficiarios.find((b) => b.id === beneficiarioId);
  const montoNum = Number(monto) || 0;
  const credito = estadoDeCredito(persona?.limiteCredito, persona?.saldoPendiente, montoNum);
  const excedeTope = credito.estado === "excede";

  /** Cambiar de persona o de monto invalida la autorización ya confirmada. */
  useEffect(() => setConfirmandoTope(false), [beneficiarioId, monto]);

  /** Lo que la pantalla ya podía saber sin que nadie lo escriba. */
  const repetible = useMemo(() => sugerirRepetir(adelantos, beneficiarioId), [adelantos, beneficiarioId]);
  const adelantoDeHoy = useMemo(() => yaTuvoAdelantoHoy(adelantos, beneficiarioId), [adelantos, beneficiarioId]);
  const plazoHabitual = useMemo(() => plazoHabitualDe(adelantos, beneficiarioId), [adelantos, beneficiarioId]);

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
    if (!beneficiarioId || montoNum <= 0) {
      setErr("Elegí una persona y un monto válido.");
      return;
    }
    /**
     * Saltarse el tope es una decisión, no un descuido: se confirma con una
     * segunda pulsación y recién entonces viaja `forzarLimite`. El backend sigue
     * rechazando por defecto —si este flag no va, el guard de siempre actúa— y
     * deja anotado en el adelanto que se autorizó por encima, para que dentro de
     * un mes se pueda explicar.
     */
    if (excedeTope && !confirmandoTope) {
      setConfirmandoTope(true);
      return;
    }

    /** Sólo las cuotas usables: el Zod del endpoint rechaza descripción vacía. */
    const plan =
      modalidad === "ENTREGAS_PACTADAS"
        ? cuotas
            .filter((c) => c.descripcion.trim() && Number(c.valor) > 0)
            .map((c) => ({
              descripcionEsperada: c.descripcion.trim(),
              valorEsperado: Number(c.valor),
              fechaEsperada: c.fecha ? aIsoLocal(c.fecha) : undefined,
            }))
        : [];

    setSaving(true);
    try {
      const res = await fetch("/api/adelantos", {
        method: "POST",
        headers: jsonHeaders(),
        credentials: "include",
        body: JSON.stringify({
          beneficiarioId,
          modalidad,
          montoAdelantado: montoNum,
          moneda,
          /* Si es hoy va sin fecha: el backend estampa la hora exacta, que es lo
             que ordena bien la actividad del día. */
          fechaAdelanto: fecha && fecha !== HOY() ? aIsoLocal(fecha) : undefined,
          fechaVencimiento: vencimiento ? aIsoLocal(vencimiento) : null,
          notas: notas.trim() || undefined,
          reciboManual: reciboManual.trim() || undefined,
          metodoCaja: metodoCaja || undefined,
          comprobanteUrl: comprobante || undefined,
          forzarLimite: excedeTope || undefined,
          entregasPactadas: plan.length ? plan : undefined,
        }),
      });
      if (res.ok) {
        onCreated();
        return;
      }
      const j = await res.json().catch(() => null);
      setErr(j?.error ?? "No se pudo crear el adelanto.");
    } catch (e) {
      logger.error("[adelantos] no se pudo crear el adelanto", { error: String(e) });
      setErr("No se pudo crear el adelanto. Revisá la conexión.");
    } finally {
      setSaving(false);
    }
  };

  /** Ctrl/⌘+Enter guarda: el formulario es largo y el botón está al pie. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const puedeGuardar = !!beneficiarioId && montoNum > 0 && !saving;

  return (
    <ModalShell
      title="Nuevo adelanto"
      subtitle="Plata que sale hoy y se liquida con lo que la persona vaya entregando."
      onClose={onClose}
      size="xl"
      footer={
        <PieDelFormulario
          persona={persona}
          monto={montoNum}
          moneda={moneda}
          excedeTope={excedeTope}
          confirmando={confirmandoTope}
          aviso={requiereAtencion(credito) ? credito.aviso : ""}
          err={err}
          saving={saving}
          puedeGuardar={puedeGuardar}
          onClose={onClose}
          onSubmit={() => void submit()}
        />
      }
    >
      {/* La modalidad va arriba y a lo ancho porque es la decisión que gobierna
          al resto: elegir «entregas pactadas» hace aparecer el plan al pie. En
          una columna quedaba como un campo más entre otros. */}
      <fieldset>
        <legend className="mb-2">
          <Encabezado n={1} titulo="¿Cómo se liquida?" />
        </legend>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {MODALIDADES.map((m) => {
            const activa = modalidad === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModalidad(m.id)}
                aria-pressed={activa}
                /* Icono a la izquierda y marca de selección a la derecha: la
                   fila entera se lee de un vistazo, y la pista debajo del
                   nombre distingue «pactadas» de «planilla» la primera vez. */
                className={`flex items-start gap-3 rounded-xl px-4 py-2.5 text-left transition-colors ${
                  activa
                    ? "bg-primary/10 text-[var(--accent-ink)] ring-2 ring-primary dark:text-[var(--accent)]"
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]/60 hover:text-[var(--text-primary)]"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    activa ? "bg-primary/20" : "bg-[var(--surface-raised)]"
                  }`}
                >
                  <m.Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold">{m.label}</span>
                  <span className="block text-sm font-medium opacity-70">{m.hint}</span>
                </span>
                {activa ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]/35" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-5 lg:grid-cols-3 lg:gap-7">
        {/* ── 1 · A quién ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <Encabezado n={2} titulo="¿A quién?" />
          <SelectorPersona
            beneficiarios={beneficiarios}
            beneficiarioId={beneficiarioId}
            onElegir={setBeneficiarioId}
            onPersonaCreada={onPersonaCreada}
          />
          {persona && <FichaPersona persona={persona} credito={credito} />}

          {/* Ya se le dio plata hoy: el caso real no es el fraude, son dos
              personas atendiendo el mismo mostrador o el botón apretado dos
              veces. El duplicado se descubre al cuadrar la caja. */}
          {adelantoDeHoy && (
            <p className="flex items-start gap-2 rounded-xl bg-[var(--data-warning)]/10 px-3 py-2 text-sm font-semibold text-[var(--data-warning)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Hoy ya se le dio {fmtMon(adelantoDeHoy.montoAdelantado, adelantoDeHoy.moneda)}
                {adelantoDeHoy.codigoOperacion ? ` (${adelantoDeHoy.codigoOperacion})` : ""}. ¿Es uno nuevo?
              </span>
            </p>
          )}

          {/* A un mismo proveedor se le adelanta casi siempre lo mismo y por lo
              mismo: volver a tipearlo cada quincena es trabajo evitable. */}
          {repetible && !monto && !adelantoDeHoy && (
            <button
              type="button"
              onClick={() => {
                setMonto(String(repetible.monto));
                setModalidad(repetible.modalidad as AdelantoModalidad);
                if (repetible.notas) setNotas(repetible.notas);
              }}
              className="flex w-full items-center gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-left text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-primary/10 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
            >
              <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1">
                Repetir el último: <strong className="tabular-nums">{fmtMon(repetible.monto, repetible.moneda)}</strong>
                <span className="text-[var(--text-tertiary)]">
                  {" "}· {repetible.hace === 0 ? "hoy" : repetible.hace === 1 ? "ayer" : `hace ${repetible.hace} días`}
                </span>
              </span>
            </button>
          )}

          {persona && <HistorialPersona historial={historial} />}
        </section>

        {/* ── 2 · Cuánto y de dónde ───────────────────────────────────── */}
        <section className="space-y-3">
          <Encabezado n={3} titulo="¿Cuánto sale?" />
          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-3">
              <Field label="Monto adelantado">
                <div className="relative">
                  {/* El símbolo adentro del campo: sin él, «500» se lee como
                      cantidad de algo y no como plata. */}
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-[var(--text-tertiary)]">
                    {moneda === "USD" ? "$" : "S/"}
                  </span>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder="500.00"
                    autoFocus={!!initialBeneficiarioId}
                    className={`${inputCls} pl-11 text-lg tabular-nums`}
                  />
                </div>
              </Field>
            </div>
            <div className="col-span-2">
            <Field label="Moneda">
              <select value={moneda} onChange={(e) => setMoneda(e.target.value as "PEN" | "USD")} className={inputCls}>
                {MONEDAS.map((m) => (
                  <option key={m} value={m}>
                    {m === "PEN" ? "Soles" : "Dólares"}
                  </option>
                ))}
              </select>
            </Field>
            </div>
          </div>
          <MontoRapido monto={monto} onCambiar={setMonto} />

          <Field label="Fecha del adelanto" grupo>
            <FechaAdelanto fecha={fecha} onCambiar={setFecha} />
          </Field>

          <Field
            grupo
            label="¿De dónde sale la plata?"
            hint={
              metodoCaja
                ? "Se anota el egreso en la caja abierta, para que el arqueo cuadre."
                : "No se anota nada en la caja. Elegilo así si la plata no salió del cajón de hoy."
            }
          >
            <OrigenCaja metodo={metodoCaja} onCambiar={setMetodoCaja} />
          </Field>

          {/* La cuenta, acá, cuando se va a transferir: estaba en la ficha de la
              persona y había que salir del modal a buscarla. */}
          {metodoCaja === "transferencia" && persona && (
            <div className="rounded-xl bg-[var(--surface-sunken)] px-3.5 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                <Landmark className="h-3.5 w-3.5" aria-hidden /> Dónde cobra
              </p>
              {persona.cuentaBancaria || persona.cci ? (
                <p className="mt-1 text-base font-semibold tabular-nums text-[var(--text-primary)]">
                  {persona.banco && <span className="font-bold">{persona.banco} </span>}
                  {persona.cuentaBancaria}
                  {persona.cci && <span className="block text-sm text-[var(--text-secondary)]">CCI {persona.cci}</span>}
                </p>
              ) : (
                <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                  No tiene cuenta cargada. Se puede agregar después en su ficha.
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── 3 · Con qué queda respaldado ────────────────────────────── */}
        <section className="space-y-3">
          <Encabezado n={4} titulo="Acuerdo y respaldo" />

          <Field
            grupo
            label="¿Cuándo lo devuelve? (opcional)"
            hint={
              vencimiento
                ? "La cobranza va a medir el atraso contra esta fecha."
                : "Sin fecha, la cobranza sólo puede mirar la antigüedad."
            }
          >
            <Vencimiento
              fechaAdelanto={fecha}
              vencimiento={vencimiento}
              onCambiar={setVencimiento}
              plazoHabitual={plazoHabitual}
            />
          </Field>
          {/* El N° del talonario: es lo que se escribe en el papel en ese mismo
              momento. Buscar por él funciona igual que por el código. */}
          <Field label="N° de recibo manual (opcional)">
            <input
              value={reciboManual}
              onChange={(e) => setReciboManual(e.target.value)}
              placeholder="Ej. 001-04578"
              aria-label="Número de recibo manual"
              className={`${inputCls} tabular-nums`}
            />
          </Field>

          <Field label="Motivo / notas (opcional)">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Para qué es la plata…"
              className={`${inputCls} h-auto py-3`}
            />
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

          <Field label="Comprobante (opcional)" grupo>
            <Comprobante url={comprobante} onChange={setComprobante} onAbrirCamara={() => setConCamara(true)} />
          </Field>
        </section>
      </div>

      {/* El plan va a lo ancho: son filas de tres campos y en una columna de un
          tercio no entran sin romperse. */}
      {modalidad === "ENTREGAS_PACTADAS" && (
        <PlanDeEntregas cuotas={cuotas} onCambiar={setCuotas} montoAdelantado={montoNum} moneda={moneda} />
      )}

      {conCamara && <CapturaFoto onSubida={setComprobante} onCerrar={() => setConCamara(false)} />}
    </ModalShell>
  );
}

/**
 * El rótulo de una sección.
 *
 * Sin línea debajo: el modal ya tenía cuatro reglas horizontales y dos
 * verticales, y una pantalla con seis líneas se lee como un formulario de
 * papel. El número en su pastilla y el aire alcanzan para agrupar.
 */
function Encabezado({ n, titulo }: { n: number; titulo: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/12 text-sm font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]">
        {n}
      </span>
      <span className="text-sm font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">{titulo}</span>
    </div>
  );
}

/**
 * El pie fijo: cómo queda la cuenta después de guardar, y las acciones.
 *
 * La proyección («va a quedar debiendo X») no estaba en ninguna parte: había que
 * sumar de cabeza el saldo viejo y el monto nuevo justo cuando se decide.
 */
function PieDelFormulario({
  persona,
  monto,
  moneda,
  excedeTope,
  confirmando,
  aviso,
  err,
  saving,
  puedeGuardar,
  onClose,
  onSubmit,
}: {
  persona?: BeneficiarioConSaldo;
  monto: number;
  moneda: string;
  excedeTope: boolean;
  confirmando: boolean;
  aviso: string;
  err: string | null;
  saving: boolean;
  puedeGuardar: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const quedaDebiendo = (persona?.saldoPendiente ?? 0) + monto;

  return (
    <div className="space-y-2.5">
      {/* El aviso del tope ya está en la ficha de la persona; acá va la versión
          corta, porque en un teléfono el pie completo se come media pantalla. */}
      {excedeTope && (
        <p
          className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
            confirmando
              ? "bg-[var(--data-error)]/10 text-[var(--data-error)]"
              : "bg-[var(--data-warning)]/10 text-[var(--data-warning)]"
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <span className="hidden sm:inline">{aviso}</span>
            <span className="sm:hidden">Pasa su tope de crédito.</span>
            {confirmando && " Queda anotado que se autorizó por encima."}
          </span>
        </p>
      )}
      {err && <p className="text-base font-semibold text-[var(--data-error)]">{err}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-base text-[var(--text-secondary)]">
          <Info className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          {persona && monto > 0 ? (
            <span className="min-w-0">
              <strong className="text-[var(--text-primary)]">{persona.nombre}</strong>
              <span className="hidden sm:inline"> va a quedar debiendo </span>
              <span className="sm:hidden"> queda en </span>
              <strong className="tabular-nums text-[var(--data-warning)]">{fmtMon(quedaDebiendo, moneda)}</strong>
              {persona.saldoPendiente > 0 && (
                <span className="hidden text-[var(--text-tertiary)] sm:inline">
                  {" "}
                  ({formatCurrency(persona.saldoPendiente)} de antes)
                </span>
              )}
            </span>
          ) : (
            <span className="text-[var(--text-tertiary)]">
              <span className="hidden sm:inline">Elegí la persona y el monto para ver cómo queda la cuenta.</span>
              <span className="sm:hidden">Elegí persona y monto.</span>
            </span>
          )}
        </p>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-xl px-5 text-base font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!puedeGuardar}
            title="Ctrl + Enter"
            className={`h-12 rounded-xl px-6 text-base font-bold text-white shadow-[var(--shadow-sm)] transition-colors disabled:opacity-50 disabled:shadow-none ${
              confirmando ? "bg-[var(--data-error)] hover:opacity-90" : "bg-primary hover:bg-primary-dark"
            }`}
          >
            {saving ? "Guardando…" : confirmando ? "Autorizar igual y crear" : "Crear adelanto"}
          </button>
        </div>
      </div>
    </div>
  );
}
