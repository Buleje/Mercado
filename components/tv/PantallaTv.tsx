"use client";

/**
 * Modo TV (pedido de Brandon 07-10: «ver mis cámaras… estilo duplicación de
 * pantalla; mi televisor es Smart TV»). El televisor abre `/tv` en su
 * navegador, sin login:
 *
 *  1. ¿Ya está vinculado? (cookie `buleje-tv`) → el mosaico de cámaras.
 *  2. Si no → un código de 6 letras y un QR; el dueño lo escribe en el panel
 *     (Cámaras → Ver en otra pantalla) y el TV pasa solo al mosaico.
 *
 * Siempre oscuro (un TV de noche en el aserradero), sin scroll, letra grande y
 * todo manejable con las flechas + OK del control remoto.
 */

import { Loader2, RefreshCw } from "@buleje/design-system/icons";
import { TV_API_TV } from "@/lib/camaras/pantallas-tv";
import { ApiCamarasProvider } from "@/components/admin/forestal/camaras/api-camaras";
import { cn } from "@/lib/utils";
import EmparejarTv from "./EmparejarTv";
import VinculadaTv from "./VinculadaTv";
import { BOTON_TV } from "./tv-estilos";
import { useCamarasTv } from "./use-sesion-tv";
import { useCursorQuieto, useNavegacionTv } from "./use-navegacion-tv";

export default function PantallaTv() {
  const s = useCamarasTv();
  const cursor = useCursorQuieto();

  return (
    <ApiCamarasProvider base={TV_API_TV}>
      <div
        className={cn(
          "dark fixed inset-0 overflow-hidden bg-[var(--surface-canvas)] text-[var(--text-primary)]",
          cursor.quieto && "cursor-none",
        )}
        onMouseMove={cursor.alMover}
        data-tv-fase={s.fase}
      >
        {s.fase === "cargando" && (
          <p className="flex h-full items-center justify-center gap-4 text-4xl text-[var(--text-secondary)]">
            <Loader2 className="h-12 w-12 animate-spin" aria-hidden /> Conectando…
          </p>
        )}
        {s.fase === "sin-vincular" && <EmparejarTv onVinculada={s.recargar} />}
        {s.fase === "error" && <SinConexion onReintentar={s.recargar} />}
        {s.fase === "vinculada" && <VinculadaTv pantalla={s.pantalla} camaras={s.camaras} onSalir={s.salir} />}
      </div>
    </ApiCamarasProvider>
  );
}

function SinConexion({ onReintentar }: { onReintentar: () => void }) {
  useNavegacionTv("error");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-[10vw] text-center">
      <p className="text-4xl font-bold">No hay conexión con el sistema.</p>
      <p className="text-2xl text-[var(--text-secondary)]">Revisa el internet del televisor. Sigo intentando cada minuto.</p>
      <button type="button" data-tv-foco onClick={onReintentar} className={BOTON_TV}>
        <RefreshCw className="h-7 w-7" aria-hidden /> Reintentar ahora
      </button>
    </div>
  );
}
