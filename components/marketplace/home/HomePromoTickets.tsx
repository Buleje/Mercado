"use client";

/**
 * HomePromoTickets — las promos del hero «Dosel» como TICKETS (2026-10-10).
 *
 * Reemplaza al carrusel de banners que rotaba solo (Baymard: en celular el
 * carrusel no debe rotar; la alternativa que mejor funciona son piezas fijas).
 *   - xl: columna a la derecha del tile, 2 tickets visibles; con más de 2,
 *     paginador «‹ 1/2 ›» (ventana corrida: siempre se ven 2).
 *   - md-lg: fila de 3 debajo del tile.
 *   - celular: carril `snap-x` de tickets de 280×80, sin autoplay.
 * Datos: banners del slot `tiendas-hero` resueltos en el server; los
 * `bgFrom/bgTo` (hex del superadmin) se ignoran: el ticket usa tokens.
 * Si el texto trae un código (BIENVENIDO10), se pinta un chip con «Copiar».
 */

import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Store,
  Tag,
  Ticket,
  Wallet,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { trackBanner } from "@/lib/marketplace/track-banner";
import type { FamiliaId } from "@/lib/marketplace/familias-categoria";

export interface TicketPromoDatos {
  id: string;
  title: string;
  subtitle?: string;
  ctaHref: string;
  ctaLabel: string;
  imageUrl: string | null;
}

/** Sin banners cargados: 2 tickets propios (tuteo, sin códigos inventados). */
const RESPALDO: TicketPromoDatos[] = [
  {
    id: "home-ticket-bienvenida",
    title: "Tu primer pedido te regala 10 %",
    subtitle: "Al recibirlo te llega un cupón para tu siguiente compra.",
    ctaHref: "/tiendas",
    ctaLabel: "Elegir tienda",
    imageUrl: null,
  },
  {
    id: "home-ticket-negocio",
    title: "¿Tienes un negocio? Súmate gratis",
    subtitle: "Publica tu tienda y llega a más vecinos del barrio.",
    ctaHref: "/negocios",
    ctaLabel: "Conocer más",
    imageUrl: null,
  },
];

const CODIGO = /\b[A-Z]{4,}\d{0,3}\b/;

function tipoDe(t: TicketPromoDatos, codigo: string | null): { Icon: LucideIcon; familia: FamiliaId } {
  const texto = `${t.ctaHref} ${t.title} ${t.subtitle ?? ""}`.toLowerCase();
  if (codigo || /oferta|cup[oó]n|%|descuento/.test(texto)) return { Icon: Ticket, familia: "comida" };
  if (/pag[ao]|yape|plin|efectivo/.test(texto)) return { Icon: Wallet, familia: "frescos" };
  if (/negocio|tienda|vend/.test(texto)) return { Icon: Store, familia: "despensa" };
  return { Icon: Tag, familia: "bebidas" };
}

/** Las 2 muescas del ticket, alineadas con la perforación (`--talon`). */
const MUESCAS = [
  "radial-gradient(circle 9px at var(--talon) 0, transparent 95%, black 100%)",
  "radial-gradient(circle 9px at var(--talon) 100%, transparent 95%, black 100%)",
].join(", ");
const ESTILO_TICKET: CSSProperties = {
  WebkitMaskImage: MUESCAS,
  maskImage: MUESCAS,
  WebkitMaskComposite: "source-in",
  maskComposite: "intersect",
};

/** Portapapeles con respaldo (http sin `navigator.clipboard`, permisos negados). */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function TicketPromo({ ticket }: { ticket: TicketPromoDatos }) {
  const codigo = `${ticket.title} ${ticket.subtitle ?? ""}`.match(CODIGO)?.[0] ?? null;
  const { Icon, familia } = tipoDe(ticket, codigo);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2200);
    return () => clearTimeout(t);
  }, [copiado]);

  const copiar = async () => {
    if (!codigo) return;
    setCopiado(await copiarTexto(codigo));
  };

  return (
    <article
      className="relative flex h-full overflow-clip rounded-[var(--radius-xl)] border border-[var(--rule-base)] bg-[var(--surface-raised)] transition-colors duration-[var(--dur-fast)] [--talon:56px] hover:border-[var(--accent)] md:[--talon:64px] xl:[--talon:72px]"
      style={ESTILO_TICKET}
    >
      {/* Talón: tinte de familia + motivo + ícono (o la imagen del banner) */}
      <div
        data-familia={familia}
        className="relative flex w-[var(--talon)] shrink-0 items-center justify-center bg-[var(--tinte-bg)]"
      >
        <span aria-hidden className="patron-familia" />
        {ticket.imageUrl ? (
          <Image src={ticket.imageUrl} alt="" fill unoptimized sizes="72px" className="object-cover" />
        ) : (
          <Icon aria-hidden className="relative size-6 text-[var(--tinte-ink)] xl:size-7" strokeWidth={2} />
        )}
      </div>
      {/* Perforación */}
      <span
        aria-hidden
        className="absolute bottom-3 left-[var(--talon)] top-3 border-l border-dashed border-[var(--rule-strong)] opacity-30"
      />

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-1.5 md:px-4 md:py-2 xl:gap-2 xl:py-4">
        <Link
          href={ticket.ctaHref || "/tiendas"}
          onClick={() => trackBanner("click", [ticket.id])}
          className="text-base font-extrabold leading-tight text-[var(--text-primary)] after:absolute after:inset-0 after:rounded-[var(--radius-xl)] after:content-[''] focus-visible:outline-none! focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[var(--accent)] xl:text-lg"
        >
          <span className="line-clamp-2">{ticket.title}</span>
        </Link>
        {ticket.subtitle && (
          <p
            className={cn(
              "text-sm text-[var(--text-secondary)]",
              codigo ? "hidden xl:line-clamp-2" : "line-clamp-1 xl:line-clamp-2",
            )}
          >
            {ticket.subtitle}
          </p>
        )}
        {codigo ? (
          <button
            type="button"
            onClick={copiar}
            aria-label={`Copiar el código ${codigo}`}
            className="relative z-10 inline-flex h-8 max-w-full items-center gap-1.5 self-start rounded-[var(--radius-sm)] border border-dashed border-amber-500 bg-[var(--tinte-comida-bg)] px-2 text-[var(--tinte-comida-ink)] transition-colors duration-[var(--dur-fast)] before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] hover:bg-[var(--tinte-comida-blob)]"
          >
            <span aria-live="polite" className="truncate font-mono text-xs font-bold tracking-wide xl:text-sm">
              {copiado ? "¡Copiado!" : codigo}
            </span>
            {copiado ? (
              <Check aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />
            ) : (
              <Copy aria-hidden className="size-4 shrink-0" />
            )}
          </button>
        ) : (
          <span className="hidden items-center gap-1 text-sm font-bold text-[var(--accent-ink)] md:inline-flex">
            {ticket.ctaLabel}
            <ArrowRight aria-hidden className="size-4" />
          </span>
        )}
      </div>
    </article>
  );
}

export default function HomePromoTickets({ banners }: { banners: TicketPromoDatos[] }) {
  const tickets = banners.length > 0 ? banners : RESPALDO;
  const paginas = Math.max(1, tickets.length - 1);
  const [pagina, setPagina] = useState(0);
  const desde = Math.min(pagina, tickets.length - 2);

  useEffect(() => {
    const reales = banners.map((b) => b.id);
    if (reales.length > 0) trackBanner("impression", reales);
  }, [banners]);

  const mover = (paso: number) => setPagina((p) => (p + paso + paginas) % paginas);

  return (
    <div className="flex flex-col gap-3 xl:col-span-4">
      {tickets.length > 2 && (
        <div className="hidden h-11 items-center justify-between xl:flex">
          <p className="text-sm font-bold text-[var(--text-secondary)]">Promos para ti</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => mover(-1)}
              aria-label="Promos anteriores"
              className="inline-flex size-11 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <span className="min-w-8 text-center text-sm font-semibold tabular-nums text-[var(--text-secondary)]" aria-live="polite">
              {pagina + 1}/{paginas}
            </span>
            <button
              type="button"
              onClick={() => mover(1)}
              aria-label="Más promos"
              className="inline-flex size-11 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <ChevronRight aria-hidden className="size-5" />
            </button>
          </div>
        </div>
      )}
      <ul
        aria-label="Promociones"
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 xl:flex xl:flex-1 xl:flex-col"
      >
        {tickets.map((t, i) => (
          <li
            key={t.id}
            className={cn(
              "h-[88px] w-[288px] shrink-0 snap-start md:h-[120px] md:w-auto xl:h-auto xl:flex-1",
              (i < desde || i > desde + 1) && "xl:hidden",
              i >= 3 && "md:max-xl:hidden",
            )}
          >
            <TicketPromo ticket={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}
