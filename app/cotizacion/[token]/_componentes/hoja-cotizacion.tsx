/**
 * La hoja que ve el cliente en /cotizacion/[token]: membrete, ítems, totales,
 * vigencia y estado. Componente de servidor; lo único interactivo es la isla
 * «Aceptar cotización» (`aceptar-cotizacion.tsx`, tramo 2).
 * Recibe la lista blanca `CotizacionPublica`: nada interno llega hasta acá.
 */
import type { CotizacionPublica } from "@/lib/cotizaciones/enlace-publico";
import { textoDia } from "@/lib/cotizaciones/vigencia";
import { textoAceptacion } from "@/lib/cotizaciones/aceptacion";
import { AceptarCotizacion, AvisoAceptada } from "./aceptar-cotizacion";

const soles = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const cantidadFmt = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 });
const fechaFmt = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Lima" });

const ESTADO: Record<string, { texto: string; tono: "neutro" | "bien" | "mal" | "aviso" }> = {
  BORRADOR: { texto: "En preparación", tono: "neutro" },
  ENVIADA: { texto: "Enviada", tono: "neutro" },
  ACEPTADA: { texto: "Aceptada", tono: "bien" },
  CONVERTIDA: { texto: "Aceptada · pedido en curso", tono: "bien" },
  RECHAZADA: { texto: "Rechazada", tono: "mal" },
  VENCIDA: { texto: "Vencida", tono: "aviso" },
};

const TONO: Record<"neutro" | "bien" | "mal" | "aviso", string> = {
  neutro: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  bien: "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/10 dark:text-[var(--data-success-500)]",
  mal: "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]",
  aviso: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)]",
};

export function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] px-3 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </main>
  );
}

/** Misma página para token alterado, vencido, de otro negocio o cotización borrada: no revela cuál. */
export function EnlaceNoValido() {
  return (
    <Marco>
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 text-center shadow-[var(--shadow-sm)]">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Este enlace ya no es válido</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Puede que haya vencido o que no esté completo. Pide al negocio que te envíe uno nuevo.
        </p>
      </div>
    </Marco>
  );
}

function Fila({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: number; fuerte?: boolean }) {
  return (
    <div className={fuerte ? "flex items-baseline justify-between gap-3 pt-2 text-lg font-extrabold text-[var(--text-primary)]" : "flex items-baseline justify-between gap-3 text-sm text-[var(--text-secondary)]"}>
      <dt>{etiqueta}</dt>
      <dd className="tabular-nums">{soles.format(valor)}</dd>
    </div>
  );
}

export function HojaCotizacion({ c, token }: { c: CotizacionPublica; token: string }) {
  const estado = c.vencida ? ESTADO.VENCIDA! : (ESTADO[c.estado] ?? { texto: c.estado, tono: "neutro" as const });
  const abierta = c.estado === "BORRADOR" || c.estado === "ENVIADA" || c.estado === "VENCIDA";
  const tasa = Math.round(c.tasaIgv * 1000) / 10;

  return (
    <Marco>
      <article className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]">
        {/* Membrete */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--rule-base)] px-5 py-5 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            {c.negocio.logoUrl ? (
              // <img> nativo: página pública sin config de next/image para el storage (igual que /estado-cuenta).
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.negocio.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-[var(--rule-base)] object-contain" />
            ) : null}
            <div className="min-w-0">
              <p className="text-base font-bold text-[var(--text-primary)]">{c.negocio.nombre}</p>
              {c.negocio.ruc ? <p className="text-xs text-[var(--text-secondary)]">RUC {c.negocio.ruc}</p> : null}
              {c.negocio.direccion ? <p className="text-xs text-[var(--text-tertiary)]">{c.negocio.direccion}</p> : null}
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Cotización</p>
            <h1 className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{c.numero}</h1>
            <p className="text-xs text-[var(--text-secondary)]">{fechaFmt.format(new Date(c.fecha))}</p>
          </div>
        </header>

        {/* Cliente, estado y vigencia */}
        <section className="space-y-3 border-b border-[var(--rule-base)] px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-[var(--text-tertiary)]">Para</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{c.cliente.nombre}</p>
              {c.cliente.ruc ? <p className="text-xs text-[var(--text-secondary)]">RUC/DNI {c.cliente.ruc}</p> : null}
            </div>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${TONO[estado.tono]}`}>{estado.texto}</span>
          </div>
          {abierta ? (
            c.vencida ? (
              <p role="status" className={`rounded-xl border px-3 py-2 text-sm ${TONO.aviso}`}>
                Venció el {textoDia(c.validoHasta)}. Pide a {c.negocio.nombre} que te la renueve.
              </p>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                Vence el <span className="font-semibold text-[var(--text-primary)]">{textoDia(c.validoHasta)}</span>
              </p>
            )
          ) : null}
        </section>

        {/* Ítems: en lista para que entren en 400 px */}
        <ul className="divide-y divide-[var(--rule-base)]">
          {c.items.map((it, i) => (
            <li key={`${i}-${it.descripcion}`} className="flex items-start justify-between gap-3 px-5 py-3 sm:px-7">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">{it.descripcion}</p>
                <p className="text-xs tabular-nums text-[var(--text-tertiary)]">
                  {cantidadFmt.format(it.cantidad)} × {soles.format(it.precioUnit)}
                  {it.descuento > 0 ? ` · ${cantidadFmt.format(it.descuento)} % de descuento` : ""}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--text-primary)]">{soles.format(it.subtotal)}</p>
            </li>
          ))}
        </ul>

        {/* Totales tal como los guardó el servidor */}
        <dl className="space-y-1 border-t border-[var(--rule-base)] bg-[var(--surface-sunken)] px-5 py-4 sm:px-7">
          <Fila etiqueta="Subtotal" valor={c.subtotal} />
          <Fila etiqueta={`IGV (${String(tasa).replace(".", ",")} %)`} valor={c.igv} />
          <Fila etiqueta="Total" valor={c.total} fuerte />
        </dl>

        {/* Aceptar (tramo 2): quién la aceptó desde el enlace, o el botón si todavía se puede */}
        {c.aceptacion ? (
          <section className="border-t border-[var(--rule-base)] px-5 py-4 sm:px-7">
            <AvisoAceptada texto={textoAceptacion(c.aceptacion.el, c.aceptacion.nombre)} />
          </section>
        ) : c.aceptable ? (
          <AceptarCotizacion token={token} numero={c.numero} whatsapp={c.whatsapp} />
        ) : null}

        {c.notas || c.negocio.telefono || c.negocio.pie ? (
          <footer className="space-y-2 px-5 py-4 text-sm text-[var(--text-secondary)] sm:px-7">
            {c.notas ? <p className="whitespace-pre-line"><span className="font-semibold text-[var(--text-primary)]">Notas: </span>{c.notas}</p> : null}
            {c.negocio.telefono ? (
              <p>
                ¿Consultas? Escríbenos al{" "}
                <a href={`tel:${c.negocio.telefono.replace(/[^\d+]/g, "")}`} className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline">
                  {c.negocio.telefono}
                </a>
              </p>
            ) : null}
            {c.negocio.pie ? <p className="text-xs text-[var(--text-tertiary)]">{c.negocio.pie}</p> : null}
          </footer>
        ) : null}
      </article>
    </Marco>
  );
}
