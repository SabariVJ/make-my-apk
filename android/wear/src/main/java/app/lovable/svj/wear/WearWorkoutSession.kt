package app.lovable.svj.wear

import kotlin.math.roundToInt

/** Lifecycle of a watch workout. */
enum class WearWorkoutState {
    IDLE,
    RUNNING,
    PAUSED,
    FINISHED
}

/**
 * Activity choices on the watch, mapped onto the canonical SVJ server types so
 * a watch workout lands in the existing activity pipeline without inventing a
 * new category.
 */
enum class WearActivityType(val label: String, val serverType: String) {
    RUN("Run", "running"),
    WALK("Walk", "walking"),
    CYCLING("Cycling", "cycling"),
    WORKOUT("Workout", "other"),
    FOOTBALL("Football", "football"),
    OTHER("Other", "other");

    companion object {
        fun fromName(value: String?): WearActivityType? = entries.firstOrNull { it.name == value }

        fun fromServerType(value: String?): WearActivityType? =
            entries.firstOrNull { it.serverType == value }
    }
}

/**
 * One watch workout session.
 *
 * Pure logic (no Android dependencies) so the whole state machine, the heart
 * rate statistics and the summary payload can be unit tested on the JVM:
 *
 *  * a session is created only when the user starts one — opening a screen
 *    never creates an activity;
 *  * a session id is generated once and never changes, which is what makes a
 *    repeated completion idempotent on the phone and server;
 *  * paused time is never counted as moving time;
 *  * a metric the hardware cannot measure stays absent rather than estimated.
 */
class WearWorkoutSession(
    val sessionId: String,
    val activity: WearActivityType,
    var state: WearWorkoutState = WearWorkoutState.IDLE,
    var startedAtMs: Long? = null,
    var endedAtMs: Long? = null,
    var stepBaseline: Float? = null,
    /** Only ever set from a real platform measurement. */
    var distanceMeters: Double? = null,
    var calories: Double? = null
) {

    val heartRate = WearHeartRate()

    private var movingMs: Long = 0L
    private var lastResumeAtMs: Long? = null
    private var countedSteps: Int = 0

    val stepCount: Int get() = countedSteps

    val active: Boolean
        get() = state == WearWorkoutState.RUNNING || state == WearWorkoutState.PAUSED

    fun elapsedSeconds(nowMs: Long): Int {
        val started = startedAtMs ?: return 0
        val until = if (state == WearWorkoutState.FINISHED) (endedAtMs ?: nowMs) else nowMs
        return maxOf(0, ((until - started) / 1000L).toInt())
    }

    /** Running time only: paused time is excluded. */
    fun movingSeconds(nowMs: Long): Int {
        var total = movingMs
        if (state == WearWorkoutState.RUNNING) {
            val since = lastResumeAtMs
            if (since != null) total += maxOf(0L, nowMs - since)
        }
        return maxOf(0, (total / 1000L).toInt())
    }

    fun start(nowMs: Long): Boolean {
        if (state != WearWorkoutState.IDLE) return false
        state = WearWorkoutState.RUNNING
        startedAtMs = nowMs
        lastResumeAtMs = nowMs
        return true
    }

    fun pause(nowMs: Long): Boolean {
        if (state != WearWorkoutState.RUNNING) return false
        lastResumeAtMs?.let { movingMs += maxOf(0L, nowMs - it) }
        lastResumeAtMs = null
        state = WearWorkoutState.PAUSED
        return true
    }

    fun resume(nowMs: Long): Boolean {
        if (state != WearWorkoutState.PAUSED) return false
        lastResumeAtMs = nowMs
        state = WearWorkoutState.RUNNING
        return true
    }

    fun finish(nowMs: Long): Boolean {
        if (state == WearWorkoutState.IDLE || state == WearWorkoutState.FINISHED) return false
        if (state == WearWorkoutState.RUNNING) {
            lastResumeAtMs?.let { movingMs += maxOf(0L, nowMs - it) }
        }
        lastResumeAtMs = null
        endedAtMs = nowMs
        state = WearWorkoutState.FINISHED
        return true
    }

    /** @return true when the reading was plausible and recorded. */
    fun onHeartRate(bpm: Int, atMs: Long): Boolean = heartRate.add(bpm, atMs)

    /**
     * Fold in the watch's cumulative step counter (steps since boot) by
     * baselining it at the first reading, so only steps taken during this
     * workout are counted.
     */
    fun onStepTotal(totalSinceBoot: Float) {
        val baseline = stepBaseline
        if (baseline == null) {
            stepBaseline = totalSinceBoot
            countedSteps = 0
            return
        }
        countedSteps = maxOf(0, (totalSinceBoot - baseline).roundToInt())
    }

    fun movingMsForPersistence(): Long = movingMs

    fun restoreTiming(movingMillis: Long, lastResume: Long?) {
        movingMs = maxOf(0L, movingMillis)
        lastResumeAtMs = lastResume
    }

    fun lastResumeForPersistence(): Long? = lastResumeAtMs

    // ── Wire payloads ──────────────────────────────────────────────────────

    fun capabilitiesJson(hasHeartRate: Boolean, hasSteps: Boolean): String {
        val capabilities = listOf(
            "heart_rate" to hasHeartRate,
            "steps" to hasSteps,
            // The watch app itself can always run a workout; distance and
            // calories are only advertised when the hardware measures them,
            // which today it does not.
            "workout" to true,
            "distance" to (distanceMeters != null),
            "calories" to (calories != null)
        )
        return WearJson.obj(*capabilities.toTypedArray())
    }

    fun toHandshakeJson(hasHeartRate: Boolean, hasSteps: Boolean): String = WearJson.obj(
        "protocol" to WearProtocol.VERSION,
        "capabilities" to RawJson(capabilitiesJson(hasHeartRate, hasSteps)),
        "sessionId" to sessionId,
        "activityType" to activity.serverType,
        "state" to state.name.lowercase()
    )

    fun toStateJson(nowMs: Long): String = WearJson.obj(
        "sessionId" to sessionId,
        "state" to state.name.lowercase(),
        "activityType" to activity.serverType,
        "elapsedSeconds" to elapsedSeconds(nowMs),
        "stepCount" to countedSteps,
        "heartRate" to heartRate.current
    )

    fun toHeartRateSampleJson(bpm: Int, atMs: Long): String = WearJson.obj(
        "type" to WearProtocol.TYPE_HEART_RATE,
        "value" to bpm,
        "timestamp" to atMs,
        "sessionId" to sessionId,
        "deviceName" to "SVJ Watch"
    )

    fun toStepsSampleJson(nowMs: Long): String = WearJson.obj(
        "type" to WearProtocol.TYPE_STEPS,
        "value" to countedSteps,
        "timestamp" to nowMs,
        "sessionId" to sessionId,
        "deviceName" to "SVJ Watch"
    )

    /**
     * The canonical completion summary. Only genuinely measured values are
     * included: a watch without a distance source sends no distance field at
     * all, so the server can never receive an invented number.
     */
    fun toSummaryJson(): String? {
        if (state != WearWorkoutState.FINISHED) return null
        val started = startedAtMs ?: return null
        val ended = endedAtMs ?: return null
        val pairs = mutableListOf<Pair<String, Any?>>(
            "sessionId" to sessionId,
            "activityType" to activity.serverType,
            "startedAtMs" to started,
            "endedAtMs" to ended,
            "durationSeconds" to maxOf(0, ((ended - started) / 1000L).toInt()),
            "movingSeconds" to movingSeconds(ended),
            "stepCount" to countedSteps,
            "avgHeartRate" to heartRate.average,
            "maxHeartRate" to heartRate.maximum,
            "heartRateSampleCount" to heartRate.sampleCount,
            "source" to "wear_os"
        )
        distanceMeters?.let { pairs.add("distanceMeters" to it) }
        calories?.let { pairs.add("caloriesEstimate" to it) }
        return WearJson.obj(*pairs.toTypedArray())
    }
}
