"use client";

/**
 * IllustrationsGallery — galería de las 33 ilustraciones + 3 logos del proyecto.
 *
 * Agrupada por tipo:
 *   - Logos (BulejeMark, BulejeWordmark, BulejeLogo)
 *   - Empty states (10)
 *   - Success moments (6)
 *   - Contextual (4)
 *   - Categorías (5)
 *   - Pucallpa locals (10)
 *   - Feature identity (8)
 *
 * Click en una card → copia `import { Foo } from "@/components/ui-system/illustrations"`.
 * Feedback visual con check icon.
 */

import { useMemo, useState, type ComponentType } from "react";
import { SectionTitle, Caption, Kicker } from "@buleje/design-system";
import { Check, Copy, Palette } from "@buleje/design-system/icons";
import {
  // Logos
  BulejeMark,
  BulejeWordmark,
  // Empty states
  CanastaVacia,
  PedidoLlegando,
  LupaConfundida,
  CuadernoAbierto,
  OllaVacia,
  EstanteVacio,
  FrascoEstrellas,
  BalanzaVacia,
  MensajeronBuscando,
  ConexionCortada,
  // Success moments
  BodegueroCelebrando,
  CajaFeliz,
  SalamanderSaludando,
  TrofeoEvolving,
  PiscoBotella,
  CampanaRinging,
  // Contextual
  BodegaAbriendo,
  CorazonLatiendo,
  MotoRuta,
  BrujulaPerdida,
  // Categorías
  VerduraFresca,
  CarniceriaFresca,
  LacteosRefresh,
  BebidasVarias,
  LimpiezaDomicilio,
  // Pucallpa locals
  DoniaElena,
  MotorizadoUcayali,
  CuadernoFiadoReal,
  PaicheEnOlla,
  MalocaAtardecer,
  RioUcayali,
  SenioraShipiba,
  TallasDePalo,
  PiscoIncaKola,
  MapaUcayaliAutentico,
  // Feature identity
  GiftCardIlustrada,
  SocioCorona,
  VideoEnVivo,
  ComparandoTres,
  RepartidorMoto,
  CalendarioEntrega,
  AsistenteBuleje,
  SellerCentralBodega,
} from "@/components/ui-system/illustrations";

// Type genérico para las ilustraciones (todas aceptan size/strokeWidth)
type IlloComp = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

interface IlloEntry {
  name: string;
  Comp: IlloComp;
  context?: string;
}

interface IlloGroup {
  id: string;
  title: string;
  description: string;
  items: IlloEntry[];
}

const GROUPS: IlloGroup[] = [
  {
    id: "logos",
    title: "Logos Buleje",
    description: "Marca e identidad — mark, wordmark, combinado",
    items: [
      { name: "BulejeMark", Comp: BulejeMark, context: "Isotipo — sidebar + favicon" },
      { name: "BulejeWordmark", Comp: BulejeWordmark, context: "Wordmark horizontal" },
    ],
  },
  {
    id: "empty-states",
    title: "Empty states",
    description: "10 ilustraciones para pantallas vacías",
    items: [
      { name: "CanastaVacia", Comp: CanastaVacia, context: "Favoritos / carrito vacío" },
      { name: "PedidoLlegando", Comp: PedidoLlegando, context: "Sin pedidos" },
      { name: "LupaConfundida", Comp: LupaConfundida, context: "Búsqueda sin resultados" },
      { name: "CuadernoAbierto", Comp: CuadernoAbierto, context: "Sin fiados" },
      { name: "OllaVacia", Comp: OllaVacia, context: "Recetas vacío" },
      { name: "EstanteVacio", Comp: EstanteVacio, context: "Sin stock" },
      { name: "FrascoEstrellas", Comp: FrascoEstrellas, context: "Puntos en cero" },
      { name: "BalanzaVacia", Comp: BalanzaVacia, context: "Comparador vacío" },
      { name: "MensajeronBuscando", Comp: MensajeronBuscando, context: "Sin conexión" },
      { name: "ConexionCortada", Comp: ConexionCortada, context: "Error network" },
    ],
  },
  {
    id: "success",
    title: "Success moments",
    description: "6 celebraciones y milestones",
    items: [
      { name: "BodegueroCelebrando", Comp: BodegueroCelebrando, context: "Post-checkout, first sale" },
      { name: "CajaFeliz", Comp: CajaFeliz, context: "Order placed" },
      { name: "SalamanderSaludando", Comp: SalamanderSaludando, context: "Welcome modal (mascot)" },
      { name: "TrofeoEvolving", Comp: TrofeoEvolving, context: "Level up loyalty" },
      { name: "PiscoBotella", Comp: PiscoBotella, context: "Upgrade plan" },
      { name: "CampanaRinging", Comp: CampanaRinging, context: "Vendor first order" },
    ],
  },
  {
    id: "contextual",
    title: "Contextual",
    description: "4 ilustraciones de acciones y estados",
    items: [
      { name: "BodegaAbriendo", Comp: BodegaAbriendo, context: "Apply wizard step 1" },
      { name: "CorazonLatiendo", Comp: CorazonLatiendo, context: "Wishlist saved" },
      { name: "MotoRuta", Comp: MotoRuta, context: "Tracking page" },
      { name: "BrujulaPerdida", Comp: BrujulaPerdida, context: "404 not found" },
    ],
  },
  {
    id: "categorias",
    title: "Categorías",
    description: "5 ilustraciones de familia de productos",
    items: [
      { name: "VerduraFresca", Comp: VerduraFresca, context: "Verduras y frutas" },
      { name: "CarniceriaFresca", Comp: CarniceriaFresca, context: "Carnes" },
      { name: "LacteosRefresh", Comp: LacteosRefresh, context: "Lácteos" },
      { name: "BebidasVarias", Comp: BebidasVarias, context: "Bebidas" },
      { name: "LimpiezaDomicilio", Comp: LimpiezaDomicilio, context: "Limpieza del hogar" },
    ],
  },
  {
    id: "pucallpa",
    title: "Pucallpa locals",
    description: "10 ilustraciones amazónicas con identidad auténtica",
    items: [
      { name: "DoniaElena", Comp: DoniaElena, context: "Bodeguera amazónica" },
      { name: "MotorizadoUcayali", Comp: MotorizadoUcayali, context: "Mototaxi repartidor" },
      { name: "CuadernoFiadoReal", Comp: CuadernoFiadoReal, context: "Cuaderno de fiado" },
      { name: "PaicheEnOlla", Comp: PaicheEnOlla, context: "Gastronomía local" },
      { name: "MalocaAtardecer", Comp: MalocaAtardecer, context: "Cultura shipiba" },
      { name: "RioUcayali", Comp: RioUcayali, context: "Paisaje amazónico" },
      { name: "SenioraShipiba", Comp: SenioraShipiba, context: "Artesanía local" },
      { name: "TallasDePalo", Comp: TallasDePalo, context: "Tallas y artesanía" },
      { name: "PiscoIncaKola", Comp: PiscoIncaKola, context: "Bebidas emblemáticas" },
      { name: "MapaUcayaliAutentico", Comp: MapaUcayaliAutentico, context: "Mapa del departamento" },
    ],
  },
  {
    id: "feature-identity",
    title: "Feature identity",
    description: "8 ilustraciones específicas de features Ola 3+4",
    items: [
      { name: "GiftCardIlustrada", Comp: GiftCardIlustrada, context: "Gift cards hub" },
      { name: "SocioCorona", Comp: SocioCorona, context: "Socio Buleje membresía" },
      { name: "VideoEnVivo", Comp: VideoEnVivo, context: "Live streaming" },
      { name: "ComparandoTres", Comp: ComparandoTres, context: "Comparador de productos" },
      { name: "RepartidorMoto", Comp: RepartidorMoto, context: "Portal repartidor" },
      { name: "CalendarioEntrega", Comp: CalendarioEntrega, context: "Seguimiento de entrega" },
      { name: "AsistenteBuleje", Comp: AsistenteBuleje, context: "Asistente IA de compras" },
      { name: "SellerCentralBodega", Comp: SellerCentralBodega, context: "Dashboard vendor" },
    ],
  },
];

const IMPORT_PATH = "@/components/ui-system/illustrations";

export default function IllustrationsGallery() {
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const totalCount = useMemo(
    () => GROUPS.reduce((sum, g) => sum + g.items.length, 0),
    [],
  );

  const copyImport = async (name: string) => {
    const snippet = `import { ${name} } from "${IMPORT_PATH}";`;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedName(name);
      setTimeout(() => setCopiedName((current) => (current === name ? null : current)), 1500);
    } catch {
      // Silent fallback: clipboard can fail in insecure contexts.
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex items-end justify-between gap-3 pb-2 border-b border-[var(--rule-base)]">
        <div className="min-w-0">
          <Kicker>Design system</Kicker>
          <SectionTitle className="mt-0.5">Galería de ilustraciones</SectionTitle>
          <Caption className="block mt-1">
            {totalCount} piezas SVG · stroke 1.5 · currentColor · click para copiar el import.
          </Caption>
        </div>
        <span
          aria-hidden="true"
          className="hidden sm:inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
        >
          <Palette className="w-5 h-5" strokeWidth={1.75} />
        </span>
      </header>

      <div className="space-y-8">
        {GROUPS.map((group) => (
          <div key={group.id}>
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h3 className="text-sm font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">
                {group.title}
              </h3>
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] tabular-nums">
                {group.items.length} piezas
              </span>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">{group.description}</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
              {group.items.map(({ name, Comp, context }) => {
                const isCopied = copiedName === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => copyImport(name)}
                    aria-label={`Copiar import de ${name}`}
                    className="group relative flex flex-col items-center text-center bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3 hover:border-[var(--accent)]/40 hover:shadow-[var(--shadow-sm)] transition-all"
                  >
                    <div className="w-24 h-24 flex items-center justify-center text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                      <Comp size={96} strokeWidth={1.5} />
                    </div>
                    <div className="mt-2 w-full">
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {name}
                      </div>
                      {context && (
                        <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate mt-0.5">
                          {context}
                        </div>
                      )}
                    </div>
                    <span
                      className={[
                        "absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded-md transition-colors",
                        isCopied
                          ? "bg-[var(--data-success-500)] text-white"
                          : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] group-hover:bg-primary/10 group-hover:text-[var(--accent)]",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      {isCopied ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center font-mono">
        import {"{"} Nombre {"}"} from &quot;{IMPORT_PATH}&quot;;
      </p>
    </section>
  );
}
