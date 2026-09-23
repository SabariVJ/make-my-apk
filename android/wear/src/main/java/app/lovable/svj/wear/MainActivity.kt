package app.lovable.svj.wear

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * The SVJ watch app UI.
 *
 * Deliberately minimal and high-contrast: black background, SVJ red accent,
 * white numerals, small secondary grey. Everything shown is a real value from
 * the watch's own sensors, the Data Layer, or the persisted session — the UI
 * never displays an estimated heart rate, an invented distance or a fake
 * "connected" state.
 */
class MainActivity : Activity(), WearWorkoutHub.Listener {

    private enum class Screen { HOME, TYPES, LIVE, SENSORS, CONNECTION }

    private lateinit var container: FrameLayout
    private lateinit var sensors: WearSensors
    private val handler = Handler(Looper.getMainLooper())

    private var screen = Screen.HOME
    private var finishArmed = false
    private var armingReset: Runnable? = null

    private val accent = Color.parseColor("#E62846")
    private val accentDeep = Color.parseColor("#C81E3A")
    private val muted = Color.parseColor("#8C8C90")
    private val good = Color.parseColor("#34D399")
    private val warn = Color.parseColor("#F59E0B")

    private val ticker = object : Runnable {
        override fun run() {
            if (screen == Screen.HOME || screen == Screen.LIVE) render()
            handler.postDelayed(this, 1_000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sensors = WearSensors(this)
        container = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        setContentView(container)

        WearWorkoutHub.add(this)

        // Recovery: a session persisted by a killed process comes back PAUSED.
        // It is never silently resumed, and it is never duplicated.
        val live = WearWorkoutHub.session
        if (live != null && live.active) {
            screen = Screen.LIVE
        } else if (live == null) {
            val restored = WearSessionStore.load(this)
            if (restored != null && restored.active) {
                if (restored.state == WearWorkoutState.RUNNING) {
                    restored.pause(System.currentTimeMillis())
                }
                WearSessionStore.save(this, restored)
                WearWorkoutHub.publish(restored)
                screen = Screen.LIVE
            } else if (restored != null) {
                WearSessionStore.clear(this)
            }
        }

        requestMissingPermissions()
        WearDataLayer.refreshPhoneState(this)

        handler.post(ticker)
    }

    override fun onResume() {
        super.onResume()
        WearDataLayer.refreshPhoneState(this)
        render()
    }

    override fun onDestroy() {
        handler.removeCallbacks(ticker)
        WearWorkoutHub.remove(this)
        super.onDestroy()
    }

    override fun onSessionChanged(session: WearWorkoutSession?) {
        if (session?.state == WearWorkoutState.FINISHED) screen = Screen.LIVE
        render()
    }

    // ── Permissions ────────────────────────────────────────────────────────

    private fun requestMissingPermissions() {
        val wanted = mutableListOf<String>()
        wanted.addAll(sensors.missingPermissions())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            wanted.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        val missing = wanted.filter {
            checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) return
        requestPermissions(missing.toTypedArray(), REQUEST_CODE)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        // Permissions are the OS's answer, never cached as if they were ours.
        render()
    }

    // ── Rendering ──────────────────────────────────────────────────────────

    private fun render() {
        val view = when (screen) {
            Screen.HOME -> homeScreen()
            Screen.TYPES -> typeScreen()
            Screen.LIVE -> liveScreen()
            Screen.SENSORS -> sensorsScreen()
            Screen.CONNECTION -> connectionScreen()
        }
        container.removeAllViews()
        container.addView(
            view,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
    }

    private fun homeScreen(): View {
        val session = WearWorkoutHub.session
        val recording = session?.active == true
        val heartRate = session?.heartRate
        val now = System.currentTimeMillis()
        val bpm = if (heartRate != null && heartRate.hasSignal(now)) heartRate.current else null

        return column(
            title("SVJ"),
            statusPill(if (recording) "RECORDING" else "READY", if (recording) accent else good),
            spacer(6),
            label("Heart rate"),
            value(bpm?.toString() ?: "--", 34f),
            label(
                when {
                    bpm != null -> "SVJ Watch"
                    heartRate != null && heartRate.sampleCount > 0 -> "Signal lost"
                    !sensors.hasHeartRateSensor -> "No HR sensor"
                    !sensors.hasHeartRatePermission() -> "Permission required"
                    else -> "Waiting for signal"
                }
            ),
            spacer(8),
            label("Phone"),
            label(
                when {
                    WearDataLayer.phoneConnected -> "CONNECTED"
                    WearDataLayer.outboxSize(this) > 0 -> "OFFLINE · ${WearDataLayer.outboxSize(this)} queued"
                    else -> "NOT FOUND"
                },
                if (WearDataLayer.phoneConnected) good else muted
            ),
            spacer(10),
            if (recording) {
                primaryButton("OPEN WORKOUT") { screen = Screen.LIVE; render() }
            } else {
                primaryButton("START WORKOUT") { screen = Screen.TYPES; render() }
            },
            spacer(6),
            navRow()
        )
    }

    private fun typeScreen(): View = column(
        title("START"),
        label("Choose an activity"),
        spacer(4),
        typeButton(WearActivityType.RUN),
        typeButton(WearActivityType.WALK),
        typeButton(WearActivityType.CYCLING),
        typeButton(WearActivityType.WORKOUT),
        typeButton(WearActivityType.FOOTBALL),
        typeButton(WearActivityType.OTHER),
        spacer(4),
        secondaryButton("BACK") { screen = Screen.HOME; render() }
    )

    private fun typeButton(activity: WearActivityType): View =
        secondaryButton(activity.label.uppercase()) { countdown { beginWorkout(activity) } }

    private fun beginWorkout(activity: WearActivityType) {
        WearWorkoutService.start(this, activity)
        finishArmed = false
        screen = Screen.LIVE
        render()
    }

    private fun countdown(onDone: () -> Unit) {
        val counter = value("3", 46f)
        counter.gravity = Gravity.CENTER
        container.removeAllViews()
        container.addView(
            counter,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            ).apply { gravity = Gravity.CENTER }
        )
        val steps = listOf("3", "2", "1", "GO")
        var index = 0
        val advance = object : Runnable {
            override fun run() {
                if (index >= steps.size) {
                    onDone()
                    return
                }
                counter.text = steps[index]
                index += 1
                handler.postDelayed(this, 700L)
            }
        }
        handler.post(advance)
    }

    private fun liveScreen(): View {
        val session = WearWorkoutHub.session
        if (session == null) {
            screen = Screen.HOME
            return homeScreen()
        }
        val now = System.currentTimeMillis()

        if (session.state == WearWorkoutState.FINISHED) {
            val summary = session
            return column(
                title("FINISHED"),
                label(summary.activity.label.uppercase()),
                spacer(4),
                label("Time"),
                value(clock(summary.elapsedSeconds(now)), 26f),
                spacer(4),
                label("Heart rate"),
                value(
                    summary.heartRate.average?.let { "$it" } ?: "--",
                    26f
                ),
                label(
                    if (summary.heartRate.sampleCount > 0) {
                        "avg · max ${summary.heartRate.maximum ?: "--"} · ${summary.heartRate.sampleCount} samples"
                    } else {
                        "No heart-rate samples"
                    }
                ),
                spacer(6),
                label("Saved to SVJ"),
                label(
                    if (WearDataLayer.phoneConnected) "Sent to your phone" else "Will sync when the phone returns",
                    if (WearDataLayer.phoneConnected) good else warn
                ),
                spacer(8),
                primaryButton("DONE") {
                    WearWorkoutHub.publish(null)
                    WearWorkoutHub.publishSummary(null)
                    screen = Screen.HOME
                    render()
                }
            )
        }

        val stale = session.heartRate.sampleCount > 0 && session.heartRate.isStale(now)
        val current = if (stale) null else session.heartRate.current
        val children = mutableListOf<View>(
            statusPill(session.state.name, if (session.state == WearWorkoutState.RUNNING) accent else warn),
            value(current?.toString() ?: "--", 40f),
            label(
                when {
                    current != null -> "BPM"
                    stale -> "SIGNAL LOST"
                    !sensors.canRecordHeartRate() -> "NO HR SENSOR"
                    else -> "BPM"
                }
            ),
            spacer(6),
            value(clock(session.elapsedSeconds(now)), 24f),
            label("TIME · moving ${clock(session.movingSeconds(now))}"),
            spacer(4),
            label("${session.activity.label} · steps ${session.stepCount}"),
            spacer(8)
        )
        session.distanceMeters?.let { children.add(label("Distance ${"%.2f".format(it / 1000.0)} km")) }
        session.calories?.let { children.add(label("Calories ${it.toInt()}")) }

        if (session.state == WearWorkoutState.RUNNING) {
            children.add(secondaryButton("PAUSE") { WearWorkoutService.command(this, WearWorkoutService.ACTION_PAUSE) })
        } else {
            children.add(primaryButton("RESUME") { WearWorkoutService.command(this, WearWorkoutService.ACTION_RESUME) })
        }
        children.add(
            if (finishArmed) {
                primaryButton("TAP AGAIN TO FINISH") { armFinish(false); WearWorkoutService.command(this, WearWorkoutService.ACTION_FINISH) }
            } else {
                secondaryButton("FINISH") { armFinish(true) }
            }
        )
        children.add(secondaryButton("BACK") { screen = Screen.HOME; render() })
        return column(*children.toTypedArray())
    }

    /** Finishing needs a confirmation so a sweaty wrist cannot end a workout. */
    private fun armFinish(armed: Boolean) {
        finishArmed = armed
        armingReset?.let { handler.removeCallbacks(it) }
        if (armed) {
            val reset = Runnable {
                finishArmed = false
                render()
            }
            armingReset = reset
            handler.postDelayed(reset, 4_000L)
        }
        render()
    }

    private fun sensorsScreen(): View {
        val children = mutableListOf<View>(
            title("SENSORS"),
            spacer(2)
        )
        children.add(sensorRow("Heart rate", sensors.hasHeartRateSensor, sensors.hasHeartRatePermission()))
        children.add(sensorRow("Step counter", sensors.hasStepSensor, sensors.hasActivityPermission()))
        children.add(spacer(6))
        children.add(label("Measuring"))
        val measuring = buildList {
            if (sensors.canRecordHeartRate()) add("Heart rate")
            if (sensors.canCountSteps()) add("Steps")
        }
        children.add(label(if (measuring.isEmpty()) "Nothing available" else measuring.joinToString(" • "), good))
        children.add(spacer(6))
        children.add(
            label(
                "SVJ only records your watch sensors during a workout you start. " +
                    "SpO2, ECG and blood pressure need dedicated hardware and are not measured."
            )
        )
        children.add(spacer(6))
        if (sensors.missingPermissions().isNotEmpty()) {
            children.add(primaryButton("GRANT PERMISSIONS") {
                requestMissingPermissions()
                render()
            })
        }
        children.add(secondaryButton("BACK") { screen = Screen.HOME; render() })
        return column(*children.toTypedArray())
    }

    private fun sensorRow(name: String, present: Boolean, permitted: Boolean): View {
        val state = when {
            !present -> "NOT ON THIS WATCH"
            permitted -> "READY"
            else -> "PERMISSION REQUIRED"
        }
        val color = when {
            !present -> muted
            permitted -> good
            else -> warn
        }
        return row(label(name), label(state, color))
    }

    private fun connectionScreen(): View {
        val session = WearWorkoutHub.session
        val capabilities = buildList {
            if (sensors.canRecordHeartRate()) add("Heart rate")
            if (sensors.canCountSteps()) add("Steps")
            add("Workout")
        }
        return column(
            title("CONNECTION"),
            label("Phone"),
            label(
                if (WearDataLayer.phoneConnected) "CONNECTED · ${WearDataLayer.phoneNodeName ?: "SVJ phone"}"
                else "NOT FOUND",
                if (WearDataLayer.phoneConnected) good else muted
            ),
            spacer(4),
            label("Protocol v${WearProtocol.VERSION}"),
            label("Session ${session?.sessionId?.takeLast(8) ?: "none"}"),
            label("Queued ${WearDataLayer.outboxSize(this)}"),
            spacer(6),
            label("Capabilities"),
            label(capabilities.joinToString(" • "), good),
            spacer(6),
            label(
                "Your watch records the workout on its own. If the phone is away, everything " +
                    "is sent as soon as it is back in range."
            ),
            spacer(6),
            primaryButton("SYNC NOW") {
                WearDataLayer.refreshPhoneState(this)
                render()
            },
            secondaryButton("BACK") { screen = Screen.HOME; render() }
        )
    }

    // ── Small view helpers ─────────────────────────────────────────────────

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun spacer(heightDp: Int): View = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(heightDp)
        )
    }

    private fun column(vararg children: View): View {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(14), dp(18), dp(14), dp(18))
        }
        for (child in children) {
            layout.addView(child, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ))
        }
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(Color.BLACK)
            addView(layout)
        }
        return scroll
    }

    private fun row(vararg children: View): View {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(4), 0, dp(4))
        }
        for (child in children) {
            layout.addView(child, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
        return layout
    }

    private fun title(text: String): TextView = textView(text, 16f, Color.WHITE, bold = true).apply {
        gravity = Gravity.CENTER
    }

    private fun label(text: String, color: Int = muted): TextView = textView(text, 11f, color).apply {
        gravity = Gravity.CENTER
    }

    private fun value(text: String, sizeSp: Float): TextView =
        textView(text, sizeSp, Color.WHITE, bold = true).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(2), 0, dp(2))
        }

    private fun statusPill(text: String, color: Int): TextView =
        textView(text, 10f, color, bold = true).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(2), 0, dp(2))
        }

    private fun textView(text: String, sizeSp: Float, color: Int, bold: Boolean = false): TextView =
        TextView(this).apply {
            this.text = text
            setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
            setTextColor(color)
            typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        }

    private fun primaryButton(text: String, onClick: () -> Unit): Button =
        styledButton(text, accentDeep, Color.WHITE, onClick)

    private fun secondaryButton(text: String, onClick: () -> Unit): Button =
        styledButton(text, Color.parseColor("#1A1A1C"), Color.WHITE, onClick)

    private fun styledButton(text: String, background: Int, textColor: Int, onClick: () -> Unit): Button =
        Button(this).apply {
            this.text = text
            setTextColor(textColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            typeface = Typeface.DEFAULT_BOLD
            setBackgroundColor(background)
            val params = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(42)
            ).apply { topMargin = dp(4) }
            layoutParams = params
            setOnClickListener { onClick() }
        }

    private fun navRow(): View {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        layout.addView(
            secondaryButton("WORKOUT") { if (WearWorkoutHub.session?.active == true) screen = Screen.LIVE else screen = Screen.TYPES; render() },
            LinearLayout.LayoutParams(0, dp(42), 1f).apply { rightMargin = dp(4) }
        )
        layout.addView(
            secondaryButton("SENSORS") { screen = Screen.SENSORS; render() },
            LinearLayout.LayoutParams(0, dp(42), 1f).apply { rightMargin = dp(4) }
        )
        layout.addView(
            secondaryButton("LINK") { screen = Screen.CONNECTION; render() },
            LinearLayout.LayoutParams(0, dp(42), 1f)
        )
        return layout
    }

    private fun clock(seconds: Int): String {
        val safe = maxOf(0, seconds)
        val hours = safe / 3600
        val minutes = (safe % 3600) / 60
        val secs = safe % 60
        return if (hours > 0) {
            "%d:%02d:%02d".format(hours, minutes, secs)
        } else {
            "%02d:%02d".format(minutes, secs)
        }
    }

    companion object {
        private const val REQUEST_CODE = 4711
    }
}
