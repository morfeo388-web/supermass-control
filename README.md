# Super Mass · Control de mercancía

App web (PWA) para escanear facturas de mercancía, recibir lo que llega, detectar diferencias y controlar caducidades de perecederos.

## Módulos

- **Facturas**: captura manual o escaneando códigos de barras/QR. Autocompleta nombre y unidad de artículos ya conocidos.
- **Recibir**: compara lo facturado contra lo que llegó, marca faltantes/sobrantes y pide caducidad de perecederos.
- **Caducidades**: lotes por vencer y vencidos, con edición de fechas.
- **Ajustes**: datos de ejemplo, respaldo JSON, restauración, exportaciones CSV y borrado total.

## Uso

Abre la URL publicada en el teléfono. Para instalarla, usa «Agregar a la pantalla de inicio» o el botón «Instalar app» en Ajustes.

Los datos se guardan en el navegador (localStorage) del dispositivo. Usa **Descargar respaldo** con frecuencia y restáuralo al cambiar de teléfono.

El escáner requiere HTTPS y permiso de cámara. Sin cámara, la captura manual sigue disponible.

## Desarrollo

Sitio estático sin dependencias de build. Sirve esta carpeta con cualquier servidor HTTP:

```
python -m http.server 8787
```

El service worker guarda la app para uso sin conexión.