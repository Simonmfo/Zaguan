import 'package:flutter/material.dart';

import '../models/zaguan_models.dart';
import '../state/zaguan_store.dart';

class AdminShell extends StatefulWidget {
  const AdminShell({super.key, required this.store});

  final ZaguanStore store;

  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> {
  int _tabIndex = 0;

  // Unidades & Alta rápida
  String? _selectedUnitFilter;
  final _resNameCtrl = TextEditingController();
  final _resEmailCtrl = TextEditingController();
  final _resPhoneCtrl = TextEditingController(text: '+598 99 ');
  final _resUnitCtrl = TextEditingController(text: '501');
  ZaguanRole _resRole = ZaguanRole.tenant;

  // Llaves maestras
  String _mkProvider = 'UTE';
  final _mkTechCtrl = TextEditingController();
  final _mkScopeCtrl = TextEditingController(text: 'Hall PB + Sala de Medidores');
  int _mkMinutes = 120;

  // Filtros Logs
  String _logUnitFilter = 'TODAS';
  AccessEventType? _logTypeFilter;
  final _logSearchCtrl = TextEditingController();

  // Cartelera
  final _noticeTitleCtrl = TextEditingController();
  final _noticeBodyCtrl = TextEditingController();
  String _noticeCategory = 'Mantenimiento';

  @override
  void dispose() {
    _resNameCtrl.dispose();
    _resEmailCtrl.dispose();
    _resPhoneCtrl.dispose();
    _resUnitCtrl.dispose();
    _mkTechCtrl.dispose();
    _mkScopeCtrl.dispose();
    _logSearchCtrl.dispose();
    _noticeTitleCtrl.dispose();
    _noticeBodyCtrl.dispose();
    super.dispose();
  }

  void _snack(String msg, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: error ? const Color(0xFFBA1A1A) : const Color(0xFF076C41),
      ),
    );
  }

  String _formatTime(DateTime dt) {
    final hh = dt.hour.toString().padLeft(2, '0');
    final mm = dt.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final building = store.activeBuilding;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF076C41),
        foregroundColor: Colors.white,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Administración · Zaguán',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            Text(
              building.name,
              style: const TextStyle(fontSize: 12, color: Color(0xFFD1FAE5)),
            ),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Cambiar edificio',
            icon: const Icon(Icons.apartment),
            onSelected: store.selectBuilding,
            itemBuilder: (_) => store.buildings
                .map(
                  (b) => PopupMenuItem<String>(
                    value: b.id,
                    child: Text(b.name),
                  ),
                )
                .toList(),
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
          _buildUnitsTab(store, building),
          _buildMasterKeysTab(store, building),
          _buildLogsTab(store, building),
          _buildNoticesTab(store, building),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tabIndex,
        onDestinationSelected: (i) => setState(() => _tabIndex = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.meeting_room_outlined),
            selectedIcon: Icon(Icons.meeting_room),
            label: 'Unidades',
          ),
          NavigationDestination(
            icon: Icon(Icons.vpn_key_outlined),
            selectedIcon: Icon(Icons.vpn_key),
            label: 'Llaves',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'Logs',
          ),
          NavigationDestination(
            icon: Icon(Icons.campaign_outlined),
            selectedIcon: Icon(Icons.campaign),
            label: 'Cartelera',
          ),
        ],
      ),
    );
  }

  Widget _buildUnitsTab(ZaguanStore store, BuildingModel building) {
    final bUnits = store.unitsForBuilding(building.id);
    final residents = store.residentsForBuilding(building.id).where((r) {
      if (_selectedUnitFilter == null) return true;
      return r.unit == _selectedUnitFilter;
    }).toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Mapa de Unidades (tocar para filtrar)',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ChoiceChip(
                      label: Text('Todas (${bUnits.length})'),
                      selected: _selectedUnitFilter == null,
                      onSelected: (_) => setState(() => _selectedUnitFilter = null),
                    ),
                    ...bUnits.map(
                      (u) => ChoiceChip(
                        label: Text('Apto ${u.unitNumber}'),
                        selected: _selectedUnitFilter == u.unitNumber,
                        onSelected: (_) => setState(() {
                          _selectedUnitFilter = u.unitNumber;
                          _resUnitCtrl.text = u.unitNumber;
                        }),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Alta Rápida de Residente',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    ChoiceChip(
                      label: const Text('Propietario'),
                      selected: _resRole == ZaguanRole.owner,
                      onSelected: (_) => setState(() => _resRole = ZaguanRole.owner),
                    ),
                    ChoiceChip(
                      label: const Text('Inquilino'),
                      selected: _resRole == ZaguanRole.tenant,
                      onSelected: (_) => setState(() => _resRole = ZaguanRole.tenant),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      flex: 2,
                      child: TextField(
                        controller: _resNameCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Nombre completo',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _resUnitCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Apto',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _resEmailCtrl,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'Email',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _resPhoneCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Teléfono',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                FilledButton.icon(
                  onPressed: () {
                    final name = _resNameCtrl.text.trim();
                    final email = _resEmailCtrl.text.trim();
                    final unit = _resUnitCtrl.text.trim().toUpperCase();
                    if (name.isEmpty || !email.contains('@') || unit.isEmpty) {
                      _snack('Completá nombre, email y apartamento.', error: true);
                      return;
                    }
                    store.createUserAccount(
                      fullName: name,
                      email: email,
                      password: 'zaguan2026',
                      role: _resRole,
                      buildingId: building.id,
                      unit: unit,
                      phone: _resPhoneCtrl.text.trim(),
                    );
                    _resNameCtrl.clear();
                    _resEmailCtrl.clear();
                    _snack('Alta completada (clave inicial: zaguan2026).');
                  },
                  icon: const Icon(Icons.person_add_alt_1),
                  label: const Text('Dar de Alta Residente'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          'Residentes (${residents.length})',
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
        const SizedBox(height: 8),
        ...residents.map(
          (r) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: r.isActive ? const Color(0xFF002547) : Colors.grey,
                foregroundColor: Colors.white,
                child: Text(r.unit ?? '?'),
              ),
              title: Text(
                r.fullName,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  decoration: r.isActive ? null : TextDecoration.lineThrough,
                ),
              ),
              subtitle: Text(
                '${r.role.label} · ${r.email} · PIN ${r.personalPin}',
              ),
              trailing: r.isActive
                  ? OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFFBA1A1A),
                        side: const BorderSide(color: Color(0xFFBA1A1A)),
                      ),
                      onPressed: () {
                        final revoked = store.offboardResident(r.id);
                        _snack(
                          '${r.fullName} dado de baja. $revoked pase(s)/RFID revocados automáticamente.',
                        );
                      },
                      child: const Text('Dar de baja'),
                    )
                  : const Chip(label: Text('Baja')),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildMasterKeysTab(ZaguanStore store, BuildingModel building) {
    final keys = store.masterKeys.where((k) => k.buildingId == building.id).toList();
    const providers = ['UTE', 'OSE', 'Antel', 'Ascensores', 'Bomberos', 'Sanitaria'];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Emitir Llave Maestra Temporal',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Expiración automática para proveedores del edificio (UTE, OSE, Antel, técnicos).',
                  style: TextStyle(fontSize: 12, color: Color(0xFF43474F)),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: providers
                      .map(
                        (p) => ChoiceChip(
                          label: Text(p),
                          selected: _mkProvider == p,
                          onSelected: (_) => setState(() => _mkProvider = p),
                        ),
                      )
                      .toList(),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _mkTechCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Nombre del técnico / cuadrilla',
                    hintText: 'Ej. Cuadrilla UTE #42',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _mkScopeCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Zonas autorizadas',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  children: [
                    for (final m in [1, 30, 120, 240])
                      ChoiceChip(
                        label: Text(m == 1 ? '1 min (demo)' : '$m min'),
                        selected: _mkMinutes == m,
                        onSelected: (_) => setState(() => _mkMinutes = m),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () {
                    final tech = _mkTechCtrl.text.trim();
                    if (tech.isEmpty) {
                      _snack('Ingresá el nombre del técnico o cuadrilla.', error: true);
                      return;
                    }
                    final mk = store.issueMasterKey(
                      provider: _mkProvider,
                      technicianName: tech,
                      scope: _mkScopeCtrl.text.trim(),
                      durationMinutes: _mkMinutes,
                    );
                    _mkTechCtrl.clear();
                    _snack('Llave $_mkProvider emitida · PIN ${mk.pin} · Expira en $_mkMinutes min.');
                  },
                  icon: const Icon(Icons.vpn_key),
                  label: const Text('Generar Llave Maestra'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          'Llaves Emitidas (${keys.length})',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        ...keys.map((k) {
          final isActive = k.status == 'Activa' || k.status == 'En edificio';
          final minsLeft = k.expiresAt.difference(DateTime.now()).inMinutes;
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Chip(
                        label: Text(k.provider, style: const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          k.technicianName,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFF002547),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'PIN ${k.pin}',
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${k.scope} · Estado: ${k.status}${isActive ? ' · Vence en ${minsLeft < 0 ? 0 : minsLeft} min' : ''}',
                    style: const TextStyle(fontSize: 12, color: Color(0xFF43474F)),
                  ),
                  if (k.enteredAt != null || k.exitedAt != null)
                    Text(
                      'Auditoría: Ingreso ${k.enteredAt ?? '-'} · Egreso ${k.exitedAt ?? 'en curso'}',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF076C41)),
                    ),
                  if (isActive) ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        FilledButton.tonal(
                          onPressed: () => store.toggleMasterKeyShift(k.id),
                          child: Text(k.status == 'Activa' ? 'Registrar Ingreso' : 'Registrar Salida'),
                        ),
                        const SizedBox(width: 8),
                        TextButton(
                          onPressed: () => store.revokeMasterKey(k.id),
                          style: TextButton.styleFrom(foregroundColor: const Color(0xFFBA1A1A)),
                          child: const Text('Revocar'),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildLogsTab(ZaguanStore store, BuildingModel building) {
    final unitOptions = ['TODAS', ...store.unitsForBuilding(building.id).map((u) => u.unitNumber)];
    final query = _logSearchCtrl.text.trim().toLowerCase();
    final filtered = store.accessLogs.where((log) {
      if (log.buildingId != building.id) return false;
      if (_logUnitFilter != 'TODAS' && log.unit != _logUnitFilter) return false;
      if (_logTypeFilter != null && log.type != _logTypeFilter) return false;
      if (query.isNotEmpty) {
        final hay = '${log.actorName} ${log.methodUsed} ${log.notes} ${log.unit ?? ''}'.toLowerCase();
        if (!hay.contains(query)) return false;
      }
      return true;
    }).toList();

    return Column(
      children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              TextField(
                controller: _logSearchCtrl,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  hintText: 'Buscar por persona, método o detalle...',
                  prefixIcon: Icon(Icons.search),
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    DropdownButton<String>(
                      value: unitOptions.contains(_logUnitFilter) ? _logUnitFilter : 'TODAS',
                      items: unitOptions
                          .map((u) => DropdownMenuItem(value: u, child: Text('Unidad: $u')))
                          .toList(),
                      onChanged: (v) => setState(() => _logUnitFilter = v ?? 'TODAS'),
                    ),
                    const SizedBox(width: 12),
                    DropdownButton<AccessEventType?>(
                      value: _logTypeFilter,
                      items: [
                        const DropdownMenuItem(value: null, child: Text('Todos los eventos')),
                        ...AccessEventType.values.map(
                          (t) => DropdownMenuItem(value: t, child: Text(t.label)),
                        ),
                      ],
                      onChanged: (v) => setState(() => _logTypeFilter = v),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: filtered.length,
            itemBuilder: (_, idx) {
              final log = filtered[idx];
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: log.granted ? const Color(0xFFECFDF5) : const Color(0xFFFFDAD6),
                    foregroundColor: log.granted ? const Color(0xFF076C41) : const Color(0xFFBA1A1A),
                    child: Icon(log.granted ? Icons.check : Icons.block, size: 20),
                  ),
                  title: Text(
                    '${log.actorName}${log.unit != null ? ' · Apto ${log.unit}' : ''}',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  ),
                  subtitle: Text('${log.type.label} · ${log.methodUsed}\n${log.notes}'),
                  isThreeLine: true,
                  trailing: Text(
                    _formatTime(log.timestamp),
                    style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildNoticesTab(ZaguanStore store, BuildingModel building) {
    final bNotices = store.notices.where((n) => n.buildingId == building.id).toList();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Publicar Comunicado en Cartelera Digital',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  children: ['Mantenimiento', 'Aviso', 'Seguridad']
                      .map(
                        (cat) => ChoiceChip(
                          label: Text(cat),
                          selected: _noticeCategory == cat,
                          onSelected: (_) => setState(() => _noticeCategory = cat),
                        ),
                      )
                      .toList(),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _noticeTitleCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Título del comunicado',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _noticeBodyCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Detalle para residentes',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                FilledButton.icon(
                  onPressed: () {
                    final title = _noticeTitleCtrl.text.trim();
                    final body = _noticeBodyCtrl.text.trim();
                    if (title.isEmpty || body.isEmpty) {
                      _snack('Completá título y detalle.', error: true);
                      return;
                    }
                    store.publishNotice(title, body, _noticeCategory);
                    _noticeTitleCtrl.clear();
                    _noticeBodyCtrl.clear();
                    _snack('Comunicado publicado en tiempo real.');
                  },
                  icon: const Icon(Icons.send),
                  label: const Text('Publicar en Edificio'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          color: const Color(0xFF002547),
          child: ListTile(
            leading: const Icon(Icons.door_front_door, color: Colors.white),
            title: const Text(
              'Apertura Remota Administración (E12W)',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
            ),
            subtitle: Text(
              'Dispara Relé 1 en ${building.akuvoxIp}',
              style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 12),
            ),
            trailing: FilledButton(
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFF076C41)),
              onPressed: () async {
                final res = await store.openDoorDirect('Apertura Administración (Relé 1)');
                _snack(res.message, error: !res.ok);
              },
              child: const Text('Abrir'),
            ),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          'Comunicados Activos (${bNotices.length})',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        ...bNotices.map(
          (n) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              title: Text(n.title, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('${n.body}\n${n.category} · ${n.dateLabel}'),
              isThreeLine: true,
            ),
          ),
        ),
      ],
    );
  }
}
