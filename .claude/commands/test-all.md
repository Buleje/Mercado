Ejecutar la suite completa de verificación de Bodega San Martín.

## Pasos

1. **Lint:**
   ```bash
   cd bodega-san-martin && npm run lint
   ```

2. **Build:**
   ```bash
   npm run build
   ```

3. **Unit tests:**
   ```bash
   npm run test
   ```

4. **E2E tests** (si están disponibles):
   ```bash
   npm run test:e2e
   ```

5. **Reporte final:** Tabla con resultado de cada paso:
   | Paso | Estado | Detalles |
   |------|--------|----------|
   | Lint | ✅/❌ | ... |
   | Build | ✅/❌ | ... |
   | Tests | ✅/❌ | X passed, Y failed |
   | E2E | ✅/❌/⏭️ | ... |
