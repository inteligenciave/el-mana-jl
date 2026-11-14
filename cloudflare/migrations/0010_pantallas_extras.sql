-- Funciones extra por rol en el lanzador «Opciones» (sección «Más opciones»). Solo el Dueño las asigna.
-- Esta tabla solo decide QUÉ APARECE en el lanzador; los permisos reales (ver/registrar/aprobar) siguen en la matriz y en cada API.
CREATE TABLE IF NOT EXISTS pantallas_extras (
  rol TEXT NOT NULL,
  clave TEXT NOT NULL,
  asignado_ts INTEGER NOT NULL,
  PRIMARY KEY (rol, clave)
);
