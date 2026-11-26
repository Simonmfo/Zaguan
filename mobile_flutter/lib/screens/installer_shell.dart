import 'package:flutter/material.dart';

import '../models/zaguan_models.dart';
import '../services/akuvox_dart_service.dart';
import '../state/zaguan_store.dart';

class InstallerShell extends StatefulWidget {
  const InstallerShell({super.key, required this.store});

  final ZaguanStore store;

  @override
  State<InstallerShell> createState() => _InstallerShellState();
}

class _InstallerShellState extends State<InstallerShell> {
  int _tabIndex = 0;

  // Nuevo Edificio
  final _bNameCtrl = TextEditingController();
  final _bAddrCtrl = TextEditingController();
  final _bCityCtrl = TextEditingController(text: 'Montevideo');
  final _bLatCtrl = TextEditingController(text: '-34.9146');
  final _bLngCtrl = TextEditingController(text: '-56.1519');
  final _bRadiusCtrl = TextEditingController(text: '30');
  final _bAkuvoxIpCtrl = TextEditingController(text: '192.168.1.125');
  final _bAkuvoxUserCtrl = TextEditingController(text: 'admin');
  String _bStorageMode = 'zaguan';

  // Generador Masivo de Pisos y Deptos
  final _fromFloorCtrl = TextEditingController(text: '1');
  final _toFloorCtrl = TextEditingController(text: '6');
  final _suffixesCtrl = TextEditingController(text: 'A, B');
  final _blockCtrl = TextEditingController(text: 'A');

  // Unidad individual
  final _singleUnitCtrl = TextEditingController();
  final _singleFloorCtrl = TextEditingController(text: '0');

  // Nuevo Usuario
  final _uNameCtrl = TextEditingController();
  final _uEmailCtrl = TextEditingController();
  final _uPassCtrl = TextEditingController(text: 'zaguan2026');
  final _uPhoneCtrl = TextEditingController(text: '+598 99 ');
  final _uUnitCtrl = TextEditingController(text: '1A');
  ZaguanRole _uRole = ZaguanRole.owner;

  // Akuvox E12W
  final _akIpCtrl = TextEditingController();
  final _akUserCtrl = TextEditingController();
  final _akPassCtrl = TextEditingController();
  final _akRelay2Ctrl = TextEditingController();
  bool _akHighSec = true;
  bool _akRealHw = false;
  String? _loadedAkuvoxBuildingId;
  AkuvoxCallResult? _lastAkuvoxResult;
  bool _akBusy = false;

  @override
  void dispose() {
    _bNameCtrl.dispose();
    _bAddrCtrl.dispose();
    _bCityCtrl.dispose();
    _bLatCtrl.dispose();
    _bLngCtrl.dispose();
    _bRadiusCtrl.dispose();
    _bAkuvoxIpCtrl.dispose();
    _bAkuvoxUserCtrl.dispose();
    _fromFloorCtrl.dispose();
    _toFloorCtrl.dispose();
    _suffixesCtrl.dispose();
    _blockCtrl.dispose();
    _singleUnitCtrl.dispose();
    _singleFloorCtrl.dispose();
    _uNameCtrl.dispose();
    _uEmailCtrl.dispose();
    _uPassCtrl.dispose();
    _uPhoneCtrl.dispose();
    _uUnitCtrl.dispose();
    _akIpCtrl.dispose();
    _akUserCtrl.dispose();
    _akPassCtrl.dispose();
    _akRelay2Ctrl.dispose();
    super.dispose();
  }

  void _syncAkuvoxFields(BuildingModel b) {
    if (_loadedAkuvoxBuildingId == b.id) return;
    _loadedAkuvoxBuildingId = b.id;
    _akIpCtrl.text = b.akuvoxIp;
    _akUserCtrl.text = b.akuvoxUser;
    _akPassCtrl.text = b.akuvoxPassword;
    _akRelay2Ctrl.text = b.secondaryRelayUrl;
    _akHighSec = b.highSecurityMode;
    _akRealHw = b.realHardwareMode;
  }

  void _snack(String msg, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: error ? const Color(0xFFBA1A1A) : const Color(0xFF002547),
      ),
    );
  }

  int _previewBatchCount() {
    final from = int.tryParse(_fromFloorCtrl.text.trim()) ?? 1;
    final to = int.tryParse(_toFloorCtrl.text.trim()) ?? 1;
    final suffixes = _suffixesCtrl.text
        .split(',')
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();
    if (suffixes.isEmpty) return 0;
    final floors = (to - from).abs() + 1;
    return floors * suffixes.length;
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final activeBuilding = store.activeBuilding;
    _syncAkuvoxFields(activeBuilding);

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF002547),
        foregroundColor: Colors.white,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Modo Instalador · Zaguán',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            Text(
              activeBuilding.name,
              style: const TextStyle(fontSize: 12, color: Color(0xFFCBD5E1)),
            ),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Cambiar edificio',
            icon: const Icon(Icons.apartment),
            onSelected: (id) {
              store.selectBuilding(id);
              setState(() => _loadedAkuvoxBuildingId = null);
            },
            itemBuilder: (_) => store.buildings
                .map(
                  (b) => PopupMenuItem<String>(
                    value: b.id,
                    child: Row(
                      children: [
                        Icon(
                          b.id == activeBuilding.id
                              ? Icons.radio_button_checked
                              : Icons.radio_button_unchecked,
                          size: 16,
                          color: const Color(0xFF002547),
                        ),
                        const SizedBox(width: 8),
                        Expanded(child: Text(b.name)),
                      ],
                    ),
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
          _buildBuildingsTab(store),
          _buildFloorsAndUnitsTab(store, activeBuilding),
          _buildUsersTab(store, activeBuilding),
          _buildAkuvoxTab(store, activeBuilding),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tabIndex,
        onDestinationSelected: (i) => setState(() => _tabIndex = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.domain_outlined),
            selectedIcon: Icon(Icons.domain),
            label: 'Edificios',
          ),
          NavigationDestination(
            icon: Icon(Icons.layers_outlined),
            selectedIcon: Icon(Icons.layers),
            label: 'Pisos/Deptos',
          ),
          NavigationDestination(
            icon: Icon(Icons.group_add_outlined),
            selectedIcon: Icon(Icons.group_add),
            label: 'Usuarios',
          ),
          NavigationDestination(
            icon: Icon(Icons.router_outlined),
            selectedIcon: Icon(Icons.router),
            label: 'Akuvox E12W',
          ),
        ],
      ),
    );
  }

  Widget _buildBuildingsTab(ZaguanStore store) {
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
                  'Crear Nuevo Edificio',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Provisioná nombre, dirección, geofence GPS y portero Akuvox E12W.',
                  style: TextStyle(fontSize: 12, color: Color(0xFF43474F)),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _bNameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Nombre del edificio',
                    hintText: 'Ej. Torre Punta Carretas 810',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _bAddrCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Dirección',
                    hintText: 'Ej. Ellauri 810, Punta Carretas',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _bCityCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Ciudad',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _bRadiusCtrl,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Radio GPS (m)',
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
                        controller: _bLatCtrl,
                        keyboardType: const TextInputType.numberWithOptions(signed: true, decimal: true),
                        decoration: const InputDecoration(
                          labelText: 'Latitud',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _bLngCtrl,
                        keyboardType: const TextInputType.numberWithOptions(signed: true, decimal: true),
                        decoration: const InputDecoration(
                          labelText: 'Longitud',
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
                        controller: _bAkuvoxIpCtrl,
                        decoration: const InputDecoration(
                          labelText: 'IP Akuvox E12W',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _bAkuvoxUserCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Usuario API',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  children: [
                    ChoiceChip(
                      label: const Text('Zaguán / Exclusa'),
                      selected: _bStorageMode == 'zaguan',
                      onSelected: (_) => setState(() => _bStorageMode = 'zaguan'),
                    ),
                    ChoiceChip(
                      label: const Text('Locker Inteligente'),
                      selected: _bStorageMode == 'locker',
                      onSelected: (_) => setState(() => _bStorageMode = 'locker'),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () {
                    final name = _bNameCtrl.text.trim();
                    final addr = _bAddrCtrl.text.trim();
                    if (name.isEmpty || addr.isEmpty) {
                      _snack('Completá nombre y dirección del edificio.', error: true);
                      return;
                    }
                    store.createBuilding(
                      name: name,
                      address: addr,
                      city: _bCityCtrl.text.trim().isEmpty ? 'Montevideo' : _bCityCtrl.text.trim(),
                      latitude: double.tryParse(_bLatCtrl.text.trim()) ?? -34.9146,
                      longitude: double.tryParse(_bLngCtrl.text.trim()) ?? -56.1519,
                      geofenceRadiusMeters: int.tryParse(_bRadiusCtrl.text.trim()) ?? 30,
                      storageMode: _bStorageMode,
                      akuvoxIp: _bAkuvoxIpCtrl.text.trim().isEmpty ? '192.168.1.120' : _bAkuvoxIpCtrl.text.trim(),
                      akuvoxUser: _bAkuvoxUserCtrl.text.trim().isEmpty ? 'admin' : _bAkuvoxUserCtrl.text.trim(),
                    );
                    _bNameCtrl.clear();
                    _bAddrCtrl.clear();
                    setState(() => _loadedAkuvoxBuildingId = null);
                    _snack('Edificio "$name" creado y seleccionado. Ahora podés generar pisos y deptos.');
                  },
                  icon: const Icon(Icons.add_business),
                  label: const Text('Crear Edificio'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          'Edificios Provisionados (${store.buildings.length})',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        ...store.buildings.map((b) {
          final isSelected = b.id == store.activeBuildingId;
          final unitCount = store.unitsForBuilding(b.id).length;
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(
                color: isSelected ? const Color(0xFF002547) : const Color(0xFFD8DADC),
                width: isSelected ? 2 : 1,
              ),
            ),
            child: ListTile(
              onTap: () {
                store.selectBuilding(b.id);
                setState(() => _loadedAkuvoxBuildingId = null);
              },
              leading: CircleAvatar(
                backgroundColor: isSelected ? const Color(0xFF002547) : const Color(0xFFE2E8F0),
                foregroundColor: isSelected ? Colors.white : const Color(0xFF002547),
                child: const Icon(Icons.apartment),
              ),
              title: Text(b.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(
                '${b.address}\nE12W: ${b.akuvoxIp} · $unitCount deptos · GPS ${b.geofenceRadiusMeters}m',
              ),
              isThreeLine: true,
              trailing: isSelected
                  ? const Chip(
                      label: Text('Activo', style: TextStyle(fontSize: 11)),
                    )
                  : const Icon(Icons.chevron_right),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildFloorsAndUnitsTab(ZaguanStore store, BuildingModel building) {
    final buildingUnits = store.unitsForBuilding(building.id);
    final Map<int, List<BuildingUnitModel>> byFloor = {};
    for (final u in buildingUnits) {
      byFloor.putIfAbsent(u.floor, () => []).add(u);
    }
    final floors = byFloor.keys.toList()..sort((a, b) => b.compareTo(a));

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Generador Masivo de Pisos y Apartamentos',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(
                  'Edificio destino: ${building.name}',
                  style: const TextStyle(fontSize: 12, color: Color(0xFF076C41), fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _fromFloorCtrl,
                        keyboardType: TextInputType.number,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(
                          labelText: 'Piso desde',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _toFloorCtrl,
                        keyboardType: TextInputType.number,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(
                          labelText: 'Piso hasta',
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
                      flex: 2,
                      child: TextField(
                        controller: _suffixesCtrl,
                        onChanged: (_) => setState(() {}),
                        decoration: const InputDecoration(
                          labelText: 'Sufijos por piso (coma)',
                          hintText: 'Ej. A, B, C o 01, 02',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _blockCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Torre/Bloque',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () {
                    final from = int.tryParse(_fromFloorCtrl.text.trim()) ?? 1;
                    final to = int.tryParse(_toFloorCtrl.text.trim()) ?? 1;
                    final suffixes = _suffixesCtrl.text.split(',').toList();
                    final created = store.batchCreateFloorsAndUnits(
                      buildingId: building.id,
                      fromFloor: from,
                      toFloor: to,
                      suffixes: suffixes,
                      towerBlock: _blockCtrl.text.trim(),
                    );
                    _snack(
                      created > 0
                          ? 'Se crearon $created apartamentos en ${building.name}.'
                          : 'No se agregaron unidades nuevas (ya existían).',
                    );
                  },
                  icon: const Icon(Icons.auto_awesome_mosaic),
                  label: Text('Generar ~${_previewBatchCount()} Apartamentos'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Expanded(
                  flex: 2,
                  child: TextField(
                    controller: _singleUnitCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Apto individual',
                      hintText: 'PH / PB1',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _singleFloorCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Piso',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: () {
                    final ok = store.addSingleUnit(
                      building.id,
                      _singleUnitCtrl.text,
                      int.tryParse(_singleFloorCtrl.text.trim()) ?? 0,
                      _blockCtrl.text.trim(),
                    );
                    if (ok) {
                      _singleUnitCtrl.clear();
                      _snack('Unidad agregada.');
                    } else {
                      _snack('Unidad inválida o duplicada.', error: true);
                    }
                  },
                  child: const Text('Agregar'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          'Plano por Piso (${buildingUnits.length} unidades)',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        if (floors.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text('Aún no hay apartamentos en este edificio. Usá el generador masivo arriba.'),
            ),
          )
        else
          ...floors.map((floor) {
            final rowUnits = byFloor[floor]!;
            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      floor == 0 ? 'Planta Baja (PB)' : 'Piso $floor',
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF002547),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: rowUnits
                          .map(
                            (u) => InputChip(
                              label: Text('${u.unitNumber} (${u.towerBlock})'),
                              avatar: Icon(
                                u.isOccupied ? Icons.person : Icons.door_front_door_outlined,
                                size: 16,
                                color: u.isOccupied ? const Color(0xFF076C41) : const Color(0xFF64748B),
                              ),
                              onDeleted: () => store.deleteUnit(u.id),
                            ),
                          )
                          .toList(),
                    ),
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }

  Widget _buildUsersTab(ZaguanStore store, BuildingModel building) {
    final needsUnit = _uRole == ZaguanRole.owner || _uRole == ZaguanRole.tenant;
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
                  'Crear Usuario (Habilitado en Login)',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: ZaguanRole.values
                      .map(
                        (r) => ChoiceChip(
                          label: Text(r.label),
                          selected: _uRole == r,
                          onSelected: (_) => setState(() => _uRole = r),
                        ),
                      )
                      .toList(),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _uNameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Nombre completo',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _uEmailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Correo (usuario de acceso)',
                    hintText: 'ej. nuevo@zaguan.uy',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _uPassCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Contraseña',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _uPhoneCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Teléfono',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                  ],
                ),
                if (needsUnit) ...[
                  const SizedBox(height: 10),
                  TextField(
                    controller: _uUnitCtrl,
                    decoration: InputDecoration(
                      labelText: 'Apartamento en ${building.name}',
                      hintText: 'Ej. 4B',
                      border: const OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () {
                    final name = _uNameCtrl.text.trim();
                    final email = _uEmailCtrl.text.trim();
                    final pass = _uPassCtrl.text.trim();
                    if (name.isEmpty || !email.contains('@') || pass.length < 4) {
                      _snack('Completá nombre, correo válido y clave (mín. 4 caracteres).', error: true);
                      return;
                    }
                    store.createUserAccount(
                      fullName: name,
                      email: email,
                      password: pass,
                      role: _uRole,
                      buildingId: building.id,
                      unit: needsUnit ? _uUnitCtrl.text.trim().toUpperCase() : null,
                      phone: _uPhoneCtrl.text.trim(),
                    );
                    _uNameCtrl.clear();
                    _uEmailCtrl.clear();
                    _snack('Usuario $email creado. Ya aparece disponible en la pantalla de Login.');
                  },
                  icon: const Icon(Icons.person_add),
                  label: Text('Crear ${_uRole.label}'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          'Cuentas Activas e Inactivas (${store.users.length})',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        ...store.users.map(
          (u) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: u.isActive ? const Color(0xFF002547) : Colors.grey,
                foregroundColor: Colors.white,
                child: Text(u.role.label.substring(0, 1)),
              ),
              title: Text(
                '${u.fullName} · ${u.role.label}',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  decoration: u.isActive ? null : TextDecoration.lineThrough,
                ),
              ),
              subtitle: Text(
                '${u.email} ${u.unit != null ? '· Apto ${u.unit}' : ''} · PIN ${u.personalPin}',
              ),
              trailing: Chip(
                label: Text(u.isActive ? 'Activo' : 'Baja', style: const TextStyle(fontSize: 11)),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildAkuvoxTab(ZaguanStore store, BuildingModel building) {
    final rfidCards = store.recurringPasses
        .where((r) => r.buildingId == building.id && r.status == 'Activo' && r.rfidUid.isNotEmpty)
        .toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Integración Hardware Akuvox E12W',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(
                  'Edificio: ${building.name} · HTTP API REST Nativa en Dart (Digest/Basic Auth)',
                  style: const TextStyle(fontSize: 12, color: Color(0xFF43474F)),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _akIpCtrl,
                  decoration: const InputDecoration(
                    labelText: 'IP Local / Endpoint E12W',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _akUserCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Usuario HTTP API',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _akPassCtrl,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Password API',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _akRelay2Ctrl,
                  decoration: const InputDecoration(
                    labelText: 'URL Relé 2 / Shelly (opcional)',
                    hintText: 'http://192.168.1.121/relay/0?turn=on',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Modo Alta Seguridad (Digest Auth)'),
                  subtitle: const Text('/fcgi/OpenDoor sin password en query string'),
                  value: _akHighSec,
                  onChanged: (v) => setState(() => _akHighSec = v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Conectar a Hardware Físico Real'),
                  subtitle: Text(
                    _akRealHw
                        ? 'Enviará peticiones HTTP reales a ${_akIpCtrl.text}'
                        : 'Modo Simulador activo (ideal para pruebas sin portero físico)',
                  ),
                  value: _akRealHw,
                  onChanged: (v) => setState(() => _akRealHw = v),
                ),
                const SizedBox(height: 8),
                FilledButton.icon(
                  onPressed: () {
                    store.updateBuildingAkuvox(
                      buildingId: building.id,
                      akuvoxIp: _akIpCtrl.text,
                      akuvoxUser: _akUserCtrl.text,
                      akuvoxPassword: _akPassCtrl.text,
                      secondaryRelayUrl: _akRelay2Ctrl.text,
                      highSecurityMode: _akHighSec,
                      realHardwareMode: _akRealHw,
                    );
                    _snack('Configuración Akuvox E12W guardada.');
                  },
                  icon: const Icon(Icons.save),
                  label: const Text('Guardar Parámetros E12W'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Pruebas de Diagnóstico Directo',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton.tonalIcon(
                      onPressed: _akBusy
                          ? null
                          : () async {
                              setState(() => _akBusy = true);
                              final res = await store.openDoorDirect('Test Instalador Relé 1', relayId: 1);
                              setState(() {
                                _lastAkuvoxResult = res;
                                _akBusy = false;
                              });
                            },
                      icon: const Icon(Icons.lock_open),
                      label: const Text('Abrir Relé 1'),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: _akBusy
                          ? null
                          : () async {
                              setState(() => _akBusy = true);
                              final res = await AkuvoxDartService.getSnapshot(building);
                              setState(() {
                                _lastAkuvoxResult = res;
                                _akBusy = false;
                              });
                            },
                      icon: const Icon(Icons.camera_alt),
                      label: const Text('Snapshot 1080p'),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: _akBusy
                          ? null
                          : () async {
                              setState(() => _akBusy = true);
                              final res = await AkuvoxDartService.syncRfidCards(building, rfidCards);
                              setState(() {
                                _lastAkuvoxResult = res;
                                _akBusy = false;
                              });
                            },
                      icon: const Icon(Icons.nfc),
                      label: Text('Sync RFID (${rfidCards.length})'),
                    ),
                  ],
                ),
                if (_lastAkuvoxResult != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _lastAkuvoxResult!.ok
                          ? const Color(0xFFECFDF5)
                          : const Color(0xFFFFDAD6),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _lastAkuvoxResult!.ok ? 'Resultado OK' : 'Error de Comunicación',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: _lastAkuvoxResult!.ok
                                ? const Color(0xFF076C41)
                                : const Color(0xFF93000A),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(_lastAkuvoxResult!.message, style: const TextStyle(fontSize: 13)),
                        const SizedBox(height: 4),
                        Text(
                          'Endpoint: ${_lastAkuvoxResult!.endpoint}',
                          style: const TextStyle(fontFamily: 'monospace', fontSize: 11),
                        ),
                        if (_lastAkuvoxResult!.snapshotBytes != null) ...[
                          const SizedBox(height: 10),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.memory(
                              _lastAkuvoxResult!.snapshotBytes!,
                              height: 160,
                              fit: BoxFit.cover,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}
