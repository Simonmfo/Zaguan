-- ============================================================================
-- Zaguán Digital — Migración 003: Seed Inicial y Publicación Realtime
-- ============================================================================

-- Habilitar Supabase Realtime para actualizaciones en vivo del Panel Admin y App
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.access_logs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.access_passes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.packages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.building_notices;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.units;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed idempotente: Edificio Pocitos 2468 + Unidades + Residentes + Llaves Maestras
DO $$
DECLARE
  v_bldg_id UUID;
  v_unit_1a UUID;
  v_unit_2b UUID;
  v_unit_3a UUID;
  v_unit_4b UUID;
  v_admin_id UUID;
  v_martin_id UUID;
  v_marta_id UUID;
BEGIN
  SELECT id INTO v_bldg_id FROM public.buildings WHERE name = 'Edificio Pocitos 2468' LIMIT 1;

  IF v_bldg_id IS NULL THEN
    INSERT INTO public.buildings (
      name, address, city, parcel_storage_mode,
      akuvox_endpoint, akuvox_api_user, akuvox_high_security_mode, akuvox_sip_server, akuvox_sip_extension
    ) VALUES (
      'Edificio Pocitos 2468',
      'Bvar. España 2468, Pocitos, Montevideo',
      'Montevideo',
      'zaguan',
      '192.168.1.120',
      'admin',
      true,
      '192.168.1.50',
      'e12w_entrada'
    ) RETURNING id INTO v_bldg_id;

    INSERT INTO public.units (building_id, unit_number, floor, is_occupied)
    VALUES (v_bldg_id, '1A', 1, true) RETURNING id INTO v_unit_1a;

    INSERT INTO public.units (building_id, unit_number, floor, is_occupied)
    VALUES (v_bldg_id, '2B', 2, true) RETURNING id INTO v_unit_2b;

    INSERT INTO public.units (building_id, unit_number, floor, is_occupied)
    VALUES (v_bldg_id, '3A', 3, true) RETURNING id INTO v_unit_3a;

    INSERT INTO public.units (building_id, unit_number, floor, is_occupied)
    VALUES (v_bldg_id, '4B', 4, true) RETURNING id INTO v_unit_4b;

    INSERT INTO public.users (building_id, role, full_name, email, phone)
    VALUES (v_bldg_id, 'building_admin', 'Administración Pocitos', 'admin@zaguan.uy', '+598 97 999 561')
    RETURNING id INTO v_admin_id;

    INSERT INTO public.users (building_id, unit_id, role, full_name, email, phone, personal_pin, duress_pin)
    VALUES (v_bldg_id, v_unit_4b, 'resident', 'Martín Silva', 'martin.silva@example.com', '+598 99 312 402', '4028', '4082')
    RETURNING id INTO v_martin_id;

    INSERT INTO public.users (building_id, unit_id, role, full_name, phone, personal_pin, duress_pin)
    VALUES
      (v_bldg_id, v_unit_3a, 'resident', 'Carolina Vega', '+598 98 640 301', '3019', '3091'),
      (v_bldg_id, v_unit_2b, 'resident', 'Roberto Pereyra', '+598 94 218 990', '2256', '2265'),
      (v_bldg_id, v_unit_1a, 'resident', 'Elena Morales (Saliente)', '+598 99 775 110', '1184', '1148');

    INSERT INTO public.users (building_id, unit_id, role, full_name, phone)
    VALUES (v_bldg_id, v_unit_4b, 'staff', 'Marta Giménez (Limpieza)', '+598 94 110 220')
    RETURNING id INTO v_marta_id;

    -- Pases iniciales (1 uso, recurrente y llaves maestras)
    INSERT INTO public.access_passes (
      building_id, unit_id, created_by_user_id, holder_name, pass_type, method,
      valid_from, valid_until, pin_code, qr_token, access_scope
    ) VALUES (
      v_bldg_id, v_unit_4b, v_martin_id, 'Sofía Méndez (Visita)', 'one_time', 'magic_link',
      now(), now() + interval '4 hours', '7310', 'ZAG-7310', 'Acceso peatonal y garaje'
    );

    INSERT INTO public.access_passes (
      building_id, unit_id, created_by_user_id, assigned_to_user_id, holder_name, pass_type, method,
      days_of_week, start_time, end_time, pin_code, qr_token, rfid_tag_uid, access_scope
    ) VALUES (
      v_bldg_id, v_unit_4b, v_martin_id, v_marta_id, 'Marta Giménez', 'recurring_schedule', 'rfid_tag',
      ARRAY['M','J'], '08:00', '13:00', '3140', 'ZAG-3140', 'RF-402M', 'Acceso peatonal Apto 4B'
    );

    INSERT INTO public.access_passes (
      building_id, created_by_user_id, holder_name, pass_type, method,
      valid_from, valid_until, pin_code, qr_token, is_master_key, provider_name, access_scope
    ) VALUES
      (v_bldg_id, v_admin_id, 'Carlos Méndez (Otis UY)', 'one_time', 'voice_code',
       now(), now() + interval '4 hours', '9041', 'ZAG-MK9041', true, 'Ascensores', 'Hall PB + Sala de Máquinas'),
      (v_bldg_id, v_admin_id, 'Cuadrilla OSE #14', 'one_time', 'voice_code',
       now(), now() + interval '12 hours', '7712', 'ZAG-MK7712', true, 'OSE', 'Sala de Medidores + Azotea');

    -- Paquete inicial recibido
    INSERT INTO public.packages (
      building_id, unit_id, resident_user_id, tracking_code, carrier, description,
      status, storage_mode, storage_location, validation_method, received_at
    ) VALUES (
      v_bldg_id, v_unit_4b, v_martin_id, '#ML-402', 'Mercado Libre Full', 'Cafetera Express',
      'received', 'zaguan', 'Zaguán Paquetería (Exclusa 1)', 'Pre-autorizado (OCR IA)', now()
    );

    -- Cartelera digital
    INSERT INTO public.building_notices (building_id, created_by_user_id, title, body, category, show_on_intercom, send_to_app)
    VALUES
      (v_bldg_id, v_admin_id, 'Corte de agua programado el jueves',
       'Limpieza semestral de tanques OSE este jueves de 09:00 a 13:00 hs. Se recomienda prever reserva.',
       'Mantenimiento', true, true),
      (v_bldg_id, v_admin_id, 'Mantenimiento preventivo de ascensor',
       'Revisión mensual técnica el viernes de 10:00 a 11:30 hs. Acceso por escalera habilitado.',
       'Aviso', true, true);

    -- Access logs iniciales
    INSERT INTO public.access_logs (building_id, unit_id, user_id, actor_name, event_source, method_used, direction, granted, notes)
    VALUES
      (v_bldg_id, v_unit_4b, v_martin_id, 'Repartidor Mercado Libre', 'package_ocr', 'ocr_label', 'entry', true, 'Paquete #ML-402 depositado en Zaguán sin interrumpir al residente'),
      (v_bldg_id, v_unit_4b, v_marta_id, 'Marta Giménez (Limpieza)', 'access_pass', 'rfid_tag', 'exit', true, 'Jornada registrada 08:04 → 12:58 (4h 54m) · Tag RF-402M'),
      (v_bldg_id, v_unit_4b, v_martin_id, 'Martín Silva', 'remote_app', 'nfc_hce', 'entry', true, 'Ingreso por proximidad BLE/NFC en Akuvox E12W');
  END IF;
END $$;
