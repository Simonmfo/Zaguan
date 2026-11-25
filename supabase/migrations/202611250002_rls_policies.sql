-- ============================================================================
-- Zaguán Digital — Migración 002: Aislamiento Multi-Edificio y Políticas RLS
-- ============================================================================

-- Funciones auxiliares SECURITY DEFINER (evitan recursión RLS en public.users)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_building_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT building_id FROM public.users WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_unit_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT unit_id FROM public.users WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_my_role() = 'super_admin', false);
$$;

CREATE OR REPLACE FUNCTION public.is_admin_of_building(target_building_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR (public.get_my_role() = 'building_admin' AND public.get_my_building_id() = target_building_id);
$$;

-- Habilitar RLS en todas las tablas del dominio
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_notices ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 1. Políticas para `buildings`
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS buildings_select ON public.buildings;
CREATE POLICY buildings_select ON public.buildings
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR id = public.get_my_building_id());

DROP POLICY IF EXISTS buildings_insert ON public.buildings;
CREATE POLICY buildings_insert ON public.buildings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS buildings_update ON public.buildings;
CREATE POLICY buildings_update ON public.buildings
  FOR UPDATE TO authenticated
  USING (public.is_admin_of_building(id))
  WITH CHECK (public.is_admin_of_building(id));

DROP POLICY IF EXISTS buildings_delete ON public.buildings;
CREATE POLICY buildings_delete ON public.buildings
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ----------------------------------------------------------------------------
-- 2. Políticas para `units`
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS units_select ON public.units;
CREATE POLICY units_select ON public.units
  FOR SELECT TO authenticated
  USING (
    public.is_admin_of_building(building_id)
    OR (building_id = public.get_my_building_id() AND id = public.get_my_unit_id())
  );

DROP POLICY IF EXISTS units_admin_write ON public.units;
CREATE POLICY units_admin_write ON public.units
  FOR ALL TO authenticated
  USING (public.is_admin_of_building(building_id))
  WITH CHECK (public.is_admin_of_building(building_id));

-- ----------------------------------------------------------------------------
-- 3. Políticas para `users`
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (public.get_my_role() = 'building_admin' AND building_id = public.get_my_building_id())
    OR auth_user_id = auth.uid()
    OR (unit_id IS NOT NULL AND unit_id = public.get_my_unit_id() AND building_id = public.get_my_building_id())
  );

DROP POLICY IF EXISTS users_admin_insert ON public.users;
CREATE POLICY users_admin_insert ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_my_role() = 'building_admin'
      AND building_id = public.get_my_building_id()
      AND role IN ('resident', 'staff')
    )
  );

DROP POLICY IF EXISTS users_admin_update ON public.users;
CREATE POLICY users_admin_update ON public.users
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_of_building(building_id)
    OR auth_user_id = auth.uid()
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.get_my_role() = 'building_admin'
      AND building_id = public.get_my_building_id()
      AND role IN ('resident', 'staff', 'building_admin')
    )
    OR (
      auth_user_id = auth.uid()
      AND role = public.get_my_role()
      AND building_id = public.get_my_building_id()
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Políticas para `access_passes`
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS access_passes_select ON public.access_passes;
CREATE POLICY access_passes_select ON public.access_passes
  FOR SELECT TO authenticated
  USING (
    public.is_admin_of_building(building_id)
    OR (
      building_id = public.get_my_building_id()
      AND is_master_key = false
      AND (
        unit_id = public.get_my_unit_id()
        OR assigned_to_user_id = public.get_my_profile_id()
      )
    )
  );

DROP POLICY IF EXISTS access_passes_insert ON public.access_passes;
CREATE POLICY access_passes_insert ON public.access_passes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_of_building(building_id)
    OR (
      public.get_my_role() = 'resident'
      AND building_id = public.get_my_building_id()
      AND unit_id = public.get_my_unit_id()
      AND is_master_key = false
    )
  );

DROP POLICY IF EXISTS access_passes_update ON public.access_passes;
CREATE POLICY access_passes_update ON public.access_passes
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_of_building(building_id)
    OR (
      public.get_my_role() = 'resident'
      AND building_id = public.get_my_building_id()
      AND unit_id = public.get_my_unit_id()
      AND is_master_key = false
    )
  )
  WITH CHECK (
    public.is_admin_of_building(building_id)
    OR (
      public.get_my_role() = 'resident'
      AND building_id = public.get_my_building_id()
      AND unit_id = public.get_my_unit_id()
      AND is_master_key = false
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Políticas para `packages`
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS packages_select ON public.packages;
CREATE POLICY packages_select ON public.packages
  FOR SELECT TO authenticated
  USING (
    public.is_admin_of_building(building_id)
    OR (building_id = public.get_my_building_id() AND unit_id = public.get_my_unit_id())
  );

DROP POLICY IF EXISTS packages_write ON public.packages;
CREATE POLICY packages_write ON public.packages
  FOR ALL TO authenticated
  USING (
    public.is_admin_of_building(building_id)
    OR (public.get_my_role() = 'resident' AND building_id = public.get_my_building_id() AND unit_id = public.get_my_unit_id())
  )
  WITH CHECK (
    public.is_admin_of_building(building_id)
    OR (public.get_my_role() = 'resident' AND building_id = public.get_my_building_id() AND unit_id = public.get_my_unit_id())
  );

-- ----------------------------------------------------------------------------
-- 6. Políticas para `access_logs` (Inmutable para residentes; admins ven todo su edificio)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS access_logs_select ON public.access_logs;
CREATE POLICY access_logs_select ON public.access_logs
  FOR SELECT TO authenticated
  USING (
    public.is_admin_of_building(building_id)
    OR (
      building_id = public.get_my_building_id()
      AND (
        unit_id = public.get_my_unit_id()
        OR user_id = public.get_my_profile_id()
      )
    )
  );

DROP POLICY IF EXISTS access_logs_insert ON public.access_logs;
CREATE POLICY access_logs_insert ON public.access_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_of_building(building_id)
    OR (building_id = public.get_my_building_id() AND (unit_id IS NULL OR unit_id = public.get_my_unit_id()))
  );

-- ----------------------------------------------------------------------------
-- 7. Políticas para `building_notices`
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS notices_select ON public.building_notices;
CREATE POLICY notices_select ON public.building_notices
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR building_id = public.get_my_building_id());

DROP POLICY IF EXISTS notices_admin_write ON public.building_notices;
CREATE POLICY notices_admin_write ON public.building_notices
  FOR ALL TO authenticated
  USING (public.is_admin_of_building(building_id))
  WITH CHECK (public.is_admin_of_building(building_id));
