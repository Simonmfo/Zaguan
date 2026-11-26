import 'dart:async';
import 'dart:convert';
import 'dart:io';

class RemoteDoorbellEvent {
  RemoteDoorbellEvent({
    required this.id,
    required this.unit,
    required this.visitorName,
    required this.residentName,
    required this.transcript,
    required this.buildingName,
  });

  final String id;
  final String unit;
  final String visitorName;
  final String residentName;
  final String transcript;
  final String buildingName;
}

/// Cliente 100% Dart (`dart:io` HttpClient) que escucha timbres en tiempo real
/// enviados desde el videoportero Web (LucIA) y envía de vuelta la respuesta
/// del residente ([Abrir Puerta], [Hablar], [Rechazar]).
class DoorbellRemoteService {
  static const String _ntfyBase = 'https://ntfy.sh';

  HttpClient? _client;
  StreamSubscription<String>? _lineSub;
  Timer? _reconnectTimer;
  bool _running = false;
  String _channel = 'pocitos-2468';
  final Set<String> _seenIds = <String>{};

  void Function(RemoteDoorbellEvent event)? _onRing;
  void Function(bool connected)? _onConnectionChanged;

  static String sanitizeChannel(String raw) {
    final clean = raw
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9-]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
    return clean.isEmpty ? 'pocitos-2468' : clean;
  }

  void start({
    required String channel,
    required void Function(RemoteDoorbellEvent event) onRing,
    required void Function(bool connected) onConnectionChanged,
  }) {
    stop();
    _channel = sanitizeChannel(channel);
    _onRing = onRing;
    _onConnectionChanged = onConnectionChanged;
    _running = true;
    _connect();
  }

  Future<void> _connect() async {
    if (!_running) return;
    _reconnectTimer?.cancel();
    _lineSub?.cancel();
    _client?.close(force: true);

    final topic = 'zaguan-e12w-ring-$_channel';
    final uri = Uri.parse('$_ntfyBase/$topic/json');
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 10);
    _client = client;

    try {
      final req = await client.getUrl(uri);
      final res = await req.close();
      if (res.statusCode != 200) {
        _onConnectionChanged?.call(false);
        _scheduleReconnect();
        return;
      }

      _onConnectionChanged?.call(true);
      _lineSub = res
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(
            _handleLine,
            onError: (_) {
              _onConnectionChanged?.call(false);
              _scheduleReconnect();
            },
            onDone: () {
              _onConnectionChanged?.call(false);
              _scheduleReconnect();
            },
            cancelOnError: true,
          );
    } catch (_) {
      _onConnectionChanged?.call(false);
      _scheduleReconnect();
    }
  }

  void _handleLine(String line) {
    final trimmed = line.trim();
    if (trimmed.isEmpty) return;
    try {
      final envelope = jsonDecode(trimmed) as Map<String, dynamic>;
      if (envelope['event'] != 'message') return;

      final envId = envelope['id']?.toString() ?? '';
      if (envId.isNotEmpty && _seenIds.contains(envId)) return;
      if (envId.isNotEmpty) _seenIds.add(envId);

      final msgRaw = envelope['message']?.toString() ?? '';
      if (msgRaw.isEmpty) return;

      final payload = jsonDecode(msgRaw) as Map<String, dynamic>;
      final callId = payload['id']?.toString() ?? envId;
      if (callId.isNotEmpty && _seenIds.contains(callId)) return;
      if (callId.isNotEmpty) _seenIds.add(callId);

      _onRing?.call(
        RemoteDoorbellEvent(
          id: callId.isEmpty ? 'call-${DateTime.now().millisecondsSinceEpoch}' : callId,
          unit: (payload['unit']?.toString() ?? '4B').toUpperCase(),
          visitorName: payload['visitorName']?.toString() ?? 'Visita',
          residentName: payload['residentName']?.toString() ?? 'Residente',
          transcript: payload['transcript']?.toString() ?? 'Visita en la entrada del edificio.',
          buildingName: payload['buildingName']?.toString() ?? 'Edificio Pocitos 2468',
        ),
      );
    } catch (_) {
      // Ignorar líneas keepalive o mensajes no JSON
    }
  }

  void _scheduleReconnect() {
    if (!_running) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 3), _connect);
  }

  Future<void> sendResponse({
    required String channel,
    required String callId,
    required String action, // 'approve' | 'reject' | 'talk'
    required String unit,
    required String residentName,
    String? message,
  }) async {
    final clean = sanitizeChannel(channel);
    final topic = 'zaguan-e12w-resp-$clean';
    final uri = Uri.parse('$_ntfyBase/$topic');
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
    try {
      final req = await client.postUrl(uri);
      req.headers.set(HttpHeaders.contentTypeHeader, 'text/plain; charset=utf-8');
      req.write(
        jsonEncode({
          'callId': callId,
          'action': action,
          'unit': unit,
          'residentName': residentName,
          'message': ?message,
          'timestampIso': DateTime.now().toIso8601String(),
        }),
      );
      final res = await req.close().timeout(const Duration(seconds: 5));
      await res.drain<void>();
    } catch (_) {
      // Ignorar error de red en respuesta remota
    } finally {
      client.close(force: true);
    }
  }

  void stop() {
    _running = false;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _lineSub?.cancel();
    _lineSub = null;
    _client?.close(force: true);
    _client = null;
    _onConnectionChanged?.call(false);
  }
}
