---
name: commit
description: Crear un commit con mensaje Conventional Commits para los cambios actuales. Usar cuando el usuario quiera guardar cambios, hacer commit, o commitear.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
argument-hint: [mensaje-opcional]
model: haiku
---

# Commit — Buleje

`$ARGUMENTS` = mensaje opcional. Si vacío, auto-generar analizando cambios.

## Pasos

### 1. Analizar cambios

```bash
cd buleje && git status && git diff --staged && git diff
```

### 2. Clasificar tipo (Conventional Commits)

| Tipo | Cuándo |
|------|--------|
| `feat` | Funcionalidad nueva visible al usuario |
| `fix` | Corrección de bug |
| `refactor` | Cambio interno sin comportamiento nuevo |
| `test` | Tests nuevos o modificados |
| `chore` | Mantenimiento, deps, config |
| `docs` | Solo documentación |
| `perf` | Mejora de rendimiento |
| `style` | Formato, nombres (sin lógica) |

### 3. Scope (opcional)

Basado en archivos: `checkout` | `inventory` | `auth` | `api` | `admin` | `cart` | `db` | `ui` | `config`

### 4. Construir mensaje

- Formato: `tipo(scope): descripción en español, imperativo`
- Max 72 chars primera línea
- Sin punto final
- Si `$ARGUMENTS` dado, adaptarlo al formato

### 5. Staging selectivo

```bash
git add <archivo1> <archivo2> ...
```

- **NUNCA `git add .` ni `git add -A`**
- NO agregar `.env*`, secrets, temporales, cache
- En duda: `git diff <archivo>` primero

### 6. Crear commit

```bash
git commit -m "tipo(scope): descripcion"
# Multi-línea si merece cuerpo:
git commit -m "tipo(scope): descripcion corta" -m "Detalle..."
```

### 7. Confirmar

Mostrar: hash, mensaje completo, archivos incluidos.

## Reglas críticas

- **NUNCA** commitear `.env*` ni secrets
- Cambios en `prisma/schema.prisma` -> commit separado: `chore(db): ...`
- Múltiples cambios independientes -> sugerir commits separados
- `BREAKING CHANGE:` en cuerpo si API pública cambia incompatiblemente
- Si `$ARGUMENTS` no sigue Conventional Commits, adaptarlo
