"use client";

import { useOptimizedImage } from "@/hooks/use-optimized-image";
import { PLACEHOLDERS } from "@/lib/image-placeholders";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ProgressiveImageProps {
  /**
   * Source URL of the high-quality image
   */
  src: string;
  
  /**
   * Alternative text for accessibility
   */
  alt: string;
  
  /**
   * Low-quality placeholder (base64 or URL)
   * Defaults to shimmer effect
   */
  placeholder?: string;
  
  /**
   * Image width (for aspect ratio)
   */
  width?: number;
  
  /**
   * Image height (for aspect ratio)
   */
  height?: number;
  
  /**
   * Custom className for the container
   */
  className?: string;
  
  /**
   * Custom className for the image
   */
  imageClassName?: string;
  
  /**
   * Custom inline styles for the container
   */
  style?: React.CSSProperties;
  
  /**
   * Object-fit CSS property
   * @default "cover"
   */
  objectFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  
  /**
   * Whether to enable lazy loading
   * @default true
   */
  lazy?: boolean;
  
  /**
   * Blur intensity for LQIP effect (0-20)
   * @default 20
   */
  blurAmount?: number;
  
  /**
   * Callback when image starts loading
   */
  onLoadStart?: () => void;
  
  /**
   * Callback when image finishes loading
   */
  onLoadEnd?: () => void;
  
  /**
   * Callback when image fails to load
   */
  onError?: (error: Error) => void;
}

/**
 * Progressive Image component with LQIP (Low Quality Image Placeholder) blur-up effect
 * 
 * Displays a blurred placeholder that transitions smoothly to the high-quality image
 * Uses IntersectionObserver for lazy loading
 * 
 * @example
 * ```tsx
 * <ProgressiveImage
 *   src="/products/apple.jpg"
 *   alt="Fresh apple"
 *   placeholder={PLACEHOLDERS.shimmer}
 *   width={400}
 *   height={400}
 *   className="rounded-xl"
 * />
 * ```
 */
export function ProgressiveImage({
  src,
  alt,
  placeholder = PLACEHOLDERS.shimmerSquare,
  width,
  height,
  className,
  imageClassName,
  objectFit = "cover",
  lazy = true,
  blurAmount = 20,
  onLoadStart,
  onLoadEnd,
  onError,
}: ProgressiveImageProps) {
  const {
    ref,
    isLoading,
    isLoaded,
    hasError,
    src: currentSrc,
  } = useOptimizedImage(src, {
    lazy,
    placeholder,
    threshold: 0.1,
    rootMargin: "50px",
    onLoadStart,
    onLoadEnd,
    onError,
  });
  
  const [imageError, setImageError] = useState(false);
  
  const aspectRatio = width && height ? width / height : undefined;
  
  return (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden bg-gray-100 dark:bg-surface",
        className
      )}
      style={{
        aspectRatio: aspectRatio ? `${width} / ${height}` : undefined,
      }}
    >
      {/* Placeholder (blurred LQIP) */}
      {!isLoaded && (
        <img
          src={placeholder}
          alt=""
          className={cn(
            "absolute inset-0 w-full h-full",
            "transition-opacity duration-300",
            isLoading ? "opacity-100" : "opacity-0",
            imageClassName
          )}
          style={{
            objectFit,
            filter: `blur(${blurAmount}px)`,
            transform: "scale(1.1)", // Slight scale to hide blur edges
          }}
          aria-hidden="true"
        />
      )}
      
      {/* High-quality image */}
      <img
        src={currentSrc}
        alt={alt}
        className={cn(
          "absolute inset-0 w-full h-full",
          "transition-opacity duration-500",
          isLoaded ? "opacity-100" : "opacity-0",
          imageClassName
        )}
        style={{ objectFit }}
        onError={() => setImageError(true)}
        loading={lazy ? "lazy" : "eager"}
      />
      
      {/* Error state */}
      {(hasError || imageError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-surface">
          <div className="text-center text-gray-400 dark:text-muted">
            <svg
              className="mx-auto h-12 w-12 mb-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-xs">No se pudo cargar la imagen</p>
          </div>
        </div>
      )}
      
      {/* Loading indicator */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

/**
 * Progressive Image Grid component for displaying multiple images
 * Optimized for product galleries and image collections
 * 
 * @example
 * ```tsx
 * <ProgressiveImageGrid
 *   images={[
 *     { src: "/img1.jpg", alt: "Image 1" },
 *     { src: "/img2.jpg", alt: "Image 2" },
 *     { src: "/img3.jpg", alt: "Image 3" },
 *   ]}
 *   columns={3}
 *   gap={4}
 * />
 * ```
 */
export function ProgressiveImageGrid({
  images,
  columns = 3,
  gap = 4,
  aspectRatio = "1/1",
  className,
}: {
  images: Array<{
    src: string;
    alt: string;
    placeholder?: string;
  }>;
  columns?: number;
  gap?: number;
  aspectRatio?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid",
        className
      )}
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: `${gap * 0.25}rem`,
      }}
    >
      {images.map((image, index) => (
        <ProgressiveImage
          key={index}
          src={image.src}
          alt={image.alt}
          placeholder={image.placeholder}
          className="rounded-lg"
          style={{ aspectRatio }}
        />
      ))}
    </div>
  );
}

/**
 * Progressive Background Image component
 * For hero sections and full-width background images
 * 
 * @example
 * ```tsx
 * <ProgressiveBackgroundImage
 *   src="/hero.jpg"
 *   alt="Hero background"
 *   className="h-96"
 * >
 *   <h1>Welcome to our store</h1>
 * </ProgressiveBackgroundImage>
 * ```
 */
export function ProgressiveBackgroundImage({
  src,
  alt,
  placeholder,
  children,
  className,
  overlayClassName,
}: {
  src: string;
  alt: string;
  placeholder?: string;
  children?: React.ReactNode;
  className?: string;
  overlayClassName?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <ProgressiveImage
        src={src}
        alt={alt}
        placeholder={placeholder}
        className="absolute inset-0"
        objectFit="cover"
      />
      {children && (
        <div className={cn("relative z-10", overlayClassName)}>
          {children}
        </div>
      )}
    </div>
  );
}
