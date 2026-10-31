/**
 * Pieza `madera-disponible` — el bloque de la portada (componente de servidor:
 * al navegador llega HTML, no los datos).
 *
 * Unidad del negocio primero (pt → m³ → piezas) y la hora de la foto del
 * patio: es una foto con hasta un minuto de atraso, no un contador vivo. Sin
 * madera libre, un aviso corto con el WhatsApp para encargar; sin madera y sin
 * WhatsApp, nada (un bloque que sólo dice «no hay» no le sirve al que compra).
 */
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { MessageCircle, Trees } from "@buleje/design-system/icons";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { formatDateNumeric, formatNumber, formatTime, formatWeekday } from "@/lib/format";
import { waLink } from "@/lib/whatsapp-link";
import type { VistaPortadaProps } from "../_contrato";
import type { ContactoPublico } from "./datos";
import type { OpcionesMaderaDisponible } from "./manifest";
import type { EspeciePublica, MaderaPublica } from "./proyeccion";

export interface DatosMadera {
  madera: MaderaPublica;
  contacto: ContactoPublico;
}

/** «jueves 01/10 a las 18:42» (hora de Lima). */
function cuando(iso: string): string {
  return `${formatWeekday(iso, { largo: true })} ${formatDateNumeric(iso).slice(0, 5)} a las ${formatTime(iso)}`;
}

const piezasTexto = (n: number | null, mostrar: boolean) =>
  mostrar && n != null ? ` · ${formatNumber(n)} ${n === 1 ? "pieza" : "piezas"}` : "";

/**
 * Tinta sobre papel, no blanco sobre el acento: en `/t/<negocio>` el acento es
 * el color de marca del dueño, y en `main` (#4DCBCB) el blanco encima daba
 * 1,96:1 (medido 01-10). Texto y fondo de la propia página siempre contrastan.
 */
const CTA_PRINCIPAL =
  "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--text-primary)] px-6 text-base font-bold text-[var(--surface-canvas)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)] motion-reduce:transition-none motion-reduce:hover:translate-y-0";

function TarjetaEspecie({
  e,
  wa,
  mostrarPiezas,
}: {
  e: EspeciePublica;
  wa: string | null;
  mostrarPiezas: boolean;
}) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <CardTitle className="text-lg font-bold">{e.nombre}</CardTitle>
      <div className="tabular-nums">
        <p className="flex items-baseline gap-1.5">
          <span className="text-3xl font-black leading-none text-[var(--text-primary)]">
            {fmtPt(e.pt)}
          </span>
          <span className="text-base font-bold text-[var(--text-secondary)]">pt</span>
        </p>
        <p className="mt-1.5 text-base text-[var(--text-secondary)]">
          {fmtM3(e.m3)} m³{piezasTexto(e.piezas, mostrarPiezas)}
        </p>
      </div>
      {e.productos.length > 0 && (
        <ul className="space-y-1 border-t border-[var(--rule-soft)] pt-3 text-sm font-medium text-[var(--text-secondary)]">
          {e.productos.slice(0, 3).map((p) => (
            <li key={p.nombre} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">{p.nombre}</span>
              <span className="shrink-0 tabular-nums">{fmtPt(p.pt)} pt</span>
            </li>
          ))}
        </ul>
      )}
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Pedir ${e.nombre} por WhatsApp`}
          className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-base font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <MessageCircle className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          Pedir {e.nombre}
        </a>
      )}
    </article>
  );
}

export function VistaMaderaDisponible({
  opciones,
  datos,
}: VistaPortadaProps<OpcionesMaderaDisponible, DatosMadera>) {
  if (!datos) return null;
  const { madera, contacto } = datos;
  const { titulo, maxEspecies, mostrarPiezas } = opciones;
  const idTitulo = "pieza-madera-disponible-titulo";

  if (madera.especies.length === 0) {
    const wa = waLink(
      contacto.whatsapp,
      `Hola ${contacto.negocio}, quiero encargar madera aserrada. ¿Cuándo vas a tener?`,
    );
    if (!wa) return null;
    return (
      <section
        aria-labelledby={idTitulo}
        data-pieza="madera-disponible"
        className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
      >
        <div className="flex flex-col gap-4 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <SectionTitle id={idTitulo} className="text-lg">
              {titulo}
            </SectionTitle>
            <p className="mt-1 text-base text-[var(--text-secondary)]">
              Hoy no queda madera aserrada libre en el patio. Escríbenos y te avisamos cuando salga
              la próxima.
            </p>
          </div>
          <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA_PRINCIPAL}>
            <MessageCircle className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            Encargar por WhatsApp
          </a>
        </div>
      </section>
    );
  }

  const visibles = madera.especies.slice(0, maxEspecies);
  const resto = madera.especies.slice(maxEspecies);
  const ptResto = resto.reduce((a, e) => a + e.pt, 0);
  const n = madera.especies.length;
  const wa = waLink(
    contacto.whatsapp,
    `Hola ${contacto.negocio}, vi la madera disponible en tu página. ¿Me pasas precios y medidas?`,
  );

  return (
    <section
      aria-labelledby={idTitulo}
      data-pieza="madera-disponible"
      className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1.5 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
            <Trees className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} aria-hidden />
            Del patio
          </p>
          <SectionTitle
            id={idTitulo}
            className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl"
          >
            {titulo}
          </SectionTitle>
          <p className="mt-2 text-base text-[var(--text-secondary)]">
            <strong className="font-bold tabular-nums text-[var(--text-primary)]">
              {fmtPt(madera.total.pt)} pt
            </strong>
            <span className="tabular-nums">
              {" "}
              · {fmtM3(madera.total.m3)} m³{piezasTexto(madera.total.piezas, mostrarPiezas)}
            </span>{" "}
            en {n} {n === 1 ? "especie" : "especies"}, contado el {cuando(madera.tomadaAt)}.
          </p>
        </div>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className={CTA_PRINCIPAL}>
            <MessageCircle className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            Pedir por WhatsApp
          </a>
        )}
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibles.map((e) => (
          <li key={e.nombre}>
            <TarjetaEspecie
              e={e}
              mostrarPiezas={mostrarPiezas}
              wa={waLink(
                contacto.whatsapp,
                `Hola ${contacto.negocio}, me interesa ${e.nombre} (${fmtPt(e.pt)} pt disponibles). ¿Me pasas precio y medidas?`,
              )}
            />
          </li>
        ))}
      </ul>

      {resto.length > 0 && (
        <p className="mt-4 text-base text-[var(--text-secondary)]">
          Y {resto.length} {resto.length === 1 ? "especie" : "especies"} más ({fmtPt(ptResto)} pt):{" "}
          {resto.map((e) => e.nombre).join(", ")}.
        </p>
      )}
    </section>
  );
}
