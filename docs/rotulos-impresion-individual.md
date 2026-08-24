# Reimprimir un rótulo suelto

**Archivo tocado:** `src/app/(plataforma)/pedidos/rotulos/page.tsx` (único).
**Fecha:** 21 de agosto de 2026.

## Qué cambió para quien usa la plataforma

Cada tarjeta de rótulo tiene ahora un botón de impresora pequeño en su esquina
superior derecha. Al apretarlo sale **solo ese rótulo** por la impresora, sin
tener que volver a la lista de pedidos ni gastar hojas en los demás.

El botón naranja de arriba sigue haciendo exactamente lo de antes: imprime
todos los rótulos que están en pantalla.

Aplica igual para el comercio de e‑commerce y para el asesor, porque los dos
llegan a la misma ruta `/pedidos/rotulos`. No hay dos vistas de rótulos:

- `/pedidos` → botón «Rótulos (N)», sin filtro por rol, para ambos perfiles.
- `/pedidos/[id]` → enlace al rótulo de un pedido puntual.

## Cómo funciona por dentro

Un estado `printingId: string | null` decide qué se manda al papel:

- `null` → se imprime la hoja completa (comportamiento de siempre).
- con un id → los demás rótulos reciben `print:hidden`.

**En pantalla no se oculta nada.** Se usa `print:hidden` y no `hidden` a
propósito: si los rótulos desaparecieran de la vista, la página saltaría y
haría scroll solo justo cuando se abre el diálogo del navegador. Con
`print:hidden` la hoja se queda quieta y el cambio existe únicamente para la
impresora.

### Los tres detalles que no son obvios

1. **El retardo de 50 ms.** `window.print()` congela la pestaña y fotografía el
   DOM tal como esté en ese instante. Llamarlo en el mismo turno en que se
   cambia el estado imprime todos los rótulos, porque React todavía no pintó.
   Un `setTimeout` mínimo alcanza; la constante es `RETARDO_DE_PINTADO`.

2. **La limpieza va en `afterprint`, no después de `print()`.** En escritorio
   `window.print()` bloquea hasta que se cierra el diálogo, así que limpiar
   justo después funcionaría; en móvil devuelve enseguida y los otros rótulos
   alcanzarían a reaparecer antes de la foto. El evento `afterprint` dispara
   igual si se imprime que si se cancela.

3. **La hoja en blanco.** La regla de impresión es
   `.rotulo { page-break-after: always }` con excepción para `:last-child`. Un
   elemento en `display:none` sigue siendo hijo del DOM, así que `:last-child`
   puede caerle a un rótulo escondido y el que sí se imprime arrastra su salto
   de página → sale una hoja vacía detrás. Por eso el rótulo aislado lleva la
   clase `.rotulo-aislado`, que fuerza `page-break-after: auto`.

### Salvaguarda del botón naranja

`imprimirTodos()` pone `printingId` en `null` **antes** de imprimir. Si algún
navegador no dispara `afterprint`, el estado quedaría pegado y el botón
principal sacaría un solo rótulo sin explicación. Así se corrige solo.

## Qué revisar después del deploy

- [ ] Abrir `/pedidos/rotulos?ids=a,b,c` con tres pedidos y usar el botón de
      impresora de la tarjeta del medio: la vista previa debe traer **una sola
      página**, no tres ni cuatro.
- [ ] Cancelar el diálogo y apretar enseguida el botón naranja: deben salir
      los tres.
- [ ] Confirmar que el botón de impresora **no aparece** en la vista previa
      (lleva `print:hidden`).
- [ ] Probarlo con el perfil de comercio y con el de asesor.
- [ ] Móvil (Chrome Android / Safari iOS): que el rótulo aislado sea el
      correcto y que al volver la vista siga completa.

## Lo que no se tocó

Ni el diseño del rótulo, ni el QR, ni los datos que trae `at_label_data`, ni
el tamaño de página A5, ni el límite de 100 rótulos por tanda de `/pedidos`.
