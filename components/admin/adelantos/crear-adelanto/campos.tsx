"use client";

/**
 * Los campos del alta de adelanto, cada uno resuelto para el mostrador.
 *
 * El criterio es siempre el mismo: lo que se repite todos los días tiene que
 * estar a UN toque (los montos redondos, «hoy», «efectivo»), y lo raro tiene
 * que seguir siendo posible (cualquier monto, cualquier fecha, no mover caja).
 */

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  Camera,
  Ban,
  Plus,
  ChevronDown,
  CreditCard,
  FileText,
  Ruler,
  Smartphone,
  X,
} from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { estadoDeCredito } from "@/lib/adelantos/limite-credito";
import { requiereAtencion } from "@/lib/adelantos/limite-credito";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { fmtMon, fmtMonedas, inputCls } from "../shared";
import type { BeneficiarioConSaldo } from "./tipos";

/**
 * De dónde sale la plata. Decide si se anota un egreso en la caja del día.
 *
 * «No mover la caja» existe porque no todo adelanto sale del cajón: una
 * transferencia desde el banco no toca el efectivo, y a veces se carga un
 * adelanto de ayer, cuando esa caja ya cerró. Anotarlo igual descuadraría el
 * arqueo de hoy — que es el problema que esto vino a resolver.
 */
export const ORIGENES_CAJA = [
  { id: "efectivo", label: "Efectivo", Icon: Banknote },
  { id: "yape", label: "Yape", Icon: Smartphone },
  { id: "plin", label: "Plin", Icon: Smartphone },
  { id: "tarjeta", label: "Tarjeta", Icon: CreditCard },
  { id: "transferencia", label: "Transferencia", Icon: ArrowRightLeft },
  { id: "", label: "No mover la caja", Icon: Ban },
] as const;

/** Los montos que se piden de verdad en una bodega, a un toque. */
const MONTOS_RAPIDOS = [50, 100, 200, 500, 1000];

/**
 * Un chip de opción.
 *
 * El estado se dice con RELLENO, no con un borde gris de 2 px: doce chips
 * delineados en la misma pantalla se leen como una reja. El no-elegido vive
 * sobre el fondo hundido y sin borde propio; el elegido se pinta con el color
 * de marca y un anillo fino, que es la única línea que hace falta.
 */
const chipCls = (activo: boolean) =>
  `inline-flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-base font-bold transition-colors ${
    activo
      ? "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40 dark:text-[var(--accent)]"
      : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]/60 hover:text-[var(--text-primary)]"
  }`;

// ── Monto ────────────────────────────────────────────────────────────────────
export function MontoRapido({ monto, onCambiar }: { monto: string; onCambiar: (v: string) => void }) {
  return (
    /* Los seis se reparten el ancho de la columna en UNA fila: con `px` fijo
       el último caía solo a un segundo renglón, que se lee como si fuera otra
       cosa. `flex-1` los estira parejo y quedan alineados con el campo. */
    <div className="flex gap-1">
      {MONTOS_RAPIDOS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onCambiar(String(m))}
          className={`h-9 flex-1 rounded-lg px-1 text-sm font-bold tabular-nums transition-colors ${
            Number(monto) === m
              ? "bg-primary/12 text-[var(--accent-ink)] ring-1 ring-primary/40 dark:text-[var(--accent)]"
              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          {m.toLocaleString("es-PE")}
        </button>
      ))}
      {/* Sumar en vez de reemplazar: «500 y 200 más» es como se arma un monto
          hablando, y obliga a menos tecleo que borrar y reescribir. */}
      <button
        type="button"
        onClick={() => onCambiar(String((Number(monto) || 0) + 100))}
        className="h-9 flex-1 rounded-lg border border-dashed border-[var(--rule-base)] px-1 text-sm font-bold text-[var(--text-tertiary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
      >
        +100
      </button>
    </div>
  );
}

// ── Fecha ────────────────────────────────────────────────────────────────────
const isoDia = (d: Date) => {
  const c = new Date(d);
  c.setMinutes(c.getMinutes() - c.getTimezoneOffset());
  return c.toISOString().slice(0, 10);
};
export const HOY = () => isoDia(new Date());
const AYER = () => isoDia(new Date(Date.now() - 86_400_000));

/**
 * Cuándo salió la plata.
 *
 * El backend ya aceptaba `fechaAdelanto` y la pantalla no lo exponía: todo
 * quedaba con fecha de hoy. Un adelanto de ayer cargado hoy corría el reloj de
 * la cobranza un día, y en el libro aparecía en el día equivocado.
 */
export function FechaAdelanto({ fecha, onCambiar }: { fecha: string; onCambiar: (v: string) => void }) {
  const hoy = HOY();
  const ayer = AYER();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => onCambiar(hoy)} className={chipCls(fecha === hoy)}>
          Hoy
        </button>
        <button type="button" onClick={() => onCambiar(ayer)} className={chipCls(fecha === ayer)}>
          Ayer
        </button>
      </div>
      {/* El calendario en su propia fila y a lo ancho: al lado de los chips el
          control nativo quedaba estrujado y la fecha se leía cortada. */}
      <input
        type="date"
        value={fecha}
        max={hoy}
        onChange={(e) => onCambiar(e.target.value)}
        aria-label="Fecha del adelanto"
        className={`${inputCls} h-11 tabular-nums`}
      />
    </div>
  );
}

// ── Origen de la plata ───────────────────────────────────────────────────────
export function OrigenCaja({ metodo, onCambiar }: { metodo: string; onCambiar: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ORIGENES_CAJA.map((o) => (
        <button key={o.id || "sin-caja"} type="button" onClick={() => onCambiar(o.id)} className={chipCls(metodo === o.id)}>
          <o.Icon className="h-4 w-4 shrink-0" aria-hidden />
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Notas rápidas ────────────────────────────────────────────────────────────
/**
 * Los motivos que se repiten, a un toque — y editables.
 *
 * Escribir el motivo a mano en cada adelanto termina en notas vacías o en tres
 * formas distintas de decir lo mismo, que después no se pueden buscar. Suma al
 * texto en vez de reemplazarlo: se pueden encadenar («Adelanto de sueldo ·
 * Emergencia familiar») sin perder lo ya escrito.
 */
export function NotasRapidas({
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
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {opciones.map((t) => (
          <span key={t} className="inline-flex items-center">
            <button
              type="button"
              onClick={() => onElegir(t)}
              className="rounded-full bg-[var(--surface-sunken)] px-3 py-1.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-primary/12 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
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
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-bold text-[var(--accent-ink)] underline-offset-2 hover:underline dark:text-[var(--accent)]"
        >
          {editando ? "Listo" : <><Plus className="h-3.5 w-3.5" aria-hidden /> Personalizar</>}
        </button>
      </div>

      {editando && (
        <div className="mt-2 flex gap-2">
          <input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregar();
              }
            }}
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

// ── Ficha e historial de la persona ──────────────────────────────────────────
/**
 * Cómo viene la persona elegida, en una línea de datos.
 *
 * Es lo que antes había que ir a buscar a la pestaña Personas —o recordar de
 * memoria— justo cuando se está por dar más plata.
 */
export function FichaPersona({
  persona,
  credito,
}: {
  persona: BeneficiarioConSaldo;
  credito: ReturnType<typeof estadoDeCredito>;
}) {
  return (
    <div className="rounded-2xl bg-[var(--surface-sunken)] px-4 py-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Resumen de cuenta</p>
      {/* En filas de etiqueta → valor, no en una tira horizontal: son cuatro
          cifras que se comparan de arriba abajo, y en una columna de un tercio
          la tira se partía en dos renglones sin alinear nada. */}
      <dl className="space-y-1.5">
        <Fila
          label="Debe hoy"
          valor={fmtMonedas(persona.saldoPendiente)}
          tono={Object.values(persona.saldoPendiente).some((v) => v > 0) ? "warning" : "ok"}
        />
        <Fila
          label="Adelantos abiertos"
          valor={String(persona.adelantosAbiertos)}
          tono={persona.adelantosAbiertos > 0 ? "warning" : "ok"}
        />
        <Fila
          label="Disponible"
          valor={credito.estado === "sin-limite" ? "sin tope" : formatCurrency(Math.max(0, credito.disponible))}
          tono={credito.estado === "sin-limite" ? "neutro" : requiereAtencion(credito) ? "alerta" : "ok"}
        />
        {persona.telefono && <Fila label="Teléfono" valor={persona.telefono} tono="neutro" />}
      </dl>
      {requiereAtencion(credito) && (
        <p className="mt-2 flex items-start gap-1.5 text-sm font-semibold text-[var(--data-warning)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {credito.aviso}
        </p>
      )}
    </div>
  );
}

function Fila({ label, valor, tono }: { label: string; valor: string; tono: "ok" | "warning" | "alerta" | "neutro" }) {
  const color =
    tono === "warning"
      ? "text-[var(--data-warning)]"
      : tono === "alerta"
        ? "text-[var(--data-error)]"
        : "text-[var(--text-primary)]";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-sm font-medium text-[var(--text-secondary)]">{label}</dt>
      <dd className={`text-base font-extrabold tabular-nums ${color}`}>{valor}</dd>
    </div>
  );
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });

/** Cómo se portó las veces anteriores: el dato que decide si conviene repetir. */
export function HistorialPersona({ historial }: { historial: DbAdelanto[] }) {
  const [abierto, setAbierto] = useState(false);
  if (historial.length === 0) return null;
  const liquidados = historial.filter((a) => a.status === "LIQUIDADO").length;

  return (
    <div className="overflow-hidden rounded-xl bg-[var(--surface-sunken)]">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <span>
          Historial · {historial.length} anterior{historial.length === 1 ? "" : "es"}
          {liquidados > 0 && (
            <span className="font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">
              {" "}• {liquidados} liquidado{liquidados === 1 ? "" : "s"}
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <ul className="max-h-48 divide-y divide-[var(--rule-soft)] overflow-y-auto border-t border-[var(--rule-soft)]">
          {historial.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-16 shrink-0 tabular-nums text-[var(--text-tertiary)]">{fechaCorta(a.fechaAdelanto)}</span>
              <span className="flex-1 truncate text-[var(--text-secondary)]">{MODALIDAD_CORTA[a.modalidad] ?? a.modalidad}</span>
              <span className="shrink-0 font-bold tabular-nums text-[var(--text-primary)]">{fmtMon(a.montoAdelantado, a.moneda)}</span>
              <span
                className={`w-24 shrink-0 text-right font-semibold tabular-nums ${
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
  );
}

const MODALIDAD_CORTA: Record<string, string> = {
  CUENTA_CORRIENTE: "Cuenta corriente",
  ENTREGAS_PACTADAS: "Entregas pactadas",
  DESCUENTO_PLANILLA: "Descuento por planilla",
};

// ── Comprobante ──────────────────────────────────────────────────────────────
/** Comprobante: se toma con la cámara o se elige un archivo ya guardado. */
export function Comprobante({
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
    try {
      const res = await fetch("/api/upload", { method: "POST", headers: csrfHeaders(), credentials: "include", body: fd });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.url) onChange(j.url);
      else setErr(j?.error ?? "No se pudo subir la imagen.");
    } catch (e2) {
      logger.error("[adelantos] fallo la subida del comprobante", { error: String(e2) });
      setErr("No se pudo subir la imagen.");
    } finally {
      setSubiendo(false);
    }
  };

  if (url) {
    return (
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail desde Supabase Storage */}
        <img src={url} alt="Comprobante del adelanto" className="h-12 w-12 rounded-lg border border-[var(--rule-base)] object-cover" />
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-primary hover:underline">
          Ver
        </a>
        <button type="button" onClick={() => onChange(null)} className="text-sm font-bold text-[var(--data-error)] hover:underline">
          Quitar
        </button>
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
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary/12 px-3.5 text-sm font-bold text-[var(--accent-ink)] ring-1 ring-primary/40 transition-colors hover:bg-primary/20 dark:text-[var(--accent)]"
        >
          <Camera className="h-4 w-4" /> Tomar foto
        </button>
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[var(--surface-sunken)] px-3.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
          <FileText className="h-4 w-4" /> {subiendo ? "Subiendo…" : "Adjuntar archivo"}
          <input type="file" accept="image/*" className="hidden" onChange={adjuntar} />
        </label>
      </div>
      {err && <p className="mt-1.5 text-sm font-semibold text-[var(--data-error)]">{err}</p>}
    </div>
  );
}

// ── Pies tablares (Pt) ───────────────────────────────────────────────────────
/**
 * Volumen de madera de referencia — Brandon 2026-08-28: "Pt comprado o
 * vendido, que es pies tablares". Colapsado por defecto: la mayoría de los
 * adelantos no tiene madera de por medio, y mostrar dos campos vacíos todo
 * el tiempo sería ruido. Al activarse pide los DOS juntos — el backend no
 * guarda uno sin el otro (no dice nada: ¿100 pt de qué lado?).
 */
export function PiesTablares({
  cantidad,
  tipo,
  onCambiarCantidad,
  onCambiarTipo,
}: {
  cantidad: string;
  tipo: "COMPRADO" | "VENDIDO" | "";
  onCambiarCantidad: (v: string) => void;
  onCambiarTipo: (v: "COMPRADO" | "VENDIDO" | "") => void;
}) {
  const [activo, setActivo] = useState(!!cantidad || !!tipo);

  if (!activo) {
    return (
      <button
        type="button"
        onClick={() => setActivo(true)}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--surface-sunken)] px-3.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-primary/10 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
      >
        <Ruler className="h-4 w-4" /> Agregar Pt (pies tablares)
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl bg-[var(--surface-sunken)] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-secondary)]">
          <Ruler className="h-4 w-4" /> Pies tablares (referencia — no afecta el saldo)
        </p>
        <button
          type="button"
          onClick={() => { setActivo(false); onCambiarCantidad(""); onCambiarTipo(""); }}
          aria-label="Quitar pies tablares"
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          step="0.01"
          value={cantidad}
          onChange={(e) => onCambiarCantidad(e.target.value)}
          placeholder="Cantidad"
          aria-label="Cantidad de pies tablares"
          className={`${inputCls} h-11 w-32 tabular-nums`}
        />
        <button type="button" onClick={() => onCambiarTipo("COMPRADO")} className={chipCls(tipo === "COMPRADO")}>
          Comprado
        </button>
        <button type="button" onClick={() => onCambiarTipo("VENDIDO")} className={chipCls(tipo === "VENDIDO")}>
          Vendido
        </button>
      </div>
    </div>
  );
}
