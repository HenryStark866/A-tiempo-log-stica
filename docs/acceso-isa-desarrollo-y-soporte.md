# Isa entra a ayudar con desarrollo y soporte

Cuatro sistemas por separado — Claude, GitHub, Vercel, Supabase — cada uno con
su propio nivel de acceso. No hay una sola cuenta que abra las cuatro puertas.

## 1. Claude — la cuenta Pro `atiempologisticamedellin@gmail.com`

Es una cuenta nueva, aparte de las que ya usas tú (tu personal y
`cdhmaker@gmail.com` para Cowork). Bien pensado tenerla separada: así el
trabajo de Isa no se mezcla con el tuyo y cada quien sabe qué hizo quién.

**Cómo entra:**

1. Isa entra a [claude.ai](https://claude.ai) con ese correo (o la contraseña
   que le pases, si la creaste con contraseña en vez de con Google).
2. Para Claude Code —la herramienta de terminal, la que estoy usando yo ahora
   mismo— lo instala en su máquina:
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```
   y al primer `claude`, inicia sesión con ese mismo correo.

**Lo único que hay que saber antes de repartir el trabajo:** una cuenta Pro
tiene un cupo de uso compartido entre todos los dispositivos donde inicie
sesión — no es "un cupo por computador". Si tú también usas esta cuenta a la
vez que Isa, los dos gastan del mismo cupo y uno de los dos puede quedar
esperando al otro. Si van a trabajar los dos a fondo al mismo tiempo, lo más
tranquilo es que cada quien tenga su propia cuenta (o pasar a un plan Team,
que da un cupo por persona). Si el trabajo de Isa es más liviano —soporte,
consultas puntuales— una sola cuenta Pro compartida alcanza sin problema.

## 2. GitHub — el código

El repo es **público** (`HenryStark866/A-tiempo-log-stica`), así que Isa ya
puede *leerlo* sin que nadie le dé permiso. Lo que necesita permiso es para
**escribir**: subir commits o abrir Pull Requests directamente sobre el repo
en vez de desde un fork.

Se la agrega como colaboradora (`gh repo add-collaborator` no existe como
subcomando; es la API REST directa):

```bash
gh api --method PUT "repos/HenryStark866/A-tiempo-log-stica/collaborators/<usuario-de-isa>" -f permission=push
```

(`push` es el nombre que usa la API para el permiso de escritura normal;
`admin` solo si además va a administrar el repo — ajustes, otros
colaboradores).

**Hecho:** invitación enviada a [`mariaiae`](https://github.com/mariaiae) con
permiso de escritura el 2026-08-18. Isa la acepta desde
`https://github.com/HenryStark866/A-tiempo-log-stica/invitations` o desde el
correo/notificación que le llegó de GitHub — hasta que la acepte, no tiene
acceso todavía.

**Su propia identidad en los commits.** Ahora mismo todos mis commits quedan
firmados como tú (`henrytaborda57@gmail.com`), por instrucción tuya. Isa
debería commitear con su propio nombre y correo — así el `git blame` sigue
diciendo la verdad de quién tocó qué. Ella configura una sola vez en su
máquina:

```bash
git config user.name "Isa <su apellido>"
git config user.email "su-correo@..."
```

## 3. Vercel — dónde vive el deploy

El scope es `henry-stark-s-projects`. Para que Isa vea builds, logs y
variables de entorno (sin que tenga que pedírtelos por WhatsApp cada vez):

1. [vercel.com](https://vercel.com) → el team `henry-stark-s-projects` →
   **Settings → Members → Invite**.
2. Rol **Member** alcanza para ver deploys y logs. **Developer** si además va
   a poder cambiar variables de entorno o forzar un redeploy — es el que
   probablemente quiere para desarrollo real.

Ojo con el plan: si el team está en el plan gratuito de Vercel, agregar un
segundo miembro puede exigir pasar a un plan de pago (Pro, por asiento). Vale
la pena confirmarlo antes de mandar la invitación, para que no te sorprenda un
cobro.

## 4. Supabase — la base de datos

Este es el que más cuidado pide. El proyecto que sirve A Tiempo Logística
(`uhbtivaepyhwfdvtpfjq`) es el **mismo** que usa TaxiYa — lo decidiste así
para no pagar dos proyectos dedicados. Si agregas a Isa a la organización de
Supabase, por defecto va a ver **los dos proyectos**, no solo el de ustedes.

Dos caminos:

- **Si a Isa no le importa ver TaxiYa** (o si TaxiYa es tuyo también y no hay
  nada que cuidar ahí): agrégala directo a la organización, con el rol
  **Developer** — puede ver tablas, correr SQL, desplegar edge functions, pero
  no cambiar facturación ni borrar el proyecto.
  `Organización → Team → Invite a team member`.

- **Si prefieres que solo vea A Tiempo**: Supabase no tiene permisos por
  proyecto dentro de una organización — es todo o nada a nivel de org. La
  única forma de aislarla sería moverla a un proyecto propio, que es
  exactamente lo que decidiste no pagar. Con 9 comercios y el volumen de hoy,
  seguramente no vale la pena todavía — pero es la razón por la que este paso
  merece pensarlo dos veces en vez de mandar la invitación de una.

**Para desarrollo local**, Isa no necesita entrar al panel de Supabase en
absoluto: le bastan dos valores del `.env.example` del repo
(`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`) que tú le
pasas una vez. Ojo con esto: **no hay proyecto de staging todavía** (sigue
pendiente, ver `docs/LO-QUE-FALTA.md`), así que correr la app en su máquina la
conecta a la base de **producción real** — los mismos 9 comercios y sus
pedidos. Para probar cosas que crean o borran datos, mejor que use el SQL
Editor del panel contra una transacción con `rollback` (así se verificó el
rol de asesor, ver `docs/traspaso-claude-code-2026-08-16.md`), no que las
pruebe a mano contra la base viva.

## Arrancar el repo en su máquina

```bash
git clone https://github.com/HenryStark866/A-tiempo-log-stica.git
cd A-tiempo-log-stica
npm install
cp .env.example .env.local   # completar las dos de Supabase
npm run dev
```

## Cómo saber que quedó bien

- `gh repo view HenryStark866/A-tiempo-log-stica --json viewerPermission` — su
  usuario aparece con permiso `WRITE` (o el que le hayas dado).
- Isa ve el proyecto en [vercel.com/henry-stark-s-projects](https://vercel.com).
- Isa ve el proyecto en el panel de Supabase (y, si compartes org, también
  ve TaxiYa — es lo esperado, no un error).
- `npm run dev` local le sirve `http://localhost:3000` sin que
  `next build` se queje de las variables de Supabase.
