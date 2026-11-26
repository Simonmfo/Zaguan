import 'package:flutter/services.dart';

typedef DoorbellOpenedCallback = void Function({
  required String callId,
  required String unit,
  required String visitorName,
  required String transcript,
});

/// Puente nativo hacia NotificationManager de Android (MainActivity.kt).
/// Dispara notificaciones reales con sonido de timbre, vibración y pantalla bloqueada.
class AndroidNotificationService {
  static const MethodChannel _channel = MethodChannel('uy.zaguan/notifications');

  static void attachTapListener(DoorbellOpenedCallback onOpened) {
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'onDoorbellOpened') {
        final args = Map<Object?, Object?>.from(call.arguments as Map? ?? {});
        onOpened(
          callId: args['callId']?.toString() ?? 'call-${DateTime.now().millisecondsSinceEpoch}',
          unit: args['unit']?.toString() ?? '4B',
          visitorName: args['visitorName']?.toString() ?? 'Visita',
          transcript: args['transcript']?.toString() ?? 'Visita en la puerta.',
        );
      }
    });
  }

  static Future<bool> requestPermission() async {
    try {
      final granted = await _channel.invokeMethod<bool>('requestPermission');
      return granted ?? true;
    } catch (_) {
      return false;
    }
  }

  static Future<void> showDoorbellNotification({
    required String title,
    required String body,
    required String unit,
    required String visitorName,
    required String transcript,
    required String callId,
  }) async {
    try {
      await _channel.invokeMethod<void>('showDoorbellNotification', {
        'title': title,
        'body': body,
        'unit': unit,
        'visitorName': visitorName,
        'transcript': transcript,
        'callId': callId,
      });
    } catch (_) {
      // Ignorar en entornos de test VM sin Android
    }
  }

  static Future<void> scheduleDelayedDoorbell({
    required int delaySeconds,
    required String title,
    required String body,
    required String unit,
    required String visitorName,
    required String transcript,
    required String callId,
  }) async {
    try {
      await _channel.invokeMethod<void>('scheduleDelayedDoorbell', {
        'delaySeconds': delaySeconds,
        'title': title,
        'body': body,
        'unit': unit,
        'visitorName': visitorName,
        'transcript': transcript,
        'callId': callId,
      });
    } catch (_) {
      // Ignorar en entornos de test VM sin Android
    }
  }

  static Future<void> cancelDoorbellNotification() async {
    try {
      await _channel.invokeMethod<void>('cancelDoorbellNotification');
    } catch (_) {
      // Ignorar en entornos de test VM
    }
  }
}
