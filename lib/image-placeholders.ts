/**
 * Utility to generate low-quality image placeholders (LQIP) for blur effect
 * Uses a simple shimmer effect as fallback
 */

/**
 * Generate a tiny base64-encoded SVG shimmer placeholder
 * Perfect for blur placeholders on images
 */
export function generateShimmerPlaceholder(width: number = 400, height: number = 400): string {
  const shimmer = (w: number, h: number) => `
<svg width="${w}" height="${h}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="g">
      <stop stop-color="#f6f7f8" offset="20%" />
      <stop stop-color="#edeef1" offset="50%" />
      <stop stop-color="#f6f7f8" offset="70%" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#f6f7f8" />
  <rect id="r" width="${w}" height="${h}" fill="url(#g)" />
  <animate xlink:href="#r" attributeName="x" from="-${w}" to="${w}" dur="1s" repeatCount="indefinite"  />
</svg>`;

  const toBase64 = (str: string) =>
    typeof window === "undefined"
      ? Buffer.from(str).toString("base64")
      : window.btoa(str);

  return `data:image/svg+xml;base64,${toBase64(shimmer(width, height))}`;
}

/**
 * Generate a solid color placeholder
 * Useful for branded loading states
 */
export function generateColorPlaceholder(color: string = "#f0f0f0"): string {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='${encodeURIComponent(
    color
  )}'/%3E%3C/svg%3E`;
}

/**
 * Common product image placeholder with shopping bag icon
 */
export function productImagePlaceholder(): string {
  const svg = `
<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="400" fill="#f8f9fa"/>
  <g transform="translate(150, 150)">
    <path d="M20 14L10 24v40c0 4 2 6 6 6h68c4 0 6-2 6-6V24l-10-10H20z" 
          stroke="#2d6a4f" stroke-width="3" fill="#e9ecef" opacity="0.5"/>
    <path d="M10 24h80" stroke="#2d6a4f" stroke-width="3"/>
    <path d="M64 34c0 8-8 14-14 14s-14-6-14-14" 
          stroke="#2d6a4f" stroke-width="3" fill="none"/>
  </g>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Blur data URL for next/image placeholder prop
 */
export const BLUR_DATA_URL = generateShimmerPlaceholder();

/**
 * Product placeholder for missing images
 */
export const PRODUCT_PLACEHOLDER = productImagePlaceholder();

/**
 * Generate gradient placeholder for premium look
 */
export function generateGradientPlaceholder(
  colorStart: string = "#2d6a4f",
  colorEnd: string = "#40916c",
  width: number = 400,
  height: number = 400
): string {
  const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colorStart};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${colorEnd};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#grad)" />
</svg>`;

  const toBase64 = (str: string) =>
    typeof window === "undefined"
      ? Buffer.from(str).toString("base64")
      : window.btoa(str);

  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

/**
 * Common aspect ratios for placeholders
 */
export const ASPECT_RATIOS = {
  square: { w: 400, h: 400 },
  portrait: { w: 300, h: 400 },
  landscape: { w: 400, h: 300 },
  wide: { w: 600, h: 300 },
  ultraWide: { w: 800, h: 300 },
} as const;

/**
 * Pre-generated placeholders for common use cases (memoized)
 */
export const PLACEHOLDERS = {
  shimmerSquare: generateShimmerPlaceholder(400, 400),
  shimmerPortrait: generateShimmerPlaceholder(300, 400),
  shimmerLandscape: generateShimmerPlaceholder(400, 300),
  shimmerWide: generateShimmerPlaceholder(600, 300),
  productSquare: productImagePlaceholder(),
  gradientPrimary: generateGradientPlaceholder("#2d6a4f", "#40916c"),
  gradientSecondary: generateGradientPlaceholder("#f77f00", "#fcbf49"),
  gray: generateColorPlaceholder("#f3f4f6"),
  white: generateColorPlaceholder("#ffffff"),
} as const;

/**
 * Get optimized placeholder based on image dimensions
 * @param width Image width in pixels
 * @param height Image height in pixels
 * @param type Type of placeholder to generate
 */
export function getOptimizedPlaceholder(
  width: number,
  height: number,
  type: "shimmer" | "product" | "gradient" | "color" = "shimmer"
): string {
  // Use pre-generated placeholders for common sizes
  const aspectRatio = width / height;

  if (type === "shimmer") {
    if (Math.abs(aspectRatio - 1) < 0.1) return PLACEHOLDERS.shimmerSquare;
    if (aspectRatio < 1) return PLACEHOLDERS.shimmerPortrait;
    if (aspectRatio < 1.5) return PLACEHOLDERS.shimmerLandscape;
    return PLACEHOLDERS.shimmerWide;
  }

  if (type === "product") return PLACEHOLDERS.productSquare;
  if (type === "gradient") return PLACEHOLDERS.gradientPrimary;
  if (type === "color") return PLACEHOLDERS.gray;

  // Fallback to dynamic generation
  return generateShimmerPlaceholder(width, height);
}
