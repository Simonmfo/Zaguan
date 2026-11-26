import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/zaguan_models.dart';
import '../services/akuvox_dart_service.dart';
import '../state/zaguan_store.dart';

class ResidentShell extends StatefulWidget {
  const ResidentShell({super.key, required this.store});

  final ZaguanStore store;

  @override
  State<ResidentShell> createState() => _ResidentShellState();
}

class _ResidentShellState extends State<ResidentShell> {
  int _tabIndex = 0;
  int _passesSubTab = 0; // 0: 1 Uso | 1: Recurrentes | 2: Coacción

  // Pase 1 Uso
  final _guestNameCtrl = TextEditingController();
  int _guestHours = 4;

  // Pase Recurrente
  final _recNameCtrl = TextEditingController();
  String _recRole = 'Limpieza';
  final Set<String> _recDays = {'M', 'J'};
  String _recStart = '08:00';
  String _recEnd = '13:00';
  final _recRfidCtrl = TextEditingController();
  bool _recMobileAccess = true;
  String? _recError;

  // PIN Coacción
  final _newPinCtrl = TextEditingController();

  // Paquetería
  String _pkgCarrier = 'Mercado Libre';
  final _pkgDescCtrl = TextEditingController();
  final _pkgWindowCtrl = TextEditingController(text: 'Hoy 09:00–18:00');
  PackageAutoRule _pkgRule = PackageAutoRule.autoOpenAfterOcr;

  // Hablar en Timbre E12W
  bool _showTalkInput = false;
  final _talkCtrl = TextEditingController();
  final _channelCtrl = TextEditingController(text: 'pocitos-2468');

  @override
  void dispose() {
    _guestNameCtrl.dispose();
    _recNameCtrl.dispose();
    _recRfidCtrl.dispose();
    _newPinCtrl.dispose();
    _pkgDescCtrl.dispose();
    _pkgWindowCtrl.dispose();
    _talkCtrl.dispose();
    _channelCtrl.dispose();
    super.dispose();
  }

  void _snack(String msg, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: error ? const Color(0xFFBA1A1A) : const Color(0xFF002547),
      ),
    );
  }

  Future<void> _copyText(String text, String confirmation) async {
    await Clipboard.setData(ClipboardData(text: text));
    _snack(confirmation);
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final user = store.currentUser!;
    final building = store.activeBuilding;
    final isOwner = user.role == ZaguanRole.owner;

    return Stack(
      children: [
        Scaffold(
          appBar: AppBar(
            backgroundColor: isOwner ? const Color(0xFF103B66) : const Color(0xFF0F766E),
            foregroundColor: Colors.white,
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${user.fullName} · Apto ${user.unit ?? '-'}',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                ),
                Text(
                  '${user.role.label} · ${building.name}',
                  style: const TextStyle(fontSize: 11, color: Color(0xFFE2E8F0)),
                ),
              ],
            ),
            actions: [
              IconButton(
                tooltip: 'Alerta silenciosa SOS',
                icon: const Icon(Icons.sos, color: Color(0xFFFCA5A5)),
                onPressed: () {
                  store.triggerDuressOrSos('Botón SOS silencioso activado desde App Residente');
                  _snack('Alerta silenciosa SOS enviada (sin señal sonora en puerta).', error: true);
                },
              ),
              IconButton(
                tooltip: 'Cerrar sesión',
                icon: const Icon(Icons.logout),
                onPressed: store.logout,
              ),
            ],
          ),
          body: IndexedStack(
            index: _tabIndex,
            children: [
              _buildHomeTab(store, user, building),
              _buildPassesTab(store, user),
              _buildPackagesTab(store, user, building),
              _buildBuildingTab(store, user, building),
            ],
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tabIndex,
            onDestinationSelected: (i) => setState(() => _tabIndex = i),
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.key_outlined),
                selectedIcon: Icon(Icons.key),
                label: 'Inicio',
              ),
              NavigationDestination(
                icon: Icon(Icons.qr_code_2_outlined),
                selectedIcon: Icon(Icons.qr_code_2),
                label: 'Pases',
              ),
              NavigationDestination(
                icon: Icon(Icons.inventory_2_outlined),
                selectedIcon: Icon(Icons.inventory_2),
                label: 'Paquetes',
              ),
              NavigationDestination(
                icon: Icon(Icons.apartment_outlined),
                selectedIcon: Icon(Icons.apartment),
                label: 'Edificio',
              ),
            ],
          ),
        ),
        if (store.pendingDoorbell != null)
          _buildLiveDoorbellOverlay(store, store.pendingDoorbell!),
      ],
    );
  }

  Widget _buildHomeTab(ZaguanStore store, AppUser user, BuildingModel building) {
    final hceUid = AkuvoxDartService.buildResidentHceUid(
      user.unit ?? '4B',
      user.personalPin,
    );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (store.lastPushTitle != null)
          Card(
            color: const Color(0xFFECFDF5),
            margin: const EdgeInsets.only(bottom: 12),
            child: ListTile(
              leading: const Icon(Icons.notifications_active, color: Color(0xFF076C41)),
              title: Text(
                store.lastPushTitle!,
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
              ),
              subtitle: Text(store.lastPushBody ?? '', style: const TextStyle(fontSize: 12)),
              trailing: IconButton(
                icon: const Icon(Icons.close, size: 18),
                onPressed: store.dismissPush,
              ),
            ),
          ),

        if (store.pendingPackageAlert != null)
          Card(
            color: const Color(0xFFFFFBEB),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: const BorderSide(color: Color(0xFFF59E0B), width: 1.5),
            ),
            margin: const EdgeInsets.only(bottom: 12),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.local_shipping, color: Color(0xFFB45309)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Confirmar Paquete · ${store.pendingPackageAlert!.carrier}',
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Apto ${store.pendingPackageAlert!.unit} · ${store.pendingPackageAlert!.ocrSummary}',
                    style: const TextStyle(fontSize: 12),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton(
                          style: FilledButton.styleFrom(backgroundColor: const Color(0xFF076C41)),
                          onPressed: () async {
                            await store.respondPackageAlert(true);
                            _snack('Puerta del zaguán abierta. Paquete marcado como delivered.');
                          },
                          child: const Text('Dejar pasar al hall'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFBA1A1A),
                          side: const BorderSide(color: Color(0xFFBA1A1A)),
                        ),
                        onPressed: () async {
                          await store.respondPackageAlert(false);
                          _snack('Entrega rechazada.', error: true);
                        },
                        child: const Text('Rechazar'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

        // Botón Principal de Apertura Rápida
        Card(
          color: store.door1Open ? const Color(0xFF076C41) : const Color(0xFF002547),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: () async {
              final res = await store.openDoorDirect('Botón Directo App Residente');
              _snack(res.message, error: !res.ok);
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 26, horizontal: 20),
              child: Column(
                children: [
                  Icon(
                    store.door1Open ? Icons.lock_open : Icons.touch_app,
                    color: Colors.white,
                    size: 48,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    store.door1Open ? 'PUERTA ABIERTA (6s)' : 'ABRIR PUERTA AHORA',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Puerta Calle: ${store.door1Open ? 'ABIERTA' : 'Cerrada'} · Puerta Hall: ${store.door2Open ? 'ABIERTA' : 'Cerrada'}',
                    style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),

        // NFC HCE Android 13.56 MHz
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.nfc, color: Color(0xFF002547)),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'NFC HCE (Android 13.56 MHz)',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                    Switch(
                      value: store.nfcHceActive,
                      onChanged: (_) async {
                        final res = await store.toggleNfcHce();
                        _snack(res.message, error: !res.ok);
                      },
                    ),
                  ],
                ),
                Text(
                  'Emula tarjeta ISO 14443-A para el lector del Akuvox E12W.\nUID: $hceUid · AID: ${AkuvoxDartService.nfcHceAidHex}',
                  style: const TextStyle(fontSize: 12, fontFamily: 'monospace', color: Color(0xFF43474F)),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),

        // Bluetooth Low Energy (BLE 5.0)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.bluetooth_connected,
                      color: store.bleInRange ? const Color(0xFF076C41) : Colors.grey,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Puente BLE 5.0 · ${store.bleInRange ? 'En rango (${store.bleRssiDbm} dBm)' : 'Fuera de rango (${store.bleRssiDbm} dBm)'}',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.tonal(
                        onPressed: store.bleInRange
                            ? () async {
                                final res = await store.openDoorDirect(
                                  'BLE 5.0 Proximidad (${store.bleRssiDbm} dBm)',
                                );
                                _snack(res.message, error: !res.ok);
                              }
                            : null,
                        child: const Text('Abrir por BLE'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton(
                      onPressed: store.toggleBleRange,
                      child: Text(store.bleInRange ? 'Alejar' : 'Acercar'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),

        // Timbre en Vivo LucIA (Notificación Android Real + Llamado Remoto desde Web)
        Card(
          color: const Color(0xFFF0F4F8),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    const CircleAvatar(
                      backgroundColor: Color(0xFF002547),
                      foregroundColor: Colors.white,
                      child: Icon(Icons.ring_volume),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Timbre LucIA (Web ↔ Celular)',
                            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                          ),
                          Text(
                            store.remoteDoorbellConnected
                                ? '● Conectado en vivo · Canal: ${store.doorbellChannel}'
                                : '○ Conectando canal ${store.doorbellChannel}...',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: store.remoteDoorbellConnected
                                  ? const Color(0xFF076C41)
                                  : const Color(0xFFB45309),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                const Text(
                  'Cuando llames al videoportero LucIA desde la Web usando el mismo canal, te sonará una notificación real en este celular Android.',
                  style: TextStyle(fontSize: 12, color: Color(0xFF43474F)),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _channelCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Canal Web ↔ Celular',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton.tonal(
                      onPressed: () {
                        store.updateDoorbellChannel(_channelCtrl.text);
                        _snack('Canal de timbre actualizado a: ${store.doorbellChannel}');
                      },
                      child: const Text('Conectar'),
                    ),
                  ],
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  title: const Text(
                    'Recibir timbres de cualquier apto (modo prueba)',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                  value: store.acceptAllUnitsForTesting,
                  onChanged: store.toggleAcceptAllUnitsForTesting,
                ),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton.icon(
                      onPressed: store.simulateDoorbellCall,
                      icon: const Icon(Icons.notifications_active, size: 16),
                      label: const Text('Probar ahora'),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: () async {
                        await store.scheduleDelayedDoorbellTest(delaySeconds: 5);
                        _snack('Notificación programada en 5 seg. ¡Podés minimizar o bloquear la pantalla!');
                      },
                      icon: const Icon(Icons.timer, size: 16),
                      label: const Text('Probar en 5s'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () async {
                        final ok = await store.requestAndroidNotificationPermission();
                        _snack(
                          ok
                              ? 'Permiso de notificaciones Android activo.'
                              : 'Aceptá el permiso de notificaciones en el aviso de Android.',
                        );
                      },
                      icon: const Icon(Icons.settings_applications, size: 16),
                      label: const Text('Permiso'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPassesTab(ZaguanStore store, AppUser user) {
    final unit = user.unit ?? '4B';
    final oneTime = store.singleUsePasses
        .where((p) => p.buildingId == store.activeBuildingId && p.unit == unit)
        .toList();
    final recurring = store.recurringPasses
        .where((r) => r.buildingId == store.activeBuildingId && r.unit == unit)
        .toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SegmentedButton<int>(
          segments: const [
            ButtonSegment(value: 0, label: Text('1 Uso'), icon: Icon(Icons.link)),
            ButtonSegment(value: 1, label: Text('Recurrentes'), icon: Icon(Icons.schedule)),
            ButtonSegment(value: 2, label: Text('Coacción'), icon: Icon(Icons.security)),
          ],
          selected: {_passesSubTab},
          onSelectionChanged: (s) => setState(() => _passesSubTab = s.first),
        ),
        const SizedBox(height: 14),

        if (_passesSubTab == 0) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Crear Pase de Un Solo Uso',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Genera código de 4 dígitos (para dictar al portero IA) + Magic Link para WhatsApp.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF43474F)),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _guestNameCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Nombre de la visita',
                      hintText: 'Ej. Juan Pérez / Técnico Fibra',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    children: [1, 2, 4, 8, 24]
                        .map(
                          (h) => ChoiceChip(
                            label: Text('$h hs'),
                            selected: _guestHours == h,
                            onSelected: (_) => setState(() => _guestHours = h),
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(height: 10),
                  FilledButton.icon(
                    onPressed: () {
                      final pass = store.createSingleUsePass(_guestNameCtrl.text, _guestHours);
                      _guestNameCtrl.clear();
                      _snack('Pase ${pass.code} generado · PIN voz ${pass.pin}.');
                    },
                    icon: const Icon(Icons.add_link),
                    label: const Text('Generar Pase + Magic Link'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          ...oneTime.map(
            (p) => Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            p.guestName,
                            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                          ),
                        ),
                        Chip(label: Text(p.status, style: const TextStyle(fontSize: 11))),
                      ],
                    ),
                    Text(
                      'Código voz IA: ${p.pin} · Link: ${p.magicLink}',
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                    ),
                    if (p.status == 'Activo') ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          FilledButton.tonalIcon(
                            onPressed: () => _copyText(
                              '¡Hola ${p.guestName}! Te comparto tu pase de Zaguán para Apto $unit:\nLink: ${p.magicLink}\nO decile el código ${p.pin} al portero IA.',
                              'Invitación de WhatsApp copiada al portapapeles.',
                            ),
                            icon: const Icon(Icons.share, size: 16),
                            label: const Text('Copiar WhatsApp'),
                          ),
                          OutlinedButton(
                            onPressed: () => store.revokeSingleUsePass(p.id),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFFBA1A1A),
                            ),
                            child: const Text('Revocar'),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ] else if (_passesSubTab == 1) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Permiso Recurrente (Limpieza / Servicios)',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _recNameCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Nombre completo',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    children: ['Limpieza', 'Paseador', 'Enfermería', 'Niñera']
                        .map(
                          (role) => ChoiceChip(
                            label: Text(role),
                            selected: _recRole == role,
                            onSelected: (_) => setState(() => _recRole = role),
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(height: 8),
                  const Text('Días autorizados:', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 6,
                    children: ['L', 'M', 'X', 'J', 'V', 'S', 'D']
                        .map(
                          (d) => FilterChip(
                            label: Text(d),
                            selected: _recDays.contains(d),
                            onSelected: (sel) => setState(() {
                              if (sel) {
                                _recDays.add(d);
                              } else {
                                _recDays.remove(d);
                              }
                            }),
                          ),
                        )
                        .toList(),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButton<String>(
                          isExpanded: true,
                          value: _recStart,
                          items: ['07:00', '08:00', '09:00', '10:00', '13:00', '14:00', '16:00']
                              .map((h) => DropdownMenuItem(value: h, child: Text('Desde $h')))
                              .toList(),
                          onChanged: (v) => setState(() => _recStart = v ?? '08:00'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: DropdownButton<String>(
                          isExpanded: true,
                          value: _recEnd,
                          items: ['11:00', '12:00', '13:00', '15:00', '16:30', '18:00', '20:00']
                              .map((h) => DropdownMenuItem(value: h, child: Text('Hasta $h')))
                              .toList(),
                          onChanged: (v) => setState(() => _recEnd = v ?? '13:00'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _recRfidCtrl,
                    decoration: const InputDecoration(
                      labelText: 'UID Llavero RFID físico (ej. 04:B2:19:FA)',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _recMobileAccess,
                    onChanged: (v) => setState(() => _recMobileAccess = v ?? true),
                    title: const Text('Habilitar acceso móvil + Push ingreso/egreso', style: TextStyle(fontSize: 13)),
                  ),
                  if (_recError != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        _recError!,
                        style: const TextStyle(color: Color(0xFFBA1A1A), fontWeight: FontWeight.w700, fontSize: 12),
                      ),
                    ),
                  FilledButton.icon(
                    onPressed: () {
                      final err = store.createRecurringPass(
                        name: _recNameCtrl.text,
                        roleLabel: _recRole,
                        days: _recDays.toList(),
                        startTime: _recStart,
                        endTime: _recEnd,
                        rfidUid: _recRfidCtrl.text,
                        mobileAccessEnabled: _recMobileAccess,
                      );
                      setState(() => _recError = err);
                      if (err == null) {
                        _recNameCtrl.clear();
                        _recRfidCtrl.clear();
                        _snack('Permiso recurrente creado con validación horaria estricta.');
                      }
                    },
                    icon: const Icon(Icons.verified_user),
                    label: const Text('Guardar Permiso Recurrente'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          ...recurring.map(
            (r) => Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${r.name} (${r.roleLabel})',
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                        Chip(label: Text(r.status, style: const TextStyle(fontSize: 11))),
                      ],
                    ),
                    Text(
                      'Días: ${r.days.join(', ')} · ${r.startTime}–${r.endTime} · PIN ${r.pin}',
                      style: const TextStyle(fontSize: 12),
                    ),
                    if (r.rfidUid.isNotEmpty)
                      Text(
                        'Llavero RFID: ${r.rfidUid}',
                        style: const TextStyle(fontFamily: 'monospace', fontSize: 12, color: Color(0xFF002547)),
                      ),
                    if (r.auditLines.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          'Último registro: ${r.auditLines.first}',
                          style: const TextStyle(fontSize: 11, color: Color(0xFF076C41)),
                        ),
                      ),
                    if (r.status == 'Activo') ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          FilledButton.tonal(
                            onPressed: () => store.toggleRecurringShift(r.id),
                            child: Text(r.currentlyInside ? 'Simular Egreso (Push)' : 'Simular Ingreso (Push)'),
                          ),
                          OutlinedButton(
                            onPressed: () {
                              store.revokeRecurringPass(r.id);
                              _snack('Acceso de ${r.name} revocado al instante.', error: true);
                            },
                            style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFBA1A1A)),
                            child: const Text('Revocar ahora'),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ] else ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'PIN Personal y PIN de Coacción Silenciosa',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF0F4F8),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Column(
                            children: [
                              const Text('PIN Personal', style: TextStyle(fontSize: 12)),
                              Text(
                                user.personalPin,
                                style: const TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 24,
                                  fontWeight: FontWeight.w900,
                                  color: Color(0xFF002547),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFFDAD6),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Column(
                            children: [
                              const Text('PIN Coacción (auto)', style: TextStyle(fontSize: 12)),
                              Text(
                                user.duressPin,
                                style: const TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 24,
                                  fontWeight: FontWeight.w900,
                                  color: Color(0xFF93000A),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _newPinCtrl,
                          maxLength: 4,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                            labelText: 'Nuevo PIN (4 dígitos)',
                            border: OutlineInputBorder(),
                            counterText: '',
                            isDense: true,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: () {
                          final digits = _newPinCtrl.text.replaceAll(RegExp(r'\D'), '');
                          if (digits.length != 4) {
                            _snack('El PIN debe tener exactamente 4 dígitos.', error: true);
                            return;
                          }
                          store.updatePersonalPin(digits);
                          _newPinCtrl.clear();
                          _snack('PIN actualizado. Coacción recalculada: ${user.duressPin}.');
                        },
                        child: const Text('Actualizar'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildPackagesTab(ZaguanStore store, AppUser user, BuildingModel building) {
    final unit = user.unit ?? '4B';
    final expected = store.preAuthPackages
        .where((p) => p.buildingId == building.id && p.unit == unit)
        .toList();
    final delivered = store.deliveredPackages
        .where((p) => p.buildingId == building.id && p.unit == unit)
        .toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Espero un Paquete (Pre-autorización)',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  children: ['Mercado Libre', 'PedidosYa', 'Correo Uruguayo', 'DAC']
                      .map(
                        (c) => ChoiceChip(
                          label: Text(c),
                          selected: _pkgCarrier == c,
                          onSelected: (_) => setState(() => _pkgCarrier = c),
                        ),
                      )
                      .toList(),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _pkgDescCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Descripción / Remitente',
                    hintText: 'Ej. Caja Mercado Libre Full',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _pkgWindowCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Ventana horaria esperada',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ChoiceChip(
                      label: const Text('Abrir zaguán auto tras OCR'),
                      selected: _pkgRule == PackageAutoRule.autoOpenAfterOcr,
                      onSelected: (_) =>
                          setState(() => _pkgRule = PackageAutoRule.autoOpenAfterOcr),
                    ),
                    ChoiceChip(
                      label: const Text('Pedirme confirmación con foto'),
                      selected: _pkgRule == PackageAutoRule.askConfirmationPhoto,
                      onSelected: (_) =>
                          setState(() => _pkgRule = PackageAutoRule.askConfirmationPhoto),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                FilledButton.icon(
                  onPressed: () {
                    store.createPreAuthPackage(
                      carrier: _pkgCarrier,
                      description: _pkgDescCtrl.text,
                      timeWindowLabel: _pkgWindowCtrl.text,
                      autoRule: _pkgRule,
                      storageMode: building.storageMode,
                    );
                    _pkgDescCtrl.clear();
                    _snack('Entrega pre-autorizada para Apto $unit.');
                  },
                  icon: const Icon(Icons.add_box),
                  label: const Text('Pre-autorizar Entrega'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: FilledButton.tonalIcon(
                onPressed: () async {
                  final msg = await store.simulateParcelArrival(_pkgCarrier, preAuthorized: true);
                  _snack(msg);
                },
                icon: const Icon(Icons.document_scanner, size: 18),
                label: const Text('Simular OCR (Auto)'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () async {
                  final msg = await store.simulateParcelArrival('Correo sin aviso', preAuthorized: false);
                  setState(() => _tabIndex = 0);
                  _snack(msg);
                },
                icon: const Icon(Icons.photo_camera, size: 18),
                label: const Text('Sin pre-auth (Foto)'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Text(
          'Entregas Esperadas (${expected.length})',
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
        ),
        const SizedBox(height: 6),
        ...expected.map(
          (p) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: const Icon(Icons.schedule_send, color: Color(0xFF002547)),
              title: Text('${p.carrier} · ${p.description}', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(
                '${p.timeWindowLabel} · ${p.autoRule == PackageAutoRule.autoOpenAfterOcr ? 'Auto-abrir OCR' : 'Pedir confirmación'}',
              ),
              trailing: Chip(label: Text(p.status, style: const TextStyle(fontSize: 11))),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'Paquetes Recibidos / Delivered (${delivered.length})',
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
        ),
        const SizedBox(height: 6),
        ...delivered.map(
          (d) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${d.code} · ${d.carrier}',
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                      Chip(label: Text(d.status, style: const TextStyle(fontSize: 11))),
                    ],
                  ),
                  Text('${d.location} · ${d.receivedTime}', style: const TextStyle(fontSize: 12)),
                  Text(d.note, style: const TextStyle(fontSize: 11, color: Color(0xFF43474F))),
                  if (d.status != 'Retirado') ...[
                    const SizedBox(height: 8),
                    FilledButton.tonal(
                      onPressed: () {
                        store.confirmPackagePickup(d.id);
                        _snack('Retiro confirmado para ${d.code}.');
                      },
                      child: const Text('Confirmar que ya lo retiré'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBuildingTab(ZaguanStore store, AppUser user, BuildingModel building) {
    final notices = store.notices.where((n) => n.buildingId == building.id).toList();
    final isOwner = user.role == ZaguanRole.owner;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          color: isOwner ? const Color(0xFFF0F4F8) : Colors.white,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      isOwner ? Icons.verified_user : Icons.home_outlined,
                      color: const Color(0xFF002547),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      isOwner
                          ? 'Panel Exclusivo del Propietario · Apto ${user.unit}'
                          : 'Perfil de Inquilino · Apto ${user.unit}',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  isOwner
                      ? 'Como propietario tenés control patrimonial de la unidad, descarga de certificados Ley 18.251 y auditoría completa de ingresos a tu apartamento.'
                      : 'Acceso habilitado como inquilino para Apto ${user.unit} en ${building.name}. Los permisos de propiedad y administración están restringidos.',
                  style: const TextStyle(fontSize: 12, color: Color(0xFF43474F)),
                ),
                if (isOwner) ...[
                  const SizedBox(height: 10),
                  FilledButton.tonalIcon(
                    onPressed: () => _snack('Certificado digital Ley 18.251 (Apto ${user.unit}) listo para descargar.'),
                    icon: const Icon(Icons.description),
                    label: const Text('Descargar Certificado Ley 18.251'),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          'Cartelera Oficial · ${building.name}',
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
        const SizedBox(height: 8),
        ...notices.map(
          (n) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: const Icon(Icons.campaign, color: Color(0xFF002547)),
              title: Text(n.title, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('${n.body}\n${n.category} · ${n.dateLabel}'),
              isThreeLine: true,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildLiveDoorbellOverlay(ZaguanStore store, PendingDoorbellModel bell) {
    return Material(
      color: Colors.black.withValues(alpha: 0.78),
      child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Card(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: bell.isPackage
                                ? const Color(0xFFB45309)
                                : const Color(0xFFBA1A1A),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            bell.isPackage
                                ? '📦 PAQUETE EN PUERTA · LUCÍA'
                                : '● TIMBRE EN VIVO · LUCÍA / E12W',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 11,
                            ),
                          ),
                        ),
                        const Spacer(),
                        Text(
                          bell.timeLabel,
                          style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Container(
                      height: 160,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(14),
                        gradient: const LinearGradient(
                          colors: [Color(0xFF0F172A), Color(0xFF1E3A5F)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                      ),
                      child: Stack(
                        children: [
                          const Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.videocam, color: Colors.white70, size: 42),
                                SizedBox(height: 6),
                                Text(
                                  'Cámara Frente de Calle · Akuvox E12W 1080p',
                                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12),
                                ),
                              ],
                            ),
                          ),
                          Positioned(
                            bottom: 10,
                            left: 12,
                            child: Text(
                              'Visita: ${bell.visitorName} → Apto ${bell.unit}',
                              style: const TextStyle(
                                color: Color(0xFF86EFAC),
                                fontWeight: FontWeight.w700,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF2F4F6),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Transcripción LucIA (Portera Virtual):',
                            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '"${bell.reasonTranscript}"',
                            style: const TextStyle(fontStyle: FontStyle.italic, fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                    if (_showTalkInput) ...[
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _talkCtrl,
                              decoration: const InputDecoration(
                                hintText: 'Mensaje al altavoz E12W...',
                                border: OutlineInputBorder(),
                                isDense: true,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          FilledButton(
                            onPressed: () {
                              final txt = _talkCtrl.text.trim();
                              if (txt.isEmpty) return;
                              store.sendDoorbellVoiceReply(txt);
                              _talkCtrl.clear();
                              _snack('Audio enviado al altavoz del E12W.');
                            },
                            child: const Text('Enviar'),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.icon(
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFF076C41),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                            onPressed: () async {
                              setState(() => _showTalkInput = false);
                              await store.respondDoorbell(true);
                              _snack(
                                bell.isPackage
                                    ? 'Paquete aceptado. Zaguán abierto para ${bell.carrier ?? 'entrega'}.'
                                    : 'Puerta abierta para ${bell.visitorName}.',
                              );
                            },
                            icon: Icon(bell.isPackage ? Icons.inventory_2 : Icons.lock_open, size: 18),
                            label: Text(
                              bell.isPackage ? 'Recibir Paquete (Abrir Hall)' : 'Abrir Puerta',
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.tonalIcon(
                            onPressed: () => setState(() => _showTalkInput = !_showTalkInput),
                            icon: const Icon(Icons.mic, size: 18),
                            label: const Text('Hablar'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFFBA1A1A),
                              side: const BorderSide(color: Color(0xFFBA1A1A)),
                            ),
                            onPressed: () async {
                              setState(() => _showTalkInput = false);
                              await store.respondDoorbell(false);
                              _snack(
                                bell.isPackage ? 'Paquete rechazado.' : 'Visita rechazada.',
                                error: true,
                              );
                            },
                            icon: const Icon(Icons.call_end, size: 18),
                            label: Text(bell.isPackage ? 'No recibir' : 'Rechazar'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
