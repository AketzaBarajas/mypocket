# Decisiones de implementación

Registro de las decisiones tomadas al construir MyPocket y de las diferencias entre
`docs/PROMPT.md` y la realidad de las librerías en el momento de instalar (octubre de 2026).
Cada entrada indica la fuente con la que se verificó.

## 1. Diferencias con el prompt (realidad de las librerías)

### 1.1 Evolu 8 exige TypeScript 7

- **Hecho:** la guía oficial ([evolu.dev/docs/local-first](https://www.evolu.dev/docs/local-first))
  indica «Requirements: TypeScript 7 or newer with `exactOptionalPropertyTypes` enabled».
  TypeScript 7 es el compilador nativo; `typescript-eslint` 8.71 solo declara soporte hasta
  TypeScript 6.0 (`peerDependencies: typescript >=4.8.4 <6.1.0`), porque usa la API de JavaScript
  del compilador.
- **Decisión:** se replica la configuración del propio monorepo de Evolu:
  - `@typescript/native` → `npm:typescript@7.0.2`. Es el `tsc` que ejecuta `pnpm typecheck`.
  - `typescript` → `npm:@typescript/typescript6@6.0.2`. Lo usa `typescript-eslint` para las
    reglas con tipos.
- **Consecuencia:** el typecheck manda. Si alguna regla con tipos de ESLint discrepara de
  TypeScript 7 en un punto concreto, se documenta aquí.

### 1.2 API de Evolu 8 (verificada en la documentación y en los tipos instalados)

Paquetes: `@evolu/common` 8.18.0, `@evolu/react` 11.2.0, `@evolu/react-web` 3.2.0,
`@evolu/web` 3.4.1.

| Tema              | Lo que dice Evolu 8                                                                                                                                                                                                                  | Cómo se aplica                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Creación          | `createRun(createEvoluDeps())` y `run.ok(createEvolu(Schema, { appName, appOwner, transports }))`. `createEvolu` devuelve una `Task`.                                                                                                | `src/data/evolu.ts`.                                                 |
| Owner             | El `AppOwner` es obligatorio y explícito: `createAppOwner(secret)`. La app es responsable de guardar el secreto.                                                                                                                     | El secreto vive envuelto en `mypocket-keystore` (`src/security`).    |
| Restaurar         | `restoreAppOwner` y `resetAppOwner` ya no existen. Se valida la frase con `Mnemonic`, se convierte con `mnemonicToOwnerSecret` y se crea el owner.                                                                                   | Asistente de bienvenida, opción «Restaurar con mi frase».            |
| Cifrado en reposo | Automático y no desactivable: «Persistent SQLite is encrypted with the AppOwner key» (`Evolu.d.ts`). En web usa SQLite3 Multiple Ciphers (esquema `sqlcipher`) sobre OPFS con la `encryptionKey` del owner (`@evolu/web/Sqlite.js`). | No requiere configuración. Queda documentado en el README.           |
| Cierre            | `Evolu` implementa `AsyncDisposable`.                                                                                                                                                                                                | Al bloquear se llama a `evolu[Symbol.asyncDispose]()`.               |
| Borrado local     | `deleteDatabase` y `deleteOwner` están declarados pero **no implementados** («Currently not implemented», lanzan).                                                                                                                   | Ver 1.3.                                                             |
| Consultas         | Todas las columnas salvo `id` son anulables al leer.                                                                                                                                                                                 | Los repositorios validan cada fila y descartan las incompletas.      |
| Mutaciones        | Aceptan valores ya validados; no vuelven a validar.                                                                                                                                                                                  | Los repositorios validan con los tipos del schema antes de escribir. |
| Persistencia      | Evolu llama por su cuenta a `navigator.storage.persist()` tras la primera mutación local.                                                                                                                                            | Ajustes solo muestra el estado (`navigator.storage.persisted()`).    |
| Sync              | Estado mediante `run.deps.syncState` y `useOwnerSyncStatus`.                                                                                                                                                                         | Indicador de sincronización de la cabecera y de la barra lateral.    |
| Relay por defecto | `wss://free.evoluhq.com`.                                                                                                                                                                                                            | Valor por defecto; ver 1.4.                                          |

### 1.3 «Borrar los datos de este dispositivo» sin `deleteDatabase`

Como Evolu 8 todavía no implementa el borrado de la base local, la zona de peligro hace lo
siguiente:

1. Cierra la instancia de Evolu.
2. Borra el almacén `mypocket-keystore` (el secreto envuelto). Sin él, la base SQLite cifrada es
   ilegible: es un borrado criptográfico.
3. Marca un borrado pendiente y recarga. Al arrancar, antes de crear ningún worker de Evolu,
   elimina los directorios de OPFS de la app.

Cuando Evolu implemente `deleteDatabase`, bastará con sustituir el paso 3.

### 1.4 El relay gratuito es «de pruebas»

La documentación ([evolu.dev/docs/relay](https://www.evolu.dev/docs/relay)) avisa: «Testing relay
data may be deleted; do not rely on it as your only backup». Se mantiene como relay por defecto,
como pide el prompt, porque los datos viven completos en cada dispositivo y además existe la
copia cifrada en Google Drive. Ajustes lo explica junto al campo de la URL.

### 1.5 Frase de 12 palabras

`createOwnerSecret` genera 32 bytes (24 palabras). El prompt pide 12 palabras, así que se crea un
secreto de 16 bytes, que Evolu admite (`OwnerSecret` acepta 16, 20, 24, 28 y 32 bytes). La
documentación de privacidad de Evolu señala que 16 bytes dan 128 bits de seguridad clásica, pero
unos 64 bits frente a un ordenador cuántico futuro. Se respeta el requisito del prompt; el cambio a
24 palabras sería una sola constante (`OWNER_SECRET_BYTES` en `src/security`).

La frase usa la lista de palabras BIP-39 en inglés: es la única que valida el tipo `Mnemonic` de
Evolu.

### 1.6 CSP y relay configurable

El prompt pide a la vez una CSP estricta por `<meta>` con `connect-src` limitado al relay
configurado y una URL de relay editable en Ajustes. Una CSP estática no puede conocer un valor
elegido en tiempo de ejecución, así que:

- La CSP se genera al compilar. Permite `wss://free.evoluhq.com` y los orígenes de
  `VITE_RELAY_ORIGINS`.
- Ajustes acepta cualquier URL `wss://`, pero avisa si su origen no está en la CSP de la
  compilación y explica cómo añadirlo.
- La CSP solo se inyecta en el build de producción: en desarrollo, Vite necesita scripts en línea y
  su WebSocket de HMR.
- `'wasm-unsafe-eval'` es necesario para SQLite WASM. `style-src 'unsafe-inline'` es necesario
  para los estilos en línea (atributo `style`) de Motion y visx; no afecta a los scripts.

### 1.7 Versiones mayores más nuevas que las habituales

Se instalan las últimas estables y se fijan sin rangos: Vite 8, Vitest 5, ESLint 10, Tailwind 4.3,
React 19.3, Zod 4, Motion 14, visx 4, lucide-react 1, vite-plugin-pwa 2.

## 2. Entorno

### 2.1 pnpm 11 fijado con Corepack

`package.json` fija `packageManager: pnpm@11.28.2`. pnpm 12 distribuye un binario nativo que en la
máquina de desarrollo no se pudo ejecutar («Acceso denegado» al lanzar `pnpm-native.exe`), y pnpm
11 es además la versión que usa el propio repositorio de Evolu. Con Corepack activo, `pnpm` usa
esa versión automáticamente.

### 2.2 Versión de Node

Evolu declara `engines.node >= 24.20.0`. Solo afecta a las herramientas de Node de Evolu (relay,
tests); la app corre en el navegador. Con Node 24.13 la instalación, el typecheck, los tests y el
build funcionan. `docs/SETUP.md` recomienda la LTS más reciente.

### 2.3 Repositorio git propio

La carpeta del proyecto está dentro de otro repositorio git (raíz en el Escritorio). Se ha creado
un repositorio independiente en la raíz de MyPocket, como pide el prompt, sin tocar el exterior.

## 3. Decisiones de arquitectura

### 3.1 Árbol de rutas generado

`src/routeTree.gen.ts` lo genera TanStack Router. Se versiona en git y además `pnpm typecheck` y
`pnpm lint` ejecutan antes `tsr generate`, para que funcionen sin haber arrancado Vite.

### 3.2 Tests: Node para la lógica, jsdom para componentes

`*.test.ts` corre en Node (dominio, criptografía, datos) y `*.test.tsx` en jsdom. La zona horaria
se fija a `Europe/Madrid` en `vitest.config.ts`.

### 3.3 Reglas de ESLint que protegen la arquitectura

- `src/domain` no puede importar React, Evolu ni la UI, ni usar `new Date()` o `Date.now()`.
- `src/ui`, `src/features` y `src/routes` no pueden importar `@evolu/*`.
- `no-console` es un error en todo el código.

## 4. Importación (fase 7)

### 4.1 El hash identifica la fila del archivo, no el movimiento final

El prompt define `importHash = SHA-256(date|amount|tipo|conceptoNormalizado|accountId|ocurrencia)`.
Se calcula con el tipo y la cuenta **tal como salen del archivo** (`sourceType`, `sourceAccountId`),
no con los que queden tras editar la fila en la vista previa. Con los valores editados, un gasto
importado como transferencia (el traspaso mensual al bróker, por ejemplo) aparecía como «nuevo» al
reimportar el mismo extracto y se podía duplicar. Solo cuando el archivo no da cuenta, ni hay una
por defecto, entra en el hash la cuenta elegida a mano.

### 4.2 Detección propia del separador

Papa Parse elige la coma como separador en los extractos que empiezan con líneas de título y usan
coma decimal (la coma se repite igual en cada fila de datos). `detectDelimiter` prueba `;`, `,`,
tabulador y `|` y se queda con el que da más columnas en más filas; si ninguno destaca, decide
Papa Parse.

### 4.3 Perfiles guardados

El modelo de `importProfile` no guarda de qué perfil preconfigurado procede ni su tipo por defecto,
así que no hay perfiles con nombre libre: al confirmar una importación (interruptor «Recordar estas
columnas», activado por defecto) se guarda un `importProfile` con el nombre del perfil
preconfigurado, y la siguiente vez que se elige ese perfil se recupera su mapeo para las columnas
que sigan existiendo en el archivo.

### 4.4 Incluir y seleccionar son cosas distintas

En la vista previa, la casilla de cada fila decide si se importa. La edición masiva usa una
selección aparte (clic en la fila, Mayús + clic para un rango, barra espaciadora con el teclado, o
«Seleccionar las N visibles» tras filtrar o buscar): así se puede categorizar un grupo de filas sin
tocar qué se importa.

### 4.5 Cuentas y categorías creadas desde la vista previa

- Una cuenta desconocida se crea como cuenta corriente, con saldo inicial 0 y fecha de apertura en
  su primer movimiento del archivo, para que todos cuenten en el saldo. El tipo se cambia después en
  Cuentas.
- Una categoría desconocida se crea de primer nivel, con 🏷️; en las de gasto se elige el grupo
  (Necesidades o Deseos) al crearla.

### 4.6 Movimientos anteriores a la apertura de la cuenta

El saldo de una cuenta solo suma movimientos desde su fecha de apertura (el saldo inicial ya incluye
lo anterior). Al migrar el histórico de Notion es normal importar movimientos más antiguos: se
guardan y cuentan en el análisis, y el paso de confirmación avisa de cuántos no cambian el saldo.

### 4.7 Límites

- Archivos de hasta 10 MB; el CSV se lee en memoria y nunca sale del dispositivo.
- Fecha e importe no se editan en la vista previa: si se leen mal, se corrige el mapeo (formato de
  fecha, separador decimal) en el paso anterior.
