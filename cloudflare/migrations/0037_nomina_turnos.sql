-- 0037 · Nómina edita los turnos: avisos para Gerencia cuando Nómina cambia un horario de turno.
-- Solo agrega una tabla. El historial de horarios (desde qué día vale cada cambio) va dentro del documento ajustes/turnos_bonos, que no se toca aquí.
-- Aplicar SOLO con --local hasta que el dueño autorice.
CREATE TABLE IF NOT EXISTS avisos_turnos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL DEFAULT 'horario',
  rol TEXT NOT NULL,                 -- quién hizo el cambio
  resumen TEXT NOT NULL,             -- frase para Gerencia, en palabras simples
  detalle TEXT,                      -- JSON: antes, después y desde qué día
  creado_ts INTEGER NOT NULL,
  visto_ts INTEGER,                  -- NULL = Gerencia todavía no lo ha visto
  visto_por TEXT
);
CREATE INDEX IF NOT EXISTS ix_avisos_turnos_visto ON avisos_turnos (visto_ts, creado_ts);
