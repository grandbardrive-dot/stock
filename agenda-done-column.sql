-- Agregar columna done para distinguir "asignado por Laura" de "marcado hecho por los chicos"
ALTER TABLE agenda_registro ADD COLUMN IF NOT EXISTS done boolean not null default false;
