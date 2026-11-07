"use client";

/**
 * Configuración › Sistema › Colas (`?sub=colas`).
 *
 * Arriba el monitor de colas de trabajo (`ColasTab`, lo que abría
 * `?tab=colas`); abajo, plegados y recordados, los dos pedazos que vivían en
 * páginas sueltas del admin sin enlace desde el panel: los crons que fallaron
 * (`/admin/cron-dead-letters`) y los webhooks de Stripe por reintentar
 * (`/admin/webhook-queue`). Las páginas siguen abriendo; esto monta su mismo
 * contenido (plan «panel unificado», ola 2). Plegados no piden datos.
 *
 * Los webhooks de Stripe son de TODA la plataforma (la cola no tiene
 * `tenantId`): el bloque sólo aparece con sesión de superadmin confirmada por
 * el servidor. Un admin de un negocio no lo ve ni dispara su lectura.
 */
import dynamic from "next/dynamic";
import ColasTab from "@/components/admin/ColasTab";
import Plegable from "@/components/admin/shared/Plegable";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { useSesionPlataforma } from "./use-sesion-plataforma";

const CronFallidosBloque = dynamic(() => import("./CronFallidos"), { loading: S });
const WebhooksStripeBloque = dynamic(() => import("./WebhooksStripe"), { loading: S });

export default function ColasSistema() {
  const plataforma = useSesionPlataforma();
  return (
    <div className="space-y-6">
      <ColasTab />
      <Plegable
        clave="config:sistema:colas:crons"
        titulo="Crons que fallaron"
        resumen="Trabajos programados que agotaron sus reintentos"
      >
        <CronFallidosBloque />
      </Plegable>
      {plataforma === "si" ? (
        <Plegable
          clave="config:sistema:colas:webhooks"
          titulo="Webhooks de Stripe por reintentar"
          resumen="Avisos de pago que no se procesaron y vuelven a intentarse solos"
        >
          <WebhooksStripeBloque />
        </Plegable>
      ) : null}
    </div>
  );
}
