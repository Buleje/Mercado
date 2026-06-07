/**
 * @cross-tenant intentional — endpoint público marketplace (recetas
 * compartidas entre tiendas son discoverable). Visual QA Bug Hunter Report
 * P0#1 marcó esto como leak — pero es por diseño del marketplace
 * (descubrimiento cross-store). Si en el futuro se quiere scope por tenant,
 * agregar header `x-tenant-id` + `WHERE tenantId = ...`.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import RecetaDetalleClient from "@/components/store/RecetaDetalleClient";
import Footer from "@/components/Footer";

const BASE_URL = "https://www.buleje.pe";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface RecetaSEO {
  id: string;
  nombre: string;
  descripcion: string | null;
  imageUrl: string | null;
  tiempoMinutos: number | null;
  porciones: number | null;
  dificultad: string | null;
  categoria: string | null;
  pasosJson: string | null;
  ingredientes: Array<{
    cantidad: number;
    unidad: string;
    productName: string | null;
  }>;
}

async function getRecetaForSEO(id: string): Promise<RecetaSEO | null> {
  try {
    // eslint-disable-next-line no-restricted-properties -- ruta pública marketplace; recetas cross-tenant por diseño (descubrimiento). Ver header del archivo.
    const row = await prisma.receta.findFirst({
      where: { id, activa: true },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        imageUrl: true,
        tiempoMinutos: true,
        porciones: true,
        dificultad: true,
        categoria: true,
        pasosJson: true,
        ingredientes: {
          select: {
            cantidad: true,
            unidad: true,
            producto: { select: { name: true } },
          },
        },
      },
    });

    if (!row) return null;

    return {
      id: row.id,
      nombre: row.nombre,
      descripcion: row.descripcion,
      imageUrl: row.imageUrl,
      tiempoMinutos: row.tiempoMinutos,
      porciones: row.porciones,
      dificultad: row.dificultad,
      categoria: row.categoria,
      pasosJson: row.pasosJson,
      ingredientes: row.ingredientes.map((i) => ({
        cantidad: Number(i.cantidad),
        unidad: i.unidad,
        productName: i.producto?.name ?? null,
      })),
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const receta = await getRecetaForSEO(id);

  if (!receta) {
    return {
      title: "Receta no encontrada",
      description: "La receta que buscas no existe o fue removida del recetario.",
      robots: { index: false, follow: false },
    };
  }

  const title = `${receta.nombre} — Receta peruana | Buleje`;
  const description =
    receta.descripcion ??
    `Aprende a preparar ${receta.nombre}. Receta paso a paso con ingredientes que encontras en bodegas de Ciudad Constitución.`;
  const url = `${BASE_URL}/marketplace/recetas/${receta.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: "Buleje",
      locale: "es_PE",
      type: "article",
      images: receta.imageUrl ? [{ url: receta.imageUrl, alt: receta.nombre }] : undefined,
    },
    twitter: {
      card: receta.imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: receta.imageUrl ? [receta.imageUrl] : undefined,
    },
  };
}

function buildRecipeJsonLd(receta: RecetaSEO): Record<string, unknown> {
  const url = `${BASE_URL}/marketplace/recetas/${receta.id}`;
  const ingredients = receta.ingredientes
    .map((i) => {
      const name = i.productName ?? "Ingrediente";
      const qty = `${i.cantidad} ${i.unidad}`.trim();
      return `${qty} ${name}`.trim();
    })
    .filter(Boolean);

  // 2026-05-28 audit P3: HowToStep es válido por schema.org/Google pero
  // se beneficia de `name` + `position` para Rich Recipe carousel. Antes
  // solo emitía text — ahora completa la triada (position + name + text).
  // Google prefiere esto para mostrar la receta en el carrusel de pasos.
  let steps: Array<{
    "@type": "HowToStep";
    position: number;
    name: string;
    text: string;
  }> = [];
  if (receta.pasosJson) {
    try {
      const parsed = JSON.parse(receta.pasosJson) as unknown;
      if (Array.isArray(parsed)) {
        steps = parsed
          .filter((s): s is string => typeof s === "string" && s.length > 0)
          .map((text, i) => ({
            "@type": "HowToStep" as const,
            position: i + 1,
            name: `Paso ${i + 1}`,
            text,
          }));
      }
    } catch {
      // invalid JSON — skip steps
    }
  }

  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: receta.nombre,
    description: receta.descripcion ?? `Receta de ${receta.nombre}`,
    image: receta.imageUrl ? [receta.imageUrl] : undefined,
    recipeCategory: receta.categoria ?? "Cocina peruana",
    recipeCuisine: "Peruana",
    recipeYield: receta.porciones ? `${receta.porciones} porciones` : undefined,
    // 2026-05-28 audit secondary: prepTime ISO 8601 si está disponible (no
    // todas las recetas tienen el campo, fallback skip vía undefined).
    ...(typeof (receta as { prepMinutos?: number }).prepMinutos === "number"
      ? { prepTime: `PT${(receta as { prepMinutos?: number }).prepMinutos}M` }
      : {}),
    totalTime: receta.tiempoMinutos ? `PT${receta.tiempoMinutos}M` : undefined,
    keywords: [receta.nombre, "receta peruana", "Ciudad Constitución", receta.categoria].filter(Boolean).join(", "),
    recipeIngredient: ingredients.length > 0 ? ingredients : undefined,
    recipeInstructions: steps.length > 0 ? steps : undefined,
    author: {
      "@type": "Organization",
      name: "Buleje",
      url: BASE_URL,
    },
    url,
  };
}

export default async function RecetaDetallePage({ params }: PageProps) {
  const { id } = await params;
  const receta = await getRecetaForSEO(id);

  if (!receta) {
    notFound();
  }

  const jsonLd = buildRecipeJsonLd(receta);

  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/*
        SEO 2026-05-28 audit P4: H1 sr-only con nombre receta + keyword
        "receta peruana". RecetaDetalleClient (client) renderiza el H1
        visual pero SSR HTML no tenía → Google sin encabezado primario.
      */}
      <h1 className="sr-only">
        {receta.nombre} — Receta peruana paso a paso | Buleje
      </h1>
      <RecetaDetalleClient recetaId={id} />
      <Footer />
    </>
  );
}
