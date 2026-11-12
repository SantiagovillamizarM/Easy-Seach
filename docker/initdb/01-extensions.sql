-- Se ejecuta automáticamente al crear la base de datos por primera vez.
-- pgvector: tipo de dato "vector" y búsqueda por similitud.
CREATE EXTENSION IF NOT EXISTS vector;
-- unaccent: permite buscar "Piedecuesta" aunque se escriba sin tildes, etc.
CREATE EXTENSION IF NOT EXISTS unaccent;
-- pg_trgm: similitud de texto (útil para detectar duplicados).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
