-- ============================================================================
-- Zaguán Digital — Migración 005: Paquetería Inteligente, Estado `delivered` y OCR Multimodal
-- ============================================================================

-- Asegurar estado 'delivered' en el enum package_status
DO $$
BEGIN
  ALTER TYPE public.package_status ADD VALUE IF NOT EXISTS 'delivered';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS sender_name TEXT,
  ADD COLUMN IF NOT EXISTS time_window_label TEXT DEFAULT 'Hoy 08:00–22:00',
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_rule TEXT NOT NULL DEFAULT 'auto_open_after_ocr'
    CHECK (auto_rule IN ('auto_open_after_ocr', 'ask_confirmation_photo')),
  ADD COLUMN IF NOT EXISTS ocr_extracted JSONB,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_packages_expected_lookup
  ON public.packages(building_id, unit_id, status)
  WHERE status = 'expected';
