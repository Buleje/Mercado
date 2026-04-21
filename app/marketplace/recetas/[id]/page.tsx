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
      title: "Receta no encontrada — Buleje",
      description: "La receta que buscas no existe o fue removida del recetario.",
      robots: { index: false, follow: false },
    };
  }

  const title = `${receta.nombre} — Receta peruana | Buleje`;
  const description =
    receta.descripcion ??
    `Aprende a preparar ${receta.nombre}. Receta paso a paso con ingredientes que encontras en bodegas de Pucallpa.`;
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

  let steps: Array<{ "@type": "HowToStep"; text: string }> = [];
  if (receta.pasosJson) {
    try {
      const parsed = JSON.parse(receta.pasosJson) as unknown;
      if (Array.isArray(parsed)) {
        steps = parsed
          .filter((s): s is string => typeof s === "string" && s.length > 0)
          .map((text) => ({ "@type": "HowToStep" as const, text }));
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
    totalTime: receta.tiempoMinutos ? `PT${receta.tiempoMinutos}M` : undefined,
    keywords: [receta.nombre, "receta peruana", "Pucallpa", receta.categoria].filter(Boolean).join(", "),
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
      <RecetaDetalleClient recetaId={id} />
      <Footer />
    </>
  );
}
