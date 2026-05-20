import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  PageTitle,
  SectionTitle,
  CardTitle,
  BodyText,
  Caption,
  Label,
  Kicker,
} from "./typography";

const meta: Meta = {
  title: "Design System/Typography",
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Primitivos tipograficos canonicos (ADR-070 / ADR-075). Fuente de verdad para h1/h2/h3/p/label/caption/kicker en admin y storefront. REGLA: no crear heading con className local en app/admin — usar estos primitivos.",
      },
    },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

// ── PageTitle ─────────────────────────────────────────────────────────────────

/**
 * Titulo principal de pagina (h1 por defecto).
 * Uno por pagina — regla de accesibilidad.
 * Escala 2xl → 3xl responsive.
 */
export const PageTitleDefault: Story = {
  render: () => <PageTitle>Dashboard de ventas</PageTitle>,
  name: "PageTitle (h1)",
};

/** Override semantico: usar as="h2" dentro de modales donde ya hay h1 exterior. */
export const PageTitleAsH2: Story = {
  render: () => <PageTitle as="h2">Seccion principal del modal</PageTitle>,
  name: "PageTitle — as h2 (override semantico)",
};

// ── SectionTitle ──────────────────────────────────────────────────────────────

/**
 * Titulo de seccion dentro de AdminPage (h2 por defecto).
 * Escala xl, bold.
 */
export const SectionTitleDefault: Story = {
  render: () => <SectionTitle>Resumen del mes</SectionTitle>,
  name: "SectionTitle (h2)",
};

// ── CardTitle ─────────────────────────────────────────────────────────────────

/**
 * Titulo de tarjeta o bloque (h3 por defecto).
 * Escala base, semibold. Usar dentro de ChartWrapper o paneles.
 */
export const CardTitleDefault: Story = {
  render: () => <CardTitle>Ventas por categoria</CardTitle>,
  name: "CardTitle (h3)",
};

// ── BodyText ──────────────────────────────────────────────────────────────────

/**
 * Texto de cuerpo para parrafos y descripciones (p por defecto).
 * Escala sm, leading-normal.
 */
export const BodyTextDefault: Story = {
  render: () => (
    <BodyText>
      La bodega ofrece delivery a domicilio en Pucallpa. Pedidos antes de las 6pm llegan el mismo dia.
      Aceptamos Yape y efectivo.
    </BodyText>
  ),
  name: "BodyText (p)",
};

// ── Caption ───────────────────────────────────────────────────────────────────

/**
 * Texto pequeño secundario: timestamps, notas al pie, metadata (span por defecto).
 * Escala xs, color secondary.
 */
export const CaptionDefault: Story = {
  render: () => <Caption>Actualizado hace 5 minutos</Caption>,
  name: "Caption (span)",
};

// ── Label ─────────────────────────────────────────────────────────────────────

/**
 * Etiqueta de campo de formulario o metrica (label por defecto).
 * Escala xs, uppercase, tracking wider, color tertiary.
 * En formularios: asociar htmlFor al input correspondiente.
 */
export const LabelDefault: Story = {
  render: () => <Label as="label" {...({ htmlFor: "precio-field" } as React.LabelHTMLAttributes<HTMLLabelElement>)}>Precio de venta</Label>,
  name: "Label (label)",
};

// ── Kicker ────────────────────────────────────────────────────────────────────

/**
 * Mini-label categorico sobre un titulo (span por defecto).
 * Escala 2xs, uppercase, semibold, color tertiary.
 * Tipico: "VENTAS / CLIENTES / PRODUCTOS" sobre un PageTitle.
 */
export const KickerDefault: Story = {
  render: () => <Kicker>Modulo de inventario</Kicker>,
  name: "Kicker (span)",
};

// ── Jerarquia completa ────────────────────────────────────────────────────────

/**
 * Todos los primitivos en su jerarquia tipica de una pagina admin.
 * Muestra la escala completa de mayor a menor importancia.
 */
export const FullHierarchy: Story = {
  render: () => (
    <div className="flex flex-col gap-3 max-w-lg">
      <Kicker>Modulo de finanzas</Kicker>
      <PageTitle>Reporte mensual</PageTitle>
      <SectionTitle>Ventas del periodo</SectionTitle>
      <CardTitle>Detalle por categoria</CardTitle>
      <BodyText>
        El total de ventas en mayo supera el mes anterior en un 12%. Las categorias con mayor crecimiento
        son abarrotes y lacteos.
      </BodyText>
      <Label>Nota del periodo</Label>
      <Caption>Generado el 09/05/2026 a las 14:32</Caption>
    </div>
  ),
  name: "Jerarquia completa",
  parameters: {
    docs: {
      description: {
        story:
          "Orden canonico de primitivos en una pagina admin: Kicker → PageTitle → SectionTitle → CardTitle → BodyText → Label → Caption.",
      },
    },
  },
};

// ── Override as ───────────────────────────────────────────────────────────────

/**
 * Todos los primitivos soportan prop `as` para override semantico
 * sin perder los estilos del design system.
 */
export const AsOverrideExamples: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <SectionTitle as="h3">SectionTitle renderizado como h3</SectionTitle>
      <CardTitle as="p">CardTitle renderizado como parrafo</CardTitle>
      <Caption as="p">Caption renderizado como p (en vez de span)</Caption>
      <Label as="span">Label renderizado como span (sin htmlFor)</Label>
    </div>
  ),
  name: "Override semantico (as prop)",
  parameters: {
    docs: {
      description: {
        story:
          "La prop `as` permite cambiar el elemento HTML sin perder estilos. Util en modales, listas, o estructuras donde el elemento por defecto rompe la semantica.",
      },
    },
  },
};
