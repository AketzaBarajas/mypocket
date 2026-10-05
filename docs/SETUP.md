# Puesta en marcha

Pasos que tienes que hacer a mano, en orden. Los comandos son para PowerShell en Windows 11.

## 1. Node y pnpm

```powershell
winget install OpenJS.NodeJS.LTS
```

Cierra y vuelve a abrir la terminal, y comprueba la versión. Evolu 8 pide Node 24.20 o superior
para sus herramientas; cualquier Node 24 reciente sirve para trabajar en la app.

```powershell
node --version
```

Activa pnpm con Corepack. Si Node está instalado en `C:\Program Files`, este comando necesita una
terminal **como administrador**:

```powershell
corepack enable
```

A partir de ahí `pnpm` usa la versión fijada en `package.json` (`pnpm@11.28.2`). Si no quieres
abrir una terminal de administrador, antepón `corepack` a cada comando: `corepack pnpm install`,
`corepack pnpm dev`, etc.

## 2. Git

```powershell
git --version
```

Si no está instalado:

```powershell
winget install Git.Git
```

## 3. Arrancar en local

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

Abre <http://localhost:5173>. La app funciona entera sin el paso 4; solo queda desactivada la
copia en Google Drive.

`localhost` cuenta como contexto seguro, así que en el escritorio puedes probar el PIN y, si el
navegador y Windows Hello lo permiten, la passkey.

## 4. Copias en Google Drive (opcional)

1. Entra en [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto nuevo
   (es gratuito). Por ejemplo, «MyPocket».
2. En **APIs y servicios → Biblioteca**, busca **Google Drive API** y pulsa **Habilitar**.
3. En **APIs y servicios → Pantalla de consentimiento de OAuth**:
   - Tipo de usuario: **Externo**.
   - Estado de publicación: **Testing** (pruebas).
   - En **Usuarios de prueba**, añade tu propio correo de Google.
   - En **Permisos (scopes)**, añade `https://www.googleapis.com/auth/drive.appdata`.
4. En **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo de aplicación: **Aplicación web**.
   - **Orígenes autorizados de JavaScript**: `http://localhost:5173` y tu dominio de producción
     (por ejemplo `https://mypocket.pages.dev`).
5. Copia el **ID de cliente** en `.env.local`:

   ```dotenv
   VITE_GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
   ```

6. Reinicia `pnpm dev`.

El ID de cliente **no es un secreto**: identifica a la app ante Google y viaja en el bundle
público. Lo que protege tus copias es el cifrado con tu frase de recuperación, no este ID. Aun
así, `.env.local` está en `.gitignore` para que cada entorno tenga el suyo.

En modo «Testing», Google solo deja entrar a los usuarios de prueba que hayas añadido. Es justo lo
que quieres para una app de un solo usuario.

## 5. Desplegar en Cloudflare Pages

Hace falta una URL con HTTPS para probar en el iPhone: las passkeys y la instalación de la PWA
solo funcionan en contextos seguros.

### Opción A: conectar el repositorio

1. Sube el repositorio a GitHub o GitLab (puede ser privado).
2. En el [panel de Cloudflare](https://dash.cloudflare.com/), ve a **Workers & Pages → Create →
   Pages → Connect to Git** y elige el repositorio.
3. Configuración del build:
   - **Build command:** `corepack enable && pnpm install --frozen-lockfile && pnpm build`
   - **Build output directory:** `dist`
   - **Variables de entorno:** `VITE_GOOGLE_CLIENT_ID` (y `VITE_RELAY_ORIGINS` si usas un relay
     propio). Añade también `NODE_VERSION` con la versión de Node que uses, por ejemplo `24`.
4. Despliega. Obtendrás una URL del tipo `https://mypocket.pages.dev`.

### Opción B: subir el build desde tu equipo

```powershell
pnpm build
pnpm dlx wrangler pages deploy dist --project-name mypocket
```

La primera vez, `wrangler` abre el navegador para iniciar sesión en Cloudflare.

### Después de desplegar

- Añade la URL de producción a los **Orígenes autorizados de JavaScript** del cliente OAuth
  (paso 4).
- **La passkey queda ligada al dominio.** Si cambias de dominio (por ejemplo, de
  `mypocket.pages.dev` a un dominio propio), la passkey antigua deja de servir y tendrás que
  registrar una nueva en Ajustes → Seguridad. El PIN sigue funcionando, y tus datos también: se
  recuperan con la frase de 12 palabras.

## 6. Instalar en el iPhone

1. Abre la URL de producción en **Safari** (iOS 18 o superior).
2. Pulsa **Compartir → Añadir a pantalla de inicio**.
3. Abre MyPocket desde el icono. Elige «Restaurar con mi frase» si ya la configuraste en el
   escritorio, e introduce las 12 palabras.
4. Activa Face ID y crea el PIN de ese dispositivo. Los datos llegan desde el relay.

Instalada en la pantalla de inicio, Safari no borra sus datos por inactividad.

## 7. Migrar desde Notion

En Notion, abre cada base de datos (Cuentas, Categorías, Pagos, Ingresos, Transferencias,
Objetivos, Deudas y Suscripciones) como página completa y usa **··· → Exportar → Markdown y CSV**,
con «Incluir contenido: Todo» y sin subpáginas. Descomprime el archivo: dentro hay un `.csv` por
base de datos.

En MyPocket, ve a **Importar** y sube primero **Cuentas** y después **Pagos**, **Ingresos** y
**Transferencias**, eligiendo en cada caso el perfil de Notion correspondiente. El asistente te
deja revisar cada fila antes de confirmar y permite deshacer un lote entero.

## 8. Guarda tu frase de recuperación

La frase de 12 palabras es la **única** llave de tus datos.

- Apúntala en papel o guárdala en un gestor de contraseñas. No la guardes en una nota sin cifrar
  ni en una captura de pantalla.
- Sirve para restaurar en otro dispositivo y para descifrar las copias de Google Drive.
- **Sin ella no hay recuperación posible.** No existe servidor, ni cuenta, ni soporte que pueda
  restablecerla: ese es precisamente el diseño que mantiene tus datos privados.
