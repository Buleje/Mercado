// ═══════════════════════════════════════════════════════
// ABOUT BLOCK - Editable About Section
// ═══════════════════════════════════════════════════════

"use client";

import { z } from "zod";
import { Award, Heart, Users, Calendar } from "lucide-react";
import Image from "next/image";

// ─── Schema & Types ─────────────────────────────────────
export const AboutBlockSchema = z.object({
  badge: z.string().default("Nuestra Historia"),
  title: z.string().default("Tu tienda virtual de"),
  titleAccent: z.string().default("abarrotes en Pucallpa"),
  description1: z.string().default("Desde 2011, Bodega San Martín ha sido el corazón del barrio en Pucallpa."),
  description2: z.string().default("Hoy somos una tienda de consumo masivo en Pucallpa con entrega a domicilio."),
  image: z.string().url().default("https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=800&h=600&fit=crop&q=80"),
  imageAlt: z.string().default("Interior de Bodega San Martin"),
  showStats: z.boolean().default(true),
  stats: z.array(z.object({
    icon: z.string().default("Calendar"),
    value: z.string(),
    label: z.string(),
  })).default([
    { icon: "Calendar", value: "15+", label: "Años de experiencia" },
    { icon: "Users", value: "5,000+", label: "Familias atendidas" },
    { icon: "Heart", value: "100%", label: "Productos frescos" },
    { icon: "Award", value: "#1", label: "Bodega del barrio" },
  ]),
  badges: z.array(z.string()).default(["Delivery en Pucallpa", "Pago con Yape", "Productos Frescos"]),
});

export type AboutBlockProps = z.infer<typeof AboutBlockSchema>;

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Calendar,
  Users,
  Heart,
  Award,
};

// ─── Component ──────────────────────────────────────────
export default function AboutBlock(props: Partial<AboutBlockProps>) {
  const {
    badge = "Nuestra Historia",
    title = "Tu tienda virtual de",
    titleAccent = "abarrotes en Pucallpa",
    description1,
    description2,
    image,
    imageAlt = "Interior de Bodega San Martin",
    showStats = true,
    stats = [],
    badges = [],
  } = props;

  return (
    <section id="nosotros" className="py-24 bg-white dark:bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div>
            <span className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary mb-6">
              {badge}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-6">
              {title}
              <br />
              <span className="text-primary">{titleAccent}</span>
            </h2>
            
            {description1 && (
              <p className="text-lg text-foreground/70 leading-relaxed mb-6">
                {description1}
              </p>
            )}
            
            {description2 && (
              <p className="text-lg text-foreground/70 leading-relaxed mb-8">
                {description2}
              </p>
            )}

            <div className="flex flex-wrap gap-4">
              {badges.map((badgeText, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted rounded-full px-5 py-2.5">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-sm font-medium text-foreground">
                    {badgeText}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right - Image + Stats */}
          <div>
            {/* Store Photo */}
            {image && (
              <div className="relative mb-10">
                <div className="aspect-4/3 rounded-3xl overflow-hidden shadow-2xl">
                  <Image
                    src={image}
                    alt={imageAlt}
                    width={800}
                    height={600}
                    loading="lazy"
                    unoptimized
                    className="w-full h-full object-cover"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(27,67,50,0.35), transparent)" }} />
                </div>
              </div>
            )}

            {/* Stats Grid */}
            {showStats && stats.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {stats.map((stat, i) => {
                  const Icon = ICONS[stat.icon] || Calendar;
                  return (
                    <div
                      key={i}
                      className="rounded-2xl bg-muted p-5 text-center hover:shadow-md transition-shadow"
                    >
                      <Icon className="h-6 w-6 text-primary mx-auto mb-2" />
                      <p className="text-2xl font-bold text-foreground">
                        {stat.value}
                      </p>
                      <p className="text-xs text-foreground/60 mt-1">
                        {stat.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── CMS Metadata ───────────────────────────────────────
export const AboutBlockMetadata = {
  type: "about",
  name: "Sección Nosotros",
  description: "Historia, misión y estadísticas de la empresa",
  category: "informativo" as const,
  icon: "Users",
  defaultProps: AboutBlockSchema.parse({}),
  propsSchema: AboutBlockSchema,
};
