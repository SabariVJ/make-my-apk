package app.lovable.svj.wear

import kotlin.math.roundToInt

/**
 * Live heart-rate statistics built only from real sensor samples.
 *
 * Impossible values are rejected instead of averaged in, no value is ever
 * interpolated between samples, and a silent sensor becomes stale rather than
 * leaving an old BPM on screen as if it were current.
 */
class WearHeartRate {

    var current: Int? = null
        private set

    var maximum: Int? = null
        private set

    var sampleCount: Int = 0
        private set

    var lastSampleAtMs: Long = 0L
        private set

    private var total: Long = 0L

    val average: Int?
        get() = if (sampleCount == 0) null else (total.toDouble() / sampleCount).roundToInt()

    /** @return true when the sample was accepted. */
    fun add(bpm: Int, atMs: Long): Boolean {
        if (!isPlausible(bpm)) return false
        current = bpm
        maximum = maxOf(maximum ?: 0, bpm)
        total += bpm.toLong()
        sampleCount += 1
        lastSampleAtMs = atMs
        return true
    }

    /** A sensor that has gone quiet — the UI must show "signal lost". */
    fun isStale(nowMs: Long, staleMs: Long = DEFAULT_STALE_MS): Boolean =
        sampleCount > 0 && nowMs - lastSampleAtMs > staleMs

    fun hasSignal(nowMs: Long): Boolean = sampleCount > 0 && !isStale(nowMs)

    /** Restore statistics after a process restart (same session, no new data). */
    fun restore(count: Int, sum: Long, max: Int?, current: Int?, lastAtMs: Long) {
        sampleCount = maxOf(0, count)
        total = maxOf(0L, sum)
        maximum = max
        this.current = current
        lastSampleAtMs = lastAtMs
    }

    fun totalForPersistence(): Long = total

    companion object {
        /** Physiological bounds; anything outside is a sensor fault. */
        const val MIN_BPM = 20
        const val MAX_BPM = 250

        /** Roughly ten missed beats at rest before we call the signal lost. */
        const val DEFAULT_STALE_MS = 12_000L

        fun isPlausible(bpm: Int): Boolean = bpm in MIN_BPM..MAX_BPM
    }
}
