"use client";

import { useState, useEffect, useRef, startTransition } from "react";
import Image from "next/image";
import { ShoppingBag, X } from "lucide-react";
import { products } from "@/data/products";
import { cn } from "@/lib/utils";

const NAMES = [
  "María", "Carlos", "Ana", "José", "Lucía", "Pedro", "Rosa",
  "Juan", "Carmen", "Luis", "Elena", "Miguel", "Diana", "Roberto",
  "Patricia", "Fernando", "Silvia", "Andrés", "Teresa", "Ricardo",
];
const ZONES = [
  "Callería", "Yarinacocha", "Manantay", "Campo Verde",
  "San Fernando", "9 de Octubre", "Las Palmeras",
];
const MINUTES_AGO = [2, 3, 5, 7, 10, 12, 15, 18, 20, 25];

type Notification = {
  id: number;
  name: string;
  zone: string;
  product: typeof products[number];
  minutesAgo: number;
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateNotification(id: number): Notification {
  return {
    id,
    name: pickRandom(NAMES),
    zone: pickRandom(ZONES),
    product: pickRandom(products),
    minutesAgo: pickRandom(MINUTES_AGO),
  };
}

export default function SocialProofToast() {
  const [notification, setNotification] = useState<Notification | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const counterRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Don't show on first 10s of page load to avoid being annoying
    const initialDelay = setTimeout(() => {
      const show = () => {
        counterRef.current += 1;
        startTransition(() => {
          setNotification(generateNotification(counterRef.current));
          setVisible(true);
          setDismissed(false);
        });
        // Auto-hide after 5s
        timerRef.current = setTimeout(() => {
          setVisible(false);
        }, 5000);
      };

      show();
      // Show every 25-40s
      const interval = setInterval(() => {
        show();
      }, 25000 + Math.random() * 15000);

      return () => clearInterval(interval);
    }, 10000);

    return () => {
      clearTimeout(initialDelay);
      clearTimeout(timerRef.current!);
    };
  }, []);

  if (!notification || dismissed) return null;

  return (
    <div
      className={cn(
        "fixed bottom-20 sm:bottom-6 left-4 z-40 max-w-xs transition-all duration-500 pointer-events-auto",
        visible
          ? "opacity-100 translate-y-0 translate-x-0"
          : "opacity-0 translate-y-4 -translate-x-4"
      )}
    >
      <div className="bg-white dark:bg-card rounded-2xl shadow-2xl border border-gray-100 dark:border-card-border overflow-hidden">
        <div className="flex items-start gap-3 p-3">
          {/* Product image */}
          <div className="relative h-14 w-14 rounded-xl overflow-hidden bg-gray-50 shrink-0 border border-gray-100">
            {notification.product.image ? (
              <Image
                src={notification.product.image}
                alt={notification.product.name}
                fill
                className="object-cover"
                sizes="56px"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-gray-300">
                <ShoppingBag className="h-6 w-6" />
              </div>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0 pr-5">
            <p className="text-xs text-foreground leading-snug">
              <strong className="font-bold">{notification.name}</strong> de{" "}
              <span className="text-primary font-semibold">{notification.zone}</span>{" "}
              compró
            </p>
            <p className="text-sm font-bold text-foreground truncate mt-0.5">
              {notification.product.name}
            </p>
            <p className="text-[10px] text-muted mt-0.5">
              hace {notification.minutesAgo} minutos
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={() => setDismissed(true)}
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-surface transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5 text-muted" />
          </button>
        </div>

        {/* Bottom accent bar */}
        <div className="h-1" style={{ background: "linear-gradient(90deg, #2d6a4f, #f4a261)" }} />
      </div>
    </div>
  );
}
