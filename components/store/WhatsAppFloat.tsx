"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

const DEFAULT_MESSAGE = "Hola, quiero hacer un pedido";

interface WhatsAppFloatProps {
  /** Numero de telefono con codigo de pais, sin '+'. Ej: '51916409675' */
  phone?: string;
  /** Mensaje pre-llenado al abrir el chat */
  message?: string;
}

export default function WhatsAppFloat({
  phone,
  message = DEFAULT_MESSAGE,
}: WhatsAppFloatProps) {
  const resolvedPhone =
    phone ??
    process.env.NEXT_PUBLIC_WHATSAPP_PHONE ??
    "51916409675";

  const url = `https://wa.me/${resolvedPhone}?text=${encodeURIComponent(message)}`;

  const [visible, setVisible]         = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);

  const lastScrollY  = useRef(0);
  const hideTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = useCallback(() => {
    const currentY = window.scrollY;
    const delta    = currentY - lastScrollY.current;

    // Hide on fast downward scroll (> 40px delta)
    if (delta > 40) {
      setVisible(false);

      if (hideTimer.current) clearTimeout(hideTimer.current);
      // Re-show after scrolling stops for 600ms
      hideTimer.current = setTimeout(() => setVisible(true), 600);
    } else if (delta < -10) {
      // Show on upward scroll
      setVisible(true);
    }

    lastScrollY.current = currentY;
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [handleScroll]);

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 transition-all duration-300",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none",
      )}
    >
      {/* tooltip */}
      {showTooltip && (
        <div
          role="tooltip"
          className={cn(
            "rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white shadow-lg",
            "dark:bg-gray-800",
            "whitespace-nowrap",
          )}
        >
          Pedir por WhatsApp
        </div>
      )}

      {/* button */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Pedir por WhatsApp"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        className={cn(
          "relative flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg",
          "hover:scale-110 active:scale-95 transition-transform duration-200",
          // pulse ring
          "before:absolute before:inset-0 before:rounded-full before:bg-[#25D366]",
          "before:animate-ping before:opacity-40",
        )}
      >
        {/* WhatsApp SVG */}
        <svg
          viewBox="0 0 32 32"
          fill="currentColor"
          className="relative z-10 h-7 w-7"
          aria-hidden="true"
        >
          <path d="M16.004 2.002c-7.731 0-14.002 6.271-14.002 14.002 0 2.468.655 4.876 1.898 6.993L2 30l7.193-1.883A13.94 13.94 0 0 0 16.004 30c7.731 0 14.002-6.271 14.002-14.002S23.735 2.002 16.004 2.002Zm0 25.62a11.56 11.56 0 0 1-5.903-1.616l-.424-.251-4.387 1.15 1.17-4.28-.276-.438a11.537 11.537 0 0 1-1.772-6.183c0-6.389 5.2-11.59 11.592-11.59 6.389 0 11.59 5.2 11.59 11.59 0 6.392-5.2 11.618-11.59 11.618Zm6.36-8.685c-.348-.175-2.062-1.018-2.382-1.134-.32-.116-.553-.175-.786.175-.233.348-.902 1.134-1.106 1.368-.204.233-.407.262-.756.087-.348-.175-1.47-.542-2.8-1.727-1.035-.923-1.734-2.063-1.937-2.41-.204-.349-.022-.537.153-.71.157-.157.348-.407.523-.612.175-.204.233-.348.348-.581.116-.233.058-.437-.029-.612-.087-.175-.786-1.895-1.077-2.594-.284-.681-.572-.59-.786-.6l-.67-.012c-.233 0-.612.087-.932.437-.32.349-1.222 1.194-1.222 2.912 0 1.718 1.251 3.378 1.426 3.611.175.233 2.462 3.757 5.963 5.267.834.36 1.484.574 1.991.735.837.265 1.598.228 2.2.138.671-.1 2.062-.843 2.353-1.657.29-.815.29-1.514.204-1.66-.087-.146-.32-.233-.67-.408Z" />
        </svg>
      </a>
    </div>
  );
}
