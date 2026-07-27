# Fuego Lento — Parrilla Argentina

Sitio de una sola página para una parrilla ficticia en San Telmo, Buenos Aires. Estático (HTML/CSS/JS sin build ni frameworks) con dos endpoints serverless en `/api` para validar los formularios de reserva y delivery.

## Estructura

- `index.html` — marcado y estilos (inline, sin dependencias de build).
- `script.js` — toda la interactividad: menú, carrusel de cortes, pestañas de la carta, animaciones de scroll, y la lógica de los dos formularios.
- `api/reservar.js`, `api/pedido.js` — funciones serverless (Vercel) que revalidan cada envío del lado del servidor.
- `api/_lib/validate.js` — validaciones y utilidades de seguridad compartidas por ambos endpoints.
- `vercel.json` — cabeceras de seguridad (CSP, HSTS, X-Frame-Options, etc.).

## Privacidad

Ningún formulario guarda datos: los endpoints validan la solicitud, generan un código de confirmación y responden. No hay base de datos, archivo ni servicio de terceros involucrado.

## Desarrollo local

```bash
npx serve .
```

Los formularios funcionan igual sin backend: si `/api/*` no está disponible (por ejemplo al servir el sitio como archivos estáticos sueltos), el cliente genera la confirmación localmente tras la misma validación.

## Deploy

Pensado para Vercel (detecta `/api` automáticamente, sin configuración adicional).
