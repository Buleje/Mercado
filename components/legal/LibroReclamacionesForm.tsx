"use client";

import { useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  BookText,
  CheckCircle2,
  Loader2,
  User,
  Package,
  MessageSquareWarning,
  ShieldAlert,
} from "lucide-react";

/**
 * Hoja de Reclamación del Libro de Reclamaciones Virtual.
 * Ley N° 29571 + D.S. 011-2011-PCM. Postea a /api/libro-reclamaciones.
 *
 * Tipografía blindada (skill bsm-typography-rules): inputs h-12 border-2
 * rounded-2xl text-base, labels text-sm font-bold, sin texto diminuto.
 */

const inputCls =
  "w-full h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] focus:outline-none transition-colors";
const areaCls =
  "w-full min-h-[120px] p-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] focus:outline-none transition-colors";
const labelCls = "block mb-1.5 text-sm font-bold text-[var(--text-secondary)]";

function Section({
  icon: Icon,
  step,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2.5 text-lg font-extrabold text-[var(--text-primary)]">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Icon className="h-5 w-5" strokeWidth={2.5} />
        </span>
        <span className="text-sm font-bold text-[var(--text-tertiary)]">{step}.</span>
        {title}
      </h2>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

export default function LibroReclamacionesForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ codigo: string; plazoDias: number } | null>(null);

  const [tipoReclamo, setTipoReclamo] = useState<"reclamo" | "queja">("reclamo");
  const [tipoBien, setTipoBien] = useState<"producto" | "servicio">("producto");
  const [esMenor, setEsMenor] = useState(false);
  const [aceptaVeracidad, setAcepta] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!aceptaVeracidad) {
      setError("Debes declarar que la información es veraz.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const payload = {
      nombre: fd.get("nombre"),
      tipoDocumento: fd.get("tipoDocumento"),
      numeroDocumento: fd.get("numeroDocumento"),
      domicilio: fd.get("domicilio"),
      telefono: fd.get("telefono"),
      email: fd.get("email"),
      esMenor,
      apoderado: fd.get("apoderado") || "",
      tipoBien,
      montoReclamado: Number(fd.get("montoReclamado") || 0),
      descripcionBien: fd.get("descripcionBien"),
      numeroPedido: fd.get("numeroPedido") || "",
      tienda: fd.get("tienda") || "",
      tipoReclamo,
      detalle: fd.get("detalle"),
      pedidoConsumidor: fd.get("pedidoConsumidor"),
      aceptaVeracidad: true,
    };
    setSubmitting(true);
    try {
      const res = await fetch("/api/libro-reclamaciones", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "No pudimos registrar tu reclamo. Intenta de nuevo.");
        return;
      }
      setDone({ codigo: data.codigo, plazoDias: data.plazoDias });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Error de conexión. Verifica tu internet e intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-3xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)] p-8 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-[var(--accent)]" strokeWidth={2} />
        <h2 className="mt-4 text-2xl font-extrabold text-[var(--text-primary)]">
          Reclamo registrado
        </h2>
        <p className="mt-2 text-base text-[var(--text-secondary)]">
          Tu código de seguimiento es:
        </p>
        <p className="mt-2 text-3xl font-black tracking-wide text-[var(--accent)]">
          {done.codigo}
        </p>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-[var(--text-secondary)]">
          Te enviamos una copia a tu correo. Responderemos en un plazo máximo de{" "}
          <strong className="text-[var(--text-primary)]">{done.plazoDias} días hábiles</strong>.
        </p>
        <a
          href="/tiendas"
          className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-[var(--accent)] px-6 text-base font-bold text-white transition-transform hover:-translate-y-0.5"
        >
          Volver a las tiendas
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      {/* Tipo de solicitud */}
      <section className="rounded-3xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6">
        <h2 className="mb-3 flex items-center gap-2.5 text-lg font-extrabold text-[var(--text-primary)]">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <MessageSquareWarning className="h-5 w-5" strokeWidth={2.5} />
          </span>
          ¿Qué deseas registrar?
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { v: "reclamo", t: "Reclamo", d: "Disconformidad con el producto o servicio recibido." },
              { v: "queja", t: "Queja", d: "Malestar con la atención (no con el producto/servicio)." },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setTipoReclamo(o.v)}
              className={`rounded-2xl border-2 p-4 text-left transition-all ${
                tipoReclamo === o.v
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--rule-base)] hover:border-[var(--accent)]/40"
              }`}
            >
              <span className="block text-base font-extrabold text-[var(--text-primary)]">{o.t}</span>
              <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">{o.d}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 1. Consumidor */}
      <Section icon={User} step={1} title="Tus datos">
        <div>
          <label className={labelCls} htmlFor="nombre">Nombre completo *</label>
          <input id="nombre" name="nombre" required className={inputCls} placeholder="Nombres y apellidos" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="tipoDocumento">Tipo de documento *</label>
            <select id="tipoDocumento" name="tipoDocumento" required className={inputCls} defaultValue="DNI">
              <option value="DNI">DNI</option>
              <option value="CE">Carné de extranjería</option>
              <option value="Pasaporte">Pasaporte</option>
              <option value="RUC">RUC</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="numeroDocumento">Número de documento *</label>
            <input id="numeroDocumento" name="numeroDocumento" required className={inputCls} inputMode="numeric" placeholder="Ej. 70123456" />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="domicilio">Domicilio *</label>
          <input id="domicilio" name="domicilio" required className={inputCls} placeholder="Dirección, distrito, provincia" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="telefono">Teléfono *</label>
            <input id="telefono" name="telefono" required className={inputCls} inputMode="tel" placeholder="Ej. 929 340 532" />
          </div>
          <div>
            <label className={labelCls} htmlFor="email">Correo electrónico *</label>
            <input id="email" name="email" type="email" required className={inputCls} placeholder="tucorreo@ejemplo.com" />
          </div>
        </div>
        <label className="flex items-center gap-3 text-base text-[var(--text-secondary)]">
          <input type="checkbox" checked={esMenor} onChange={(e) => setEsMenor(e.target.checked)} className="h-5 w-5 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)]" />
          Soy menor de edad (se requiere apoderado)
        </label>
        {esMenor && (
          <div>
            <label className={labelCls} htmlFor="apoderado">Nombre del padre, madre o apoderado *</label>
            <input id="apoderado" name="apoderado" className={inputCls} placeholder="Nombre completo del apoderado" />
          </div>
        )}
      </Section>

      {/* 2. Bien contratado */}
      <Section icon={Package} step={2} title="Producto o servicio">
        <div className="grid gap-3 sm:grid-cols-2">
          {(["producto", "servicio"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setTipoBien(o)}
              className={`h-12 rounded-2xl border-2 text-base font-bold capitalize transition-all ${
                tipoBien === o
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="montoReclamado">Monto reclamado (S/)</label>
            <input id="montoReclamado" name="montoReclamado" type="number" min={0} step="0.01" className={inputCls} placeholder="0.00" />
          </div>
          <div>
            <label className={labelCls} htmlFor="numeroPedido">N° de pedido (opcional)</label>
            <input id="numeroPedido" name="numeroPedido" className={inputCls} placeholder="Ej. #10245" />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="tienda">Tienda / vendedor (opcional)</label>
          <input id="tienda" name="tienda" className={inputCls} placeholder="Nombre de la tienda donde compraste" />
        </div>
        <div>
          <label className={labelCls} htmlFor="descripcionBien">Descripción del bien contratado *</label>
          <input id="descripcionBien" name="descripcionBien" required className={inputCls} placeholder="¿Qué compraste o contrataste?" />
        </div>
      </Section>

      {/* 3. Detalle */}
      <Section icon={MessageSquareWarning} step={3} title="Detalle de tu reclamo">
        <div>
          <label className={labelCls} htmlFor="detalle">Detalle del reclamo o queja *</label>
          <textarea id="detalle" name="detalle" required className={areaCls} placeholder="Explica claramente qué ocurrió." />
        </div>
        <div>
          <label className={labelCls} htmlFor="pedidoConsumidor">¿Qué solicitas como solución? *</label>
          <textarea id="pedidoConsumidor" name="pedidoConsumidor" required className={areaCls} placeholder="Indica tu pedido concreto (devolución, cambio, etc.)." />
        </div>
      </Section>

      {/* Declaración + envío */}
      <div className="rounded-3xl border-2 border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5 sm:p-6">
        <label className="flex items-start gap-3 text-base text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={aceptaVeracidad}
            onChange={(e) => setAcepta(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 rounded border-2 border-[var(--rule-base)] accent-[var(--accent)]"
          />
          <span>
            Declaro que la información proporcionada es veraz. Entiendo que el reclamo será
            atendido en un plazo máximo de <strong className="text-[var(--text-primary)]">15 días hábiles</strong> y que esto
            no me impide acudir al <strong className="text-[var(--text-primary)]">INDECOPI</strong> u otras vías de solución.
          </span>
        </label>

        {error && (
          <p className="mt-4 flex items-center gap-2 rounded-xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 px-4 py-3 text-base font-medium text-[var(--data-error-600)]">
            <ShieldAlert className="h-5 w-5 shrink-0" strokeWidth={2.5} />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-6 text-base font-bold text-white shadow-[0_4px_14px_rgba(0,180,166,0.35)] transition-transform hover:-translate-y-0.5 disabled:opacity-60 sm:w-auto"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Registrando…
            </>
          ) : (
            <>
              <BookText className="h-5 w-5" strokeWidth={2.5} /> Registrar mi reclamo
            </>
          )}
        </button>
      </div>
    </form>
  );
}
