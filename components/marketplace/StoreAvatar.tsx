import Image from "next/image";

/**
 * StoreAvatar — muestra el LOGO de la tienda si existe; si no, la inicial del
 * nombre. Único lugar para la regla "logo primero, letra como fallback"
 * (Brandon 2026-07-04). Presentational — server-compatible.
 */
export function StoreAvatar({
  name,
  logo,
  size = 40,
  rounded = "rounded-lg",
  className = "",
}: {
  name: string;
  logo?: string | null;
  /** Lado en px (cuadrado). */
  size?: number;
  /** Clase de redondeo (rounded-lg, rounded-full, rounded-sm…). */
  rounded?: string;
  className?: string;
}) {
  const initial = (name?.trim().charAt(0) || "?").toUpperCase();

  if (logo) {
    return (
      <span
        className={`relative inline-block shrink-0 overflow-hidden border border-[var(--rule-base)] bg-[var(--surface-raised)] ${rounded} ${className}`}
        style={{ width: size, height: size }}
      >
        <Image
          src={logo}
          alt={name}
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center bg-[var(--surface-sunken)] font-bold uppercase text-[var(--text-secondary)] ${rounded} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initial}
    </span>
  );
}
