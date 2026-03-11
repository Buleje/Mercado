// ═══════════════════════════════════════════════════════
// BLOCK REGISTRY - Component Registration System
// ═══════════════════════════════════════════════════════

import type { BlockDefinition } from "./types";

// Registry map: type => component
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const BLOCK_REGISTRY: Record<string, React.ComponentType<any>> = {};

// Metadata map: type => definition
export const BLOCK_METADATA: Record<string, BlockDefinition> = {};

/**
 * Register a new block component
 */
export function registerBlock(
  type: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.ComponentType<any>,
  metadata: Omit<BlockDefinition, "type">
) {
  BLOCK_REGISTRY[type] = component;
  BLOCK_METADATA[type] = { type, ...metadata };
}

/**
 * Get component for block type
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBlockComponent(type: string): React.ComponentType<any> | null {
  return BLOCK_REGISTRY[type] || null;
}

/**
 * Get metadata for block type
 */
export function getBlockMetadata(type: string): BlockDefinition | null {
  return BLOCK_METADATA[type] || null;
}

/**
 * Get all registered blocks
 */
export function getAllBlocks(): BlockDefinition[] {
  return Object.values(BLOCK_METADATA);
}

/**
 * Get blocks by category
 */
export function getBlocksByCategory(category: string): BlockDefinition[] {
  return Object.values(BLOCK_METADATA).filter(
    (block) => block.category === category
  );
}
