-- ═══════════════════════════════════════════════════════════════════════════
-- LA BILLETERA DE CADA QUIEN
--
-- Una direccion de billetera de Open Payments es una URL publica —algo como
-- https://billetera.example/panaderia-norte— que hace de cuenta de cobro: dice
-- en que moneda opera y con que servidor hay que hablar para pagarle. Es lo
-- unico que un comercio de otro pais tiene que darnos para poder recibir
-- plata, y por eso es la columna que abre el comercio internacional.
--
-- ── Por que una columna y no una tabla ──────────────────────────────────
-- Hoy cada comercio cobra en un sitio. El dia que uno quiera repartir sus
-- ventas entre varias billeteras habra que sacar esto a `at_wallets`, y esa
-- migracion sera facil justamente porque ahora no se invento una tabla para
-- un caso que nadie ha pedido.
--
-- ── Lo que NO se guarda aqui ────────────────────────────────────────────
-- Ni llaves, ni tokens, ni permisos. Una direccion de billetera es publica:
-- se puede poner en una factura. Lo que mueve dinero es la llave privada de
-- YAM, que vive en el entorno (OP_PRIVATE_KEY) y no en ninguna tabla, y los
-- permisos de cada pago, que son de un solo uso y mueren con el.
--
-- El formato se comprueba de minimos: tiene que ser https y sin interrogante.
-- Validar de verdad es resolverla contra la red, y eso lo hace la app al
-- guardarla (`resolverBilletera` en src/lib/pagos/openpayments.ts): una
-- expresion regular no sabe si esa URL existe, y aqui no se puede salir a
-- internet a preguntarlo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.at_clients
  add column if not exists wallet_address text,
  add column if not exists wallet_asset_code text,     -- COP, EUR, NGN...
  add column if not exists wallet_verified_at timestamptz;

alter table public.at_profiles
  add column if not exists wallet_address text;

alter table public.at_clients
  drop constraint if exists at_clients_wallet_https;
alter table public.at_clients
  add constraint at_clients_wallet_https check (
    wallet_address is null
    or (wallet_address ~ '^https://[^\s?#]+$' and length(wallet_address) <= 512)
  );

alter table public.at_profiles
  drop constraint if exists at_profiles_wallet_https;
alter table public.at_profiles
  add constraint at_profiles_wallet_https check (
    wallet_address is null
    or (wallet_address ~ '^https://[^\s?#]+$' and length(wallet_address) <= 512)
  );

comment on column public.at_clients.wallet_address is
  'Direccion de billetera Open Payments donde el comercio recibe sus pagos.';
comment on column public.at_clients.wallet_asset_code is
  'Moneda de esa billetera, como la declara la red (ISO 4217). La llena la app al verificar.';
comment on column public.at_clients.wallet_verified_at is
  'Cuando se resolvio esa billetera contra la red por ultima vez. Null = sin verificar: no cobrarle a nadie contra ella.';

-- La billetera del comercio NO es publica en la vitrina. La 0143 abrio
-- `at_clients` a `anon` columna por columna justamente para que anadir una
-- columna nueva no la publicara sola; esto lo deja escrito para que nadie
-- "arregle" aquel grant con un `grant select on at_clients to anon`.
--
-- Que una direccion de billetera sea publicable no quiere decir que debamos
-- publicarla: puestas todas juntas y asociadas a un nombre, son un directorio
-- de a quien cobrarle y por donde.
revoke select (wallet_address, wallet_asset_code, wallet_verified_at)
  on public.at_clients from anon;

notify pgrst, 'reload schema';
