# University Marketplace (Prototype)

This repository contains the UCF-themed marketplace prototype located in the `Protype1/` folder.

## Cómo ver la página
- Abre `Protype1/index.html` directamente en tu navegador; no requiere build ni dependencias.
- Para evitar problemas de rutas relativas al explorar otras páginas (perfil, mensajes, etc.), usa un servidor local simple:
  - Con Python 3: `cd Protype1 && python3 -m http.server 8000` y visita `http://localhost:8000/index.html`.

## Qué puedes modificar rápidamente
- **Colores UCF**: en `Protype1/index.html`, el bloque `tailwind.config` define `ucfBlack`, `ucfGold` y `ucfGray`. Cambia estos valores para ajustar la paleta.
- **Tipografía y sombras**: la clase global del `<body>` y las utilidades Tailwind controlan la fuente y los fondos. Puedes editar `Protype1/styles.css` para ajustes adicionales.
- **Tarjetas y filtros**: el layout principal está en `Protype1/index.html`. Las tarjetas se llenan desde el script al final del archivo y usan clases Tailwind para espaciado, bordes y hovers.

## Próximos pasos sugeridos
1. Revisa el flujo de búsqueda y filtros en `index.html` y ajusta los textos a tus necesidades.
2. Añade tus datos reales de productos en el arreglo `listings` del mismo archivo o conéctalo a tu backend.
3. Ejecuta una pasada visual en móvil (ancho < 900px) para confirmar que el layout responsivo te gusta; ajusta utilidades Tailwind si hace falta.
4. Si quieres un CSS final optimizado, considera integrar la build de Tailwind (con `tailwind.config.js`) en lugar del CDN.

## Dónde seguir trabajando
- `Protype1/index.html`: estructura, filtros, tarjetas y lógica básica de búsqueda.
- `Protype1/styles.css`: ajustes globales extra (sombras, transiciones) si no usas únicamente utilidades Tailwind.
- Otros HTML en `Protype1/` (perfil, mensajes, etc.) comparten el mismo look; ábrelos en el navegador para revisar enlaces y consistencia.
