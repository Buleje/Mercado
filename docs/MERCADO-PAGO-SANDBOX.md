# Guía: Mercado Pago Sandbox (Pruebas)

## ¿Qué es el Sandbox?

El sandbox es un **entorno de pruebas** de Mercado Pago donde puedes simular pagos sin usar dinero real. Es como un "modo práctica" para verificar que todo funcione antes de activar pagos reales.

---

## Paso 1: Crear cuenta de desarrollador

1. Ve a [https://www.mercadopago.com.pe/developers](https://www.mercadopago.com.pe/developers)
2. Inicia sesión con tu cuenta de Mercado Pago (o crea una)
3. Ve a **Tus integraciones** → **Crear aplicación**
4. Nombra la app: `Buleje - Pruebas`
5. Selecciona **Pagos online** como producto a integrar

## Paso 2: Obtener credenciales de prueba

1. En tu aplicación, ve a **Credenciales de prueba** (sidebar izquierdo)
2. Copia estas dos claves:
   - **Access Token (de prueba)**: empieza con `APP_USR-` y es largo
   - **Public Key (de prueba)**: también empieza con `APP_USR-`

> ⚠️ **IMPORTANTE**: Las credenciales de prueba son DIFERENTES a las de producción. Asegúrate de copiar las de la pestaña "Prueba", no las de "Producción".

## Paso 3: Configurar en el proyecto

En tu archivo `.env` (o `.env.local`), agrega:

```env
# Modo sandbox (pruebas)
MERCADOPAGO_ACCESS_TOKEN="APP_USR-tu-access-token-de-pruebas"
MERCADOPAGO_PUBLIC_KEY="APP_USR-tu-public-key-de-pruebas"
MERCADOPAGO_WEBHOOK_SECRET="tu-webhook-secret-de-pruebas"
```

## Paso 4: Crear usuarios de prueba

Mercado Pago necesita **usuarios de prueba** para simular compras:

1. Ve a **Credenciales de prueba** → sección **Cuentas de prueba**
2. Crea 2 usuarios:
   - **Comprador**: simula al cliente que paga
   - **Vendedor**: simula a la bodega que recibe el pago
3. Anota el email y contraseña de cada uno

## Paso 5: Probar un pago

1. Inicia tu servidor local: `npm run dev`
2. Ve al marketplace y agrega productos al carrito
3. En el checkout, selecciona **Mercado Pago** como método de pago
4. Serás redirigido a la página de pago de MP
5. Inicia sesión con el **usuario comprador de prueba**
6. Usa estas tarjetas de prueba:

### Tarjetas de prueba (Perú)

| Resultado | Número de tarjeta | CVV | Vencimiento |
|-----------|-------------------|-----|-------------|
| ✅ Aprobado | 5031 7557 3453 0604 | 123 | 11/25 |
| ❌ Rechazado | 5031 7557 3453 0604 | 123 | 11/25 (usa DNI: 12345678) |
| ⏳ Pendiente | 5031 7557 3453 0604 | 123 | 11/25 (usa DNI: 11111111) |

> **DNI del comprador de prueba**: Usa cualquier número de 8 dígitos (ej: `12345678`)

## Paso 6: Verificar el webhook

Para probar que los webhooks funcionen localmente:

1. Instala [ngrok](https://ngrok.com/) o usa el servicio similar de tu preferencia
2. Ejecuta: `ngrok http 3000`
3. Copia la URL pública (ej: `https://abc123.ngrok.io`)
4. En tu app de MP developers, ve a **Webhooks** → configura:
   - URL: `https://abc123.ngrok.io/api/marketplace/payment/mercadopago/webhook`
   - Eventos: `payment`
5. Haz un pago de prueba y verifica que el webhook llegue

## Paso 7: Pasar a producción

Cuando todo funcione bien en sandbox:

1. En MP developers, ve a **Credenciales de producción**
2. Reemplaza las credenciales en `.env` con las de producción
3. Configura el webhook con tu URL real de producción
4. ¡Listo! Ya recibes pagos reales

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| "Access token inválido" | Verifica que usas las credenciales de **prueba**, no las de producción |
| Webhook no llega | Verifica que ngrok esté corriendo y la URL esté actualizada en MP |
| Pago siempre rechazado | Usa el usuario comprador de prueba, no tu cuenta real |
| Error 500 en create-preference | Revisa que `MERCADOPAGO_ACCESS_TOKEN` no esté vacío |

---

## Archivos relevantes en el proyecto

| Archivo | Qué hace |
|---------|----------|
| `lib/mercadopago.ts` | Cliente MP (singleton con access token) |
| `app/api/marketplace/payment/mercadopago/create-preference/route.ts` | Crea la preferencia de pago (checkout link) |
| `app/api/marketplace/payment/mercadopago/webhook/route.ts` | Recibe el webhook cuando MP confirma el pago |
| `.env.example` | Plantilla de variables de entorno (líneas 172-176) |
