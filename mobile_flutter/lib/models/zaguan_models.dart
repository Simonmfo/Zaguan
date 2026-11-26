enum ZaguanRole { installer, buildingAdmin, owner, tenant }

extension ZaguanRoleExt on ZaguanRole {
  String get label => switch (this) {
        ZaguanRole.installer => 'Instalador',
        ZaguanRole.buildingAdmin => 'Administrador',
        ZaguanRole.owner => 'Propietario',
        ZaguanRole.tenant => 'Inquilino',
      };

  String get shortDesc => switch (this) {
        ZaguanRole.installer =>
          'Crear edificios, pisos, apartamentos, usuarios y Akuvox E12W',
        ZaguanRole.buildingAdmin =>
          'Unidades, altas/bajas, llaves UTE/OSE/Antel, access_logs y cartelera',
        ZaguanRole.owner =>
          'Propietario · Apertura NFC/BLE, pases, paquetes OCR y control unidad',
        ZaguanRole.tenant =>
          'Inquilino · Apertura rápida, pases WhatsApp, limpieza y paquetes',
      };
}

enum PackageAutoRule { autoOpenAfterOcr, askConfirmationPhoto }

enum AccessEventType {
  remoteApp,
  aiVoice,
  accessPass,
  masterKey,
  packageOcr,
  duressPin,
  loiteringAlert,
  adminAction,
}

extension AccessEventTypeExt on AccessEventType {
  String get label => switch (this) {
        AccessEventType.remoteApp => 'Apertura App / NFC / BLE',
        AccessEventType.aiVoice => 'Portero IA (Voz)',
        AccessEventType.accessPass => 'Pase QR / RFID / Voz',
        AccessEventType.masterKey => 'Llave Maestra',
        AccessEventType.packageOcr => 'Paquetería OCR',
        AccessEventType.duressPin => 'PIN Coacción',
        AccessEventType.loiteringAlert => 'Alerta Merodeo',
        AccessEventType.adminAction => 'Administración',
      };
}

class AppUser {
  AppUser({
    required this.id,
    required this.email,
    required this.password,
    required this.fullName,
    required this.role,
    required this.buildingId,
    this.unit,
    required this.phone,
    required this.personalPin,
    required this.duressPin,
    this.isActive = true,
  });

  final String id;
  final String email;
  final String password;
  final String fullName;
  final ZaguanRole role;
  final String buildingId;
  final String? unit;
  final String phone;
  String personalPin;
  String duressPin;
  bool isActive;
}

class BuildingModel {
  BuildingModel({
    required this.id,
    required this.name,
    required this.address,
    required this.city,
    required this.latitude,
    required this.longitude,
    this.geofenceRadiusMeters = 30,
    this.storageMode = 'zaguan',
    this.akuvoxIp = '192.168.1.120',
    this.akuvoxUser = 'admin',
    this.akuvoxPassword = '',
    this.highSecurityMode = true,
    this.secondaryRelayUrl = '',
    this.realHardwareMode = false,
  });

  final String id;
  String name;
  String address;
  String city;
  double latitude;
  double longitude;
  int geofenceRadiusMeters;
  String storageMode; // 'zaguan' | 'locker'
  String akuvoxIp;
  String akuvoxUser;
  String akuvoxPassword;
  bool highSecurityMode;
  String secondaryRelayUrl;
  bool realHardwareMode;
}

class BuildingUnitModel {
  BuildingUnitModel({
    required this.id,
    required this.buildingId,
    required this.unitNumber,
    required this.floor,
    this.towerBlock = 'A',
    this.isOccupied = false,
  });

  final String id;
  final String buildingId;
  final String unitNumber;
  final int floor;
  final String towerBlock;
  bool isOccupied;
}

class SingleUsePassModel {
  SingleUsePassModel({
    required this.id,
    required this.buildingId,
    required this.unit,
    required this.code,
    required this.pin,
    required this.guestName,
    required this.hoursValid,
    required this.validUntil,
    required this.magicLink,
    this.status = 'Activo', // Activo | Usado | Expirado | Revocado
  });

  final String id;
  final String buildingId;
  final String unit;
  final String code;
  final String pin;
  final String guestName;
  final int hoursValid;
  final DateTime validUntil;
  final String magicLink;
  String status;
}

class RecurringPassModel {
  RecurringPassModel({
    required this.id,
    required this.buildingId,
    required this.unit,
    required this.name,
    required this.roleLabel,
    required this.days,
    required this.startTime,
    required this.endTime,
    required this.pin,
    this.rfidUid = '',
    this.mobileAccessEnabled = true,
    this.status = 'Activo',
    this.currentlyInside = false,
    List<String>? auditLines,
  }) : auditLines = auditLines ?? <String>[];

  final String id;
  final String buildingId;
  final String unit;
  final String name;
  final String roleLabel;
  final List<String> days;
  final String startTime;
  final String endTime;
  final String pin;
  final String rfidUid;
  final bool mobileAccessEnabled;
  String status;
  bool currentlyInside;
  final List<String> auditLines;
}

class PreAuthPackageModel {
  PreAuthPackageModel({
    required this.id,
    required this.buildingId,
    required this.unit,
    required this.residentName,
    required this.carrier,
    required this.description,
    required this.timeWindowLabel,
    required this.autoRule,
    required this.storageMode,
    this.status = 'Esperando', // Esperando | delivered
  });

  final String id;
  final String buildingId;
  final String unit;
  final String residentName;
  final String carrier;
  final String description;
  final String timeWindowLabel;
  final PackageAutoRule autoRule;
  final String storageMode;
  String status;
}

class DeliveredPackageModel {
  DeliveredPackageModel({
    required this.id,
    required this.buildingId,
    required this.unit,
    required this.code,
    required this.carrier,
    required this.location,
    required this.validationMethod,
    required this.receivedTime,
    required this.note,
    this.status = 'delivered', // delivered | Retirado
  });

  final String id;
  final String buildingId;
  final String unit;
  final String code;
  final String carrier;
  final String location;
  final String validationMethod;
  final String receivedTime;
  final String note;
  String status;
}

class MasterKeyModel {
  MasterKeyModel({
    required this.id,
    required this.buildingId,
    required this.provider,
    required this.technicianName,
    required this.pin,
    required this.scope,
    required this.expiresAt,
    this.status = 'Activa', // Activa | En edificio | Finalizada | Expirada | Revocada
    this.enteredAt,
    this.exitedAt,
  });

  final String id;
  final String buildingId;
  final String provider;
  final String technicianName;
  final String pin;
  final String scope;
  final DateTime expiresAt;
  String status;
  String? enteredAt;
  String? exitedAt;
}

class BuildingNoticeModel {
  BuildingNoticeModel({
    required this.id,
    required this.buildingId,
    required this.title,
    required this.body,
    required this.category,
    required this.dateLabel,
    this.showOnIntercom = true,
  });

  final String id;
  final String buildingId;
  final String title;
  final String body;
  final String category;
  final String dateLabel;
  bool showOnIntercom;
}

class AccessLogModel {
  AccessLogModel({
    required this.id,
    required this.buildingId,
    this.unit,
    required this.actorName,
    required this.type,
    required this.methodUsed,
    required this.granted,
    required this.notes,
    required this.timestamp,
  });

  final String id;
  final String buildingId;
  final String? unit;
  final String actorName;
  final AccessEventType type;
  final String methodUsed;
  final bool granted;
  final String notes;
  final DateTime timestamp;
}

class PendingDoorbellModel {
  PendingDoorbellModel({
    required this.id,
    required this.unit,
    required this.residentName,
    required this.visitorName,
    required this.reasonTranscript,
    required this.timeLabel,
  });

  final String id;
  final String unit;
  final String residentName;
  final String visitorName;
  final String reasonTranscript;
  final String timeLabel;
}

class PendingPackageAlertModel {
  PendingPackageAlertModel({
    required this.id,
    required this.unit,
    required this.carrier,
    required this.ocrSummary,
    required this.storageMode,
  });

  final String id;
  final String unit;
  final String carrier;
  final String ocrSummary;
  final String storageMode;
}

String computeDuressPin(String pin) {
  final digits = pin.replaceAll(RegExp(r'\D'), '');
  if (digits.length < 4) return '4082';
  final a = digits[digits.length - 2];
  final b = digits[digits.length - 1];
  if (a == b) {
    final bumped = ((int.tryParse(b) ?? 0) + 1) % 10;
    return '${digits.substring(0, digits.length - 1)}$bumped';
  }
  return '${digits.substring(0, digits.length - 2)}$b$a';
}
