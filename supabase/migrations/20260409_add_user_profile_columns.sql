-- Add all user profile columns used by the app
-- Safe to run multiple times (IF NOT EXISTS)
-- Run this in the Supabase SQL editor

-- Basic profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image text;

-- Location (used in CoachProfile)
ALTER TABLE users ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city text;

-- Coach-specific
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS certifications text;

-- Trainee profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS main_goal text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_status text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS future_vision text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notes text;

-- Emergency contact
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone text;

-- Health declaration
ALTER TABLE users ADD COLUMN IF NOT EXISTS health_issues text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS health_declaration_accepted boolean default false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS medical_history text;

-- Vision (JSON object stored in TraineeProfile)
ALTER TABLE users ADD COLUMN IF NOT EXISTS vision jsonb;

-- Onboarding fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed boolean default false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS training_goals text[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS sport_background text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS fitness_level text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS training_frequency text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS motivation text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_training_style text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_notes text;
