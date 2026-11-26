import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import '../models/zaguan_models.dart';

class AkuvoxCallResult {
  AkuvoxCallResult({
    required this.ok,
    required this.simulated,
    required this.endpoint,
    required this.message,
    this.snapshotBytes,
  });

  final bool ok;
  final bool simulated;
  final String endpoint;
  final String message;
  final Uint8List? snapshotBytes;
}

/// Controlador 100% Dart nativo para Akuvox E12W vía HTTP API REST
/// Soporta autenticación Basic y Digest (RFC 2617 nativo en dart:io HttpClient),
/// timeouts cortos (3.5s) y modo simulador para pruebas sin portero físico.
class AkuvoxDartService {
  static const Duration _timeout = Duration(milliseconds: 3500);
  static const String nfcHceAidHex = 'F05A414755414E01';

  static String buildResidentHceUid(String unit, String pin) {
    final clean = unit.replaceAll(RegExp(r'[^A-Za-z0-9]'), '').padRight(2, '0');
    final b1 = clean.codeUnitAt(0).toRadixString(16).toUpperCase().padLeft(2, '0');
    final b2 = clean.codeUnitAt(1).toRadixString(16).toUpperCase().padLeft(2, '0');
    final pNum = int.tryParse(pin.replaceAll(RegExp(r'\D'), '')) ?? 4028;
    final b3 = ((pNum >> 4) & 0xff).toRadixString(16).toUpperCase().padLeft(2, '0');
    final b4 = (pNum & 0xff).toRadixString(16).toUpperCase().padLeft(2, '0');
    return '04:$b1:$b2:$b3:$b4';
  }

  static Future<AkuvoxCallResult> openDoor(
    BuildingModel building, {
    int relayId = 1,
  }) async {
    final String url = (relayId == 2 && building.secondaryRelayUrl.isNotEmpty)
        ? building.secondaryRelayUrl
        : building.highSecurityMode
            ? 'http://${building.akuvoxIp}/fcgi/OpenDoor?action=OpenDoor&DoorNum=$relayId'
            : 'http://${building.akuvoxIp}/fcgi/do?action=OpenDoor&UserName=${Uri.encodeComponent(building.akuvoxUser)}&Password=${Uri.encodeComponent(building.akuvoxPassword)}&DoorNum=$relayId';

    if (!building.realHardwareMode) {
      return AkuvoxCallResult(
        ok: true,
        simulated: true,
        endpoint: url.replaceAll(RegExp(r'Password=[^&]+'), 'Password=****'),
        message: 'Relé $relayId del Akuvox E12W disparado (modo simulador).',
      );
    }

    final client = HttpClient()..connectionTimeout = _timeout;
    try {
      final uri = Uri.parse(url);
      client.addCredentials(
        uri,
        '',
        HttpClientDigestCredentials(building.akuvoxUser, building.akuvoxPassword),
      );
      client.addCredentials(
        uri,
        '',
        HttpClientBasicCredentials(building.akuvoxUser, building.akuvoxPassword),
      );
      final req = await client.getUrl(uri).timeout(_timeout);
      final res = await req.close().timeout(_timeout);
      final body = await res.transform(utf8.decoder).join();
      final ok = res.statusCode >= 200 && res.statusCode < 300;
      return AkuvoxCallResult(
        ok: ok,
        simulated: false,
        endpoint: url.replaceAll(RegExp(r'Password=[^&]+'), 'Password=****'),
        message: ok
            ? 'Relé $relayId del Akuvox E12W desbloqueado (HTTP ${res.statusCode}).'
            : 'Akuvox respondió HTTP ${res.statusCode}: ${body.length > 80 ? body.substring(0, 80) : body}',
      );
    } catch (e) {
      return AkuvoxCallResult(
        ok: false,
        simulated: false,
        endpoint: url.replaceAll(RegExp(r'Password=[^&]+'), 'Password=****'),
        message: 'Error conectando al E12W (${building.akuvoxIp}): $e',
      );
    } finally {
      client.close(force: true);
    }
  }

  static Future<AkuvoxCallResult> getSnapshot(BuildingModel building) async {
    final url = 'http://${building.akuvoxIp}:8080/picture.jpg';
    if (!building.realHardwareMode) {
      return AkuvoxCallResult(
        ok: true,
        simulated: true,
        endpoint: url,
        message: 'Snapshot 1080p verificado (modo simulador).',
      );
    }

    final client = HttpClient()..connectionTimeout = _timeout;
    try {
      final uri = Uri.parse(url);
      client.addCredentials(
        uri,
        '',
        HttpClientBasicCredentials(building.akuvoxUser, building.akuvoxPassword),
      );
      final req = await client.getUrl(uri).timeout(_timeout);
      final res = await req.close().timeout(_timeout);
      if (res.statusCode == 200) {
        final builder = BytesBuilder(copy: false);
        await for (final chunk in res) {
          builder.add(chunk);
        }
        return AkuvoxCallResult(
          ok: true,
          simulated: false,
          endpoint: url,
          message: 'Snapshot 1080p capturado desde ${building.akuvoxIp}',
          snapshotBytes: builder.takeBytes(),
        );
      }
      return AkuvoxCallResult(
        ok: false,
        simulated: false,
        endpoint: url,
        message: 'Snapshot devolvió HTTP ${res.statusCode}.',
      );
    } catch (e) {
      return AkuvoxCallResult(
        ok: false,
        simulated: false,
        endpoint: url,
        message: 'No se pudo obtener snapshot de ${building.akuvoxIp}: $e',
      );
    } finally {
      client.close(force: true);
    }
  }

  static Future<AkuvoxCallResult> syncRfidCards(
    BuildingModel building,
    List<RecurringPassModel> cards,
  ) async {
    final active = cards.where((c) => c.status == 'Activo' && c.rfidUid.isNotEmpty).toList();
    final endpoint = 'http://${building.akuvoxIp}/api/user/set';

    if (!building.realHardwareMode) {
      return AkuvoxCallResult(
        ok: true,
        simulated: true,
        endpoint: endpoint,
        message: '${active.length} tarjetas RFID 13.56 MHz sincronizadas (modo simulador).',
      );
    }

    final client = HttpClient()..connectionTimeout = _timeout;
    int synced = 0;
    try {
      final uri = Uri.parse(endpoint);
      client.addCredentials(
        uri,
        '',
        HttpClientDigestCredentials(building.akuvoxUser, building.akuvoxPassword),
      );
      for (final card in active) {
        final cleanUid = card.rfidUid.replaceAll(':', '').toUpperCase();
        final req = await client.postUrl(uri).timeout(_timeout);
        req.headers.contentType = ContentType.json;
        req.write(jsonEncode({
          'target': 'user',
          'action': 'add',
          'data': {
            'item': [
              {
                'Name': '${card.name} (${card.unit})',
                'UserID': cleanUid,
                'CardCode': cleanUid,
                'WebRelay': '1',
              }
            ]
          }
        }));
        final res = await req.close().timeout(_timeout);
        if (res.statusCode >= 200 && res.statusCode < 300) synced++;
      }
      return AkuvoxCallResult(
        ok: synced == active.length,
        simulated: false,
        endpoint: endpoint,
        message: 'Sincronizadas $synced/${active.length} tarjetas RFID en ${building.akuvoxIp}.',
      );
    } catch (e) {
      return AkuvoxCallResult(
        ok: false,
        simulated: false,
        endpoint: endpoint,
        message: 'Error sincronizando RFID con E12W: $e',
      );
    } finally {
      client.close(force: true);
    }
  }
}
