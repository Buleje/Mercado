import { useState, useEffect, useRef } from "react";

interface UseOptimizedImageOptions {
  /**
   * Threshold for intersection observer (0-1)
   * @default 0.1
   */
  threshold?: number;

  /**
   * Root margin for intersection observer
   * @default "50px"
   */
  rootMargin?: string;

  /**
   * Whether to enable lazy loading
   * @default true
   */
  lazy?: boolean;

  /**
   * Placeholder to show while loading
   */
  placeholder?: string;

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

interface UseOptimizedImageReturn {
  /**
   * Ref to attach to the image element
   */
  ref: React.RefObject<HTMLImageElement | null>;

  /**
   * Whether the image is currently loading
   */
  isLoading: boolean;

  /**
   * Whether the image has loaded successfully
   */
  isLoaded: boolean;

  /**
   * Whether an error occurred while loading
   */
  hasError: boolean;

  /**
   * The actual source to use (placeholder or real image)
   */
  src: string;
}

/**
 * Optimizes image loading with intersection observer and lazy loading
 * @param imageSrc Source URL of the image
 * @param options Configuration options
 * @returns Image loading state and utilities
 *
 * @example
 * ```tsx
 * const { ref, isLoaded, src } = useOptimizedImage("/product.jpg", {
 *   placeholder: PLACEHOLDERS.shimmerSquare,
 *   lazy: true,
 * });
 *
 * return <img ref={ref} src={src} className={isLoaded ? 'opacity-100' : 'opacity-0'} />;
 * ```
 */
export function useOptimizedImage(
  imageSrc: string,
  options: UseOptimizedImageOptions = {}
): UseOptimizedImageReturn {
  const {
    threshold = 0.1,
    rootMargin = "50px",
    lazy = true,
    placeholder,
    onLoadStart,
    onLoadEnd,
    onError,
  } = options;

  const ref = useRef<HTMLImageElement>(null);
  const [loadState, setLoadState] = useState<{
    isLoading: boolean;
    isLoaded: boolean;
    hasError: boolean;
  }>(() => ({
    isLoading: !lazy,
    isLoaded: false,
    hasError: false,
  }));
  const [shouldLoad, setShouldLoad] = useState(() => !lazy);

  // Intersection observer for lazy loading
  useEffect(() => {
    if (!lazy || !ref.current || shouldLoad) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShouldLoad(true);
            observer.disconnect();
          }
        });
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [lazy, threshold, rootMargin, shouldLoad]);

  // Load image when shouldLoad becomes true
  useEffect(() => {
    if (!shouldLoad || !imageSrc) return;

    onLoadStart?.();

    const img = new Image();

    img.onload = () => {
      setLoadState({
        isLoading: false,
        isLoaded: true,
        hasError: false,
      });
      onLoadEnd?.();
    };

    img.onerror = () => {
      setLoadState({
        isLoading: false,
        isLoaded: false,
        hasError: true,
      });
      onError?.(new Error(`Failed to load image: ${imageSrc}`));
    };

    img.src = imageSrc;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [shouldLoad, imageSrc, onLoadStart, onLoadEnd, onError]);

  // Determine which source to use
  const src = shouldLoad && !loadState.hasError ? imageSrc : (placeholder ?? imageSrc);

  return {
    ref,
    isLoading: loadState.isLoading,
    isLoaded: loadState.isLoaded,
    hasError: loadState.hasError,
    src,
  };
}

/**
 * Preloads a set of images in the background
 * Useful for product galleries, carousels, etc.
 *
 * @param urls Array of image URLs to preload
 * @param priority Priority order (true = high priority, load immediately)
 *
 * @example
 * ```tsx
 * usePreloadImages(["/hero.jpg", "/product1.jpg"], true);
 * ```
 */
export function usePreloadImages(urls: string[], priority: boolean = false): void {
  useEffect(() => {
    if (!urls || urls.length === 0) return;

    // Use requestIdleCallback for low-priority preloading
    const preload = () => {
      urls.forEach((url) => {
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "image";
        link.href = url;
        document.head.appendChild(link);
      });
    };

    if (priority || !("requestIdleCallback" in window)) {
      preload();
    } else {
      requestIdleCallback(preload);
    }
  }, [urls, priority]);
}

/**
 * Detects if user prefers reduced motion
 * Useful for disabling image transitions for accessibility
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const listener = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  return prefersReducedMotion;
}
