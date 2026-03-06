-- Initialize PostGIS extension and create initial schema

-- Enable PostGIS extension for geospatial operations
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE activity_type AS ENUM ('run', 'ride', 'hike', 'walk', 'swim', 'ski', 'other');
CREATE TYPE difficulty_level AS ENUM ('easy', 'moderate', 'hard', 'expert');
CREATE TYPE readiness_status AS ENUM ('ready', 'almost_ready', 'not_ready', 'overqualified');
CREATE TYPE program_status AS ENUM ('not_started', 'in_progress', 'completed', 'paused');

-- Grant privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fitreadyiq_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fitreadyiq_user;
