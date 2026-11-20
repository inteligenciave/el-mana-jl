-- Reversa de 0030. Quita los esquemas de bono, los bonos aplicados con el sistema nuevo, el archivo y las marcas de fritura por persona.
-- Se pierde: lo guardado en esas cinco tablas (bonos nuevos ya aplicados incluidos: si ya se pagaron en una nómina, el pago conserva su monto). La regla vieja (ajustes/turnos_bonos) y bonos_turno no se tocaron.
DROP TABLE IF EXISTS etapa_personas;
DROP TABLE IF EXISTS bonos_archivo;
DROP TABLE IF EXISTS bonos_aplicados_emp;
DROP TABLE IF EXISTS bonos_aplicados;
DROP TABLE IF EXISTS bonos_esquemas;
