// Página de retorno del permiso de Google Drive (ver src/backup/oauth.ts).
// Google redirige aquí con el token en el fragmento de la URL. Esta página lo
// entrega a la app, que está en este mismo origen, y se cierra. No guarda nada.
(function () {
  var CHANNEL = "mypocket-oauth";
  var message = { type: CHANNEL, fragment: window.location.hash.slice(1) };

  // Quita el token de la barra de direcciones y del historial.
  try {
    window.history.replaceState(null, "", window.location.pathname);
  } catch (error) {
    // Sin acceso al historial no hay nada que limpiar.
  }

  try {
    if (window.opener) window.opener.postMessage(message, window.location.origin);
  } catch (error) {
    // El navegador ha cortado la relación con la ventana que abrió esta.
  }
  try {
    var channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch (error) {
    // Navegador sin BroadcastChannel: queda la vía de postMessage.
  }

  var status = document.getElementById("status");
  if (status) status.textContent = "Listo. Ya puedes cerrar esta ventana.";
  window.close();
})();
