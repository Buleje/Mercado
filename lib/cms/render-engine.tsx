// ═══════════════════════════════════════════════════════
// RENDER ENGINE - Dynamic Page Renderer
// ═══════════════════════════════════════════════════════

import React from 'react';
import { getBlockComponent } from './block-registry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BLOCK_COMPONENTS = new Map<string, React.ComponentType<any>>();

export interface RenderBlock {
  id: string;
  type: string;
  order: number;
  visible: boolean;
  props: Record<string, any>;
  styles?: Record<string, any>;
  mobileProps?: Record<string, any>;
}

export interface RenderPageProps {
  blocks: RenderBlock[];
  isMobile?: boolean;
}

/**
 * Render a page from blocks array
 */
export function RenderPage({ blocks, isMobile = false }: RenderPageProps) {
  // Filter visible blocks and sort by order
  const visibleBlocks = blocks
    .filter((block) => block.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <>
      {visibleBlocks.map((block) => {
        const Component = getBlockComponent(block.type);

        if (!Component) {
          console.warn(`[RenderEngine] Block type "${block.type}" not registered`);
          return null;
        }

        // Use mobile props if available and on mobile
        const props = isMobile && block.mobileProps 
          ? { ...block.props, ...block.mobileProps }
          : block.props;

        return (
          <Component
            key={block.id}
            {...props}
            style={block.styles}
          />
        );
      })}
    </>
  );
}

/**
 * Render a single block
 */
export function RenderBlock({ block, isMobile = false }: { block: RenderBlock; isMobile?: boolean }) {
  const Resolved = BLOCK_COMPONENTS.get(block.type) ?? getBlockComponent(block.type);

  if (!Resolved) {
    console.warn(`[RenderEngine] Block type "${block.type}" not registered`);
    return null;
  }

  const props = isMobile && block.mobileProps
    ? { ...block.props, ...block.mobileProps }
    : block.props;

  return React.createElement(Resolved, { ...props, style: block.styles });
}
