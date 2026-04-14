-- Read-Only PostgreSQL Role for AI Queries
--
-- Defence-in-depth: even if SQL validation (validateAiSql) has a bypass,
-- the database user physically cannot execute writes.
--
-- Run once against the production database:
--   psql -U postgres -d customer_relations -f scripts/create-readonly-role.sql
--
-- After creating, set DATABASE_URL_READONLY in .env pointing to crm_ai_user.

-- Create the read-only role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_readonly') THEN
    CREATE ROLE crm_readonly;
  END IF;
END
$$;

-- Grant minimum privileges
GRANT CONNECT ON DATABASE customer_relations TO crm_readonly;
GRANT USAGE ON SCHEMA public TO crm_readonly;

-- Grant SELECT on all current tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO crm_readonly;

-- Grant SELECT on all future tables automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO crm_readonly;

-- Create a login user bound to this role
-- Replace '<STRONG_RANDOM_PASSWORD>' with a generated password:
--   openssl rand -base64 32
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_ai_user') THEN
    CREATE USER crm_ai_user WITH PASSWORD '<STRONG_RANDOM_PASSWORD>';
    GRANT crm_readonly TO crm_ai_user;
  END IF;
END
$$;
