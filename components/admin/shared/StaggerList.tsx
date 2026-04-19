"use client";

/**
 * StaggerList — lista con fade-in escalonado al montar.
 *
 * Las N filas aparecen una tras otra con 20ms de delay. Da sensación de
 * "fluye" en vez de "pop". Respeta prefers-reduced-motion.
 *
 * Uso:
 *   <StaggerList>
 *     {items.map((item) => (
 *       <div key={item.id}>{item.name}</div>
 *     ))}
 *   </StaggerList>
 */

import { Children, isValidElement, cloneElement, type ReactNode, type ReactElement } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  /** Delay entre items en ms. Default 20. */
  stagger?: number;
  /** Delay del primer item. Default 0. */
  initialDelay?: number;
  /** Duración del fade individual. Default 300. */
  duration?: number;
  className?: string;
}

export function StaggerList({
  children,
  stagger = 20,
  initialDelay = 0,
  duration = 300,
  className,
}: Props) {
  const array = Children.toArray(children).filter(isValidElement) as ReactElement<{
    style?: React.CSSProperties;
    className?: string;
  }>[];

  return (
    <div className={className}>
      {array.map((child, i) =>
        cloneElement(child, {
          key: child.key ?? i,
          style: {
            ...(child.props.style ?? {}),
            animation: `stagger-fade-in ${duration}ms ease-out ${initialDelay + i * stagger}ms both`,
          },
          className: cn("motion-safe-stagger", child.props.className),
        }),
      )}
      <style jsx global>{`
        @keyframes stagger-fade-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .motion-safe-stagger {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export default StaggerList;
