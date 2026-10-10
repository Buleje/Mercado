"use client";

/**
 * El respaldo del alta de adelanto: notas rápidas, comprobante (foto o
 * archivo) y pies tablares de referencia. Salió de `campos.tsx` sin cambiar
 * comportamiento.
 */

import { useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import { Camera, Plus, FileText, Ruler, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { inputCls } from "../shared";
import { chipCls } from "./campos-monto";

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
              className="rounded-full bg-[var(--surface-sunken)] px-3 py-1.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-primary/12 hover:text-[var(--accent-ink)]"
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
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-bold text-[var(--accent-ink)] underline-offset-2 hover:underline"
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
            className="h-10 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            Agregar
          </button>
        </div>
      )}
    </div>
  );
}

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
      const j = await leerJson<{ url?: string; error?: string }>(res);
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
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary/12 px-3.5 text-sm font-semibold text-[var(--accent-ink)] ring-1 ring-primary/40 transition-colors hover:bg-primary/20"
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
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--surface-sunken)] px-3.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-primary/10 hover:text-[var(--accent-ink)]"
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
