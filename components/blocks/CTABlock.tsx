// ═══════════════════════════════════════════════════════
// CTA BLOCK - Editable Call to Action Section
// ═══════════════════════════════════════════════════════

"use client";

import { z } from "zod";
import { ArrowRight, Phone } from "lucide-react";

// ─── Schema & Types ─────────────────────────────────────
export const CTABlockSchema = z.object({
  layout: z.enum(["centered", "split", "gradient"]).default("centered"),
  title: z.string().default("¿Listo para hacer tu pedido?"),
  subtitle: z.string().default("Delivery rápido en toda Pucallpa. Paga con Yape o efectivo."),
  primaryCTA: z.object({
    text: z.string(),
    link: z.string(),
    icon: z.enum(["arrow", "phone", "none"]).default("arrow"),
  }).default({
    text: "Ver Productos",
    link: "/tienda",
    icon: "arrow",
  }),
  secondaryCTA: z.object({
    text: z.string(),
    link: z.string(),
    show: z.boolean(),
  }).default({
    text: "Contactar por WhatsApp",
    link: "https://wa.me/51916409675",
    show: true,
  }),
  backgroundColor: z.string().default("#1b4332"),
  textColor: z.string().default("#ffffff"),
  primaryButtonColor: z.string().default("#22c55e"),
  showPattern: z.boolean().default(true),
});

export type CTABlockProps = z.infer<typeof CTABlockSchema>;

// ─── Component ──────────────────────────────────────────
export default function CTABlock(props: Partial<CTABlockProps>) {
  const {
    layout = "centered",
    title = "¿Listo para hacer tu pedido?",
    subtitle,
    primaryCTA = { text: "Ver Productos", link: "/tienda", icon: "arrow" },
    secondaryCTA = { text: "Contactar por WhatsApp", link: "https://wa.me/51916409675", show: true },
    backgroundColor = "#1b4332",
    textColor = "#ffffff",
    primaryButtonColor = "#22c55e",
    showPattern = true,
  } = props;

  const IconComponent = primaryCTA.icon === "phone" ? Phone : ArrowRight;

  if (layout === "centered") {
    return (
      <section
        className="relative py-20 sm:py-28 overflow-hidden"
        style={{ backgroundColor }}
      >
        {showPattern && (
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
        )}
        
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-6"
            style={{ color: textColor }}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className="text-lg sm:text-xl mb-10 opacity-90"
              style={{ color: textColor }}
            >
              {subtitle}
            </p>
          )}
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href={primaryCTA.link}
              className="inline-flex items-center gap-2 px-8 py-4 font-bold rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
              style={{ backgroundColor: primaryButtonColor, color: "#ffffff" }}
            >
              {primaryCTA.text}
              {primaryCTA.icon !== "none" && <IconComponent className="h-5 w-5" />}
            </a>
            
            {secondaryCTA.show && (
              <a
                href={secondaryCTA.link}
                className="inline-flex items-center gap-2 px-8 py-4 font-semibold rounded-full border-2 hover:bg-white/10 transition-colors"
                style={{ borderColor: textColor, color: textColor }}
              >
                {secondaryCTA.text}
              </a>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (layout === "split") {
    return (
      <section
        className="relative py-20 sm:py-28"
        style={{ backgroundColor }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2
                className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-6"
                style={{ color: textColor }}
              >
                {title}
              </h2>
              {subtitle && (
                <p
                  className="text-lg opacity-90"
                  style={{ color: textColor }}
                >
                  {subtitle}
                </p>
              )}
            </div>
            
            <div className="flex flex-col gap-4">
              <a
                href={primaryCTA.link}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 font-bold rounded-xl shadow-lg hover:shadow-xl transition-all"
                style={{ backgroundColor: primaryButtonColor, color: "#ffffff" }}
              >
                {primaryCTA.text}
                {primaryCTA.icon !== "none" && <IconComponent className="h-5 w-5" />}
              </a>
              
              {secondaryCTA.show && (
                <a
                  href={secondaryCTA.link}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 font-semibold rounded-xl border-2 hover:bg-white/10 transition-colors"
                  style={{ borderColor: textColor, color: textColor }}
                >
                  {secondaryCTA.text}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Gradient layout
  return (
    <section className="relative py-20 sm:py-28 overflow-hidden bg-linear-to-br from-primary to-primary-dark">
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, rgba(255,255,255,0.2) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.2) 0%, transparent 50%)`,
        }}
      />
      
      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-6 text-white">
          {title}
        </h2>
        {subtitle && (
          <p className="text-lg sm:text-xl mb-10 text-white/90">
            {subtitle}
          </p>
        )}
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <a
            href={primaryCTA.link}
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-primary font-bold rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            {primaryCTA.text}
            {primaryCTA.icon !== "none" && <IconComponent className="h-5 w-5" />}
          </a>
          
          {secondaryCTA.show && (
            <a
              href={secondaryCTA.link}
              className="inline-flex items-center gap-2 px-8 py-4 font-semibold rounded-full border-2 border-white text-white hover:bg-white/10 transition-colors"
            >
              {secondaryCTA.text}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── CMS Metadata ───────────────────────────────────────
export const CTABlockMetadata = {
  type: "cta",
  name: "Llamada a la Acción",
  description: "Sección de CTA con botones y diseño flexible",
  category: "marketing" as const,
  icon: "Megaphone",
  defaultProps: CTABlockSchema.parse({}),
  propsSchema: CTABlockSchema,
};
