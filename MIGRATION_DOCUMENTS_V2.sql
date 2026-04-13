-- Migration: Add PDF URL columns to users table for signed documents
-- Run this in Supabase SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS health_declaration_pdf_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cooperation_agreement_pdf_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS health_declaration_metadata JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cooperation_agreement_metadata JSONB;
