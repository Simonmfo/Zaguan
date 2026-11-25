-- ============================================================================
-- Zaguán Digital — Migración 004: Geolocalización del Edificio y RPC Magic Link
-- ============================================================================

ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION NOT NULL DEFAULT -34.914620,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION NOT NULL DEFAULT -56.151890,
  ADD COLUMN IF NOT EXISTS geofence_radius_meters INTEGER NOT NULL DEFAULT 30 CHECK (geofence_radius_meters BETWEEN 5 AND 500);

-- Actualizar edificio demo Pocitos 2468 (Bvar. España 2468, Montevideo)
UPDATE public.buildings
   SET latitude = -34.914620,
       longitude = -56.151890,
       geofence_radius_meters = 30
 WHERE name = 'Edificio Pocitos 2468';

-- Función auxiliar Haversine en metros
CREATE OR REPLACE FUNCTION public.haversine_distance_meters(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 6371000.0 * 2.0 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2.0), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lon2 - lon1) / 2.0), 2)
    )
  );
$$;

-- RPC Pública (anónima) para consultar estado de un Magic Link sin exponer datos privados del edificio
CREATE OR REPLACE FUNCTION public.get_public_magic_link_pass(p_qr_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pass public.access_passes%ROWTYPE;
  v_bldg public.buildings%ROWTYPE;
  v_unit_number TEXT;
BEGIN
  PERFORM public.expire_elapsed_access_passes(NULL);

  SELECT * INTO v_pass
    FROM public.access_passes
   WHERE upper(qr_token) = upper(trim(p_qr_token))
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'status', 'not_found', 'reason', 'El enlace del pase no existe.');
  END IF;

  SELECT * INTO v_bldg FROM public.buildings WHERE id = v_pass.building_id;
  SELECT unit_number INTO v_unit_number FROM public.units WHERE id = v_pass.unit_id;

  IF v_pass.status <> 'active' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'status', v_pass.status::TEXT,
      'reason', CASE v_pass.status
        WHEN 'used' THEN 'Este pase de un solo uso ya fue utilizado.'
        WHEN 'expired' THEN 'Este pase expiró fuera de su vigencia.'
        WHEN 'revoked' THEN 'Este pase fue revocado por el residente.'
        ELSE 'Este pase ya no se encuentra activo.'
      END,
      'building_name', v_bldg.name
    );
  END IF;

  IF now() < v_pass.valid_from OR (v_pass.valid_until IS NOT NULL AND now() > v_pass.valid_until) THEN
    UPDATE public.access_passes SET status = 'expired' WHERE id = v_pass.id;
    RETURN jsonb_build_object('valid', false, 'status', 'expired', 'reason', 'El pase superó su ventana horaria.');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'status', 'active',
    'qr_token', v_pass.qr_token,
    'pin_code', v_pass.pin_code,
    'holder_name', v_pass.holder_name,
    'pass_type', v_pass.pass_type::TEXT,
    'valid_until', v_pass.valid_until,
    'access_scope', v_pass.access_scope,
    'unit_number', COALESCE(v_unit_number, 'PB'),
    'building_id', v_bldg.id,
    'building_name', v_bldg.name,
    'building_address', v_bldg.address,
    'latitude', v_bldg.latitude,
    'longitude', v_bldg.longitude,
    'geofence_radius_meters', v_bldg.geofence_radius_meters
  );
END;
$$;

-- RPC Pública para redimir (abrir puerta + quemar pase one_time + registrar access_logs) verificando GPS
CREATE OR REPLACE FUNCTION public.redeem_magic_link_pass(
  p_qr_token TEXT,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pass public.access_passes%ROWTYPE;
  v_bldg public.buildings%ROWTYPE;
  v_distance DOUBLE PRECISION;
BEGIN
  PERFORM public.expire_elapsed_access_passes(NULL);

  SELECT * INTO v_pass
    FROM public.access_passes
   WHERE upper(qr_token) = upper(trim(p_qr_token))
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'Pase no encontrado.');
  END IF;

  IF v_pass.status <> 'active' THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'El pase ya fue utilizado, expiró o fue revocado.');
  END IF;

  IF now() < v_pass.valid_from OR (v_pass.valid_until IS NOT NULL AND now() > v_pass.valid_until) THEN
    UPDATE public.access_passes SET status = 'expired' WHERE id = v_pass.id;
    RETURN jsonb_build_object('granted', false, 'reason', 'El pase expiró por ventana horaria.');
  END IF;

  SELECT * INTO v_bldg FROM public.buildings WHERE id = v_pass.building_id;

  v_distance := public.haversine_distance_meters(p_lat, p_lng, v_bldg.latitude, v_bldg.longitude);

  IF v_distance > v_bldg.geofence_radius_meters THEN
    INSERT INTO public.access_logs (
      building_id, unit_id, access_pass_id, actor_name, event_source, method_used, direction, granted, notes
    ) VALUES (
      v_pass.building_id, v_pass.unit_id, v_pass.id, v_pass.holder_name, 'access_pass', 'magic_link_gps', 'alert', false,
      format('Intento de apertura a distancia bloqueado (%s m > radio %s m).', round(v_distance::numeric, 1), v_bldg.geofence_radius_meters)
    );
    RETURN jsonb_build_object(
      'granted', false,
      'distance_meters', round(v_distance::numeric, 1),
      'max_radius_meters', v_bldg.geofence_radius_meters,
      'reason', format('Estás a %s m del edificio. Acercate a menos de %s m de la puerta.', round(v_distance::numeric, 0), v_bldg.geofence_radius_meters)
    );
  END IF;

  IF v_pass.pass_type = 'one_time' THEN
    UPDATE public.access_passes
       SET status = 'used',
           used_at = now()
     WHERE id = v_pass.id;
  END IF;

  INSERT INTO public.access_logs (
    building_id, unit_id, access_pass_id, actor_name, event_source, method_used, direction, granted, notes
  ) VALUES (
    v_pass.building_id, v_pass.unit_id, v_pass.id, v_pass.holder_name, 'access_pass', 'magic_link_gps', 'entry', true,
    format('Apertura Magic Link verificada por GPS (%s m). Pase %s.', round(v_distance::numeric, 1), CASE WHEN v_pass.pass_type = 'one_time' THEN 'quemado (1 uso)' ELSE 'activo' END)
  );

  RETURN jsonb_build_object(
    'granted', true,
    'distance_meters', round(v_distance::numeric, 1),
    'burned', v_pass.pass_type = 'one_time',
    'message', 'Puerta abierta. Bienvenido al edificio.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_magic_link_pass(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_magic_link_pass(TEXT, DOUBLE PRECISION, DOUBLE PRECISION) TO anon, authenticated;
