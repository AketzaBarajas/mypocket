# Informe final

Estado de cada criterio de aceptación de `docs/PROMPT.md` a 7 de octubre de 2026, con la evidencia
que lo respalda. Leyenda: ✅ comprobado · ⚠️ implementado, comprobado solo en parte · ❌ sin
comprobar.

Todo lo marcado ✅ se ha ejecutado. Lo que no se pudo ejecutar en la máquina de desarrollo (Google
real, iPhone, Lighthouse) está marcado como tal, con lo que falta para cerrarlo en el apartado
[Pendiente de comprobar por ti](#pendiente-de-comprobar-por-ti).

## Resumen

| Comprobación                       | Resultado                                               |
| ---------------------------------- | ------------------------------------------------------- |
| `pnpm typecheck`                   | Sin errores (TypeScript 7, modo estricto)               |
| `pnpm lint`                        | Sin errores ni avisos                                   |
| `pnpm format:check`                | Todo formateado                                         |
| `pnpm test`                        | 414 tests en 17 archivos, todos en verde                |
| `pnpm test:coverage`               | Supera el umbral del 90 % de líneas en `src/domain`     |
| `pnpm test:e2e`                    | 19 tests en verde (móvil 390×844 y escritorio 1440×900) |
| `vite build` + `pnpm check:bundle` | JS inicial de 311,5 kB en gzip (presupuesto: 350 kB)    |

Los e2e se ejecutaron contra el build de producción servido con `vite preview`, con el Edge del
sistema (`PW_CHANNEL=msedge`).

## Proyecto

| Criterio                                                                                   | Estado | Evidencia                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------ | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `install`, `dev`, `build`, `preview`, `typecheck`, `lint` y `test` funcionan en PowerShell |   ⚠️   | Ejecutados uno a uno con `corepack pnpm …`. El script `build` (`pnpm typecheck && vite build`) no se lanzó tal cual porque en la sesión de desarrollo `pnpm` solo existía vía Corepack; sus dos mitades sí, por separado.                              |
| Sin rutas absolutas, secretos ni `any` en `src`                                            |   ✅   | Búsqueda sin resultados de `any`, `@ts-ignore`, rutas de disco, `console.*` y claves; `no-explicit-any` y `no-console` son errores de ESLint. `localStorage` solo guarda el tema, la hora de la última sincronización y la marca de borrado pendiente. |
| `docs/SETUP.md`, `docs/DECISIONES.md` y `README.md` completos                              |   ✅   | Los tres existen; `DECISIONES.md` recoge las decisiones de las nueve fases.                                                                                                                                                                            |

## Seguridad y privacidad

| Criterio                                                                          | Estado | Evidencia                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | :----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arranca bloqueada; sin passkey ni PIN no se ve ningún dato                        |   ✅   | `e2e/bienvenida.spec.ts` › «arranca bloqueada».                                                                                                                                                                                                                                                                |
| Passkey con PRF; el PIN funciona siempre                                          |   ⚠️   | PIN: e2e. Passkey: la capa de claves está cubierta en `src/security/security.test.ts` («envoltura por passkey (PRF)»), pero el desbloqueo con una passkey real no se ha probado: el autenticador virtual no da PRF.                                                                                            |
| Tras 5 PIN fallidos, espera exponencial y nunca se borran datos                   |   ✅   | `e2e/bienvenida.spec.ts` › «tras 5 PIN fallidos» y `security.test.ts` › «espera exponencial del PIN».                                                                                                                                                                                                          |
| Se bloquea tras el tiempo de autobloqueo en segundo plano                         |   ⚠️   | Implementado en `installAutoLock` (temporizador y comprobación al volver). Sin test automático: depende de `visibilitychange` en un dispositivo real.                                                                                                                                                          |
| El secreto del owner no aparece en claro                                          |   ✅   | `security.test.ts` › «nunca contiene el secreto ni la frase en claro» (IndexedDB) y e2e «arranca bloqueada» (`localStorage` y `sessionStorage`). El bundle no lleva ningún secreto: se genera en el dispositivo.                                                                                               |
| Datos locales cifrados en reposo                                                  |   ✅   | Lo hace Evolu 8 con la clave del owner (SQLite3 Multiple Ciphers sobre OPFS); documentado en `DECISIONES.md` 1.2.                                                                                                                                                                                              |
| Solo hay peticiones al relay, a Google tras conectar Drive y a los propios assets |   ✅   | `e2e/privacidad.spec.ts`: ningún host externo salvo `free.evoluhq.com`, y la CSP solo admite scripts propios.                                                                                                                                                                                                  |
| La copia de Drive es ilegible sin la frase y se restaura con ella                 |   ⚠️   | Formato y cifrado: `src/backup/backup.test.ts`. Ciclo completo exportar → restaurar con la frase (y rechazo con otra frase) comprobado a mano en el navegador con el archivo exportado. La subida real a Drive y la restauración en un perfil limpio no se han probado: hace falta un ID de cliente de Google. |

## Lógica (tests unitarios)

| Criterio                                               | Estado | Evidencia                                                                   |
| ------------------------------------------------------ | :----: | --------------------------------------------------------------------------- |
| Saldos sin futuros, pendientes ni borrados             |   ✅   | `src/domain/balances.test.ts`                                               |
| Inversión con valoraciones y flujos posteriores        |   ✅   | `src/domain/balances.test.ts`, `networthSeries.test.ts`                     |
| Presupuesto «desde este mes» y «solo este mes»         |   ✅   | `src/domain/budgets.test.ts`                                                |
| Estados al 79 %, 80 %, 100 % y 101 %                   |   ✅   | `src/domain/budgets.test.ts`                                                |
| Ahorro del grupo con transferencias de ida y vuelta    |   ✅   | `src/domain/budgets.test.ts`                                                |
| «Hoy puedes gastar» con exceso y el último día del mes |   ✅   | `src/domain/budgets.test.ts`                                                |
| Colchón con menos de 6 meses de datos                  |   ✅   | `src/domain/budgets.test.ts`                                                |
| Recurrencias idempotentes y con días 29, 30 y 31       |   ✅   | `src/domain/recurrences.test.ts`                                            |
| Reglas por prioridad y especificidad; regex inválida   |   ✅   | `src/domain/rules.test.ts`                                                  |
| Parseo de importes y fechas españolas y de Notion      |   ✅   | `src/domain/money.test.ts`, `importing/importing.test.ts`                   |
| Deduplicación con filas idénticas el mismo día         |   ✅   | `importing/importing.test.ts`, `importing/session.test.ts`                  |
| Progreso de metas                                      |   ✅   | `src/domain/rules.test.ts` › «metas»                                        |
| Sumas siempre en enteros                               |   ✅   | `src/domain/money.test.ts` y comprobaciones `Number.isInteger` en los demás |

## Flujos (e2e con Playwright)

| Criterio                                                                        | Estado | Evidencia                                                                                                                                       |
| ------------------------------------------------------------------------------- | :----: | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Bienvenida completa hasta Inicio                                                |   ✅   | `e2e/bienvenida.spec.ts`                                                                                                                        |
| Alta rápida en 3 interacciones; cambia saldo, presupuesto y «Hoy puedes gastar» |   ✅   | `e2e/movimientos.spec.ts` (dos tests)                                                                                                           |
| Deshacer desde el aviso elimina el movimiento                                   |   ✅   | `e2e/movimientos.spec.ts`                                                                                                                       |
| Una recurrencia genera su pendiente, se aprueba y cuenta                        |   ✅   | `e2e/recurrentes.spec.ts`                                                                                                                       |
| Importar un CSV tipo BBVA, reimportar y deshacer el lote                        |   ✅   | `e2e/importar.spec.ts` (móvil y escritorio)                                                                                                     |
| Cena con adelanto: el patrimonio solo baja la parte propia                      |   ✅   | `e2e/movimientos.spec.ts`                                                                                                                       |
| «Actualizar valor» cambia el patrimonio y la gráfica                            |   ✅   | `e2e/inversion.spec.ts`                                                                                                                         |
| Sin conexión carga y registra; al volver, sincroniza                            |   ⚠️   | `e2e/offline.spec.ts`: carga, desbloquea y guarda sin red. La sincronización con el relay al volver no se comprueba: necesita dos dispositivos. |

## Diseño

| Criterio                                                                   | Estado | Evidencia                                                                                                                                          |
| -------------------------------------------------------------------------- | :----: | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sistema Obsidian: tokens, Geist, radios, un acento, cifras tabulares       |   ✅   | `src/ui/tokens.css` y `src/ui/tokens.test.ts`; revisión visual de las pantallas nuevas en capturas a 1440 px y 390 px.                             |
| Modo claro y oscuro, siguen al sistema y se fijan en Ajustes; contraste AA |   ✅   | `tokens.test.ts` verifica el contraste AA de ambos temas; el cambio de tema se comprobó en el navegador.                                           |
| Móvil, tablet y escritorio sin desbordes                                   |   ✅   | `e2e/responsive.spec.ts`: 12 rutas × 3 anchos, sin desborde horizontal ni errores. Los textos cortados no se detectan automáticamente.             |
| Animaciones de lectura y `prefers-reduced-motion`; hoja en ≤ 150 ms        |   ⚠️   | La app funciona con movimiento reducido (`e2e/responsive.spec.ts`) y la hoja usa la transición rápida de 150 ms, pero la duración no se ha medido. |
| Estados vacíos, de carga y de error diseñados                              |   ⚠️   | `EmptyState`, `ScreenSkeleton` y `RouteError` se usan en todas las rutas; no hay una revisión pantalla a pantalla documentada.                     |

## PWA

| Criterio                               | Estado | Evidencia                                                                                                                      |
| -------------------------------------- | :----: | ------------------------------------------------------------------------------------------------------------------------------ |
| Instalable (Lighthouse PWA sin fallos) |   ⚠️   | Manifiesto, iconos y service worker verificados en `e2e/offline.spec.ts`. Lighthouse no se ha ejecutado.                       |
| Funciona offline tras la primera carga |   ✅   | `e2e/offline.spec.ts`                                                                                                          |
| Aviso de nueva versión                 |   ⚠️   | `src/features/shell/UpdatePrompt.tsx` con `registerType: "prompt"`. No se ha ejercitado: hacen falta dos despliegues seguidos. |
| Iconos propios                         |   ✅   | `public/pwa-*.png`, `maskable-icon-512x512.png` y `apple-touch-icon.png`, generados con `pnpm icons`.                          |
| Lighthouse móvil ≥ 90 / 95 / 95        |   ❌   | Sin medir.                                                                                                                     |

Presupuestos de rendimiento: el JS inicial está medido (311,5 kB). La apertura de la hoja en
150 ms y el Inicio interactivo en 1,5 s con 10 000 movimientos no se han medido.

## Pendiente de comprobar por ti

Son cosas que necesitan tu cuenta de Google, tu iPhone o una herramienta que no estaba instalada:

1. **Copia en Google Drive.** Crea el ID de cliente (SETUP, paso 4, con el URI de redireccionamiento
   `/oauth.html`), pulsa «Hacer copia» en Ajustes → Copias y comprueba que aparece en «Ver copias».
   Es el punto con más riesgo: el permiso se pide con un flujo propio que no se ha podido probar
   contra Google.
2. **Passkey en el iPhone y en Windows Hello.** Actívala en Ajustes → Seguridad y desbloquea con
   ella.
3. **Sincronización entre dos dispositivos.** Restaura con la frase en el segundo y comprueba que
   llega un movimiento creado en el primero.
4. **Autobloqueo.** Deja la app en segundo plano más tiempo del configurado.
5. **Aviso de nueva versión.** Despliega dos veces y abre la app instalada entre medias.
6. **Lighthouse.** Con la URL desplegada: `npx lighthouse https://TU-DOMINIO --preset=perf --form-factor=mobile`.

## Cómo probarla, desplegarla e instalarla

### 1. En local, en Windows

```powershell
corepack enable
pnpm install
pnpm dev            # http://localhost:5173, con la bienvenida real
pnpm seed:demo      # perfil demo con 12 meses de datos, sin PIN
```

Comprobaciones:

```powershell
pnpm typecheck; pnpm lint; pnpm test
pnpm build; pnpm check:bundle
pnpm exec playwright install chromium   # una vez; o usa el Edge del sistema:
$env:PW_CHANNEL = "msedge"; pnpm test:e2e
```

### 2. Despliegue en Cloudflare Pages

`docs/SETUP.md`, sección 5. En resumen: conecta el repositorio con el comando de build
`pnpm build` y el directorio `dist`, o sube el build con `pnpm build` y
`pnpm dlx wrangler pages deploy dist --project-name mypocket`. Define `VITE_GOOGLE_CLIENT_ID` en las
variables de entorno si quieres copias en Drive, y añade el dominio (y su `/oauth.html`) al cliente
OAuth.

### 3. Instalación en el iPhone

`docs/SETUP.md`, sección 6: abre la URL desplegada en Safari, **Compartir → Añadir a pantalla de
inicio**, completa la bienvenida y guarda la frase de 12 palabras. La passkey queda ligada a ese
dominio.
