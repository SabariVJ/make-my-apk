package app.lovable.svj.wear

import android.content.Context
import java.util.UUID

/**
 * Durable watch-side session and outbox storage.
 *
 * A watch workout must survive the app being killed mid-session: the active
 * session is written on every transition, and it is restored (still paused)
 * when the app comes back. Nothing here fabricates a workout — if no session
 * was persisted, none is invented.
 *
 * The outbox holds messages that could not be delivered because the phone was
 * out of range, so a finished workout is never lost.
 */
object WearSessionStore {

    private const val PREFS = "svj_wear_session"
    private const val OUTBOX_PREFS = "svj_wear_outbox"

    private const val KEY_SESSION_ID = "sessionId"
    private const val KEY_ACTIVITY = "activity"
    private const val KEY_STATE = "state"
    private const val KEY_STARTED = "startedAtMs"
    private const val KEY_ENDED = "endedAtMs"
    private const val KEY_MOVING = "movingMs"
    private const val KEY_LAST_RESUME = "lastResumeAtMs"
    private const val KEY_STEP_BASELINE = "stepBaseline"
    private const val KEY_STEPS = "stepCount"
    private const val KEY_HR_COUNT = "hrCount"
    private const val KEY_HR_SUM = "hrSum"
    private const val KEY_HR_MAX = "hrMax"
    private const val KEY_HR_CURRENT = "hrCurrent"
    private const val KEY_HR_AT = "hrAtMs"
    private const val KEY_DISTANCE = "distanceMeters"
    private const val KEY_CALORIES = "calories"

    private const val KEY_OUTBOX = "pending"
    private const val MAX_OUTBOX = 40

    private const val ABSENT_LONG = -1L
    private const val ABSENT_FLOAT = Float.MIN_VALUE

    /** A fresh, unguessable session id. Created once per workout. */
    fun newSessionId(): String = "svj-wear-" + UUID.randomUUID().toString()

    fun newSession(activity: WearActivityType): WearWorkoutSession =
        WearWorkoutSession(newSessionId(), activity)

    fun load(context: Context): WearWorkoutSession? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val sessionId = prefs.getString(KEY_SESSION_ID, null) ?: return null
        val activity = WearActivityType.fromName(prefs.getString(KEY_ACTIVITY, null)) ?: return null
        val state = runCatching {
            WearWorkoutState.valueOf(prefs.getString(KEY_STATE, WearWorkoutState.IDLE.name)!!)
        }.getOrDefault(WearWorkoutState.IDLE)

        val session = WearWorkoutSession(
            sessionId = sessionId,
            activity = activity,
            state = state,
            startedAtMs = prefs.optionalLong(KEY_STARTED),
            endedAtMs = prefs.optionalLong(KEY_ENDED),
            stepBaseline = prefs.optionalFloat(KEY_STEP_BASELINE),
            distanceMeters = prefs.optionalDouble(KEY_DISTANCE),
            calories = prefs.optionalDouble(KEY_CALORIES)
        )
        session.restoreTiming(
            prefs.getLong(KEY_MOVING, 0L),
            prefs.optionalLong(KEY_LAST_RESUME)
        )
        session.heartRate.restore(
            prefs.getInt(KEY_HR_COUNT, 0),
            prefs.getLong(KEY_HR_SUM, 0L),
            prefs.optionalInt(KEY_HR_MAX),
            prefs.optionalInt(KEY_HR_CURRENT),
            prefs.getLong(KEY_HR_AT, 0L)
        )
        // Only rebase the step counter when a baseline was actually captured:
        // otherwise the workout had no step source at all and must stay at 0
        // instead of inventing a baseline of zero.
        prefs.optionalFloat(KEY_STEP_BASELINE)?.let { baseline ->
            session.onStepTotal(baseline + prefs.getInt(KEY_STEPS, 0).toFloat())
        }
        return session
    }

    fun save(context: Context, session: WearWorkoutSession) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_SESSION_ID, session.sessionId)
            .putString(KEY_ACTIVITY, session.activity.name)
            .putString(KEY_STATE, session.state.name)
            .putLong(KEY_STARTED, session.startedAtMs ?: ABSENT_LONG)
            .putLong(KEY_ENDED, session.endedAtMs ?: ABSENT_LONG)
            .putLong(KEY_MOVING, session.movingMsForPersistence())
            .putLong(KEY_LAST_RESUME, session.lastResumeForPersistence() ?: ABSENT_LONG)
            .putFloat(KEY_STEP_BASELINE, session.stepBaseline ?: ABSENT_FLOAT)
            .putInt(KEY_STEPS, session.stepCount)
            .putInt(KEY_HR_COUNT, session.heartRate.sampleCount)
            .putLong(KEY_HR_SUM, session.heartRate.totalForPersistence())
            .putInt(KEY_HR_MAX, session.heartRate.maximum ?: -1)
            .putInt(KEY_HR_CURRENT, session.heartRate.current ?: -1)
            .putLong(KEY_HR_AT, session.heartRate.lastSampleAtMs)
            .putFloat(KEY_DISTANCE, session.distanceMeters?.toFloat() ?: ABSENT_FLOAT)
            .putFloat(KEY_CALORIES, session.calories?.toFloat() ?: ABSENT_FLOAT)
            .apply()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }

    // ── Outbox ─────────────────────────────────────────────────────────────

    /** Queue a message that could not reach the phone. */
    fun enqueue(context: Context, path: String, payload: String) {
        val prefs = context.getSharedPreferences(OUTBOX_PREFS, Context.MODE_PRIVATE)
        val existing = prefs.getStringSet(KEY_OUTBOX, emptySet()) ?: emptySet()
        val entry = path + "\u0000" + payload
        val next = LinkedHashSet(existing)
        next.add(entry)
        val trimmed = if (next.size <= MAX_OUTBOX) next else next.toList().takeLast(MAX_OUTBOX).toSet()
        prefs.edit().putStringSet(KEY_OUTBOX, trimmed).apply()
    }

    /** Every queued message, plus a callback to remove the ones that landed. */
    fun pending(context: Context): List<Pair<String, String>> =
        (context.getSharedPreferences(OUTBOX_PREFS, Context.MODE_PRIVATE)
            .getStringSet(KEY_OUTBOX, emptySet()) ?: emptySet())
            .mapNotNull { entry ->
                val separator = entry.indexOf('\u0000')
                if (separator <= 0) null else entry.substring(0, separator) to entry.substring(separator + 1)
            }

    fun remove(context: Context, path: String, payload: String) {
        val prefs = context.getSharedPreferences(OUTBOX_PREFS, Context.MODE_PRIVATE)
        val existing = prefs.getStringSet(KEY_OUTBOX, emptySet()) ?: emptySet()
        val next = existing.toMutableSet()
        next.remove(path + "\u0000" + payload)
        prefs.edit().putStringSet(KEY_OUTBOX, next).apply()
    }

    fun outboxSize(context: Context): Int = pending(context).size

    private fun android.content.SharedPreferences.optionalLong(key: String): Long? =
        getLong(key, ABSENT_LONG).takeIf { it != ABSENT_LONG }

    private fun android.content.SharedPreferences.optionalInt(key: String): Int? =
        getInt(key, -1).takeIf { it >= 0 }

    private fun android.content.SharedPreferences.optionalFloat(key: String): Float? =
        getFloat(key, ABSENT_FLOAT).takeIf { it != ABSENT_FLOAT }

    private fun android.content.SharedPreferences.optionalDouble(key: String): Double? =
        optionalFloat(key)?.toDouble()
}
