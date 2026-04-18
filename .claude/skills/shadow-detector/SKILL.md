---
name: shadow-detector
description: Detecta componentes shadowed — misma export name desde 2+ archivos, uno local dentro de un modulo grande que shadowea al canonico del DS. Previene bugs tipo "refactor no se refleja en runtime". Uso antes de cada refactor de primitive (StatCard, StatusBadge, AdminCard, SparklineKPICard, etc.) o cuando Brandon diga "por que el fix no se ve", "refactor no toma efecto", "shadow", "por que sigue igual".
---

# Skill: shadow-detector

## Motivacion

En Buleje, modulos grandes (PrestamosModule.tsx, InventoryTab.tsx,
Customer360Tab.tsx, etc.) a veces tienen **copia local** de primitives que
supuestamente viven en `@buleje/design-system` o `components/admin/shared/`.
Ejemplo real 2026-04-17 (commit 8ca0c9a9): `SparklineKPICard` tenia
definicion externa + interna. El admin usaba la interna. Fixes al externo
nunca se reflejaban.

## Algoritmo

Dado un primitive name `X`:

1. **Grep de definiciones** en todo el repo (excepto `_archive/`, `.next/`,
   `node_modules/`, `packages/design-system/src/**`):
   ```bash
   grep -rn -E "function ${X}\s*\(|const ${X}\s*=|class ${X}" \
     components/ app/ | sort
   ```

2. **Grep de imports** del primitive:
   ```bash
   grep -rn "import.*\\b${X}\\b.*from" components/ app/
   ```

3. **Detectar shadow**:
   - Si aparecen ≥2 definiciones, hay shadow candidato.
   - Si un archivo tiene tanto la definicion local COMO el JSX uso,
     confirma que NO importa del DS (shadowing activo).

4. **Reportar tabla**:
   | Archivo | Linea | Tipo | Risk |
   |---|---|---|---|
   | packages/design-system/src/data-display.tsx | 45 | canonical | safe |
   | components/admin/PrestamosModule.tsx | 154 | shadow internal | **high** |
   | components/admin/ShadowerX.tsx | 78 | shadow internal | high |

5. **Propuesta de fix**:
   - Eliminar la definicion interna.
   - Importar del DS: `import { X } from "@buleje/design-system";`
   - Validar con visual regression post-refactor.

## Cuando invocar (auto + manual)

- **Auto**: antes de cualquier refactor de componente que exporte el DS
  (activar via hook PreToolUse con matcher `Edit|Write` y if condicional
  sobre primitives conocidos).
- **Manual**: Brandon dice "por que el fix no se ve", "refactor no toma
  efecto", "por que sigue igual", "shadow", "duplicate", o antes de cada
  refactor de un primitive usado en ≥5 modulos.

## Output contract

Al terminar reporta exactamente:

```
## Shadow detector — <PrimitiveName>

Definiciones encontradas: N
- canonical: path:line
- shadow: path:line (M archivos)

Recomendacion: <eliminar shadow / mantener / consolidar / investigar>

Comandos sugeridos:
- grep de uso: ...
- diff de implementacion: ...
```

Max 200 palabras. Cita path:line.
