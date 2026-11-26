package uy.zaguan.zaguan_app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    companion object {
        private const val CHANNEL_NAME = "uy.zaguan/notifications"
        private const val NOTIF_CHANNEL_ID = "zaguan_doorbell_lucia_v2"
        private const val DOORBELL_NOTIF_ID = 2468
        private const val REQ_POST_NOTIFICATIONS = 1001
    }

    private var methodChannel: MethodChannel? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        ensureDoorbellChannel()

        val channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL_NAME)
        methodChannel = channel

        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "requestPermission" -> {
                    val granted = requestNotificationPermissionIfNeeded()
                    result.success(granted)
                }

                "showDoorbellNotification" -> {
                    val title = call.argument<String>("title") ?: "Timbre LucIA · Zaguán"
                    val body = call.argument<String>("body") ?: "Tenés una visita en la puerta."
                    val unit = call.argument<String>("unit") ?: "4B"
                    val visitorName = call.argument<String>("visitorName") ?: "Visita"
                    val transcript = call.argument<String>("transcript") ?: body
                    val callId = call.argument<String>("callId") ?: "call-${System.currentTimeMillis()}"

                    showDoorbellNotification(
                        title = title,
                        body = body,
                        unit = unit,
                        visitorName = visitorName,
                        transcript = transcript,
                        callId = callId,
                    )
                    result.success(true)
                }

                "scheduleDelayedDoorbell" -> {
                    val delaySeconds = call.argument<Int>("delaySeconds") ?: 5
                    val title = call.argument<String>("title") ?: "Timbre LucIA · Zaguán"
                    val body = call.argument<String>("body") ?: "Visita esperando en la puerta."
                    val unit = call.argument<String>("unit") ?: "4B"
                    val visitorName = call.argument<String>("visitorName") ?: "Simón (Prueba)"
                    val transcript = call.argument<String>("transcript") ?: body
                    val callId = call.argument<String>("callId") ?: "delayed-${System.currentTimeMillis()}"

                    mainHandler.postDelayed({
                        showDoorbellNotification(
                            title = title,
                            body = body,
                            unit = unit,
                            visitorName = visitorName,
                            transcript = transcript,
                            callId = callId,
                        )
                        methodChannel?.invokeMethod(
                            "onDoorbellOpened",
                            mapOf(
                                "callId" to callId,
                                "unit" to unit,
                                "visitorName" to visitorName,
                                "transcript" to transcript,
                            ),
                        )
                    }, delaySeconds.toLong() * 1000L)
                    result.success(true)
                }

                "cancelDoorbellNotification" -> {
                    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    nm.cancel(DOORBELL_NOTIF_ID)
                    result.success(true)
                }

                else -> result.notImplemented()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        forwardIntentIfDoorbell(intent)
    }

    private fun forwardIntentIfDoorbell(intent: Intent?) {
        if (intent == null) return
        if (!intent.getBooleanExtra("zaguan_doorbell", false)) return
        methodChannel?.invokeMethod(
            "onDoorbellOpened",
            mapOf(
                "callId" to (intent.getStringExtra("callId") ?: "call-${System.currentTimeMillis()}"),
                "unit" to (intent.getStringExtra("unit") ?: "4B"),
                "visitorName" to (intent.getStringExtra("visitorName") ?: "Visita"),
                "transcript" to (intent.getStringExtra("transcript") ?: "Visita en la puerta."),
            ),
        )
    }

    private fun requestNotificationPermissionIfNeeded(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true
        }
        val granted = checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_POST_NOTIFICATIONS)
        }
        return granted
    }

    private fun ensureDoorbellChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val existing = nm.getNotificationChannel(NOTIF_CHANNEL_ID)
        if (existing != null) return

        val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val audioAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        val channel = NotificationChannel(
            NOTIF_CHANNEL_ID,
            "Timbre Videoportero LucIA",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Notificaciones en vivo cuando alguien toca el videoportero Akuvox E12W / LucIA."
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 450, 200, 450, 200, 650)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setSound(ringtoneUri, audioAttrs)
        }
        nm.createNotificationChannel(channel)
    }

    private fun vibrateDoorbell() {
        try {
            val pattern = longArrayOf(0, 350, 150, 350)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
            } else {
                @Suppress("DEPRECATION")
                val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(pattern, -1)
                }
            }
        } catch (_: Exception) {
            // Ignorar en dispositivos sin motor de vibración
        }
    }

    private fun showDoorbellNotification(
        title: String,
        body: String,
        unit: String,
        visitorName: String,
        transcript: String,
        callId: String,
    ) {
        ensureDoorbellChannel()
        vibrateDoorbell()

        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
            putExtra("zaguan_doorbell", true)
            putExtra("callId", callId)
            putExtra("unit", unit)
            putExtra("visitorName", visitorName)
            putExtra("transcript", transcript)
        }

        val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            DOORBELL_NOTIF_ID,
            openIntent,
            pendingFlags,
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, NOTIF_CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setPriority(Notification.PRIORITY_MAX)
                .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
        }

        val notification = builder
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setCategory(Notification.CATEGORY_CALL)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setFullScreenIntent(pendingIntent, true)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(DOORBELL_NOTIF_ID, notification)
    }
}
