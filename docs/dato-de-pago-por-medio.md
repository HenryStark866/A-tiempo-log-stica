# El dato de cobro: campos separados en pantalla, un texto en la base

**Fecha:** 25 de agosto de 2026. Sustituye la nota anterior del mismo día.

**Archivos tocados**

| Archivo | Qué cambia |
| --- | --- |
| `src/lib/constants.ts` | formatos, filtros de tecleo, armar/partir la cuenta, revisión |
| `src/components/MiComercioPanel.tsx` | modal «Nuevo medio de pago» (se abre desde `/mi-perfil`) |
| `src/app/pagar/[token]/page.tsx` | vista pública del QR: presentación y qué se copia |
| `supabase/migrations/0098_la_cuenta_bancaria_se_guarda_en_partes.sql` | la misma regla, exigida por la base |

## Qué estaba mal

El primer intento pidió banco, tipo y número **en una sola casilla** y al mismo
tiempo prohibió las letras en los medios bancarios. Las dos cosas no caben
juntas: si el campo es de solo números, no hay dónde decir «Ahorros» ni «Banco
de Bogotá».

## La forma nueva

**En pantalla el formulario cambia según el medio.**

- **Cuentas bancarias** (Bancolombia, Otro banco): tres campos.
  - *Banco* — solo aparece en «Otro banco»; en Bancolombia lo dice ya el medio.
  - *Tipo* — `<select>` con Ahorros / Corriente.
  - *Número* — filtrado a dígitos en cada tecla, teclado numérico en el celular.
- **Billeteras y links** (Nequi, Daviplata, Link): un solo campo **Dato /
  Enlace**, alfanumérico.
- **Efectivo**: ningún campo.

**En la base sigue habiendo un solo texto.** `at_payment_methods.identifier` no
cambió de tipo ni la vista pública cambió de contrato. Al guardar se unen con
` - `; al abrir a editar se vuelven a separar:

```
otro_banco  →  «Banco de Bogotá - Ahorros - 12345678»
bancolombia →  «Ahorros - 12345678»
nequi       →  «3001234567»
link        →  «https://…»
efectivo    →  null
```

## Los cuatro detalles que no son obvios

1. **El botón «copiar» del QR ya no copia lo que se ve.** De una cuenta copia
   **solo el número**: pegar «Ahorros - 12345» en la app del banco no sirve, y
   quien está en la puerta con el paquete en la mano no está para editar texto.
   El banco y el tipo se muestran arriba, pequeños, como contexto.

2. **El nombre del banco se guarda sin guiones.** El separador es ` - `, así
   que un «Banco - Popular» rompería la partición al editar. `limpiarNombreDeBanco`
   los quita.

3. **`null ~ '…'` en SQL no es falso, es `null`, y un CHECK que da `null` se
   aprueba.** Cada rama de la restricción lleva su `is not null` explícito.

4. **Nequi y Daviplata dejaron de exigir 10 dígitos.** Las llaves Bre-B admiten
   un correo, un `@usuario` o una cédula; amarrarlas al celular le cerraba la
   puerta al comercio que ya cobra así. El requisito pedía justamente que ese
   campo fuera alfanumérico.

## Por qué la migración va como 0098 y no editando la 0097

0097 (de hace un rato) exigía que una cuenta de Bancolombia fuera solo dígitos:
la nueva forma la violaría. Se pudo haber reescrito 0097, pero **puede estar ya
aplicada en la nube**, y `supabase db push` no vuelve a correr una migración
registrada — la base se habría quedado con la regla vieja y el comercio se
llevaría un error crudo de Postgres al guardar.

0098 se para sobre cualquiera de los dos escenarios: quita la restricción
anterior si existe y deja la nueva. Funciona tanto si 0097 ya se aplicó como si
se aplica junto con esta.

Entra como **NOT VALID**: los medios ya guardados se quedan como están. La
consulta que encuentra los que no cumplen —y el `validate constraint` para
sellarla— están comentados al final del archivo.

## Migración de datos viejos

Un medio guardado antes (por ejemplo «Bancolombia ahorros 4567 890», todo en una
línea) **no se puede partir**. En vez de adivinar, al abrirlo a editar el modal
muestra un aviso ámbar con el texto anterior para que el comercio lo reescriba
en los campos separados. No se borra nada hasta que él guarde.

## Verificación hecha

- **32 casos** de la restricción contra un PostgreSQL 16 real, aplicando
  primero 0097 y encima 0098 (el escenario peor): 32/32. Incluye formas sin el
  separador, números con letras, saltos de línea, textos de 121 caracteres y
  `null` en cada medio.
- Las 3 filas viejas que no cumplen sobrevivieron a las dos migraciones.
- **40 casos** de los ayudantes de TypeScript, incluida la ida y vuelta
  completa `datoParaGuardar → partirDatoDeCuenta`: 40/40.
- **Cruce cliente ↔ base:** se generaron todas las combinaciones que el
  formulario dejaría guardar (**142**, con 126 frenadas antes por la revisión) y
  se insertaron en la base. Las 142 pasan. El comercio nunca ve un error crudo
  de Postgres.

## Orden de despliegue

**Primero la app, después `supabase db push`.** La app nueva es más estricta que
la base, así que desplegarla antes no rompe nada. Al revés, entre la migración y
el despliegue el formulario viejo mandaría el formato viejo y sería rechazado.

## Qué revisar después

- [ ] `/mi-perfil` → Medios de pago → Nuevo → **Otro banco**: aparecen Banco,
      Tipo y Número. En Número no deja escribir letras.
- [ ] **Bancolombia**: aparecen Tipo y Número, *sin* campo de banco.
- [ ] **Nequi**: un solo campo «Dato / Enlace» que acepta letras.
- [ ] **Efectivo**: ningún campo, solo la línea explicativa.
- [ ] Guardar «Banco de Bogotá / Ahorros / 12345678», reabrir a editar: los tres
      campos vuelven llenos y separados.
- [ ] Abrir un medio viejo con todo en una línea: sale el aviso ámbar con el
      texto anterior.
- [ ] Escanear el QR de pago de un pedido con recaudo a esa cuenta: arriba
      «Banco de Bogotá · Ahorros», abajo el número grande, y el botón de copiar
      entrega **solo** `12345678`.

## Lo que no se tocó

`at_payment_info` devuelve los mismos campos: la vista pública no cambió de
contrato, solo de presentación. Tampoco se tocó el rótulo de `/pedidos`, ni la
tabla fuera de la restricción.
