-- Pagos de nómina registrados (Pagar nómina) con el descuento de préstamo. Solo agrega. Aplicar SOLO con --local.
CREATE TABLE IF NOT EXISTS pagos_nomina (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empleado_id TEXT NOT NULL,
  periodo TEXT NOT NULL CHECK (periodo IN ('semana','quincena','mes')),
  desde TEXT NOT NULL,                -- AAAA-MM-DD
  hasta TEXT NOT NULL,
  base REAL NOT NULL DEFAULT 0,       -- todo en bolívares
  extra REAL NOT NULL DEFAULT 0,
  bonos REAL NOT NULL DEFAULT 0,
  ley REAL NOT NULL DEFAULT 0,
  descuento_prestamo REAL NOT NULL DEFAULT 0,
  neto REAL NOT NULL,
  prestamos TEXT,                     -- JSON: [{id, bs, cuotas}] lo que se descontó de cada préstamo
  detalle TEXT,                       -- JSON: días, horas, horas extra y de dónde salieron
  fecha TEXT NOT NULL,                -- fecha del pago
  forma TEXT NOT NULL CHECK (forma IN ('Efectivo','Transferencia','Pago móvil')),
  nota TEXT,
  quien TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pagos_nomina_emp ON pagos_nomina (empleado_id, desde, hasta);
