import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../models/zaguan_models.dart';
import '../services/akuvox_dart_service.dart';
import '../services/android_notification_service.dart';
import '../services/doorbell_remote_service.dart';

class ZaguanStore extends ChangeNotifier {
  ZaguanStore() {
    _seedInitialData();
    _expiryTimer = Timer.periodic(const Duration(seconds: 5), (_) => _expireElapsed());
    AndroidNotificationService.attachTapListener(_handleDoorbellNotificationOpened);
  }

  Timer? _expiryTimer;
  final Random _rng = Random();
  final DoorbellRemoteService _remoteDoorbell = DoorbellRemoteService();

  String doorbellChannel = 'pocitos-2468';
  bool remoteDoorbellConnected = false;
  bool acceptAllUnitsForTesting = true;

  AppUser? currentUser;
  String activeBuildingId = 'bldg-pocitos-2468';

  final List<BuildingModel> buildings = [];
  final List<BuildingUnitModel> units = [];
  final List<AppUser> users = [];
  final List<SingleUsePassModel> singleUsePasses = [];
  final List<RecurringPassModel> recurringPasses = [];
  final List<PreAuthPackageModel> preAuthPackages = [];
  final List<DeliveredPackageModel> deliveredPackages = [];
  final List<MasterKeyModel> masterKeys = [];
  final List<BuildingNoticeModel> notices = [];
  final List<AccessLogModel> accessLogs = [];

  PendingDoorbellModel? pendingDoorbell;
  PendingPackageAlertModel? pendingPackageAlert;
  String? lastPushTitle;
  String? lastPushBody;

  bool door1Open = false;
  bool door2Open = false;
  bool nfcHceActive = false;
  bool bleInRange = true;
  int bleRssiDbm = -56;

  BuildingModel get activeBuilding => buildings.firstWhere(
        (b) => b.id == activeBuildingId,
        orElse: () => buildings.first,
      );

  List<BuildingUnitModel> unitsForBuilding(String buildingId) {
    final list = units.where((u) => u.buildingId == buildingId).toList();
    list.sort((a, b) {
      final floorCmp = b.floor.compareTo(a.floor);
      return floorCmp != 0 ? floorCmp : a.unitNumber.compareTo(b.unitNumber);
    });
    return list;
  }

  List<AppUser> residentsForBuilding(String buildingId) => users
      .where((u) =>
          u.buildingId == buildingId &&
          (u.role == ZaguanRole.owner || u.role == ZaguanRole.tenant))
      .toList();

  void _seedInitialData() {
    buildings.addAll([
      BuildingModel(
        id: 'bldg-pocitos-2468',
        name: 'Edificio Pocitos 2468',
        address: 'Bvar. España 2468, Pocitos',
        city: 'Montevideo',
        latitude: -34.91462,
        longitude: -56.15189,
        geofenceRadiusMeters: 30,
        storageMode: 'zaguan',
        akuvoxIp: '192.168.1.120',
      ),
      BuildingModel(
        id: 'bldg-cordon-1820',
        name: 'Torre Cordón 1820',
        address: 'Av. 18 de Julio 1820, Cordón',
        city: 'Montevideo',
        latitude: -34.90418,
        longitude: -56.17854,
        geofenceRadiusMeters: 30,
        storageMode: 'locker',
        akuvoxIp: '192.168.10.45',
      ),
    ]);

    units.addAll([
      BuildingUnitModel(id: 'u-1a', buildingId: 'bldg-pocitos-2468', unitNumber: '1A', floor: 1, isOccupied: true),
      BuildingUnitModel(id: 'u-2b', buildingId: 'bldg-pocitos-2468', unitNumber: '2B', floor: 2, isOccupied: true),
      BuildingUnitModel(id: 'u-3a', buildingId: 'bldg-pocitos-2468', unitNumber: '3A', floor: 3, isOccupied: true),
      BuildingUnitModel(id: 'u-4b', buildingId: 'bldg-pocitos-2468', unitNumber: '4B', floor: 4, isOccupied: true),
      BuildingUnitModel(id: 'u-501', buildingId: 'bldg-pocitos-2468', unitNumber: '501', floor: 5, isOccupied: false),
      BuildingUnitModel(id: 'u-c101', buildingId: 'bldg-cordon-1820', unitNumber: '101', floor: 1, isOccupied: true),
    ]);

    // 4 usuarios de prueba (1 por cada tipo de usuario pedido)
    users.addAll([
      AppUser(
        id: 'usr-installer',
        email: 'instalador@zaguan.uy',
        password: 'zaguan2026',
        fullName: 'Simón Fleitas (Instalador)',
        role: ZaguanRole.installer,
        buildingId: 'bldg-pocitos-2468',
        phone: '+598 97 999 561',
        personalPin: '9901',
        duressPin: '9910',
      ),
      AppUser(
        id: 'usr-admin',
        email: 'admin@zaguan.uy',
        password: 'zaguan2026',
        fullName: 'Laura Gómez (Administración)',
        role: ZaguanRole.buildingAdmin,
        buildingId: 'bldg-pocitos-2468',
        phone: '+598 99 100 200',
        personalPin: '8802',
        duressPin: '8820',
      ),
      AppUser(
        id: 'usr-owner',
        email: 'propietario@zaguan.uy',
        password: 'zaguan2026',
        fullName: 'Martín Silva',
        role: ZaguanRole.owner,
        buildingId: 'bldg-pocitos-2468',
        unit: '4B',
        phone: '+598 99 312 402',
        personalPin: '4028',
        duressPin: '4082',
      ),
      AppUser(
        id: 'usr-tenant',
        email: 'inquilino@zaguan.uy',
        password: 'zaguan2026',
        fullName: 'Carolina Vega',
        role: ZaguanRole.tenant,
        buildingId: 'bldg-pocitos-2468',
        unit: '3A',
        phone: '+598 98 640 301',
        personalPin: '3019',
        duressPin: '3091',
      ),
    ]);

    singleUsePasses.addAll([
      SingleUsePassModel(
        id: 'p-1',
        buildingId: 'bldg-pocitos-2468',
        unit: '4B',
        code: 'ZAG-7310',
        pin: '7310',
        guestName: 'Sofía Méndez (Visita)',
        hoursValid: 4,
        validUntil: DateTime.now().add(const Duration(hours: 4)),
        magicLink: 'https://zaguan.uy/pase/ZAG-7310',
      ),
      SingleUsePassModel(
        id: 'p-2',
        buildingId: 'bldg-pocitos-2468',
        unit: '3A',
        code: 'ZAG-6104',
        pin: '6104',
        guestName: 'Delivery PedidosYa',
        hoursValid: 1,
        validUntil: DateTime.now().add(const Duration(hours: 1)),
        magicLink: 'https://zaguan.uy/pase/ZAG-6104',
        status: 'Usado',
      ),
    ]);

    recurringPasses.addAll([
      RecurringPassModel(
        id: 'rec-marta',
        buildingId: 'bldg-pocitos-2468',
        unit: '4B',
        name: 'Marta Giménez',
        roleLabel: 'Limpieza',
        days: ['M', 'J'],
        startTime: '08:00',
        endTime: '13:00',
        pin: '3140',
        rfidUid: '04:A3:2F:8B',
        mobileAccessEnabled: true,
        auditLines: ['Mar 24 nov · 08:04 → 12:58 (4h 54m)'],
      ),
      RecurringPassModel(
        id: 'rec-diego',
        buildingId: 'bldg-pocitos-2468',
        unit: '3A',
        name: 'Diego Rojas',
        roleLabel: 'Paseador',
        days: ['L', 'X', 'V'],
        startTime: '14:00',
        endTime: '16:30',
        pin: '6290',
        rfidUid: 'RF-301P',
        mobileAccessEnabled: true,
        auditLines: ['Lun 23 nov · 14:10 → 15:25 (1h 15m)'],
      ),
    ]);

    preAuthPackages.addAll([
      PreAuthPackageModel(
        id: 'pkg-exp-1',
        buildingId: 'bldg-pocitos-2468',
        unit: '4B',
        residentName: 'Martín Silva',
        carrier: 'Mercado Libre',
        description: 'Paquete Full · Cafetera Express',
        timeWindowLabel: 'Hoy 09:00–18:00',
        autoRule: PackageAutoRule.autoOpenAfterOcr,
        storageMode: 'zaguan',
      ),
      PreAuthPackageModel(
        id: 'pkg-exp-2',
        buildingId: 'bldg-pocitos-2468',
        unit: '3A',
        residentName: 'Carolina Vega',
        carrier: 'PedidosYa Market',
        description: 'Supermercado (pedir foto)',
        timeWindowLabel: 'Hoy 14:00–20:00',
        autoRule: PackageAutoRule.askConfirmationPhoto,
        storageMode: 'zaguan',
      ),
    ]);

    deliveredPackages.addAll([
      DeliveredPackageModel(
        id: 'pkg-del-1',
        buildingId: 'bldg-pocitos-2468',
        unit: '4B',
        code: '#ML-402',
        carrier: 'Mercado Libre Full',
        location: 'Zaguán Paquetería (Exclusa 1)',
        validationMethod: 'Pre-autorizado (OCR Visión IA)',
        receivedTime: 'Hoy 14:32 hs',
        note: 'Validado por cámara 1080p del Akuvox E12W. Puerta al hall permaneció bloqueada.',
      ),
    ]);

    masterKeys.addAll([
      MasterKeyModel(
        id: 'mk-1',
        buildingId: 'bldg-pocitos-2468',
        provider: 'Ascensores',
        technicianName: 'Carlos Méndez (Otis UY)',
        pin: '9041',
        scope: 'Hall PB + Sala de Máquinas',
        expiresAt: DateTime.now().add(const Duration(hours: 3)),
        status: 'En edificio',
        enteredAt: '14:15',
      ),
      MasterKeyModel(
        id: 'mk-2',
        buildingId: 'bldg-pocitos-2468',
        provider: 'OSE',
        technicianName: 'Cuadrilla OSE #14',
        pin: '7712',
        scope: 'Sala de Medidores + Azotea',
        expiresAt: DateTime.now().add(const Duration(hours: 6)),
      ),
    ]);

    notices.addAll([
      BuildingNoticeModel(
        id: 'not-1',
        buildingId: 'bldg-pocitos-2468',
        title: 'Corte de agua programado el jueves',
        body: 'Limpieza semestral de tanques OSE de 09:00 a 13:00 hs.',
        category: 'Mantenimiento',
        dateLabel: 'Jue 09:00–13:00',
      ),
      BuildingNoticeModel(
        id: 'not-2',
        buildingId: 'bldg-pocitos-2468',
        title: 'Revisión de ascensor principal',
        body: 'Viernes de 10:00 a 11:30 hs. Escalera habilitada.',
        category: 'Aviso',
        dateLabel: 'Vie 10:00–11:30',
      ),
    ]);

    accessLogs.addAll([
      AccessLogModel(
        id: 'log-1',
        buildingId: 'bldg-pocitos-2468',
        unit: '4B',
        actorName: 'Repartidor Mercado Libre',
        type: AccessEventType.packageOcr,
        methodUsed: 'OCR Etiqueta + Relé 1 E12W',
        granted: true,
        notes: 'Paquete #ML-402 entregado (delivered) en Zaguán.',
        timestamp: DateTime.now().subtract(const Duration(minutes: 20)),
      ),
      AccessLogModel(
        id: 'log-2',
        buildingId: 'bldg-pocitos-2468',
        unit: '4B',
        actorName: 'Marta Giménez (Limpieza)',
        type: AccessEventType.accessPass,
        methodUsed: 'RFID 13.56MHz (04:A3:2F:8B)',
        granted: true,
        notes: 'Egreso registrado en franja Mar/Jue 08:00–13:00 (4h 54m).',
        timestamp: DateTime.now().subtract(const Duration(hours: 1)),
      ),
      AccessLogModel(
        id: 'log-3',
        buildingId: 'bldg-pocitos-2468',
        actorName: 'Carlos Méndez (Otis UY)',
        type: AccessEventType.masterKey,
        methodUsed: 'Llave Maestra PIN 9041',
        granted: true,
        notes: 'Ingreso de mantenimiento de ascensores.',
        timestamp: DateTime.now().subtract(const Duration(hours: 2)),
      ),
    ]);
  }

  void _expireElapsed() {
    final now = DateTime.now();
    bool changed = false;
    for (final mk in masterKeys) {
      if ((mk.status == 'Activa' || mk.status == 'En edificio') &&
          mk.expiresAt.isBefore(now)) {
        mk.status = 'Expirada';
        changed = true;
      }
    }
    for (final p in singleUsePasses) {
      if (p.status == 'Activo' && p.validUntil.isBefore(now)) {
        p.status = 'Expirado';
        changed = true;
      }
    }
    if (changed) notifyListeners();
  }

  String _nowHm() {
    final n = DateTime.now();
    return '${n.hour.toString().padLeft(2, '0')}:${n.minute.toString().padLeft(2, '0')}';
  }

  void _addLog({
    required String buildingId,
    String? unit,
    required String actorName,
    required AccessEventType type,
    required String methodUsed,
    bool granted = true,
    required String notes,
  }) {
    accessLogs.insert(
      0,
      AccessLogModel(
        id: 'log-${DateTime.now().millisecondsSinceEpoch}-${_rng.nextInt(999)}',
        buildingId: buildingId,
        unit: unit,
        actorName: actorName,
        type: type,
        methodUsed: methodUsed,
        granted: granted,
        notes: notes,
        timestamp: DateTime.now(),
      ),
    );
  }

  // --- Auth ---
  AppUser? login(String email, String password) {
    final clean = email.trim().toLowerCase();
    for (final u in users) {
      if (u.email.toLowerCase() == clean && u.password == password && u.isActive) {
        currentUser = u;
        activeBuildingId = u.buildingId;
        _startRemoteDoorbellListener();
        AndroidNotificationService.requestPermission();
        notifyListeners();
        return u;
      }
    }
    return null;
  }

  void logout() {
    _remoteDoorbell.stop();
    remoteDoorbellConnected = false;
    currentUser = null;
    pendingDoorbell = null;
    pendingPackageAlert = null;
    AndroidNotificationService.cancelDoorbellNotification();
    notifyListeners();
  }

  void _startRemoteDoorbellListener() {
    _remoteDoorbell.start(
      channel: doorbellChannel,
      onRing: _handleRemoteDoorbellEvent,
      onConnectionChanged: (connected) {
        if (remoteDoorbellConnected != connected) {
          remoteDoorbellConnected = connected;
          notifyListeners();
        }
      },
    );
  }

  void updateDoorbellChannel(String rawChannel) {
    doorbellChannel = DoorbellRemoteService.sanitizeChannel(rawChannel);
    if (currentUser != null) {
      _startRemoteDoorbellListener();
    }
    notifyListeners();
  }

  void toggleAcceptAllUnitsForTesting(bool value) {
    acceptAllUnitsForTesting = value;
    notifyListeners();
  }

  Future<bool> requestAndroidNotificationPermission() {
    return AndroidNotificationService.requestPermission();
  }

  void _handleDoorbellNotificationOpened({
    required String callId,
    required String unit,
    required String visitorName,
    required String transcript,
  }) {
    pendingDoorbell = PendingDoorbellModel(
      id: callId,
      unit: unit,
      residentName: currentUser?.fullName ?? 'Martín Silva',
      visitorName: visitorName,
      reasonTranscript: transcript,
      timeLabel: _nowHm(),
    );
    notifyListeners();
  }

  void _handleRemoteDoorbellEvent(RemoteDoorbellEvent event) {
    final user = currentUser;
    if (user == null) return;
    if (!acceptAllUnitsForTesting && user.unit != null && user.unit!.toUpperCase() != event.unit.toUpperCase()) {
      return;
    }

    pendingDoorbell = PendingDoorbellModel(
      id: event.id,
      unit: event.unit,
      residentName: user.fullName,
      visitorName: event.visitorName,
      reasonTranscript: event.transcript,
      timeLabel: _nowHm(),
      isPackage: event.isPackage,
      carrier: event.carrier,
    );

    final notifTitle = event.isPackage
        ? '📦 Paquete ${event.carrier ?? 'Entrega'} · Apto ${event.unit}'
        : '🔔 Timbre LucIA · Apto ${event.unit}';
    final notifBody = event.isPackage
        ? 'Llegó ${event.carrier ?? 'un paquete'} para el ${event.unit}. Tocá para recibir en el hall o rechazar.'
        : '${event.visitorName} está en la puerta: "${event.transcript}"';

    AndroidNotificationService.showDoorbellNotification(
      title: notifTitle,
      body: notifBody,
      unit: event.unit,
      visitorName: event.visitorName,
      transcript: event.transcript,
      callId: event.id,
    );

    _addLog(
      buildingId: activeBuildingId,
      unit: event.unit,
      actorName: event.visitorName,
      type: event.isPackage ? AccessEventType.packageOcr : AccessEventType.aiVoice,
      methodUsed: event.isPackage ? 'LucIA Paquete → Push Android' : 'LucIA Web → Push Android',
      notes: event.isPackage
          ? 'Notificación obligatoria de paquete (${event.carrier ?? 'Entrega'}) enviada al celular.'
          : 'Timbre recibido desde videoportero Web: "${event.transcript}"',
    );
    notifyListeners();
  }

  void selectBuilding(String buildingId) {
    activeBuildingId = buildingId;
    notifyListeners();
  }

  // --- Instalador: Edificios, Pisos, Apartamentos y Usuarios ---
  String createBuilding({
    required String name,
    required String address,
    required String city,
    required double latitude,
    required double longitude,
    required int geofenceRadiusMeters,
    required String storageMode,
    required String akuvoxIp,
    required String akuvoxUser,
  }) {
    final id = 'bldg-${DateTime.now().millisecondsSinceEpoch}';
    buildings.insert(
      0,
      BuildingModel(
        id: id,
        name: name,
        address: address,
        city: city,
        latitude: latitude,
        longitude: longitude,
        geofenceRadiusMeters: geofenceRadiusMeters,
        storageMode: storageMode,
        akuvoxIp: akuvoxIp,
        akuvoxUser: akuvoxUser,
      ),
    );
    activeBuildingId = id;
    _addLog(
      buildingId: id,
      actorName: currentUser?.fullName ?? 'Instalador',
      type: AccessEventType.adminAction,
      methodUsed: 'Instalador',
      notes: 'Nuevo edificio "$name" provisionado (Akuvox $akuvoxIp · GPS ${geofenceRadiusMeters}m).',
    );
    notifyListeners();
    return id;
  }

  int batchCreateFloorsAndUnits({
    required String buildingId,
    required int fromFloor,
    required int toFloor,
    required List<String> suffixes,
    required String towerBlock,
  }) {
    final existing = units
        .where((u) => u.buildingId == buildingId)
        .map((u) => u.unitNumber.toUpperCase())
        .toSet();
    int created = 0;
    final start = min(fromFloor, toFloor).clamp(0, 60);
    final end = max(fromFloor, toFloor).clamp(0, 60);
    for (int f = start; f <= end; f++) {
      for (final rawSuf in suffixes) {
        final suf = rawSuf.trim().toUpperCase();
        if (suf.isEmpty) continue;
        final code = '$f$suf';
        if (existing.contains(code)) continue;
        existing.add(code);
        units.add(
          BuildingUnitModel(
            id: 'u-${DateTime.now().millisecondsSinceEpoch}-$code-${_rng.nextInt(999)}',
            buildingId: buildingId,
            unitNumber: code,
            floor: f,
            towerBlock: towerBlock.isEmpty ? 'A' : towerBlock,
          ),
        );
        created++;
      }
    }
    if (created > 0) {
      _addLog(
        buildingId: buildingId,
        actorName: currentUser?.fullName ?? 'Instalador',
        type: AccessEventType.adminAction,
        methodUsed: 'Generador Pisos',
        notes: 'Se crearon $created apartamentos (Pisos $start a $end).',
      );
      notifyListeners();
    }
    return created;
  }

  bool addSingleUnit(String buildingId, String unitNumber, int floor, String block) {
    final code = unitNumber.trim().toUpperCase();
    if (code.isEmpty) return false;
    final exists = units.any(
      (u) => u.buildingId == buildingId && u.unitNumber.toUpperCase() == code,
    );
    if (exists) return false;
    units.add(
      BuildingUnitModel(
        id: 'u-${DateTime.now().millisecondsSinceEpoch}-$code',
        buildingId: buildingId,
        unitNumber: code,
        floor: floor,
        towerBlock: block.isEmpty ? 'A' : block,
      ),
    );
    notifyListeners();
    return true;
  }

  void deleteUnit(String unitId) {
    units.removeWhere((u) => u.id == unitId);
    notifyListeners();
  }

  void createUserAccount({
    required String fullName,
    required String email,
    required String password,
    required ZaguanRole role,
    required String buildingId,
    String? unit,
    required String phone,
  }) {
    final pin = (1000 + _rng.nextInt(8999)).toString();
    users.add(
      AppUser(
        id: 'usr-${DateTime.now().millisecondsSinceEpoch}',
        email: email.trim().toLowerCase(),
        password: password,
        fullName: fullName.trim(),
        role: role,
        buildingId: buildingId,
        unit: unit,
        phone: phone,
        personalPin: pin,
        duressPin: computeDuressPin(pin),
      ),
    );
    if (unit != null) {
      for (final u in units) {
        if (u.buildingId == buildingId && u.unitNumber == unit) {
          u.isOccupied = true;
        }
      }
    }
    _addLog(
      buildingId: buildingId,
      unit: unit,
      actorName: fullName,
      type: AccessEventType.adminAction,
      methodUsed: 'Alta ${role.label}',
      notes: 'Cuenta creada ($email) habilitada en Login.',
    );
    notifyListeners();
  }

  // --- Admin: Baja en 1 clic revoca automáticamente todos los pases ---
  int offboardResident(String userId) {
    final idx = users.indexWhere((u) => u.id == userId);
    if (idx == -1) return 0;
    final target = users[idx];
    target.isActive = false;
    int revoked = 0;
    for (final p in singleUsePasses) {
      if (p.buildingId == target.buildingId &&
          p.unit == target.unit &&
          p.status == 'Activo') {
        p.status = 'Revocado';
        revoked++;
      }
    }
    for (final r in recurringPasses) {
      if (r.buildingId == target.buildingId &&
          r.unit == target.unit &&
          r.status == 'Activo') {
        r.status = 'Revocado';
        r.currentlyInside = false;
        revoked++;
      }
    }
    _addLog(
      buildingId: target.buildingId,
      unit: target.unit,
      actorName: target.fullName,
      type: AccessEventType.adminAction,
      methodUsed: 'Baja 1 clic',
      notes: 'Residente dado de baja. $revoked pase(s) y permisos RFID revocados automáticamente.',
    );
    notifyListeners();
    return revoked;
  }

  // --- Admin: Llaves maestras temporales ---
  MasterKeyModel issueMasterKey({
    required String provider,
    required String technicianName,
    required String scope,
    required int durationMinutes,
  }) {
    final pin = (1000 + _rng.nextInt(8999)).toString();
    final mk = MasterKeyModel(
      id: 'mk-${DateTime.now().millisecondsSinceEpoch}',
      buildingId: activeBuildingId,
      provider: provider,
      technicianName: technicianName,
      pin: pin,
      scope: scope,
      expiresAt: DateTime.now().add(Duration(minutes: durationMinutes)),
    );
    masterKeys.insert(0, mk);
    _addLog(
      buildingId: activeBuildingId,
      actorName: '$technicianName ($provider)',
      type: AccessEventType.masterKey,
      methodUsed: 'PIN $pin',
      notes: 'Llave maestra emitida ($durationMinutes min) · $scope.',
    );
    notifyListeners();
    return mk;
  }

  void toggleMasterKeyShift(String keyId) {
    final mk = masterKeys.firstWhere((k) => k.id == keyId);
    final hm = _nowHm();
    if (mk.status == 'Activa') {
      mk.status = 'En edificio';
      mk.enteredAt = hm;
      _addLog(
        buildingId: mk.buildingId,
        actorName: '${mk.technicianName} (${mk.provider})',
        type: AccessEventType.masterKey,
        methodUsed: 'PIN ${mk.pin}',
        notes: 'Ingreso registrado a las $hm hs.',
      );
    } else if (mk.status == 'En edificio') {
      mk.status = 'Finalizada';
      mk.exitedAt = hm;
      _addLog(
        buildingId: mk.buildingId,
        actorName: '${mk.technicianName} (${mk.provider})',
        type: AccessEventType.masterKey,
        methodUsed: 'PIN ${mk.pin}',
        notes: 'Salida registrada a las $hm hs.',
      );
    }
    notifyListeners();
  }

  void revokeMasterKey(String keyId) {
    final mk = masterKeys.firstWhere((k) => k.id == keyId);
    mk.status = 'Revocada';
    notifyListeners();
  }

  void publishNotice(String title, String body, String category) {
    notices.insert(
      0,
      BuildingNoticeModel(
        id: 'not-${DateTime.now().millisecondsSinceEpoch}',
        buildingId: activeBuildingId,
        title: title,
        body: body,
        category: category,
        dateLabel: 'Hoy ${_nowHm()}',
      ),
    );
    notifyListeners();
  }

  // --- Hardware Akuvox E12W & Apertura Directa ---
  Future<AkuvoxCallResult> openDoorDirect(String methodLabel, {int relayId = 1}) async {
    final res = await AkuvoxDartService.openDoor(activeBuilding, relayId: relayId);
    if (res.ok) {
      door1Open = true;
      if (relayId == 1 && !methodLabel.contains('Zaguán')) {
        door2Open = true;
      }
      _addLog(
        buildingId: activeBuildingId,
        unit: currentUser?.unit,
        actorName: currentUser?.fullName ?? 'Usuario',
        type: AccessEventType.remoteApp,
        methodUsed: methodLabel,
        notes: res.message,
      );
      notifyListeners();
      Future<void>.delayed(const Duration(seconds: 6), () {
        door1Open = false;
        door2Open = false;
        notifyListeners();
      });
    }
    return res;
  }

  Future<AkuvoxCallResult> toggleNfcHce() async {
    nfcHceActive = !nfcHceActive;
    notifyListeners();
    if (nfcHceActive) {
      final uid = AkuvoxDartService.buildResidentHceUid(
        currentUser?.unit ?? '4B',
        currentUser?.personalPin ?? '4028',
      );
      return openDoorDirect('NFC HCE 13.56MHz (UID $uid)');
    }
    return AkuvoxCallResult(
      ok: true,
      simulated: true,
      endpoint: 'NFC HCE',
      message: 'Emulación NFC HCE detenida.',
    );
  }

  void toggleBleRange() {
    bleInRange = !bleInRange;
    bleRssiDbm = bleInRange ? -56 : -84;
    notifyListeners();
  }

  // --- Pases de 1 uso & Recurrentes ---
  SingleUsePassModel createSingleUsePass(String guestName, int hoursValid) {
    final pin = (1000 + _rng.nextInt(8999)).toString();
    final code = 'ZAG-$pin';
    final pass = SingleUsePassModel(
      id: 'p-${DateTime.now().millisecondsSinceEpoch}',
      buildingId: activeBuildingId,
      unit: currentUser?.unit ?? '4B',
      code: code,
      pin: pin,
      guestName: guestName.trim().isEmpty ? 'Visita' : guestName.trim(),
      hoursValid: hoursValid,
      validUntil: DateTime.now().add(Duration(hours: hoursValid)),
      magicLink: 'https://zaguan.uy/pase/$code',
    );
    singleUsePasses.insert(0, pass);
    _addLog(
      buildingId: activeBuildingId,
      unit: pass.unit,
      actorName: pass.guestName,
      type: AccessEventType.accessPass,
      methodUsed: 'Magic Link + Voz $pin',
      notes: 'Pase de 1 uso creado ($hoursValid hs).',
    );
    notifyListeners();
    return pass;
  }

  void revokeSingleUsePass(String passId) {
    for (final p in singleUsePasses) {
      if (p.id == passId) p.status = 'Revocado';
    }
    notifyListeners();
  }

  String? createRecurringPass({
    required String name,
    required String roleLabel,
    required List<String> days,
    required String startTime,
    required String endTime,
    required String rfidUid,
    required bool mobileAccessEnabled,
  }) {
    if (name.trim().length < 2) return 'Ingresá el nombre del personal.';
    if (days.isEmpty) return 'Seleccioná al menos un día.';
    if (startTime.compareTo(endTime) >= 0) {
      return 'La hora de fin debe ser posterior a la hora de inicio.';
    }
    final cleanUid = rfidUid.trim().toUpperCase();
    if (cleanUid.isEmpty && !mobileAccessEnabled) {
      return 'Ingresá un UID RFID físico o habilitá el acceso móvil.';
    }
    final pin = (1000 + _rng.nextInt(8999)).toString();
    recurringPasses.insert(
      0,
      RecurringPassModel(
        id: 'rec-${DateTime.now().millisecondsSinceEpoch}',
        buildingId: activeBuildingId,
        unit: currentUser?.unit ?? '4B',
        name: name.trim(),
        roleLabel: roleLabel,
        days: List<String>.from(days),
        startTime: startTime,
        endTime: endTime,
        pin: pin,
        rfidUid: cleanUid,
        mobileAccessEnabled: mobileAccessEnabled,
      ),
    );
    notifyListeners();
    return null;
  }

  void toggleRecurringShift(String id) {
    final staff = recurringPasses.firstWhere((r) => r.id == id);
    final hm = _nowHm();
    staff.currentlyInside = !staff.currentlyInside;
    if (staff.currentlyInside) {
      staff.auditLines.insert(0, 'Hoy · Ingresó $hm hs (en curso)');
      lastPushTitle = 'Push: Ingresó ${staff.name} (${staff.roleLabel})';
      lastPushBody = 'Ingreso a las $hm hs · ${staff.rfidUid.isNotEmpty ? 'RFID ${staff.rfidUid}' : 'Acceso móvil'}';
    } else {
      staff.auditLines.insert(0, 'Hoy · Egresó $hm hs (jornada auditada)');
      lastPushTitle = 'Push: Salió ${staff.name} (${staff.roleLabel})';
      lastPushBody = 'Egreso registrado a las $hm hs en Apto ${staff.unit}.';
    }
    _addLog(
      buildingId: staff.buildingId,
      unit: staff.unit,
      actorName: '${staff.name} (${staff.roleLabel})',
      type: AccessEventType.accessPass,
      methodUsed: staff.rfidUid.isNotEmpty ? 'RFID ${staff.rfidUid}' : 'Móvil',
      notes: lastPushBody ?? '',
    );
    notifyListeners();
  }

  void revokeRecurringPass(String id) {
    for (final r in recurringPasses) {
      if (r.id == id) {
        r.status = 'Revocado';
        r.currentlyInside = false;
      }
    }
    notifyListeners();
  }

  // --- Paquetería Inteligente ---
  void createPreAuthPackage({
    required String carrier,
    required String description,
    required String timeWindowLabel,
    required PackageAutoRule autoRule,
    required String storageMode,
  }) {
    preAuthPackages.insert(
      0,
      PreAuthPackageModel(
        id: 'pkg-exp-${DateTime.now().millisecondsSinceEpoch}',
        buildingId: activeBuildingId,
        unit: currentUser?.unit ?? '4B',
        residentName: currentUser?.fullName ?? 'Martín Silva',
        carrier: carrier,
        description: description.trim().isEmpty ? 'Entrega $carrier' : description.trim(),
        timeWindowLabel: timeWindowLabel,
        autoRule: autoRule,
        storageMode: storageMode,
      ),
    );
    notifyListeners();
  }

  Future<String> simulateParcelArrival(String carrier, {bool preAuthorized = true}) async {
    final unit = currentUser?.unit ?? '4B';
    final matched = preAuthorized
        ? preAuthPackages
            .where((p) => p.status == 'Esperando' && p.unit == unit)
            .cast<PreAuthPackageModel?>()
            .firstWhere((p) => p != null, orElse: () => null)
        : null;

    if (matched != null && matched.autoRule == PackageAutoRule.autoOpenAfterOcr) {
      matched.status = 'delivered';
      await openDoorDirect('Zaguán OCR Auto (Relé 1)', relayId: 1);
      final code = '#${carrier.substring(0, min(2, carrier.length)).toUpperCase()}-${100 + _rng.nextInt(899)}';
      deliveredPackages.insert(
        0,
        DeliveredPackageModel(
          id: 'del-${DateTime.now().millisecondsSinceEpoch}',
          buildingId: activeBuildingId,
          unit: unit,
          code: code,
          carrier: matched.carrier,
          location: matched.storageMode == 'locker'
              ? 'Locker Inteligente #B2'
              : 'Zaguán Paquetería (Exclusa 1)',
          validationMethod: 'Pre-autorizado (OCR Visión IA)',
          receivedTime: 'Hoy ${_nowHm()} hs',
          note: 'Etiqueta validada por cámara E12W. Puerta al hall bloqueada. Foto enviada.',
        ),
      );
      lastPushTitle = 'Tu paquete ya está en el zaguán (${_nowHm()} hs)';
      lastPushBody = '${matched.carrier} · Estado: delivered · Comprobante fotográfico guardado.';
      notifyListeners();
      return 'OCR OK → Relé 1 (Zaguán) abierto automáticamente · Estado: delivered.';
    }

    pendingPackageAlert = PendingPackageAlertModel(
      id: 'pal-${DateTime.now().millisecondsSinceEpoch}',
      unit: unit,
      carrier: matched?.carrier ?? carrier,
      ocrSummary: matched != null
          ? 'Regla configurada: Pedir confirmación con foto'
          : 'Entrega sin pre-autorización detectada por cámara E12W',
      storageMode: activeBuilding.storageMode,
    );
    notifyListeners();
    return 'Alerta con foto enviada al residente ([Dejar pasar al hall] / [Rechazar]).';
  }

  Future<void> respondPackageAlert(bool allowHall) async {
    final alert = pendingPackageAlert;
    if (alert == null) return;
    pendingPackageAlert = null;
    if (allowHall) {
      await openDoorDirect('Zaguán Paquetería (Confirmado)', relayId: 1);
      deliveredPackages.insert(
        0,
        DeliveredPackageModel(
          id: 'del-${DateTime.now().millisecondsSinceEpoch}',
          buildingId: activeBuildingId,
          unit: alert.unit,
          code: '#PK-${100 + _rng.nextInt(899)}',
          carrier: alert.carrier,
          location: alert.storageMode == 'locker' ? 'Locker #B2' : 'Zaguán Paquetería',
          validationMethod: 'Confirmado con foto por residente',
          receivedTime: 'Hoy ${_nowHm()} hs',
          note: 'Residente autorizó ingreso al hall/zaguán. Foto comprobante archivada.',
        ),
      );
    } else {
      _addLog(
        buildingId: activeBuildingId,
        unit: alert.unit,
        actorName: alert.carrier,
        type: AccessEventType.packageOcr,
        methodUsed: 'Rechazo residente',
        granted: false,
        notes: 'Entrega de ${alert.carrier} rechazada desde la App.',
      );
    }
    notifyListeners();
  }

  void confirmPackagePickup(String id) {
    for (final p in deliveredPackages) {
      if (p.id == id) p.status = 'Retirado';
    }
    notifyListeners();
  }

  // --- Timbre en vivo Akuvox E12W / LucIA (con notificación nativa Android) ---
  void simulateDoorbellCall() {
    final unit = currentUser?.unit ?? '4B';
    final residentFirst = currentUser?.fullName.split(' ').first ?? 'Martín';
    final callId = 'bell-${DateTime.now().millisecondsSinceEpoch}';
    final transcript = 'Hola LucIA, vengo a ver a $residentFirst del $unit, soy Lucas.';
    pendingDoorbell = PendingDoorbellModel(
      id: callId,
      unit: unit,
      residentName: currentUser?.fullName ?? 'Martín Silva',
      visitorName: 'Lucas Fernández',
      reasonTranscript: transcript,
      timeLabel: _nowHm(),
    );
    AndroidNotificationService.showDoorbellNotification(
      title: '🔔 Timbre LucIA · Apto $unit',
      body: 'Lucas Fernández está en la puerta: "$transcript"',
      unit: unit,
      visitorName: 'Lucas Fernández',
      transcript: transcript,
      callId: callId,
    );
    notifyListeners();
  }

  Future<void> scheduleDelayedDoorbellTest({int delaySeconds = 5}) async {
    final unit = currentUser?.unit ?? '4B';
    final residentFirst = currentUser?.fullName.split(' ').first ?? 'Martín';
    final callId = 'delayed-${DateTime.now().millisecondsSinceEpoch}';
    final transcript = 'Hola LucIA, soy Simón, vengo a ver a $residentFirst del $unit.';
    await AndroidNotificationService.scheduleDelayedDoorbell(
      delaySeconds: delaySeconds,
      title: '🔔 Timbre LucIA · Apto $unit',
      body: 'Simón está en la puerta: "$transcript"',
      unit: unit,
      visitorName: 'Simón',
      transcript: transcript,
      callId: callId,
    );
  }

  Future<void> respondDoorbell(bool approve) async {
    final bell = pendingDoorbell;
    if (bell == null) return;
    pendingDoorbell = null;
    await AndroidNotificationService.cancelDoorbellNotification();

    final action = bell.isPackage
        ? (approve ? 'approve_package' : 'reject_package')
        : (approve ? 'approve' : 'reject');

    // Enviar respuesta de vuelta a la Web para que LucIA hable en el videoportero
    unawaited(
      _remoteDoorbell.sendResponse(
        channel: doorbellChannel,
        callId: bell.id,
        action: action,
        unit: bell.unit,
        residentName: currentUser?.fullName ?? bell.residentName,
      ),
    );

    if (approve) {
      if (bell.isPackage) {
        await openDoorDirect('Paquete Recibido (Relé 1 Zaguán)', relayId: 1);
        final carrier = bell.carrier ?? 'Paquetería';
        deliveredPackages.insert(
          0,
          DeliveredPackageModel(
            id: 'del-${DateTime.now().millisecondsSinceEpoch}',
            buildingId: activeBuildingId,
            unit: bell.unit,
            code: '#PK-${100 + _rng.nextInt(899)}',
            carrier: carrier,
            location: activeBuilding.storageMode == 'locker'
                ? 'Locker Inteligente #B2'
                : 'Zaguán Paquetería (Exclusa 1)',
            validationMethod: 'Confirmado desde notificación Android (LucIA)',
            receivedTime: 'Hoy ${_nowHm()} hs',
            note: 'Residente aceptó recibir paquete desde su celular. Foto comprobante guardada.',
          ),
        );
      } else {
        await openDoorDirect('Timbre LucIA / E12W Aprobado');
      }
    } else {
      _addLog(
        buildingId: activeBuildingId,
        unit: bell.unit,
        actorName: bell.visitorName,
        type: bell.isPackage ? AccessEventType.packageOcr : AccessEventType.aiVoice,
        methodUsed: bell.isPackage ? 'Paquete Rechazado (LucIA)' : 'Timbre LucIA / E12W',
        granted: false,
        notes: bell.isPackage
            ? 'Paquete de ${bell.carrier ?? bell.visitorName} rechazado desde el celular.'
            : 'Visita de ${bell.visitorName} rechazada por el residente.',
      );
    }
    notifyListeners();
  }

  void sendDoorbellVoiceReply(String text) {
    final bell = pendingDoorbell;
    if (bell != null) {
      unawaited(
        _remoteDoorbell.sendResponse(
          channel: doorbellChannel,
          callId: bell.id,
          action: 'talk',
          unit: bell.unit,
          residentName: currentUser?.fullName ?? bell.residentName,
          message: text,
        ),
      );
    }
    _addLog(
      buildingId: activeBuildingId,
      unit: currentUser?.unit,
      actorName: currentUser?.fullName ?? 'Residente',
      type: AccessEventType.aiVoice,
      methodUsed: 'SIP Altavoz E12W / LucIA',
      notes: 'Habló al frente de calle: "$text"',
    );
    notifyListeners();
  }

  void triggerDuressOrSos(String reason) {
    _addLog(
      buildingId: activeBuildingId,
      unit: currentUser?.unit,
      actorName: currentUser?.fullName ?? 'Residente',
      type: AccessEventType.duressPin,
      methodUsed: 'Alerta Silenciosa SOS',
      granted: true,
      notes: '$reason · Audio/video enviado a seguridad y contactos.',
    );
    notifyListeners();
  }

  void updatePersonalPin(String newPin) {
    final user = currentUser;
    if (user == null || newPin.length != 4) return;
    user.personalPin = newPin;
    user.duressPin = computeDuressPin(newPin);
    notifyListeners();
  }

  void dismissPush() {
    lastPushTitle = null;
    lastPushBody = null;
    notifyListeners();
  }

  void updateBuildingAkuvox({
    required String buildingId,
    required String akuvoxIp,
    required String akuvoxUser,
    required String akuvoxPassword,
    required String secondaryRelayUrl,
    required bool highSecurityMode,
    required bool realHardwareMode,
  }) {
    final b = buildings.firstWhere((item) => item.id == buildingId);
    b.akuvoxIp = akuvoxIp.trim();
    b.akuvoxUser = akuvoxUser.trim();
    b.akuvoxPassword = akuvoxPassword;
    b.secondaryRelayUrl = secondaryRelayUrl.trim();
    b.highSecurityMode = highSecurityMode;
    b.realHardwareMode = realHardwareMode;
    _addLog(
      buildingId: buildingId,
      actorName: currentUser?.fullName ?? 'Instalador',
      type: AccessEventType.adminAction,
      methodUsed: 'Config Akuvox E12W',
      notes: 'IP ${b.akuvoxIp} · ${realHardwareMode ? 'Hardware Real' : 'Simulador'} · ${highSecurityMode ? 'Alta Seguridad' : 'Legacy'}.',
    );
    notifyListeners();
  }

  @override
  void dispose() {
    _expiryTimer?.cancel();
    _remoteDoorbell.stop();
    super.dispose();
  }
}
