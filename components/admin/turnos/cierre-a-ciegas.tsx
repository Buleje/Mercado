"use client";

/**
 * Cierre a ciegas en el navegador (ver `lib/pos/cierre-a-ciegas.ts`).
 *
 * `useCierreACiegas()` lo leen las pantallas de conteo (Turnos › Cerrar turno,
 * Caja › Contar, arqueos y cierre de caja): con `ciego` el cajero cuenta sin
 * ver lo esperado. Una sola petición por página (promesa compartida); el
 * interruptor de Configuración › Cobros la olvida al guardar.
 *
 * Si la lectura falla, `ciego` queda en `false`: es como estaba antes (y el
 * dueño y el admin lo ven siempre igual).
 */
import { useEffect, useState } from "react";
import { Toggle } from "@/components/admin/settings/campos";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";

type EstadoCiegas = { activo: boolean; ciego: boolean };

let pedido: Promise<EstadoCiegas> | null = null;

function pedirEstado(): Promise<EstadoCiegas> {
  pedido ??= fetch("/api/pos/cierre-a-ciegas")
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as Partial<EstadoCiegas>;
      return { activo: d.activo === true, ciego: d.ciego === true };
    })
    .catch((err) => {
      console.warn("[caja] cierre a ciegas", err);
      pedido = null;
      return { activo: false, ciego: false };
    });
  return pedido;
}

/** `null` mientras carga: las pantallas no muestran lo esperado hasta saberlo. */
export function useCierreACiegas(): { activo: boolean | null; ciego: boolean | null } {
  const [estado, setEstado] = useState<EstadoCiegas | null>(null);
  useEffect(() => {
    let vivo = true;
    void pedirEstado().then((e) => { if (vivo) setEstado(e); });
    return () => { vivo = false; };
  }, []);
  return { activo: estado?.activo ?? null, ciego: estado?.ciego ?? null };
}

/** Configuración › Cobros › Caja: se guarda al tocarlo (no espera la barra de cambios). */
export function InterruptorCierreACiegas() {
  const { activo } = useCierreACiegas();
  const [propio, setPropio] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const valor = propio ?? activo ?? false;

  async function cambiar(v: boolean) {
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/pos/cierre-a-ciegas", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ activo: v }),
      });
      if (!res.ok) {
        setAviso({ ok: false, texto: res.status === 403 ? "Sólo el dueño o un admin lo cambia." : `No se pudo guardar (error ${res.status}).` });
        return;
      }
      pedido = null;
      setPropio(v);
      setAviso({ ok: true, texto: v ? "Guardado: el cajero cuenta sin ver lo esperado." : "Guardado: el cajero vuelve a ver lo esperado." });
    } catch (err) {
      console.warn("[ajustes] cierre a ciegas", err);
      setAviso({ ok: false, texto: "Sin conexión: no se guardó." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-1">
      <Toggle
        enabled={valor}
        onChange={(v) => void cambiar(v)}
        disabled={guardando || activo === null}
        label="Cierre a ciegas"
        desc={
          <span className="inline-flex items-center gap-1">
            El cajero cuenta la caja sin ver lo esperado · se guarda al tocarlo
            <InfoTip
              title="Cierre a ciegas"
              what="Al contar la caja o cerrar el turno, el cajero y el encargado no ven cuánto debería haber: cuentan, confirman y recién ahí ven lo esperado y la diferencia."
              affects="El dueño y los admin lo ven siempre. Si el cajero corrige el conteo después de ver lo esperado, las dos cifras quedan en la nota del cierre. Caja › Hoy sigue mostrando el saldo del cajón."
              example="Sin ver los S/ 550 esperados, el cajero cuenta S/ 540 y confirma: recién ahí sale «faltan S/ 10»."
            />
          </span>
        }
      />
      {aviso && (
        <p role="status" className={aviso.ok ? "text-sm text-[var(--data-success-ink)]" : "text-sm text-[var(--data-error-ink)]"}>{aviso.texto}</p>
      )}
    </div>
  );
}
