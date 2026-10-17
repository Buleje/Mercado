/**
 * Las partes de la ficha del salón (ADR-460) que no tienen estado: migas,
 * foto, el resumen con precio y existencias, los beneficios y los pasos.
 * Sirven en el servidor; lo que se toca (cantidad y agregar) es `Comprar.tsx`.
 */
import Image from "next/image";
import { Clock, MessageCircle, ShieldCheck, Sparkles, Truck, Wallet } from "@buleje/design-system/icons";
import { BENEFICIOS } from "./anuncios";
import { BENEFICIOS_SERVICIO } from "./anuncios-ficha";
import { Comprar } from "./Comprar";
import type { ProductoSalon } from "./datos";
import { enlaceWhatsapp, mensajeReserva, rellenar, soles } from "./destinos";
import { esServicio } from "./rutina";
import { BOTON, KICKER } from "./ui";

const POCAS = 5;
const ICONOS = { camion: Truck, pago: Wallet, chat: MessageCircle, reloj: Clock, escudo: ShieldCheck } as const;

type Beneficio = { icono: keyof typeof ICONOS; titulo: string; texto: string };

export interface Miga {
  nombre: string;
  href?: string;
}

/** Inicio / categoría / producto. El último no es enlace: es donde estás. */
export function Migas({ items }: { items: Miga[] }) {
  return (
    <nav aria-label="Estás en" className="text-base text-[var(--text-secondary)]">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((m, i) => (
          <li key={m.nombre} className="inline-flex items-center gap-x-2">
            {i > 0 && <span aria-hidden="true">/</span>}
            {m.href ? (
              <a href={m.href} className="underline-offset-4 hover:text-[var(--text-primary)] hover:underline">
                {m.nombre}
              </a>
            ) : (
              <span aria-current="page" className="font-medium text-[var(--text-primary)]">
                {m.nombre}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** La foto grande sobre el rubor del salón (el fondo de las tarjetas), con la etiqueta del dueño. */
export function Galeria({ p }: { p: ProductoSalon }) {
  return (
    <div className="lg:sticky lg:top-28 lg:self-start">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-[var(--bb-rubor)]">
        {p.imagen ? (
          <Image src={p.imagen} alt={p.nombre} fill priority sizes="(min-width: 1280px) 620px, (min-width: 1024px) 50vw, 100vw" className="object-cover" />
        ) : (
          <Sparkles className="absolute inset-0 m-auto h-16 w-16 text-[var(--bb-rosa)]" strokeWidth={1.2} aria-hidden="true" />
        )}
        {p.etiqueta && (
          <span className="absolute left-4 top-4 rounded-full bg-[var(--surface-raised)]/90 px-4 py-1.5 text-base font-semibold text-[var(--text-primary)] backdrop-blur">
            {p.etiqueta}
          </span>
        )}
      </div>
    </div>
  );
}

export function Precio({ p }: { p: ProductoSalon }) {
  return (
    <div className="mt-5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-3xl font-bold tabular-nums text-[var(--text-primary)] sm:text-4xl">{soles(p.precio)}</span>
        {p.antes && (
          <>
            <span className="text-lg tabular-nums text-[var(--text-tertiary)] line-through">
              <span className="sr-only">Antes </span>
              {soles(p.antes)}
            </span>
            <span className="rounded-full bg-[var(--bb-vino)] px-3 py-1 text-base font-bold text-[var(--surface-canvas)]">-{p.descuento} %</span>
          </>
        )}
      </p>
      {p.antes && <p className="mt-2 text-base font-semibold text-[var(--bb-vino)]">Ahorras {soles(p.antes - p.precio)}</p>}
      <p className="mt-1 text-sm text-[var(--text-tertiary)]">Precio en soles, con IGV{esServicio(p) ? " · se paga en el salón" : ""}.</p>
    </div>
  );
}

export function Existencias({ stock }: { stock: number | null }) {
  if (stock === null) return null;
  const [texto, tono] =
    stock <= 0 ? ["Agotado por ahora", "text-[var(--text-secondary)]"] : stock <= POCAS ? [`¡Quedan ${stock}!`, "font-semibold text-[var(--bb-vino)]"] : ["Disponible para delivery", "text-[var(--text-secondary)]"];
  return (
    <p className={`mt-4 inline-flex items-center gap-2 text-base ${tono}`}>
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${stock > 0 ? "bg-[var(--bb-vino)]" : "bg-[var(--rule-strong)]"}`} />
      {texto}
    </p>
  );
}

/** Delivery, pago y asesoría (o, para un servicio: cuánto dura, dónde se paga, cómo se confirma). */
function BeneficiosFicha({ p, pagos }: { p: ProductoSalon; pagos: string | null }) {
  const base: readonly Beneficio[] = esServicio(p) ? BENEFICIOS_SERVICIO : BENEFICIOS.filter((b) => b.icono !== "escudo");
  const items = base
    .map((b) => ({ ...b, titulo: rellenar(b.titulo, { duracion: p.duracion }), texto: rellenar(b.texto, { pagos }) }))
    .filter((b): b is typeof b & { titulo: string; texto: string } => Boolean(b.titulo && b.texto));
  return (
    <ul className="mt-7 divide-y divide-[var(--rule-soft)] rounded-2xl border border-[var(--rule-soft)] bg-[var(--bb-papel)]">
      {items.map((b) => {
        const Icono = ICONOS[b.icono];
        return (
          <li key={b.icono} className="flex items-start gap-4 p-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bb-rubor)] text-[var(--bb-vino)]">
              <Icono className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-base font-semibold text-[var(--text-primary)]">{b.titulo}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-[var(--text-secondary)]">{b.texto}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** La columna de al lado de la foto: marca, nombre, precio, existencias, descripción y qué hacer. */
export function Resumen({ p, whatsapp, pagos }: { p: ProductoSalon; whatsapp: string | null; pagos: string | null }) {
  const servicio = esServicio(p);
  return (
    <div className="flex flex-col">
      <p className={KICKER}>{servicio ? "Servicio del salón" : (p.marca ?? p.categoria)}</p>
      <h1 className="bb-serif mt-3 text-4xl leading-[1.05] tracking-tight text-[var(--text-primary)] sm:text-5xl">{p.nombre}</h1>
      <Precio p={p} />
      {servicio ? (
        p.duracion && (
          <p className="mt-4 inline-flex items-center gap-2 text-base text-[var(--text-secondary)]">
            <Clock className="h-5 w-5" aria-hidden="true" /> {p.duracion}
          </p>
        )
      ) : (
        <Existencias stock={p.stock} />
      )}
      {p.descripcion && <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">{p.descripcion}</p>}
      {servicio ? (
        <a href={enlaceWhatsapp(whatsapp, mensajeReserva(p))} target="_blank" rel="noopener noreferrer" className={`${BOTON} mt-7 w-full`}>
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> Reservar por WhatsApp
        </a>
      ) : (
        <Comprar
          producto={{ id: p.id, name: p.nombre, category: p.categoria, price: p.precio, image: p.imagen, unit: p.unidad, ...(p.stock !== null ? { stock: p.stock } : {}) }}
          consulta={enlaceWhatsapp(whatsapp, `Hola, tengo una consulta sobre ${p.nombre} (${soles(p.precio)}).`)}
        />
      )}
      <BeneficiosFicha p={p} pagos={pagos} />
    </div>
  );
}
