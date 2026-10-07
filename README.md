# MyPocket

PWA de finanzas personales para un único usuario. Local-first, cifrada de extremo a extremo y sin
backend propio: tus datos viven completos en cada dispositivo y solo salen de él cifrados.

- **Privada:** sin analítica, sin telemetría, sin IA y sin APIs bancarias.
- **Rápida:** un gasto se apunta en dos o tres toques.
- **Offline:** funciona entera sin conexión y sincroniza entre móvil, tablet y escritorio.
- **Gratis:** hosting estático y relay de sincronización gratuitos.

## Arrancar

Requisitos: Node 24 LTS y pnpm (vía Corepack). Los pasos manuales completos (Google Drive,
despliegue, iPhone y migración desde Notion) están en [docs/SETUP.md](docs/SETUP.md).

```powershell
corepack enable
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

## Scripts

| Script               | Qué hace                                                        |
| -------------------- | --------------------------------------------------------------- |
| `pnpm dev`           | Servidor de desarrollo en `http://localhost:5173`.              |
| `pnpm build`         | Typecheck y build de producción en `dist/`.                     |
| `pnpm preview`       | Sirve el build en `http://localhost:4173`.                      |
| `pnpm typecheck`     | Genera el árbol de rutas y comprueba tipos con TypeScript 7.    |
| `pnpm lint`          | ESLint estricto con reglas con tipos.                           |
| `pnpm format`        | Prettier sobre todo el proyecto.                                |
| `pnpm test`          | Tests unitarios y de componentes (Vitest).                      |
| `pnpm test:coverage` | Tests con cobertura de `src/domain`.                            |
| `pnpm test:e2e`      | Tests de extremo a extremo (Playwright).                        |
| `pnpm seed:demo`     | Arranca un perfil demo aislado con 12 meses de datos ficticios. |
| `pnpm icons`         | Regenera los iconos de la PWA.                                  |
| `pnpm check:bundle`  | Comprueba, tras el build, el presupuesto de JS inicial.         |

## Arquitectura

```text
                         ┌──────────────────────────────────────────┐
                         │                Dispositivo               │
                         │                                          │
  src/routes ───────────▶│  Rutas (TanStack Router)                 │
  src/features ─────────▶│  Pantallas por dominio                   │
  src/ui ───────────────▶│  Design system «Obsidian»                │
                         │        │ solo hooks y repositorios       │
  src/data ─────────────▶│  Repositorios ── Evolu ── SQLite cifrado │──┐
  src/domain ───────────▶│  Lógica pura (saldos, presupuestos…)     │  │ cambios cifrados
  src/security ─────────▶│  Passkey PRF · PIN · envoltura de claves │  │ (E2EE)
  src/backup ───────────▶│  Copia cifrada · cliente de Drive        │  ▼
                         └──────────────────────────────────────────┘  Relay de Evolu
                                          │ JSON cifrado (AES-GCM)      (solo ve bytes)
                                          ▼
                                    Google Drive
                                   (appDataFolder)
```

- `src/domain`: funciones puras, sin React ni Evolu, con «hoy» siempre inyectado.
- `src/data`: schema de Evolu, repositorios y hooks. Es la única capa que conoce Evolu.
- `src/security`: criptografía, passkey con PRF, PIN y bloqueo de sesión.
- `src/backup`: exportación e importación cifrada y cliente de Google Drive.
- `src/ui`: tokens y componentes del design system.
- `src/features/<dominio>`: pantallas y componentes de cada área.
- `src/routes`: rutas por archivos.

Nada derivado se persiste: saldos, totales y métricas se calculan siempre a partir de los
movimientos.

## Cifrado

Las decisiones y sus fuentes están en [docs/DECISIONES.md](docs/DECISIONES.md).
