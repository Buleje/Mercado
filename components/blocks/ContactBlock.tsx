// ═══════════════════════════════════════════════════════
// CONTACT BLOCK - Editable Contact Section
// ═══════════════════════════════════════════════════════

"use client";

import { z } from "zod";
import { MapPin, Phone, Clock, MessageCircle } from "@buleje/design-system/icons";

// ─── Schema & Types ─────────────────────────────────────
export const ContactBlockSchema = z.object({
  badge: z.string().default("Contacto"),
  title: z.string().default("Delivery de Abarrotes a Domicilio"),
  subtitle: z.string().default("Haz tu pedido online o escríbenos por WhatsApp. Entrega rápida y segura."),
  contactInfo: z.array(z.object({
    icon: z.string(),
    label: z.string(),
    value: z.string(),
    href: z.string().optional(),
  })).default([
    {
      icon: "MapPin",
      label: "Dirección",
      value: "Jr. Ucayali 450, Ucayali",
    },
    {
      icon: "Phone",
      label: "Teléfono",
      value: "929 340 532",
      href: "tel:+51929340532",
    },
    {
      icon: "Clock",
      label: "Horario",
      value: "Lun - Sáb: 7:00am - 9:00pm",
    },
    {
      icon: "MessageCircle",
      label: "WhatsApp",
      value: "Escríbenos al WhatsApp",
      href: "https://wa.me/51929340532",
    },
  ]),
  ctaTitle: z.string().default("¿Listo para pedir?"),
  ctaDescription: z.string().default("Agrega productos a tu carrito y envía tu pedido directo por WhatsApp."),
  ctaSteps: z.array(z.string()).default([
    "Elige tus productos desde nuestro catálogo",
    "Revisa tu carrito y confirma la orden",
    "Envía el pedido por WhatsApp y listo",
  ]),
});

export type ContactBlockProps = z.infer<typeof ContactBlockSchema>;

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  MapPin,
  Phone,
  Clock,
  MessageCircle,
};

// ─── Component ──────────────────────────────────────────
export default function ContactBlock(props: Partial<ContactBlockProps>) {
  const {
    badge = "Contacto",
    title = "Delivery de Abarrotes a Domicilio",
subtitle,
    contactInfo = [],
    ctaTitle,
    ctaDescription,
    ctaSteps = [],
  } = props;

  return (
    <section id="contacto" className="py-20 sm:py-28 bg-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-3 bg-primary/8 rounded-full px-4 py-1.5">
            {badge}
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[var(--text-primary)]">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
              {subtitle}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Contact Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {contactInfo.map((item, i) => {
              const Icon = ICONS[item.icon] || Phone;
              const content = (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ${item.href ? 'group-hover:bg-primary group-hover:text-white' : ''} transition-colors`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-semibold text-muted">
                      {item.label}
                    </span>
                  </div>
                  <p className={`font-semibold text-[var(--text-primary)] ${item.href ? 'group-hover:text-primary' : ''} transition-colors`}>
                    {item.value}
                  </p>
                </>
              );

              return item.href ? (
                <a
                  key={i}
                  href={item.href}
                  target={item.href.startsWith("http") ? "_blank" : undefined}
                  rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="block bg-[var(--surface-raised)] rounded-xl p-6 shadow-sm hover:shadow-lg hover:border-primary/20 transition-all duration-[var(--dur-base)] group"
                >
                  {content}
                </a>
              ) : (
                <div key={i} className="bg-[var(--surface-raised)] rounded-xl p-6 shadow-sm">
                  {content}
                </div>
              );
            })}
          </div>

          {/* WhatsApp CTA Card */}
          {ctaTitle && (
            <div
              className="rounded-2xl p-8 sm:p-10 text-white shadow-xl"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}
            >
              <h3 className="text-2xl sm:text-3xl font-extrabold mb-4">
                {ctaTitle}
              </h3>
              {ctaDescription && (
                <p className="text-white/80 text-lg mb-8 leading-relaxed">
                  {ctaDescription}
                </p>
              )}

              <div className="space-y-4">
                {ctaSteps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-white/90">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── CMS Metadata ───────────────────────────────────────
export const ContactBlockMetadata = {
  type: "contact",
  name: "Contacto",
  description: "Información de contacto y formulario",
  category: "informativo" as const,
  icon: "Phone",
  defaultProps: (() => { const parsed = ContactBlockSchema.safeParse({}); return parsed.success ? parsed.data : { badge: "Contacto", title: "Delivery de Abarrotes a Domicilio", subtitle: "", contactInfo: [], ctaTitle: "¿Listo para pedir?", ctaDescription: "", ctaSteps: [] }; })(),
  propsSchema: ContactBlockSchema,
};
