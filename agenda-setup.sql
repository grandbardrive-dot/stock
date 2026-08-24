-- Registro de agenda: qué proveedor se contó y qué día
create table if not exists agenda_registro (
  id         bigint generated always as identity primary key,
  fecha      date    not null,
  sector     text    not null check (sector in ('vinos','spirits')),
  proveedor  text    not null,
  created_at timestamptz default now(),
  unique(sector, proveedor)  -- un proveedor solo aparece una vez por ciclo
);

-- Proveedores excluidos del conteo de stock
create table if not exists proveedores_excluidos (
  id         bigint generated always as identity primary key,
  sector     text    not null check (sector in ('vinos','spirits')),
  proveedor  text    not null,
  created_at timestamptz default now(),
  unique(sector, proveedor)
);

-- Deshabilitar RLS (función Netlify usa service role)
alter table agenda_registro       disable row level security;
alter table proveedores_excluidos disable row level security;
