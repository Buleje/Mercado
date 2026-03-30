# 🛒 Buleje - E-commerce Platform

Plataforma completa de e-commerce para abarrotes con delivery, construida con Next.js 16, React 19, Tailwind CSS 4, y Prisma + Supabase.

![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?logo=next.js)
![React](https://img.shields.io/badge/React-19.2.3-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4.0-38bdf8?logo=tailwind-css)
![Prisma](https://img.shields.io/badge/Prisma-7.4.2-2D3748?logo=prisma)

---

## ✨ Características Principales

### 🎯 **E-commerce Completo**
- **Catálogo de productos** con filtros dinámicos, búsqueda y ordenamiento
- **Carrito de compras** persistente con sincronización multi-tab (BroadcastChannel API)
- **Sistema de checkout** con múltiples métodos de pago (Yape, Efectivo)
- **Gestión de pedidos** con estados y historial completo
- **Sistema de cupones y promociones** con validación server-side
- **Productos favoritos** y comparación de productos
- **Vistas recientes** con tracking automático

### 📱 **PWA (Progressive Web App)**
- **Instalable** en dispositivos móviles y desktop
- **Funciona offline** con service worker y estrategias de caché inteligentes
- **Página de fallback** branded para cuando no hay conexión
- **Push notifications** ready (infraestructura lista)
- **Install prompt** personalizado con dismissal tracking

### 🎨 **UX/UI Premium**
- **Landing page** optimizada para conversión con CTAs estratégicos
- **Diseño responsive** mobile-first con Tailwind CSS 4
- **Dark mode** con persistencia y sincronización
- **Loading skeletons** consistentes para mejor percepción de performance
- **Exit intent modal** para recuperación de carritos abandonados
- **Animaciones fluidas** con Framer Motion
- **Sticky cart bar** para móviles

### 🔒 **Seguridad y Performance**
- **Rate limiting** en API endpoints críticos (orders, auth, contact)
- **Error Boundary** global para manejo de errores React
- **Headers de seguridad** (X-Frame-Options, CSP, etc.)
- **Validación Zod** en todos los endpoints API
- **Session management** seguro con JWT
- **Resource hints** (preconnect, dns-prefetch) para optimización 

### 📊 **Analytics y Tracking**
- **Google Analytics 4** con Enhanced E-commerce
- **Microsoft Clarity** para heatmaps y session replay
- **Google Tag Manager** ready
- **Tracking de eventos** type-safe personalizado
- **Conversión tracking** en todos los CTAs

### 🏗️ **Admin Dashboard**
- **Gestión de productos** CRUD completo
- **Gestión de pedidos** con estados y búsqueda
- **Gestión de clientes** y ubicaciones
- **Sistema de cupones** con expiración y límites
- **Analytics dashboard** con estadísticas en tiempo real
- **Gestión de usuarios admin** con roles
- **Activity logging** para auditoría

### 🔍 **SEO Optimizado**
- **Schema.org markup** (GroceryStore, Product, BreadcrumbList)
- **Open Graph** y Twitter Cards
- **Meta tags** optimizados para Pucallpa
- **Sitemap dinámico** con next-sitemap
- **Canonical URLs** y hreflang ready

---

## 🚀 Inicio Rápido

### Prerequisitos
- Node.js 20+ 
- PostgreSQL (o cuenta Supabase)
- npm, yarn, o pnpm

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/Buleje/Mercado.git
cd buleje

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales

# Generar cliente Prisma
npx prisma generate

# Ejecutar migraciones
npx prisma db push

# Seed inicial (opcional)
npm run seed

# Iniciar servidor de desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## 📦 Stack Tecnológico

### **Frontend**
- **Next.js 16.1.6** - App Router, Turbopack
- **React 19.2.3** - React Compiler
- **TypeScript 5.7** - Type safety
- **Tailwind CSS 4** - Utility-first CSS
- **Framer Motion** - Animaciones
- **Lucide React** - Iconos
- **React Hook Form + Zod** - Formularios y validación

### **Backend**
- **Next.js API Routes** - Serverless functions
- **Prisma 7.4.2** - ORM type-safe
- **Supabase PostgreSQL** - Base de datos
- **Nodemailer** - Emails transaccionales
- **bcryptjs** - Hashing de passwords
- **jose** - JWT tokens

### **State Management**
- **React Context API** - Estado global (Cart, Favorites, Theme, Settings)
- **localStorage** - Persistencia client-side
- **BroadcastChannel API** - Sincronización multi-tab

### **DevOps y Tooling**
- **Vercel** - Hosting y deployments
- **ESLint + Prettier** - Linting y formatting
- **Vitest** - Testing framework
- **next-sitemap** - Generación de sitemap
- **TypeScript** - Type checking

---

## 📁 Estructura del Proyecto

```
buleje/
├── app/                          # Next.js App Router
│   ├── (store)/                  # Grupo de rutas públicas
│   │   ├── page.tsx             # Landing page
│   │   ├── tienda/              # Catálogo completo
│   │   └── cuenta/              # Perfil de usuario
│   ├── admin/                    # Dashboard administrativo
│   ├── api/                      # API Routes
│   │   ├── orders/              # Gestión de pedidos
│   │   ├── products/            # CRUD productos
│   │   ├── auth/                # Autenticación
│   │   └── ...
│   ├── layout.tsx               # Root layout
│   ├── globals.css              # Estilos globales
│   └── manifest.ts              # PWA manifest
├── components/                   # Componentes React
│   ├── Header.tsx               # Navegación principal
│   ├── Hero.tsx                 # Landing hero
│   ├── ProductCatalog.tsx       # Catálogo principal
│   ├── CartSidebar.tsx          # Carrito lateral
│   ├── CheckoutModal.tsx        # Modal de checkout
│   ├── ErrorBoundary.tsx        # Error handling
│   ├── InstallPrompt.tsx        # PWA install
│   ├── LoadingSkeleton.tsx      # Skeletons
│   └── admin/                   # Componentes admin
├── contexts/                     # React Contexts
│   ├── cart-context.tsx         # Estado del carrito
│   ├── favorites-context.tsx    # Favoritos
│   ├── theme-context.tsx        # Dark mode
│   └── ...
├── lib/                          # Utilidades y lógica
│   ├── analytics.ts             # Tracking de eventos
│   ├── rate-limit.ts            # Rate limiting
│   ├── prisma.ts                # Cliente Prisma
│   ├── session.ts               # Auth sessions
│   ├── events.ts                # Event system
│   └── ...
├── data/                         # Data estática
│   └── products.ts              # Productos de ejemplo
├── prisma/                       # Prisma schema y migraciones
│   └── schema.prisma
├── public/                       # Assets estáticos
│   ├── sw.js                    # Service worker
│   └── offline.html             # Offline fallback
├── __tests__/                    # Tests unitarios
├── next.config.ts               # Configuración Next.js
├── tailwind.config.ts           # Configuración Tailwind
├── tsconfig.json                # Configuración TypeScript
└── package.json                 # Dependencies

```

---

## 🔧 Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Inicia servidor dev en localhost:3000 (Turbopack)

# Producción
npm run build            # Build optimizado + genera sitemap
npm start                # Inicia servidor producción

# Prisma
npx prisma generate      # Genera Prisma Client
npx prisma db push       # Sincroniza schema con Supabase
npx prisma studio        # Abre Prisma Studio (GUI)
npx prisma db seed       # Ejecuta seed (productos, usuarios)

# Calidad de código
npm run lint             # Ejecuta ESLint
npm run test             # Ejecuta tests con Vitest
```

---

## ⚙️ Configuración

### Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto con las siguientes variables:

```env
# Base de datos (Supabase PostgreSQL)
DATABASE_URL="postgresql://user:password@host:5432/database"

# Supabase (para cliente)
NEXT_PUBLIC_SUPABASE_URL="https://tu-proyecto.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="tu-publishable-key"

# Autenticación (JWT Secret - genera con: openssl rand -base64 32)
AUTH_SECRET="tu-secret-key-super-segura-minimo-32-caracteres"

# Email (SMTP - opcional para notificaciones)
SMTP_USER="tu-email@gmail.com"
SMTP_PASS="tu-app-password"
NOTIFY_EMAIL="notificaciones@buleje.com"

# Push Notifications (opcional - genera con web-push generate-vapid-keys)
VAPID_EMAIL="mailto:tu-email@buleje.com"
NEXT_PUBLIC_VAPID_PUBLIC_KEY="tu-vapid-public-key"
VAPID_PRIVATE_KEY="tu-vapid-private-key"

# WhatsApp API (opcional - para notificaciones automáticas)
WHATSAPP_API_URL="https://api.whatsapp.com/send"
WHATSAPP_API_TOKEN="tu-api-token"

# Analytics (opcional pero recomendado)
NEXT_PUBLIC_GA_MEASUREMENT_ID="G-XXXXXXXXXX"
NEXT_PUBLIC_GTM_ID="GTM-XXXXXX"
NEXT_PUBLIC_CLARITY_ID="tu-clarity-project-id"

# Base URL (para preview/production)
NEXT_PUBLIC_BASE_URL="http://localhost:3000"  # Cambiar en producción
```

### Configuración de Prisma

El proyecto usa **Prisma 7.4.2** con el adaptador de PostgreSQL para Supabase:

```bash
# 1. Configura DATABASE_URL en .env.local
# 2. Genera el cliente
npx prisma generate

# 3. Sincroniza schema
npx prisma db push

# 4. (Opcional) Carga datos de ejemplo
npx prisma db seed
```

### Schema Principal

```prisma
model Product {
  id          String   @id @default(cuid())
  name        String
  price       Float
  category    String
  image       String
  stock       Int      @default(0)
  createdAt   DateTime @default(now())
}

model Order {
  id          String   @id @default(cuid())
  customerName String
  products    Json
  total       Float
  status      String   @default("pending")
  createdAt   DateTime @default(now())
}
```

---

## 🚢 Deployment

### Despliegue en Vercel (Recomendado)

1. **Conecta el repositorio**:
   ```bash
   git remote add origin https://github.com/Buleje/Mercado.git
   git push -u origin master
   ```

2. **Importa en Vercel**:
   - Ve a [vercel.com](https://vercel.com) → "Import Project"
   - Conecta tu repo de GitHub
   - Selecciona "Buleje/Mercado"

3. **Configura variables de entorno**:
   - En Vercel Dashboard → Settings → Environment Variables
   - Agrega todas las variables de `.env.local`
   - **Críticas**: `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

4. **Deploy**:
   - Vercel detecta Next.js automáticamente
   - Build Command: `npm run build` (ya incluye sitemap)
   - Output Directory: `.next`
   - Node.js 20.x

5. **Post-deployment**:
   ```bash
   # Actualiza NEXT_PUBLIC_BASE_URL en variables de entorno
   NEXT_PUBLIC_BASE_URL="https://tu-dominio.vercel.app"
   
   # Sincroniza base de datos
   npx prisma db push
   
   # (Opcional) Carga productos
   npx prisma db seed
   ```

### Checklist Pre-Deploy

- ✅ Variables de entorno configuradas en Vercel
- ✅ `DATABASE_URL` apunta a Supabase production
- ✅ `AUTH_SECRET` es seguro (mínimo 32 caracteres)
- ✅ Analytics IDs configurados (GA4, GTM, Clarity)
- ✅ SMTP configurado para emails transaccionales
- ✅ Prisma schema sincronizado (`db push`)
- ✅ PWA icons generados (`/api/pwa-icon/[size]`)
- ✅ Service Worker activo (`/sw.js`)
- ✅ Sitemap generado (`/sitemap.xml`, `/robots.txt`)

### Dominios Personalizados

```bash
# En Vercel Dashboard → Settings → Domains
# Agrega: www.buleje.com

# Actualiza DNS:
# A Record: @ → 76.76.21.21
# CNAME: www → cname.vercel-dns.com
```

---

## 📡 API Endpoints

### Productos

```typescript
// GET /api/products - Lista todos los productos
// GET /api/products?category=bebidas - Filtrar por categoría
// POST /api/products - Crear producto (requiere admin)
// PUT /api/products/[id] - Actualizar producto (requiere admin)
// DELETE /api/products/[id] - Eliminar producto (requiere admin)
```

### Órdenes

```typescript
// POST /api/orders - Crear nueva orden
{
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  products: { id: string; quantity: number; price: number }[];
  total: number;
  paymentMethod: "yape" | "plin" | "efectivo";
}

// GET /api/orders - Listar órdenes (requiere admin)
// GET /api/orders/[id] - Detalle de orden
// PUT /api/orders/[id] - Actualizar estado (requiere admin)
```

### Autenticación

```typescript
// POST /api/auth/login - Login admin
{
  email: string;
  password: string;
}
// Response: { token: string; user: { id, email, name } }

// POST /api/auth/logout - Logout
// GET /api/auth/session - Obtener sesión actual
```

### Cupones

```typescript
// POST /api/coupons/validate - Validar cupón
{
  code: string;
  total: number;
}
// Response: { valid: boolean; discount: number; finalTotal: number }

// GET /api/coupons - Listar cupones (requiere admin)
// POST /api/coupons - Crear cupón (requiere admin)
```

### Push Notifications

```typescript
// POST /api/push/subscribe - Suscribir dispositivo
{
  subscription: PushSubscription;
}

// POST /api/push/send - Enviar notificación (requiere admin)
{
  title: string;
  body: string;
  icon?: string;
  badge?: string;
}
```

### Rate Limiting

Todos los endpoints tienen protección contra abuso:

- **Órdenes**: 5 solicitudes / 15 minutos (STRICT)
- **Auth**: 3 intentos / 1 hora (AUTH)
- **API General**: 50 solicitudes / 1 minuto (MODERATE)
- **Públicos**: 100 solicitudes / 1 minuto (GENEROUS)

---

## 🧪 Testing

```bash
# Ejecutar tests unitarios
npm run test

# Modo watch (desarrollo)
npm run test -- --watch

# Coverage
npm run test -- --coverage
```

### Tests Implementados

- ✅ `cart-context.test.tsx` - Context de carrito (add, remove, update, clear)
- ✅ `order-utils.test.ts` - Validación de órdenes, cálculo de totales
- ✅ `products-data.test.ts` - Estructura de productos, categorías
- ✅ `utils.test.ts` - Helpers (formato precios, validaciones)

---

## 🎨 Personalización

### Colores

Edita `app/globals.css`:

```css
@theme {
  --color-primary-50: #e7f5ec;
  --color-primary-100: #c3e6d0;
  --color-primary-500: #2d6a4f;  /* Color principal */
  --color-primary-900: #081c15;
}
```

### Información de Negocio

Edita `lib/constants.ts`:

```typescript
export const STORE_INFO = {
  name: "Buleje",
  phone: "+51 961 123 456",
  whatsapp: "+51961123456",
  address: "Jr. San Martín 123, Pucallpa",
  email: "contacto@buleje.com",
};
```

### Productos

Edita `data/products.ts` o administra via `/admin/productos`.

---

## 🤝 Contributing

### Workflow de Desarrollo

```bash
# 1. Crea una rama
git checkout -b feature/nueva-funcionalidad

# 2. Desarrolla y commitea
git add .
git commit -m "feat: descripción clara del cambio"

# 3. Push y PR
git push origin feature/nueva-funcionalidad
# Abre Pull Request en GitHub
```

### Convenciones de Código

- **TypeScript strict mode** activado
- **ESLint** + **Prettier** para formateo
- **Naming**: camelCase para variables, PascalCase para componentes
- **Imports**: Orden alfabético, React primero
- **Components**: Máximo 300 líneas, extraer lógica a hooks
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`)

### Estructura de Componentes

```typescript
// components/NuevoComponente.tsx
"use client"; // Solo si necesita interactividad

import { useState } from "react";
import { motion } from "framer-motion";

interface NuevoComponenteProps {
  title: string;
  optional?: boolean;
}

export function NuevoComponente({ title, optional = false }: NuevoComponenteProps) {
  const [state, setState] = useState(false);
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-4 rounded-xl bg-white"
    >
      <h2 className="text-xl font-bold">{title}</h2>
    </motion.div>
  );
}
```

---

## 📄 Licencia

Este proyecto es privado y pertenece a **Buleje**. Todos los derechos reservados.

Para consultas comerciales: contacto@buleje.com

---

## 🙏 Agradecimientos

Desarrollado con ❤️ para modernizar la experiencia de compra de abarrotes en Pucallpa.

**Stack powered by**:
- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Prisma](https://www.prisma.io/) - ORM
- [Supabase](https://supabase.com/) - PostgreSQL hosting
- [Vercel](https://vercel.com/) - Deployment platform

---

<div align="center">
  <p><strong>🛒 Buleje</strong> - Tu tienda de abarrotes preferida, ahora online 📦</p>
  <p>Hecho con Next.js 16 • React 19 • TypeScript 5.7 • Tailwind CSS 4</p>
</div>
