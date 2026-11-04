-- Idempotent: existing installs may already have applied this by hand.
ALTER TYPE "JobSource" ADD VALUE IF NOT EXISTS 'MANUAL';
