import { installPolyfills } from "@evolu/common/polyfills";

// Safari (iOS incluido) aún no trae `DisposableStack` ni `Symbol.dispose`, y Evolu
// los usa en la página principal. Sus workers ya lo instalan; la página, no.
// Debe ser el primer import de `main.tsx`: se ejecuta antes que el resto.
installPolyfills();
