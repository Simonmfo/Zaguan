-- ============================================================================
-- Zaguán Digital — Migración 001: Esquema Multi-Edificio, Roles, Accesos y Akuvox E12W
-- Proyecto Supabase: https://wjjjxdlorndnkufyyjef.supabase.co
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Tipos enumerados del dominio
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('super_admin', 'building_admin', 'resident', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.access_pass_type AS ENUM ('one_time', 'recurring_schedule', 'permanent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.access_pass_method AS ENUM ('magic_link', 'nfc_hce', 'rfid_tag', 'voice_code');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.access_pass_status AS ENUM ('active', 'used', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.package_status AS ENUM ('expected', 'received', 'picked_up', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.access_event_source AS ENUM (
    'remote_app',
    'ai_voice',
    'access_pass',
    'master_key',
    'package_ocr',
    'duress_pin',
    'loitering_alert',
    'admin_action'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabla: buildings (Edificios + configuración de paquetería y Akuvox E12W)
CREATE TABLE IF NOT EXISTS public.buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Montevideo',
  parcel_storage_mode TEXT NOT NULL DEFAULT 'zaguan' CHECK (parcel_storage_mode IN ('zaguan', 'locker')),
  parcel_schedule_config JSONB NOT NULL DEFAULT '{
    "enabled": true,
    "allow_24h": false,
    "start_time": "08:00",
    "end_time": "22:00",
    "spontaneous_timeout_seconds": 20,
    "default_unannounced_rule": "auto-zaguan"
  }'::jsonb,
  -- Configuración de integración Akuvox E12W
  akuvox_endpoint TEXT,
  akuvox_http_port INTEGER NOT NULL DEFAULT 80,
  akuvox_api_user TEXT NOT NULL DEFAULT 'admin',
  akuvox_api_password_encrypted TEXT,
  akuvox_high_security_mode BOOLEAN NOT NULL DEFAULT true,
  akuvox_sip_server TEXT,
  akuvox_sip_extension TEXT,
  akuvox_has_wiegand_keypad BOOLEAN NOT NULL DEFAULT false,
  secondary_relay_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabla: units (Apartamentos por edificio)
CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  floor INTEGER NOT NULL DEFAULT 1,
  tower_block TEXT,
  is_occupied BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (building_id, unit_number)
);

CREATE INDEX IF NOT EXISTS idx_units_building_id ON public.units(building_id);

-- 4. Tabla: users (Perfiles multi-rol vinculados a Supabase Auth cuando corresponda)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  role public.user_role NOT NULL DEFAULT 'resident',
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  personal_pin CHAR(4) CHECK (personal_pin ~ '^[0-9]{4}$'),
  duress_pin CHAR(4) CHECK (duress_pin ~ '^[0-9]{4}$'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  move_in_date DATE DEFAULT CURRENT_DATE,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_building_required_unless_super CHECK (
    role = 'super_admin' OR building_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_users_building_id ON public.users(building_id);
CREATE INDEX IF NOT EXISTS idx_users_unit_id ON public.users(unit_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON public.users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON public.users(building_id, role, is_active);

-- 5. Tabla: access_passes (Un solo uso, recurrentes por horario, permanentes y llaves maestras)
CREATE TABLE IF NOT EXISTS public.access_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  holder_name TEXT NOT NULL,
  pass_type public.access_pass_type NOT NULL DEFAULT 'one_time',
  method public.access_pass_method NOT NULL DEFAULT 'magic_link',
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  -- Días permitidos para recurring_schedule: ['L','M','X','J','V','S','D']
  days_of_week TEXT[] DEFAULT ARRAY['L','M','X','J','V','S','D']::TEXT[],
  start_time TIME,
  end_time TIME,
  status public.access_pass_status NOT NULL DEFAULT 'active',
  pin_code CHAR(4) NOT NULL CHECK (pin_code ~ '^[0-9]{4}$'),
  qr_token TEXT UNIQUE NOT NULL DEFAULT ('ZAG-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6))),
  rfid_tag_uid TEXT,
  is_master_key BOOLEAN NOT NULL DEFAULT false,
  provider_name TEXT, -- Ej. UTE, OSE, Antel, Ascensores, Bomberos
  access_scope TEXT NOT NULL DEFAULT 'Acceso peatonal',
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_passes_building_status ON public.access_passes(building_id, status);
CREATE INDEX IF NOT EXISTS idx_access_passes_unit_id ON public.access_passes(unit_id);
CREATE INDEX IF NOT EXISTS idx_access_passes_created_by ON public.access_passes(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_access_passes_pin_lookup ON public.access_passes(building_id, pin_code) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_access_passes_rfid_lookup ON public.access_passes(building_id, rfid_tag_uid) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_access_passes_valid_until ON public.access_passes(valid_until) WHERE status = 'active';

-- 6. Tabla: packages (Pre-autorizaciones OCR y entregas recibidas con foto comprobante)
CREATE TABLE IF NOT EXISTS public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  resident_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  tracking_code TEXT NOT NULL,
  carrier TEXT NOT NULL,
  description TEXT,
  status public.package_status NOT NULL DEFAULT 'expected',
  storage_mode TEXT NOT NULL DEFAULT 'zaguan' CHECK (storage_mode IN ('zaguan', 'locker')),
  storage_location TEXT,
  validation_method TEXT,
  proof_photo_url TEXT,
  third_party_pickup_pin CHAR(4) CHECK (third_party_pickup_pin IS NULL OR third_party_pickup_pin ~ '^[0-9]{4}$'),
  expected_at TIMESTAMPTZ DEFAULT now(),
  received_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_packages_building_status ON public.packages(building_id, status);
CREATE INDEX IF NOT EXISTS idx_packages_unit_id ON public.packages(unit_id);

-- 7. Tabla: access_logs (Historial auditable de eventos y capturas del Akuvox E12W)
CREATE TABLE IF NOT EXISTS public.access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  access_pass_id UUID REFERENCES public.access_passes(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  event_source public.access_event_source NOT NULL,
  method_used TEXT NOT NULL, -- Ej: magic_link, rfid_tag, nfc_hce, voice_code, remote_open, ocr_label
  direction TEXT NOT NULL DEFAULT 'entry' CHECK (direction IN ('entry', 'exit', 'alert', 'system')),
  granted BOOLEAN NOT NULL DEFAULT true,
  snapshot_url TEXT, -- Foto captura en vivo del Akuvox E12W (:8080/picture.jpg)
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_logs_building_time ON public.access_logs(building_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_unit_time ON public.access_logs(unit_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_source ON public.access_logs(building_id, event_source);

-- 8. Tabla: building_notices (Cartelera digital y comunicados oficiales)
CREATE TABLE IF NOT EXISTS public.building_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Aviso' CHECK (category IN ('Mantenimiento', 'Aviso', 'Urgente')),
  show_on_intercom BOOLEAN NOT NULL DEFAULT true,
  send_to_app BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notices_building_active ON public.building_notices(building_id, is_active, published_at DESC);

-- ============================================================================
-- 9. Triggers y Funciones de Negocio en Base de Datos
-- ============================================================================

-- Trigger genérico para actualizar updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_buildings_updated ON public.buildings;
CREATE TRIGGER trg_buildings_updated BEFORE UPDATE ON public.buildings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_units_updated ON public.units;
CREATE TRIGGER trg_units_updated BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated ON public.users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_access_passes_updated ON public.access_passes;
CREATE TRIGGER trg_access_passes_updated BEFORE UPDATE ON public.access_passes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_packages_updated ON public.packages;
CREATE TRIGGER trg_packages_updated BEFORE UPDATE ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- TRIGGER CRÍTICO: Al dar de baja un residente (is_active -> false),
-- revoca automáticamente TODOS sus pases creados o asignados y deja registro en access_logs.
CREATE OR REPLACE FUNCTION public.revoke_passes_on_user_deactivation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revoked_count INTEGER := 0;
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    NEW.deactivated_at := COALESCE(NEW.deactivated_at, now());

    UPDATE public.access_passes
       SET status = 'revoked',
           revoked_at = now(),
           updated_at = now()
     WHERE status = 'active'
       AND building_id = NEW.building_id
       AND (
         created_by_user_id = NEW.id
         OR assigned_to_user_id = NEW.id
         OR (NEW.unit_id IS NOT NULL AND unit_id = NEW.unit_id AND is_master_key = false)
       );

    GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

    INSERT INTO public.access_logs (
      building_id,
      unit_id,
      user_id,
      actor_name,
      event_source,
      method_used,
      direction,
      granted,
      notes
    ) VALUES (
      NEW.building_id,
      NEW.unit_id,
      NEW.id,
      NEW.full_name,
      'admin_action',
      'resident_offboarding',
      'system',
      true,
      format('Baja automática: %s pase(s) y permiso(s) revocados al instante.', v_revoked_count)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_revoke_passes_on_deactivation ON public.users;
CREATE TRIGGER trg_revoke_passes_on_deactivation
  BEFORE UPDATE OF is_active ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_passes_on_user_deactivation();

-- Función para expirar automáticamente pases y llaves maestras vencidas
CREATE OR REPLACE FUNCTION public.expire_elapsed_access_passes(p_building_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  UPDATE public.access_passes
     SET status = 'expired',
         updated_at = now()
   WHERE status = 'active'
     AND valid_until IS NOT NULL
     AND valid_until < now()
     AND (p_building_id IS NULL OR building_id = p_building_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Función RPC atómica para validar QR / PIN / RFID desde el puente Akuvox E12W
CREATE OR REPLACE FUNCTION public.validate_akuvox_access(
  p_building_id UUID,
  p_credential TEXT,
  p_method TEXT DEFAULT 'magic_link',
  p_snapshot_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pass public.access_passes%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_day_code TEXT;
  v_local_time TIME;
BEGIN
  -- 1. Expirar vencidos primero
  PERFORM public.expire_elapsed_access_passes(p_building_id);

  -- 2. Buscar pase activo por qr_token, pin_code o rfid_tag_uid
  SELECT * INTO v_pass
    FROM public.access_passes
   WHERE building_id = p_building_id
     AND status = 'active'
     AND (
       upper(qr_token) = upper(p_credential)
       OR pin_code = p_credential
       OR upper(COALESCE(rfid_tag_uid, '')) = upper(p_credential)
     )
   LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.access_logs (
      building_id, actor_name, event_source, method_used, direction, granted, snapshot_url, notes
    ) VALUES (
      p_building_id, 'Desconocido', 'access_pass', p_method, 'alert', false, p_snapshot_url,
      format('Credencial inválida o revocada: %s', p_credential)
    );
    RETURN jsonb_build_object('granted', false, 'reason', 'Credencial inválida, expirada o revocada');
  END IF;

  -- 3. Verificar ventana de fechas
  IF v_now < v_pass.valid_from OR (v_pass.valid_until IS NOT NULL AND v_now > v_pass.valid_until) THEN
    UPDATE public.access_passes SET status = 'expired' WHERE id = v_pass.id;
    RETURN jsonb_build_object('granted', false, 'reason', 'Pase fuera de vigencia');
  END IF;

  -- 4. Verificar franja horaria en recurring_schedule (hora Uruguay UTC-3)
  IF v_pass.pass_type = 'recurring_schedule' THEN
    v_day_code := (ARRAY['D','L','M','X','J','V','S'])[EXTRACT(DOW FROM (v_now AT TIME ZONE 'America/Montevideo'))::INT + 1];
    v_local_time := (v_now AT TIME ZONE 'America/Montevideo')::TIME;

    IF NOT (v_day_code = ANY(v_pass.days_of_week))
       OR (v_pass.start_time IS NOT NULL AND v_local_time < v_pass.start_time)
       OR (v_pass.end_time IS NOT NULL AND v_local_time > v_pass.end_time) THEN
      INSERT INTO public.access_logs (
        building_id, unit_id, access_pass_id, actor_name, event_source, method_used, direction, granted, snapshot_url, notes
      ) VALUES (
        p_building_id, v_pass.unit_id, v_pass.id, v_pass.holder_name, 'access_pass', p_method, 'alert', false, p_snapshot_url,
        format('Bloqueado fuera de horario (%s %s)', v_day_code, to_char(v_local_time, 'HH24:MI'))
      );
      RETURN jsonb_build_object('granted', false, 'reason', 'Acceso bloqueado fuera de días/horarios permitidos');
    END IF;
  END IF;

  -- 5. Destruir pase one_time al primer uso
  IF v_pass.pass_type = 'one_time' THEN
    UPDATE public.access_passes
       SET status = 'used',
           used_at = v_now
     WHERE id = v_pass.id;
  END IF;

  -- 6. Registrar auditoría
  INSERT INTO public.access_logs (
    building_id, unit_id, access_pass_id, actor_name, event_source, method_used, direction, granted, snapshot_url, notes
  ) VALUES (
    p_building_id,
    v_pass.unit_id,
    v_pass.id,
    v_pass.holder_name,
    CASE WHEN v_pass.is_master_key THEN 'master_key'::public.access_event_source ELSE 'access_pass'::public.access_event_source END,
    p_method,
    'entry',
    true,
    p_snapshot_url,
    CASE WHEN v_pass.pass_type = 'one_time' THEN 'Pase de 1 uso consumido y autodestruido' ELSE 'Acceso autorizado' END
  );

  RETURN jsonb_build_object(
    'granted', true,
    'pass_id', v_pass.id,
    'holder_name', v_pass.holder_name,
    'is_master_key', v_pass.is_master_key
  );
END;
$$;
