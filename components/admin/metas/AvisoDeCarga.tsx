"use client";

/**
 * Lo que dice una vista de Metas y logros cuando su dato no llegó.
 *
 * - Error de red o del servidor → la línea en rojo + «Reintentar».
 * - 403 (cajero, almacenero) → una línea neutra, sin «Reintentar»: reintentar
 *   nunca lo arregla (antes el botón quedaba ofreciéndose para siempre).
 */
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { TEXTO_TONO } from "@/components/admin/metas/clases-meta";
import { cn } from "@/lib/utils";

interface Props {
  error: string | null;
  sinPermiso: boolean;
  onReintentar: () => void;
  /** Lo que el rol no ve, en minúscula: «lo vendido por hora», «los logros». */
  que: string;
}

export function AvisoDeCarga({ error, sinPermiso, onReintentar, que }: Props) {
  if (sinPermiso) {
    return (
      <p
        role="status"
        className={cn("flex flex-wrap items-center gap-1 text-sm", TEXTO_TONO.neutro)}
      >
        Tu rol no ve {que}.
        <InfoTip
          title="Por qué no lo ves"
          what="Son cifras de plata del negocio: las ven el dueño, el administrador, el encargado y el analista."
          affects="Tus metas siguen a la vista; sólo se ocultan las cifras."
          example="Si las necesitas, pídele al dueño que te cambie de rol y vuelve a entrar."
        />
      </p>
    );
  }
  if (!error) return null;
  return (
    <p role="alert" className={cn("flex flex-wrap items-center gap-2 text-sm", TEXTO_TONO.error)}>
      {error}
      <button type="button" className="min-h-10 font-semibold underline" onClick={onReintentar}>
        Reintentar
      </button>
    </p>
  );
}
