"use client";

/**
 * IntegrationDiagram — Diagrama SVG custom mostrando como las features
 * Buleje se conectan alrededor del carrito del cliente.
 *
 * Central: "Tu carrito" (node grande).
 * Alrededor: 6 nodes conectados:
 *   - Asistente (responde dudas)
 *   - Comparar (antes de comprar)
 *   - Bodega al Mes (recurrente)
 *   - Socio (beneficios)
 *   - Gift Cards (regalar)
 *   - Seguimiento (post-compra)
 *
 * Stroke animations: dashed pulsing. Colores tokens.
 *
 * Responsive: 1 columna SVG centrado. En mobile, el viewBox
 * encoge proporcionalmente (no se oculta).
 */

import {
  SectionTitle,
  BodyText,
} from "@buleje/design-system";

type Node = {
  id: string;
  label: string;
  sublabel: string;
  x: number;
  y: number;
};

// Radios del circulo de nodos alrededor del centro (200, 200)
const NODES: Node[] = [
  // Top
  { id: "asistente", label: "Asistente", sublabel: "Resuelve dudas", x: 200, y: 50 },
  // Top-right
  { id: "comparar", label: "Comparar", sublabel: "Antes de comprar", x: 335, y: 115 },
  // Bottom-right
  { id: "seguimiento", label: "Seguimiento", sublabel: "Post-compra", x: 335, y: 285 },
  // Bottom
  { id: "bodega-mes", label: "Bodega al Mes", sublabel: "Recurrente", x: 200, y: 350 },
  // Bottom-left
  { id: "socio", label: "Socio", sublabel: "Beneficios", x: 65, y: 285 },
  // Top-left
  { id: "gift-cards", label: "Gift Cards", sublabel: "Regalar", x: 65, y: 115 },
];

const CENTER = { x: 200, y: 200 };

export function IntegrationDiagram() {
  return (
    <section className="border-b border-[var(--rule-base)] bg-[var(--surface-canvas)] py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <header className="max-w-2xl space-y-3 mb-10 sm:mb-14 mx-auto text-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
            Cómo se integra todo
          </span>
          <SectionTitle className="text-[length:var(--ts-2xl)] sm:text-[length:var(--ts-3xl)] font-extrabold">
            Todo conectado alrededor de tu carrito
          </SectionTitle>
          <BodyText className="text-[length:var(--ts-base)] text-[var(--text-secondary)] leading-relaxed">
            Cada feature es una pieza del mismo engranaje. Compras,
            consultás, ahorrás y recibís — sin cambiar de app.
          </BodyText>
        </header>

        <div className="flex justify-center">
          <svg
            viewBox="0 0 400 400"
            className="w-full max-w-[520px] text-[var(--text-primary)]"
            role="img"
            aria-label="Diagrama de integración: tu carrito al centro conectado con Asistente, Comparar, Seguimiento, Bodega al Mes, Socio y Gift Cards"
          >
            {/* Dashed animated connections from center to each node */}
            <g
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              fill="none"
              opacity="0.5"
            >
              {NODES.map((node) => (
                <line
                  key={`line-${node.id}`}
                  x1={CENTER.x}
                  y1={CENTER.y}
                  x2={node.x}
                  y2={node.y}
                  strokeDasharray="4 4"
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="0"
                    to="8"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </line>
              ))}
            </g>

            {/* Outer orbit guide (muy sutil) */}
            <circle
              cx={CENTER.x}
              cy={CENTER.y}
              r="150"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              strokeDasharray="2 6"
              opacity="0.15"
            />

            {/* Center node: Tu carrito */}
            <g>
              <circle
                cx={CENTER.x}
                cy={CENTER.y}
                r="54"
                fill="var(--text-primary)"
                stroke="var(--text-primary)"
                strokeWidth="1"
              />
              <text
                x={CENTER.x}
                y={CENTER.y - 6}
                textAnchor="middle"
                fill="var(--surface-canvas)"
                fontSize="12"
                fontWeight="700"
                letterSpacing="0.05em"
              >
                TU CARRITO
              </text>
              <text
                x={CENTER.x}
                y={CENTER.y + 12}
                textAnchor="middle"
                fill="var(--surface-canvas)"
                fontSize="10"
                opacity="0.85"
              >
                Centro de todo
              </text>

              {/* Pulse ring */}
              <circle
                cx={CENTER.x}
                cy={CENTER.y}
                r="54"
                fill="none"
                stroke="var(--text-primary)"
                strokeWidth="1"
                opacity="0.35"
              >
                <animate
                  attributeName="r"
                  from="54"
                  to="70"
                  dur="2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  from="0.35"
                  to="0"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>

            {/* Satellite nodes */}
            {NODES.map((node) => (
              <g key={node.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="38"
                  fill="var(--surface-raised)"
                  stroke="var(--rule-base)"
                  strokeWidth="1"
                />
                <text
                  x={node.x}
                  y={node.y - 2}
                  textAnchor="middle"
                  fill="var(--text-primary)"
                  fontSize="10"
                  fontWeight="700"
                >
                  {node.label}
                </text>
                <text
                  x={node.x}
                  y={node.y + 11}
                  textAnchor="middle"
                  fill="var(--text-tertiary)"
                  fontSize="8"
                >
                  {node.sublabel}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </section>
  );
}

export default IntegrationDiagram;
