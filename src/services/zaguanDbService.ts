import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import {
  AccessEventSource,
  AccessLogRecord,
  BuildingNotice,
  BuildingRecord,
  BuildingTenant,
  BuildingUnit,
  MasterKeyRecord,
  ParcelItem,
  PreAuthorizedParcel,
  QrPass,
  RecurringPass,
  UserRole,
} from '../types/zaguan';

export interface SupabaseSyncStatus {
  connected: boolean;
  message: string;
  authenticatedEmail?: string | null;
  tablesReady?: boolean;
}

export async function checkSupabaseHealth(): Promise<SupabaseSyncStatus> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      connected: false,
      message:
        'Ingresá la Publishable / Anon Key de https://wjjjxdlorndnkufyyjef.supabase.co para sincronizar en vivo (modo local activo).',
    };
  }

  try {
    const [{ data: authData }, { error: tableErr }] = await Promise.all([
      client.auth.getSession(),
      client.from('buildings').select('id').limit(1),
    ]);

    if (tableErr) {
      const missingTable =
        tableErr.code === '42P01' || tableErr.message.toLowerCase().includes('relation');
      return {
        connected: !missingTable,
        tablesReady: false,
        authenticatedEmail: authData.session?.user?.email ?? null,
        message: missingTable
          ? 'Conectado a Supabase, pero faltan aplicar las migraciones SQL de /supabase/migrations/.'
          : `Conectado a Supabase (${tableErr.message})`,
      };
    }

    return {
      connected: true,
      tablesReady: true,
      authenticatedEmail: authData.session?.user?.email ?? null,
      message: 'Conectado en tiempo real a Supabase (tablas y RLS listos).',
    };
  } catch (err) {
    return {
      connected: false,
      message: `Error de conexión con Supabase: ${err instanceof Error ? err.message : 'Red'}`,
    };
  }
}

export async function signInSupabase(
  email: string,
  password: string
): Promise<{ ok: boolean; message: string; email?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, message: 'Configurá primero la Anon/Publishable Key de Supabase.' };
  }
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    message: `Sesión iniciada como ${data.user?.email}`,
    email: data.user?.email ?? undefined,
  };
}

export async function signOutSupabase(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

export async function syncBuildingToSupabase(building: BuildingRecord): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.from('buildings').insert({
    name: building.name,
    address: building.address,
    city: building.city,
    latitude: building.latitude,
    longitude: building.longitude,
    geofence_radius_meters: building.geofenceRadiusMeters,
    parcel_storage_mode: building.parcelStorageMode,
    parcel_schedule_config: {
      enabled: true,
      start_time: building.parcelHoursStart,
      end_time: building.parcelHoursEnd,
      spontaneous_timeout_seconds: building.spontaneousTimeoutSec,
    },
    akuvox_endpoint: building.akuvoxIp,
    akuvox_api_user: building.akuvoxApiUser,
  });
}

export async function syncUnitToSupabase(unit: BuildingUnit): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.from('units').upsert({
    building_id: unit.buildingId,
    unit_number: unit.unitNumber,
    floor: unit.floor,
    tower_block: unit.towerBlock || null,
    is_occupied: unit.isOccupied,
  });
}

export async function syncTenantToSupabase(
  tenant: BuildingTenant,
  unitId?: string
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.from('users').insert({
    building_id: tenant.buildingId,
    unit_id: unitId || null,
    role: tenant.role as UserRole,
    full_name: tenant.name,
    email: tenant.email || null,
    phone: tenant.phone,
    personal_pin: tenant.personalPin,
    duress_pin: tenant.duressPin,
    is_active: tenant.status === 'Activo',
  });
}

export async function deactivateTenantInSupabase(tenantId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  // El trigger SQL `trg_revoke_passes_on_deactivation` revoca todos los pases automáticamente
  await client.from('users').update({ is_active: false }).eq('id', tenantId);
}

export async function syncMasterKeyToSupabase(mk: MasterKeyRecord): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.from('access_passes').insert({
    building_id: mk.buildingId,
    holder_name: mk.technicianName,
    pass_type: 'one_time',
    method: 'voice_code',
    valid_from: new Date().toISOString(),
    valid_until: mk.expiresAtIso,
    pin_code: mk.pin,
    is_master_key: true,
    provider_name: mk.provider,
    access_scope: mk.scope,
    status: 'active',
  });
}

export async function syncSingleUsePassToSupabase(
  buildingId: string,
  pass: QrPass
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.from('access_passes').insert({
    building_id: buildingId,
    holder_name: pass.guestName,
    pass_type: 'one_time',
    method: 'magic_link',
    valid_from: new Date().toISOString(),
    valid_until: pass.validUntilIso || new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    pin_code: pass.pin,
    qr_token: pass.code,
    access_scope: pass.accessScope,
    status: 'active',
  });
}

export async function syncRecurringPassToSupabase(
  buildingId: string,
  staff: RecurringPass
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.from('access_passes').insert({
    building_id: buildingId,
    holder_name: `${staff.name} (${staff.role})`,
    pass_type: 'recurring_schedule',
    method: staff.rfidTag ? 'rfid_tag' : 'nfc_hce',
    days_of_week: staff.days,
    start_time: staff.startTime,
    end_time: staff.endTime,
    pin_code: staff.pin,
    rfid_tag_uid: staff.rfidTag || null,
    access_scope: `Acceso personal Apto ${staff.unit}`,
    status: 'active',
  });
}

export async function revokePassInSupabase(qrOrPin: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client
    .from('access_passes')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .or(`qr_token.eq.${qrOrPin},pin_code.eq.${qrOrPin}`);
}

export async function syncPreAuthPackageToSupabase(
  buildingId: string,
  unitId: string | undefined,
  parcel: PreAuthorizedParcel
): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !unitId) return;
  await client.from('packages').insert({
    building_id: buildingId,
    unit_id: unitId,
    tracking_code: `EXP-${Date.now().toString().slice(-4)}`,
    carrier: parcel.carrier,
    description: parcel.description,
    time_window_label: parcel.timeWindowLabel,
    auto_rule: parcel.autoRule,
    status: 'expected',
    storage_mode: parcel.storageMode,
  });
}

export async function syncDeliveredPackageToSupabase(
  buildingId: string,
  unitId: string | undefined,
  parcel: ParcelItem
): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !unitId) return;
  await client.from('packages').insert({
    building_id: buildingId,
    unit_id: unitId,
    tracking_code: parcel.code,
    carrier: parcel.carrier,
    description: parcel.note,
    status: 'delivered',
    storage_mode: parcel.storageMode,
    storage_location: parcel.location,
    validation_method: parcel.validationMethod,
    proof_photo_url: parcel.imageUrl || null,
    delivered_at: new Date().toISOString(),
  });
}

export async function syncNoticeToSupabase(
  buildingId: string,
  notice: BuildingNotice
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.from('building_notices').insert({
    building_id: buildingId,
    title: notice.title,
    body: notice.body,
    category: notice.category,
    show_on_intercom: notice.showOnIntercom,
    send_to_app: notice.sentToApp,
  });
}

export async function syncAccessLogToSupabase(log: AccessLogRecord): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  await client.from('access_logs').insert({
    building_id: log.buildingId,
    actor_name: log.actorName,
    event_source: log.eventSource as AccessEventSource,
    method_used: log.methodUsed,
    direction: log.direction,
    granted: log.granted,
    snapshot_url: log.snapshotUrl || null,
    notes: log.notes,
    occurred_at: log.occurredAtIso,
  });
}

export async function fetchBuildingsFromSupabase(): Promise<BuildingRecord[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.from('buildings').select('*').order('created_at');
  if (error || !data || data.length === 0) return null;
  return data.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    address: String(row.address),
    city: String(row.city || 'Montevideo'),
    latitude: Number(row.latitude ?? -34.91462),
    longitude: Number(row.longitude ?? -56.15189),
    geofenceRadiusMeters: Number(row.geofence_radius_meters ?? 30),
    parcelStorageMode: row.parcel_storage_mode === 'locker' ? 'locker' : 'zaguan',
    parcelHoursStart: String(row.parcel_schedule_config?.start_time || '08:00'),
    parcelHoursEnd: String(row.parcel_schedule_config?.end_time || '22:00'),
    spontaneousTimeoutSec: Number(row.parcel_schedule_config?.spontaneous_timeout_seconds || 20),
    akuvoxIp: String(row.akuvox_endpoint || '192.168.1.120'),
    akuvoxApiUser: String(row.akuvox_api_user || 'admin'),
  }));
}

export async function fetchPublicMagicLinkFromSupabase(token: string) {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.rpc('get_public_magic_link_pass', {
    p_qr_token: token,
  });
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

export async function redeemMagicLinkInSupabase(
  token: string,
  lat: number,
  lng: number
): Promise<{ granted: boolean; reason?: string; distance_meters?: number; burned?: boolean } | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.rpc('redeem_magic_link_pass', {
    p_qr_token: token,
    p_lat: lat,
    p_lng: lng,
  });
  if (error || !data) return null;
  return data as { granted: boolean; reason?: string; distance_meters?: number; burned?: boolean };
}

export function subscribeToAccessLogsRealtime(
  onNewLog: (record: AccessLogRecord) => void
): RealtimeChannel | null {
  const client = getSupabaseClient();
  if (!client) return null;

  const channel = client
    .channel('zaguan-access-logs-realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'access_logs' },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        const occurredAtIso = String(row.occurred_at || new Date().toISOString());
        const d = new Date(occurredAtIso);
        onNewLog({
          id: String(row.id || `rt-${Date.now()}`),
          buildingId: String(row.building_id || 'bldg-pocitos-2468'),
          actorName: String(row.actor_name || 'Evento en vivo'),
          eventSource: (row.event_source as AccessEventSource) || 'access_pass',
          methodUsed: String(row.method_used || 'akuvox_e12w'),
          direction: (row.direction as AccessLogRecord['direction']) || 'entry',
          granted: Boolean(row.granted ?? true),
          snapshotUrl: row.snapshot_url ? String(row.snapshot_url) : undefined,
          notes: String(row.notes || ''),
          occurredAtIso,
          dateKey: occurredAtIso.slice(0, 10),
          timeLabel: d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }),
        });
      }
    )
    .subscribe();

  return channel;
}
