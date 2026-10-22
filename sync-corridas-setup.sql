-- Registro de cada corrida de la sincronización de stock con Córdoba (AIKON).
-- Aplicado el 22/10/2026 en el proyecto Supabase "Stock Grandbar".
-- Solo la escriben/leen las funciones de Netlify con service role: RLS activo y sin políticas.
create table if not exists public.sync_corridas (
  id         bigint generated always as identity primary key,
  origen     text        not null,              -- 'cron' | 'admin' | 'manual' | ...
  inicio     timestamptz not null default now(),
  fin        timestamptz,
  ok         boolean,
  resumen    jsonb,
  error      text
);
create index if not exists sync_corridas_inicio_idx on public.sync_corridas (inicio desc);
alter table public.sync_corridas enable row level security;
