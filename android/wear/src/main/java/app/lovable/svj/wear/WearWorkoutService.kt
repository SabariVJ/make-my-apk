package app.lovable.svj.wear

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.util.concurrent.CopyOnWriteArrayList

/**
 * The single source of truth for a running watch workout.
 *
 * The service owns the session, the sensors and the Data Layer pushes, so a
 * workout continues while the screen is off, while the user navigates away
 * from the workout screen, and across a WebView-free process restart
 * (`START_STICKY` plus [WearSessionStore]). The UI only observes through
 * [WearWorkoutHub].
 */
object WearWorkoutHub {

    interface Listener {
        fun onSessionChanged(session: WearWorkoutSession?)
    }

    private val listeners = CopyOnWriteArrayList<Listener>()

    @Volatile
    var session: WearWorkoutSession? = null
        private set

    /** A finished session stays visible until the user dismisses it. */
    @Volatile
    var lastSummaryJson: String? = null
        private set

    fun publish(next: WearWorkoutSession?) {
        session = next
        for (listener in listeners) listener.onSessionChanged(next)
    }

    fun publishSummary(json: String?) {
        lastSummaryJson = json
    }

    fun add(listener: Listener) {
        listeners.add(listener)
    }

    fun remove(listener: Listener) {
        listeners.remove(listener)
    }
}

class WearWorkoutService : Service(), WearSensors.Listener {

    companion object {
        const val ACTION_START = "app.lovable.svj.wear.action.START"
        const val ACTION_PAUSE = "app.lovable.svj.wear.action.PAUSE"
        const val ACTION_RESUME = "app.lovable.svj.wear.action.RESUME"
        const val ACTION_FINISH = "app.lovable.svj.wear.action.FINISH"
        const val ACTION_STOP = "app.lovable.svj.wear.action.STOP"

        const val EXTRA_ACTIVITY = "activity"

        private const val CHANNEL_ID = "svj_wear_workout"
        private const val NOTIFICATION_ID = 4201
        private const val STEPS_PUSH_INTERVAL_MS = 15_000L

        fun start(context: Context, activity: WearActivityType) {
            val intent = Intent(context, WearWorkoutService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_ACTIVITY, activity.name)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun command(context: Context, action: String) {
            val intent = Intent(context, WearWorkoutService::class.java).apply { this.action = action }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var sensors: WearSensors
    private var lastHeartRatePushMs = 0L
    private var lastPushedBpm: Int? = null
    private var lastStepsPushMs = 0L
    private var lastPushedSteps = -1

    private val ticker = object : Runnable {
        override fun run() {
            val session = WearWorkoutHub.session ?: return
            if (!session.active) return
            handler.postDelayed(this, 1_000L)
            notifyOngoing(session)
            pushSamples(session)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        sensors = WearSensors(this).apply { listener = this@WearWorkoutService }
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_RESUME
        when (action) {
            ACTION_START -> {
                val activity = WearActivityType.fromName(intent?.getStringExtra(EXTRA_ACTIVITY))
                    ?: WearActivityType.RUN
                startWorkout(activity)
            }
            ACTION_PAUSE -> transition { it.pause(System.currentTimeMillis()) }
            ACTION_RESUME -> {
                val current = WearWorkoutHub.session
                if (current == null) {
                    // The system restarted the service: never invent a session.
                    stopSelf()
                    return START_NOT_STICKY
                }
                transition { it.resume(System.currentTimeMillis()) }
            }
            ACTION_FINISH -> finishWorkout()
            ACTION_STOP -> stopWorkout()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(ticker)
        sensors.stop()
        if (WearWorkoutHub.session?.active == true) {
            // A service teardown must not silently lose the session: persist it
            // so the app can recover it as paused.
            WearWorkoutHub.session?.let { WearSessionStore.save(this, it) }
        }
        super.onDestroy()
    }

    // ── Session control ────────────────────────────────────────────────────

    private fun startWorkout(activity: WearActivityType) {
        val existing = WearWorkoutHub.session
        if (existing != null && existing.active) {
            // The same session continues; a workout is never created twice.
            startForegroundNotification(existing)
            sensorStart(existing)
            return
        }
        val session = WearSessionStore.newSession(activity)
        session.start(System.currentTimeMillis())
        WearWorkoutHub.publish(session)
        WearWorkoutHub.publishSummary(null)
        WearSessionStore.save(this, session)
        startForegroundNotification(session)
        sensorStart(session)
        WearDataLayer.send(this, WearProtocol.PATH_HANDSHAKE, handshakeJson(session))
        WearDataLayer.send(this, WearProtocol.PATH_STATE, session.toStateJson(System.currentTimeMillis()))
    }

    private fun transition(apply: (WearWorkoutSession) -> Boolean) {
        val session = WearWorkoutHub.session ?: return
        val changed = apply(session)
        if (!changed) return
        WearSessionStore.save(this, session)
        WearWorkoutHub.publish(session)
        notifyOngoing(session)
        WearDataLayer.send(this, WearProtocol.PATH_STATE, session.toStateJson(System.currentTimeMillis()))
        if (session.state != WearWorkoutState.RUNNING) {
            handler.removeCallbacks(ticker)
        } else {
            handler.removeCallbacks(ticker)
            handler.post(ticker)
        }
    }

    private fun finishWorkout() {
        val session = WearWorkoutHub.session ?: return
        if (!session.finish(System.currentTimeMillis())) return
        handler.removeCallbacks(ticker)
        sensors.stop()
        val summary = session.toSummaryJson()
        if (summary != null) {
            WearWorkoutHub.publishSummary(summary)
            // A summary is queued if the phone is away and delivered later.
            WearDataLayer.send(this, WearProtocol.PATH_SUMMARY, summary)
        }
        WearDataLayer.send(this, WearProtocol.PATH_STATE, session.toStateJson(System.currentTimeMillis()))
        WearSessionStore.clear(this)
        WearWorkoutHub.publish(session)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun stopWorkout() {
        handler.removeCallbacks(ticker)
        sensors.stop()
        WearSessionStore.clear(this)
        WearWorkoutHub.publish(null)
        WearWorkoutHub.publishSummary(null)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun sensorStart(session: WearWorkoutSession) {
        if (session.state == WearWorkoutState.RUNNING) {
            sensors.start()
            handler.removeCallbacks(ticker)
            handler.post(ticker)
        } else {
            sensors.stop()
        }
    }

    // ── Sensor callbacks ───────────────────────────────────────────────────

    override fun onHeartRate(bpm: Int, atMs: Long) {
        val session = WearWorkoutHub.session ?: return
        if (session.state != WearWorkoutState.RUNNING) return
        if (!session.onHeartRate(bpm, atMs)) return
        WearWorkoutHub.publish(session)
        WearSessionStore.save(this, session)
        pushHeartRate(session, bpm, atMs)
    }

    override fun onStepTotal(totalSinceBoot: Float) {
        val session = WearWorkoutHub.session ?: return
        if (session.state != WearWorkoutState.RUNNING) return
        session.onStepTotal(totalSinceBoot)
        WearWorkoutHub.publish(session)
    }

    // ── Phone pushes (throttled: the watch battery matters) ────────────────

    private fun pushSamples(session: WearWorkoutSession) {
        val now = System.currentTimeMillis()
        if (session.heartRate.current != null && now - lastHeartRatePushMs >= WearProtocol.HEART_RATE_PUSH_INTERVAL_MS) {
            pushHeartRate(session, session.heartRate.current!!, session.heartRate.lastSampleAtMs)
        }
        if (session.stepCount != lastPushedSteps && now - lastStepsPushMs >= STEPS_PUSH_INTERVAL_MS) {
            lastStepsPushMs = now
            lastPushedSteps = session.stepCount
            WearDataLayer.send(this, WearProtocol.PATH_SAMPLE, session.toStepsSampleJson(now))
        }
    }

    private fun pushHeartRate(session: WearWorkoutSession, bpm: Int, atMs: Long) {
        val now = System.currentTimeMillis()
        if (now - lastHeartRatePushMs < WearProtocol.HEART_RATE_PUSH_INTERVAL_MS) return
        if (bpm == lastPushedBpm && now - lastHeartRatePushMs < WearProtocol.HEART_RATE_PUSH_INTERVAL_MS * 2) return
        lastHeartRatePushMs = now
        lastPushedBpm = bpm
        WearDataLayer.send(this, WearProtocol.PATH_SAMPLE, session.toHeartRateSampleJson(bpm, atMs))
    }

    private fun handshakeJson(session: WearWorkoutSession): String =
        session.toHandshakeJson(sensors.canRecordHeartRate(), sensors.canCountSteps())

    // ── Notification ───────────────────────────────────────────────────────

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.workout_channel_name),
            NotificationManager.IMPORTANCE_LOW
        )
        channel.description = getString(R.string.workout_notification_recording)
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(session: WearWorkoutSession): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val recording = session.state == WearWorkoutState.RUNNING
        val heartRate = session.heartRate.current
        val detail = buildString {
            append(if (recording) "Recording" else "Paused")
            heartRate?.let { append(" · ").append(it).append(" bpm") }
            append(" · ").append(session.elapsedSeconds(System.currentTimeMillis()) / 60).append(" min")
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(
                getString(
                    if (recording) R.string.workout_notification_recording
                    else R.string.workout_notification_paused
                )
            )
            .setContentText(detail)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun startForegroundNotification(session: WearWorkoutSession) {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
        } else {
            0
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(session), type)
    }

    private fun notifyOngoing(session: WearWorkoutSession) {
        val manager = getSystemService(NotificationManager::class.java) ?: return
        manager.notify(NOTIFICATION_ID, buildNotification(session))
    }
}
