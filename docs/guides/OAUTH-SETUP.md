# Habilitar login Google + Facebook (OAuth Supabase)

> Ola 7 · ADR OAuth Supabase. Tiempo estimado: 30 min si ya tenés cuentas Google Cloud y Facebook Developers; 45 min desde cero.

Esta guía configura el flujo B — OAuth via **Supabase Auth**. El flujo A (custom OAuth directo contra Google/FB) sigue funcionando en paralelo y puede seguir usándose si el usuario prefiere. Ver tabla comparativa al final.

---

## 0 · Resumen en 1 tabla

| Paso | Plataforma | Qué obtenés | Dónde lo pegás |
|---|---|---|---|
| 1 | Google Cloud Console | Client ID + Client Secret | Supabase Dashboard |
| 2 | Facebook Developers | App ID + App Secret | Supabase Dashboard |
| 3 | Supabase Dashboard | (activar providers) | — |
| 4 | `.env.local` / Vercel | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | El repo |
| 5 | `npm run dev` | Test manual de ambos flujos | — |

---

## Prerequisitos

- Cuenta en **Supabase Dashboard** — https://supabase.com (el user ya tiene una, se reutiliza)
- Cuenta en **Google Cloud Console** — https://console.cloud.google.com
- Cuenta en **Facebook Developers** — https://developers.facebook.com

Las 3 plataformas tienen tier gratuito suficiente para producción de una bodega con tráfico moderado.

---

## Paso 1 · Crear OAuth Client de Google

### 1.1 — Proyecto en Google Cloud

1. Entrá a https://console.cloud.google.com
2. Arriba-izquierda, dropdown de proyectos → **Nuevo Proyecto**
3. Nombre: `Buleje OAuth` (o lo que prefieras). Sin organización.
4. **Crear**.

### 1.2 — OAuth consent screen

1. Menú izquierdo → **APIs & Services** → **OAuth consent screen**
2. Tipo de usuario: **External** → **Create**
3. Campos obligatorios:
   - **App name:** Buleje
   - **User support email:** `tuemail@buleje.pe`
   - **App logo:** (opcional — se puede agregar después)
   - **App domain:**
     - Application home page: `https://buleje.pe`
     - Application privacy policy link: `https://buleje.pe/privacidad`
     - Application terms of service link: `https://buleje.pe/terminos`
   - **Authorized domains:** `buleje.pe` (enter)
   - **Developer contact information:** `tuemail@buleje.pe`
4. **Save and continue** en cada pantalla (Scopes / Test users / Summary).

> **Nota —** **Modo Testing vs Producción:** Cuando la app esté en Testing mode, solo los emails listados como "Test users" pueden hacer login. Para producción, pedí la verificación en Google (puede tardar días si pedís scopes sensibles). Para empezar usá Testing.

### 1.3 — Crear las credenciales

1. **Credentials** (menú izquierdo) → **Create Credentials** → **OAuth client ID**
2. Application type: **Web application**
3. Name: `Buleje — Supabase Auth`
4. **Authorized JavaScript origins:**
   - `http://localhost:3000`
   - `https://buleje.pe`
5. **Authorized redirect URIs** (este es el paso crítico):
   - `https://<tu-project-ref>.supabase.co/auth/v1/callback`
   - Reemplazá `<tu-project-ref>` con el subdomain real de tu proyecto Supabase (p. ej. `abcdefgh.supabase.co`).
6. **Create**.
7. Se abre un modal con **Client ID** y **Client Secret**. Copialos. También podés descargar el JSON.

---

## Paso 2 · Crear App de Facebook

### 2.1 — Crear la app

1. Entrá a https://developers.facebook.com
2. **My Apps** → **Create App**
3. Use case: **Authenticate and request data from users with Facebook Login** → **Next**
4. App type: **Consumer** → **Next**
5. Display name: `Buleje`. App contact email: el tuyo. **Create app**.

### 2.2 — Producto: Facebook Login

1. En el dashboard de la app, tarjeta **Facebook Login** → **Set up**
2. Plataforma → **Web**
3. Site URL: `https://buleje.pe` → **Save** → **Continue**

### 2.3 — Settings → Basic

1. Menú izquierdo → **App settings** → **Basic**
2. Campos:
   - **App domains:** `buleje.pe`
   - **Privacy Policy URL:** `https://buleje.pe/privacidad`
   - **Terms of Service URL:** `https://buleje.pe/terminos`
   - **User Data Deletion:** `https://buleje.pe/privacidad` (ó el endpoint específico si lo tenés)
   - **Category:** `Shopping`
3. Copiá arriba el **App ID** y **App Secret** (hacé click en **Show** para ver el secret).

### 2.4 — Facebook Login → Settings

1. Menú izquierdo → **Facebook Login** → **Settings**
2. **Valid OAuth Redirect URIs:**
   - `https://<tu-project-ref>.supabase.co/auth/v1/callback`
3. **Client OAuth Login:** ON
4. **Web OAuth Login:** ON
5. **Enforce HTTPS:** ON (recomendado)
6. **Save changes**

> **Nota —** **Facebook Development Mode:** Las apps nuevas arrancan en *Development* y solo los roles (Admin/Developer/Tester) pueden loguearse. Para publicar: **App Review** → **Request** → pedir el permiso `email` y el caso de uso *Facebook Login*. Mientras tanto, agregá tu propio user como Tester: **App Roles** → **Testers** → **Add Tester**.

---

## Paso 3 · Configurar Supabase Dashboard

### 3.1 — Activar providers

1. Entrá a tu proyecto en https://supabase.com/dashboard
2. Menú izquierdo → **Authentication** → **Providers**
3. **Google** → toggle **Enabled** ON
   - **Client ID (for OAuth):** pegá el del Paso 1
   - **Client Secret (for OAuth):** pegá el del Paso 1
   - **Skip nonce checks:** OFF
   - **Save**
4. **Facebook** → toggle **Enabled** ON
   - **Facebook client ID:** pegá el App ID del Paso 2
   - **Facebook secret:** pegá el App Secret del Paso 2
   - **Save**

### 3.2 — URL Configuration

1. **Authentication** → **URL Configuration**
2. **Site URL:**
   - Dev: `http://localhost:3000`
   - Prod: `https://buleje.pe`
3. **Redirect URLs (allow list):** agregá ambas (una por línea)
   - `http://localhost:3000/api/auth/oauth/callback`
   - `https://buleje.pe/api/auth/oauth/callback`
4. **Save**

### 3.3 — Copiar las API keys

1. **Project Settings** → **API**
2. Copiá:
   - **Project URL** → va a `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → va a `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** (secret!) → va a `SUPABASE_SERVICE_ROLE_KEY` (solo server)

---

## Paso 4 · Env vars del proyecto

### 4.1 — Local (`.env.local`)

Editá `bodega-san-martin/.env.local` y agregá / confirmá:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://<tu-project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key-del-dashboard>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key-del-dashboard>"
```

Reiniciá el dev server (`npm run dev`) para que Next cargue las nuevas vars.

### 4.2 — Producción (Vercel)

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

O desde el dashboard: https://vercel.com/<org>/buleje/settings/environment-variables

---

## Paso 5 · Test manual

### 5.1 — Dev local

1. `npm run dev`
2. Abrí http://localhost:3000/login (o abrí el `AuthModal` desde cualquier botón "Iniciar sesión")
3. Los botones OAuth deberían mostrar **"Continuar con Google"** y **"Continuar con Facebook"**.
   - Si muestran **"Próximamente"**, revisá que las env vars `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` estén seteadas y reiniciá el server.
4. Click en **Continuar con Google** → popup/redirect → acepta permisos → volvés a `/marketplace/explorar` con la cookie `sb-<project>-auth-token` seteada.
5. Repetí con Facebook.

### 5.2 — Verificar sesión

En DevTools → Application → Cookies → `localhost:3000`, deberías ver:

- `sb-<project>-auth-token` (Supabase Auth — nuevo flow)
- (opcional) `customer_session` si usaste el flow custom

Ambas pueden coexistir. El `customer-context` del front lee la que corresponda.

---

## 6 · Troubleshooting

| Error | Causa probable | Fix |
|---|---|---|
| "Redirect URI mismatch" (Google) | El redirect URI no coincide | Verificá en Google Cloud que sea **exactamente** `https://<project-ref>.supabase.co/auth/v1/callback` (sin trailing slash) |
| "URL Blocked" (Supabase) | Falta agregar la ruta al allow list | Supabase Dashboard → Authentication → URL Configuration → agregá `http://localhost:3000/api/auth/oauth/callback` |
| "App Not Set Up: This app is still in development mode" (Facebook) | App en development, user no es tester | Facebook Dev → App Roles → agregá tu user como Tester. Para producción, hacer App Review. |
| "Invalid API key" (runtime) | Env var mal copiada | Re-copiar desde Supabase Dashboard → API. Fijate que no haya espacios o quotes extra |
| Botón sigue mostrando "Próximamente" | Dev server no leyó las env vars | `Ctrl+C` + `npm run dev` para reiniciar (Next lee `.env.local` solo al arrancar) |
| `code` llega pero la sesión no queda | Cookies bloqueadas por dominio | Verificá que `Site URL` en Supabase = origin real. En Chrome DevTools → Application → Cookies, confirmá que `sb-*-auth-token` esté seteada |
| OAuth error genérico en consola | `exchangeCodeForSession` falló | Mirar el parámetro `?reason=...` en `/login?error=oauth_exchange_failed` para el mensaje exacto |

---

## 7 · Tabla comparativa — Ruta A vs Ruta B

| Aspecto | Ruta A — OAuth custom | Ruta B — OAuth Supabase |
|---|---|---|
| Archivos | `/api/auth/google` + `/api/auth/facebook` + `/lib/auth/oauth-*.ts` | `/api/auth/oauth/callback` + `/lib/supabase/*.ts` |
| Env vars | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Sesión | Cookie `customer_session` (JWT custom, `lib/auth/customer-session`) | Cookie `sb-<project>-auth-token` (Supabase SDK) |
| Gestión | Código propio | Supabase Dashboard (dashboard, stats, magic links) |
| Pros | Control total, ya integrado con `CustomersDB` | Menos código que mantener, soporta email magic links y otros providers gratis |
| Contras | Hay que mantener los flows a mano | Dependencia de Supabase Auth, sesión separada del `customer-context` existente |

Mientras estén las 2 rutas activas, el botón OAuth del `AuthModal` usa la **Ruta B** (nueva). Los viejos endpoints `/api/auth/google` y `/api/auth/facebook` quedan disponibles para flows legacy (links directos). En una ola futura se unificará.

---

## 8 · Próximos pasos (opcionales)

- **Magic link por email:** con las mismas credenciales de Supabase, activá `Email` provider en Dashboard → sirve para login sin password.
- **Apple Sign-In:** requiere cuenta Apple Developer (99 USD/año). Mismo flow, Supabase lo soporta out-of-the-box.
- **Cablear al `customer-context`:** el helper `lib/auth/sync-supabase-to-customer.ts` ya está listo para leer la sesión Supabase. Falta wiring al `contexts/cart-context.tsx` (zona peligrosa — ADR aparte).

---

Cualquier duda, ping al equipo — o abrí un issue en GitHub.
