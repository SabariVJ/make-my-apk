package app.lovable.svj.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression coverage for the SVJ watch workout logic.
 *
 * Everything here runs on the JVM with no watch, no Data Layer and no health
 * hardware: the session state machine, heart-rate acceptance, step deltas and
 * the exact payloads the phone receives.
 */
class WearWorkoutSessionTest {

    private fun started(activity: WearActivityType = WearActivityType.RUN, atMs: Long = 1_000_000L): WearWorkoutSession {
        val session = WearWorkoutSession("svj-wear-test-session", activity)
        assertTrue(session.start(atMs))
        return session
    }

    @Test
    fun `a session is idle until it is explicitly started`() {
        val session = WearWorkoutSession("svj-wear-test-session", WearActivityType.RUN)
        assertEquals(WearWorkoutState.IDLE, session.state)
        assertFalse(session.active)
        assertNull(session.startedAtMs)
        assertEquals(0, session.elapsedSeconds(5_000L))
    }

    @Test
    fun `session id is stable for the life of the workout`() {
        val session = started()
        val id = session.sessionId
        session.pause(1_010_000L)
        session.resume(1_020_000L)
        session.finish(1_030_000L)
        assertEquals(id, session.sessionId)
        assertTrue(id.startsWith("svj-wear-"))
    }

    @Test
    fun `paused time is never counted as moving time`() {
        val session = started(atMs = 0L)
        // 60 s running.
        assertEquals(60, session.movingSeconds(60_000L))
        session.pause(60_000L)
        // 10 minutes paused.
        assertEquals(60, session.movingSeconds(660_000L))
        session.resume(660_000L)
        // 30 s running.
        assertEquals(90, session.movingSeconds(690_000L))
        assertEquals(690, session.elapsedSeconds(690_000L))
    }

    @Test
    fun `illegal transitions are refused`() {
        val idle = WearWorkoutSession("svj-wear-test-session", WearActivityType.WALK)
        assertFalse(idle.pause(1L))
        assertFalse(idle.resume(1L))
        assertFalse(idle.finish(1L))

        val running = started()
        assertFalse(running.start(2_000_000L))
        assertTrue(running.pause(2_000_000L))
        assertFalse(running.pause(2_000_000L))
        assertTrue(running.resume(2_000_000L))
        assertTrue(running.finish(2_000_000L))
        assertFalse(running.finish(2_000_000L))
        assertFalse(running.resume(2_000_000L))
        assertEquals(WearWorkoutState.FINISHED, running.state)
    }

    @Test
    fun `heart rate accepts real values and rejects impossible ones`() {
        val session = started()
        assertTrue(session.onHeartRate(148, 1_001_000L))
        assertTrue(session.onHeartRate(152, 1_002_000L))
        assertTrue(session.onHeartRate(250, 1_003_000L))
        assertFalse(session.onHeartRate(0, 1_004_000L))
        assertFalse(session.onHeartRate(-10, 1_004_000L))
        assertFalse(session.onHeartRate(251, 1_004_000L))
        assertFalse(session.onHeartRate(9000, 1_004_000L))

        assertEquals(3, session.heartRate.sampleCount)
        assertEquals(250, session.heartRate.maximum)
        assertEquals(250, session.heartRate.current)
        assertEquals(183, session.heartRate.average)
    }

    @Test
    fun `heart rate with no samples reports nothing`() {
        val stats = WearHeartRate()
        assertNull(stats.current)
        assertNull(stats.average)
        assertNull(stats.maximum)
        assertEquals(0, stats.sampleCount)
        assertFalse(stats.hasSignal(10_000L))
    }

    @Test
    fun `a silent sensor goes stale instead of showing a frozen value`() {
        val stats = WearHeartRate()
        assertTrue(stats.add(140, 1_000L))
        assertTrue(stats.hasSignal(5_000L))
        assertTrue(stats.isStale(1_000L + WearHeartRate.DEFAULT_STALE_MS + 1))
        assertFalse(stats.hasSignal(1_000L + WearHeartRate.DEFAULT_STALE_MS + 1))
    }

    @Test
    fun `steps are measured from the workout baseline, not since boot`() {
        val session = started()
        // The hardware counter already reads 12,000 steps since boot.
        session.onStepTotal(12_000f)
        assertEquals(0, session.stepCount)
        session.onStepTotal(12_340f)
        assertEquals(340, session.stepCount)
        // A counter reset (reboot) must not produce negative steps.
        session.onStepTotal(10f)
        assertEquals(0, session.stepCount)
    }

    @Test
    fun `summary is only produced for a finished workout`() {
        val session = started(atMs = 0L)
        assertNull(session.toSummaryJson())
        session.onStepTotal(500f)
        session.onStepTotal(3_700f)
        session.onHeartRate(140, 10_000L)
        session.onHeartRate(180, 20_000L)
        session.finish(1_800_000L)

        val summary = session.toSummaryJson()
        assertNotNull(summary)
        val json = summary!!
        assertTrue(json.contains("\"sessionId\":\"svj-wear-test-session\""))
        assertTrue(json.contains("\"activityType\":\"running\""))
        assertTrue(json.contains("\"startedAtMs\":0"))
        assertTrue(json.contains("\"endedAtMs\":1800000"))
        assertTrue(json.contains("\"durationSeconds\":1800"))
        assertTrue(json.contains("\"movingSeconds\":1800"))
        assertTrue(json.contains("\"stepCount\":3200"))
        assertTrue(json.contains("\"avgHeartRate\":160"))
        assertTrue(json.contains("\"maxHeartRate\":180"))
        assertTrue(json.contains("\"heartRateSampleCount\":2"))
        assertTrue(json.contains("\"source\":\"wear_os\""))
        // No distance or calorie source exists on the watch, so neither is invented.
        assertFalse(json.contains("distanceMeters"))
        assertFalse(json.contains("caloriesEstimate"))
    }

    @Test
    fun `summary includes distance and calories only when they were really measured`() {
        val session = started()
        session.distanceMeters = 5_432.5
        session.calories = 321.0
        session.finish(1_800_000L)
        val json = session.toSummaryJson()!!
        assertTrue(json.contains("\"distanceMeters\":5432.5"))
        assertTrue(json.contains("\"caloriesEstimate\":321"))
    }

    @Test
    fun `capabilities are only advertised for sensors that exist`() {
        val session = WearWorkoutSession("svj-wear-test-session", WearActivityType.CYCLING)
        val full = session.capabilitiesJson(hasHeartRate = true, hasSteps = true)
        assertTrue(full.contains("\"heart_rate\":true"))
        assertTrue(full.contains("\"steps\":true"))
        assertTrue(full.contains("\"workout\":true"))
        assertFalse(full.contains("\"distance\":true"))
        assertFalse(full.contains("\"calories\":true"))

        val minimal = session.capabilitiesJson(hasHeartRate = false, hasSteps = false)
        assertTrue(minimal.contains("\"heart_rate\":false"))
        assertTrue(minimal.contains("\"steps\":false"))
        assertTrue(minimal.contains("\"workout\":true"))
    }

    @Test
    fun `handshake and state payloads carry the contract version and state`() {
        val session = started(activity = WearActivityType.FOOTBALL, atMs = 0L)
        session.onStepTotal(100f)
        session.onStepTotal(500f)
        val handshake = session.toHandshakeJson(hasHeartRate = true, hasSteps = true)
        assertTrue(handshake.contains("\"protocol\":${WearProtocol.VERSION}"))
        assertTrue(handshake.contains("\"sessionId\":\"svj-wear-test-session\""))

        val state = session.toStateJson(90_000L)
        assertTrue(state.contains("\"state\":\"running\""))
        assertTrue(state.contains("\"activityType\":\"football\""))
        assertTrue(state.contains("\"elapsedSeconds\":90"))
        assertTrue(state.contains("\"stepCount\":400"))

        session.pause(90_000L)
        assertTrue(session.toStateJson(90_000L).contains("\"state\":\"paused\""))
        session.finish(120_000L)
        assertTrue(session.toStateJson(120_000L).contains("\"state\":\"finished\""))
    }

    @Test
    fun `sample payloads describe one real measurement`() {
        val session = started()
        val json = session.toHeartRateSampleJson(151, 4_242L)
        assertTrue(json.contains("\"type\":\"heart_rate\""))
        assertTrue(json.contains("\"value\":151"))
        assertTrue(json.contains("\"timestamp\":4242"))
        assertTrue(json.contains("\"sessionId\":\"svj-wear-test-session\""))

        val steps = session.toStepsSampleJson(5_000L)
        assertTrue(steps.contains("\"type\":\"steps\""))
        assertTrue(steps.contains("\"timestamp\":5000"))
    }

    @Test
    fun `json escaping keeps payloads valid`() {
        assertEquals("a\\\"b", WearJson.escape("a\"b"))
        assertEquals("line\\nbreak", WearJson.escape("line\nbreak"))
        val json = WearJson.obj(
            "name" to "SVJ \"Watch\"",
            "value" to 12,
            "nested" to RawJson(WearJson.obj("a" to true)),
            "missing" to null
        )
        assertEquals("{\"name\":\"SVJ \\\"Watch\\\"\",\"value\":12,\"nested\":{\"a\":true},\"missing\":null}", json)
    }

    @Test
    fun `activity types map onto canonical SVJ server types`() {
        assertEquals("running", WearActivityType.RUN.serverType)
        assertEquals("walking", WearActivityType.WALK.serverType)
        assertEquals("cycling", WearActivityType.CYCLING.serverType)
        assertEquals("football", WearActivityType.FOOTBALL.serverType)
        assertEquals("other", WearActivityType.OTHER.serverType)
        assertEquals(WearActivityType.CYCLING, WearActivityType.fromServerType("cycling"))
        assertEquals(WearActivityType.RUN, WearActivityType.fromName("RUN"))
        assertNull(WearActivityType.fromServerType("swimming"))
    }

    @Test
    fun `restored timing keeps totals and never resumes on its own`() {
        val session = WearWorkoutSession(
            "svj-wear-test-session",
            WearActivityType.WALK,
            state = WearWorkoutState.RUNNING,
            startedAtMs = 0L
        )
        session.restoreTiming(60_000L, null)
        // A restored session reports its accumulated moving time and is not
        // silently counting time it did not measure.
        assertEquals(60, session.movingSeconds(600_000L))
    }
}
