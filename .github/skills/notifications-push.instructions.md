---
applyTo: "**/push*,**/subscription*,**/notification*,**/vapid*"
---

# Push Notifications — Bodega San Martín

## Stack

- **Librería:** `web-push` (Node.js)
- **Modelo Prisma:** `PushSubscription` (por cliente/teléfono)
- **Variables de entorno requeridas:**
  ```bash
  NEXT_PUBLIC_VAPID_PUBLIC_KEY=BK...  # Clave pública VAPID
  VAPID_PRIVATE_KEY=...               # Clave privada VAPID (nunca en cliente)
  ```

## Modelo PushSubscription

```prisma
model PushSubscription {
  id        Int      @id @default(autoincrement())
  phone     String   // FK a Customer (phone es PK de Customer)
  endpoint  String
  p256dh    String
  auth      String
  tenantId  String   @default("main")
  createdAt DateTime @default(now())
}
```

## Enviar notificación push (server-side)

```typescript
import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:admin@bodegasanmartin.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

async function sendPushNotification(subscription: PushSubscription, payload: object) {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload)
    );
  } catch (err) {
    // 410 Gone = suscripción expirada, eliminar de la DB
    if ((err as { statusCode?: number }).statusCode === 410) {
      await prisma.pushSubscription.delete({ where: { id: subscription.id } });
    }
  }
}
```

## Payloads de notificación

```typescript
// Actualización de pedido:
{ title: "Tu pedido está listo 🛒", body: "Pedido #123 listo para entrega", url: "/pedido/123" }

// Promoción:
{ title: "Oferta especial 🎉", body: "20% de descuento en lácteos hoy", url: "/tienda" }

// Recordatorio de cumpleaños:
{ title: "¡Feliz cumpleaños! 🎂", body: "Tienes un cupón especial esperándote", url: "/mis-cupones" }
```

## Service Worker (public/sw.js)

```javascript
// Escucha eventos push y muestra notificaciones
self.addEventListener("push", (event) => {
  const data = event.data?.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      data: { url: data.url }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

## Suscribir cliente (front-end)

```typescript
const registration = await navigator.serviceWorker.register("/sw.js");
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
});
// POST /api/notifications/subscribe con { subscription, phone }
```

## Crons que usan push notifications

```
/api/birthday-coupons  (7am) → notifica clientes con cumpleaños hoy
/api/stock-alerts      (8am) → alerta admin sobre stock bajo
/api/daily-digest      (9pm) → resumen diario al admin
```

## Gotchas

- **VAPID_PRIVATE_KEY nunca en NEXT_PUBLIC_** — es secreta
- **410 Gone** — suscripción expirada; debe eliminarse de la DB o fallará siempre
- **Safari iOS** — requiere iOS 16.4+ para Web Push; versiones anteriores no soportan
- **Service worker scope** — registrar en `/` para que cubra toda la app
- **Permiso del usuario** — siempre solicitar permiso antes de suscribir; no hacerlo automáticamente

## Anti-patrones

- NO enviar push sin `await` en fire-and-forget → puede crashear funciones serverless
- NO guardar VAPID_PRIVATE_KEY en variables NEXT_PUBLIC_
- NO ignorar errores 410 → la DB se llenará de suscripciones inválidas
