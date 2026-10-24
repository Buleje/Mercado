"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Keyboard, LogIn, LogOut, ShieldCheck } from "@buleje/design-system/icons";
import { PageTitle } from "@buleje/design-system";
import { STORE_TIMEZONE, cn } from "@/lib/utils";
import type { RespuestaKiosko, TipoMarcaKiosko } from "@/lib/rrhh/kiosko";

/** Piezas de la pantalla del kiosko (`KioskoAsistencia.tsx`). */

const FORMATO_RELOJ = new Intl.DateTimeFormat("es-PE", {
  timeZone: STORE_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** La hora de Lima, grande. Sólo después de montar: el servidor no sabe la hora de la tablet. */
export function RelojKiosko() {
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    setAhora(new Date());
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="text-6xl font-bold tabular-nums tracking-tight text-[var(--text-primary)]" aria-live="off">
      {ahora ? FORMATO_RELOJ.format(ahora) : " "}
    </p>
  );
}

const BOTON_TIPO =
  "flex min-h-40 flex-1 flex-col items-center justify-center gap-3 rounded-3xl border-2 text-3xl font-bold transition active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-muted)]";

export function BotonesTipo({ onElegir }: { onElegir: (t: TipoMarcaKiosko) => void }) {
  return (
    <div className="flex w-full max-w-3xl gap-6">
      <button
        type="button"
        onClick={() => onElegir("ENTRADA")}
        className={cn(BOTON_TIPO, "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)]")}
      >
        <LogIn className="h-14 w-14" aria-hidden />
        Entrada
      </button>
      <button
        type="button"
        onClick={() => onElegir("SALIDA")}
        className={cn(BOTON_TIPO, "border-[var(--data-info-500)] bg-[var(--data-info-50)] text-[var(--data-info-700)]")}
      >
        <LogOut className="h-14 w-14" aria-hidden />
        Salida
      </button>
    </div>
  );
}

/** Para cuando la cámara no lee el QR: el DNI con el teclado de la tablet. */
export function FormCodigo({ onEnviar, deshabilitado }: { onEnviar: (codigo: string) => void; deshabilitado: boolean }) {
  const [codigo, setCodigo] = useState("");
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const t = codigo.trim();
    if (t) onEnviar(t);
  };
  return (
    <form onSubmit={enviar} className="flex w-full max-w-xl items-center gap-3">
      <label htmlFor="kiosko-codigo" className="sr-only">
        Tu DNI
      </label>
      <Keyboard className="h-7 w-7 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      <input
        id="kiosko-codigo"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        inputMode="numeric"
        autoComplete="off"
        placeholder="O escribe tu DNI"
        maxLength={20}
        className="h-14 min-w-0 flex-1 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-2xl tabular-nums text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
      />
      <button
        type="submit"
        disabled={deshabilitado || !codigo.trim()}
        className="h-14 rounded-2xl bg-[var(--accent)] px-6 text-xl font-semibold text-[var(--text-inverse)] disabled:opacity-40"
      >
        Marcar
      </button>
    </form>
  );
}

/** El resultado, grande y de un vistazo. */
export function ResultadoKiosko({ r }: { r: RespuestaKiosko }) {
  if (r.ok) {
    const que = r.tipo === "ENTRADA" ? "Entrada" : "Salida";
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <CheckCircle2 className="h-28 w-28 text-[var(--data-success-500)]" aria-hidden />
        <p className="text-5xl font-bold text-[var(--text-primary)]">¡Listo, {r.nombre}!</p>
        <p className="text-3xl tabular-nums text-[var(--text-secondary)]">
          {que} {r.hora}
        </p>
        {r.repetida && <p className="text-xl text-[var(--text-tertiary)]">Ya estaba marcada hace un momento.</p>}
      </div>
    );
  }
  return (
    <div className="flex max-w-2xl flex-col items-center gap-4 text-center" role="alert">
      <AlertTriangle className="h-24 w-24 text-[var(--data-error-500)]" aria-hidden />
      {r.nombre && <p className="text-4xl font-bold text-[var(--text-primary)]">{r.nombre}</p>}
      <p className="text-3xl text-[var(--text-primary)]">{r.message}</p>
    </div>
  );
}

/** Pantalla entera de aviso: enlace que no sirve, kiosko apagado u otra tablet. */
export function AvisoKiosko({ mensaje }: { mensaje: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--surface-canvas)] px-8 text-center">
      <ShieldCheck className="h-20 w-20 text-[var(--text-tertiary)]" aria-hidden />
      <PageTitle className="text-4xl">Kiosko de asistencia</PageTitle>
      <p className="max-w-xl text-2xl text-[var(--text-secondary)]" role="alert">
        {mensaje}
      </p>
    </main>
  );
}
