import { BLOQUES_POR_TIPO } from "./registro-bloques";

export interface BloqueARenderizar {
  id?: string;
  type: string;
  order: number;
  visible: boolean;
  props?: unknown;
  styles?: unknown;
}

/**
 * Dibuja los bloques de una página: sólo los visibles, por `order`. Un tipo sin
 * componente registrado se omite (no tumba la página). Sin estado ni datos
 * propios: sirve igual en `/cms/<slug>` y en la portada del negocio.
 */
export default function RenderBloques({ bloques }: { bloques: ReadonlyArray<BloqueARenderizar> }) {
  const visibles = bloques.filter((b) => b.visible).sort((a, b) => a.order - b.order);
  return (
    <>
      {visibles.map((bloque, i) => {
        const Bloque = BLOQUES_POR_TIPO[bloque.type];
        if (!Bloque) {
          if (process.env.NODE_ENV === "development") {
            console.warn(`[RenderBloques] Tipo de bloque "${bloque.type}" sin componente registrado`);
          }
          return null;
        }
        return (
          <Bloque
            key={bloque.id ?? `${bloque.type}-${i}`}
            {...(bloque.props as Record<string, unknown> | undefined)}
            style={bloque.styles ?? undefined}
          />
        );
      })}
    </>
  );
}
