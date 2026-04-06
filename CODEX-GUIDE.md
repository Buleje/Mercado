# 🤖 OpenAI Codex CLI - Guía Rápida

## ✅ Estado de Instalación

**Codex CLI v0.113.0** ya está instalado y autenticado correctamente.

```powershell
✅ Node.js: v24.14.0
✅ Codex CLI: 0.113.0
✅ Autenticación: Logged in using ChatGPT
```

---

## 🚀 Uso Básico

### Modo Interactivo (Recomendado)

```powershell
# Dentro del proyecto
cd "c:\Users\Usuario\OneDrive\Documentos\Escritorio\Prueba 2\buleje"
codex
```

Luego escribe tu prompt en lenguaje natural, por ejemplo:
- "Agrega validación de email en el formulario de contacto"
- "Optimiza las imágenes de productos para mejor performance"
- "Crea un test unitario para cart-context.tsx"

### Modo No Interactivo (One-shot)

```powershell
# Ejecuta un comando directo
codex exec "agrega comentarios JSDoc a los helpers en lib/utils.ts"

# Con aprobación automática
codex exec --full-auto "refactoriza ProductCard para usar memo"
```

### Code Review

```powershell
# Revisa cambios antes de commit
codex review

# Revisa un archivo específico
codex review components/Hero.tsx
```

---

## 🛠️ Comandos Útiles para Buleje

### 1. Testing
```powershell
codex "crea tests unitarios para lib/order-utils.ts con Vitest"
codex "agrega tests para el context de favoritos"
```

### 2. Optimización
```powershell
codex "analiza bundle size y sugiere optimizaciones"
codex "implementa lazy loading para ProductCatalog"
```

### 3. Documentación
```powershell
codex "agrega JSDoc a todas las funciones en lib/analytics.ts"
codex "genera documentación de API para endpoints en app/api"
```

### 4. Refactoring
```powershell
codex "extrae la lógica de carrito a un custom hook reutilizable"
codex "convierte ProductCard a TypeScript estricto sin any"
```

### 5. Features
```powershell
codex "agrega filtros de categoría a la página de tienda"
codex "implementa búsqueda en tiempo real de productos"
```

---

## ⚡ Opciones Avanzadas

### Sandbox Modes

```powershell
# Solo lectura (safe)
codex --sandbox read-only

# Puede escribir en workspace
codex --sandbox workspace-write

# Acceso completo (PELIGROSO)
codex --sandbox danger-full-access
```

### Auto-Approvals

```powershell
# Pide aprobación solo para comandos no confiables
codex -a untrusted

# El modelo decide cuándo pedir aprobación (recomendado)
codex -a on-request

# NUNCA pide aprobación (PELIGROSO)
codex -a never
```

### Modo Full-Auto (Productivo pero cuidadoso)

```powershell
# Ejecución automática con permisos de escritura
codex --full-auto "implementa loading states en todas las páginas"
```

---

## 🔍 Comandos de Utilidad

### Verificar Estado

```powershell
# Estado de autenticación
codex login status

# Versión instalada
codex --version

# Configuración actual
codex debug config
```

### Gestión de Sesiones

```powershell
# Reanudar última sesión
codex resume --last

# Bifurcar sesión anterior (fork)
codex fork --last

# Aplicar últimos cambios sugeridos
codex apply
```

### MCP (Model Context Protocol)

```powershell
# Listar servidores MCP
codex mcp list

# Agregar servidor MCP personalizado
codex mcp add <server-name>
```

---

## 💡 Ejemplos Prácticos para el Proyecto

### Caso 1: Agregar Feature de Wishlist

```powershell
codex "implementa un sistema de wishlist:
- Agrega botón de corazón en ProductCard
- Crea wishlist-context.tsx
- Persiste en localStorage
- Agrega página /wishlist
- Usa el mismo patrón que cart-context"
```

### Caso 2: Mejorar SEO

```powershell
codex "mejora el SEO de la página de tienda:
- Agrega meta tags dinámicos por categoría
- Implementa breadcrumbs con schema.org
- Optimiza títulos H1/H2 para palabras clave
- Agrega alt text descriptivo a imágenes"
```

### Caso 3: Testing E2E

```powershell
codex "crea tests E2E con Playwright para:
- Flujo de agregar producto al carrito
- Proceso de checkout completo
- Búsqueda y filtrado de productos"
```

### Caso 4: Performance Audit

```powershell
codex "analiza performance y aplica mejoras:
- Identifica componentes pesados
- Implementa code splitting
- Optimiza re-renders con React.memo
- Agrega preloading de rutas críticas"
```

---

## 🎯 Mejores Prácticas

### ✅ DO
- Usa prompts específicos y con contexto
- Revisa cambios antes de aplicarlos (sin --full-auto inicialmente)
- Prueba en una rama de Git separada
- Usa `codex review` antes de hacer commits

### ❌ DON'T
- No uses `--dangerously-bypass-approvals-and-sandbox` en producción
- No ejecutes comandos destructivos sin revisar
- No confíes ciegamente en código generado (siempre revisa)
- No uses `--full-auto` en proyectos críticos sin supervisión

---

## 🔧 Configuración Personalizada

Edita `~/.codex/config.toml` para personalizar:

```toml
[general]
model = "gpt-4"  # o "o3", "o1-preview", etc.
default_approval_policy = "on-request"
default_sandbox_mode = "workspace-write"

[features]
web_search = true
code_review = true
```

---

## 🆘 Troubleshooting

### Problema: "Not logged in"
```powershell
codex login
# O si no abre navegador:
codex login --device-auth
```

### Problema: Comandos lentos
```powershell
# Usa modelo más rápido
codex -m gpt-4-turbo "tu prompt aquí"
```

### Problema: Errores de permisos
```powershell
# Ejecuta PowerShell como administrador si es necesario
# O usa --sandbox read-only para solo lectura
```

---

## 📚 Recursos Adicionales

- [Documentación Oficial](https://platform.openai.com/docs/codex)
- [GitHub Issues](https://github.com/openai/codex-cli/issues)
- [Changelog](https://github.com/openai/codex-cli/releases)

---

## 🎉 Inicio Rápido

```powershell
# Abre PowerShell en el proyecto
cd "c:\Users\Usuario\OneDrive\Documentos\Escritorio\Prueba 2\buleje"

# Inicia Codex
codex

# Prueba con un prompt simple
> "revisa el archivo README.md y sugiere mejoras"
```

**¡Ya estás listo para usar Codex CLI!** 🚀
