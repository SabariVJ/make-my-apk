package app.lovable.svj;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import app.lovable.svj.AccelStepDetector.StepDetectState;
import org.junit.Before;
import org.junit.Test;

/** Unit tests for the accelerometer fallback step detector.
 *
 *  The first seven tests are unchanged from the version that ships with the
 *  plugin (they are the expectations the Accelerometer fallback has to meet).
 *  The remaining tests were added to cover the waveform classes that exposed the
 *  earlier defects: violent motion while the gravity estimate is adapting,
 *  sustained wobble, isolated spikes, plausible walking cadences and a complete
 *  adaptive-state reset.
 *
 *  Run with: ./gradlew :app:testDebugUnitTest
 */
public class AccelStepDetectorTest {

    private static final long SAMPLE_MS = 20L;

    private AccelStepDetector detector;

    @Before
    public void setUp() {
        detector = new AccelStepDetector();
    }

    /** Stationary tablet: gravity only, plus sensor jitter. */
    @Test
    public void stationaryNoiseNeverCountsAStep() {
        int steps = 0;
        for (int i = 0; i < 500; i += 1) {
            float jitter = (float) Math.sin(i * 0.7) * 0.08f;
            if (detector.onSample(0.05f, 0.05f, 9.81f + jitter, i * SAMPLE_MS)) {
                steps += 1;
            }
        }
        assertEquals(0, steps);
    }

    /** Walking waveform: a positive vertical oscillation around gravity. */
    @Test
    public void walkingWaveformCountsEachStepOnce() {
        int steps = 0;
        int samples = 200; // 4 seconds at 20 ms
        for (int i = 0; i < samples; i += 1) {
            long t = i * SAMPLE_MS;
            double phase = (2 * Math.PI * t) / 600.0; // ~1.67 steps/second
            float z = (float) (9.81 + 2.4 * Math.sin(phase));
            if (detector.onSample(0.1f, 0.1f, z, t)) {
                steps += 1;
            }
        }
        // ~6.6 walking cycles in 4 s; allow a small window around it.
        assertTrue("expected a plausible walking count, got " + steps, steps >= 4 && steps <= 8);
    }

    /** Two peaks only 100 ms apart are one step, not two. */
    @Test
    public void debounceRejectsASecondPeakInsideTheMinimumInterval() {
        assertTrue(detector.onSample(0f, 0f, 12.5f, 500L));
        assertFalse(detector.onSample(0f, 0f, 9.81f, 560L));
        assertFalse(detector.onSample(0f, 0f, 12.5f, 600L));
        // Past the minimum interval and re-armed, the next peak counts.
        assertFalse(detector.onSample(0f, 0f, 9.81f, 800L));
        assertTrue(detector.onSample(0f, 0f, 12.5f, 1000L));
    }

    /** Violent shaking (a dropped or wobbled tablet) is not walking. */
    @Test
    public void aggressiveShakingIsRejectedAsNoise() {
        int steps = 0;
        for (int i = 0; i < 200; i += 1) {
            long t = i * SAMPLE_MS;
            float z = (i % 2 == 0) ? 45f : -20f;
            if (detector.onSample(z, 30f, z, t)) {
                steps += 1;
            }
        }
        assertEquals(0, steps);
    }

    /** Zero, NaN and infinite samples never advance the count. */
    @Test
    public void invalidSensorDataIsIgnored() {
        assertFalse(detector.onSample(0f, 0f, 0f, 0L));
        assertTrue(detector.lastSampleInvalid());
        assertFalse(detector.onSample(Float.NaN, 0f, 9.81f, SAMPLE_MS));
        assertFalse(detector.onSample(Float.POSITIVE_INFINITY, 0f, 9.81f, 2 * SAMPLE_MS));
        assertFalse(detector.onSample(0f, 0f, -9.81f, 3 * SAMPLE_MS));
    }

    /** Multiple separated steps each count exactly once. */
    @Test
    public void separatedPeaksCountAsSeparateSteps() {
        int steps = 0;
        long t = 0;
        for (int step = 0; step < 3; step += 1) {
            // rise
            if (detector.onSample(0f, 0f, 12.6f, t)) steps += 1;
            t += 200;
            // fall back below the re-arm threshold
            detector.onSample(0f, 0f, 9.81f, t);
            t += 200;
        }
        assertEquals(3, steps);
    }

    /** Reset clears the adaptive state and the debounce window. */
    @Test
    public void resetClearsAdaptiveState() {
        assertTrue(detector.onSample(0f, 0f, 12.5f, 500L));
        detector.reset();
        assertEquals(AccelStepDetector.GRAVITY, detector.highThreshold() > 0 ? detector.highThreshold() : 1f, 100f);
        assertTrue(detector.onSample(0f, 0f, 12.5f, 600L));
    }

    // ------------------------------------------------------------------
    // Added coverage
    // ------------------------------------------------------------------

    /** Feed the quiet settling samples every real sensor stream starts with.
     *  Used only by the tests below, which check steady-state behaviour; the
     *  shipped tests above deliberately exercise the cold-start path. */
    private long settle() {
        int samples = AccelStepDetector.WARMUP_SAMPLES + 5;
        for (int i = 0; i < samples; i++) {
            if (detector.onSample(0f, 0f, 9.81f, i * SAMPLE_MS)) {
                fail("quiet settling samples must never be steps");
            }
        }
        return samples * SAMPLE_MS;
    }

    /** Slow walking with a smaller dynamic amplitude still registers. */
    @Test
    public void slowWalkingStillCounts() {
        int steps = 0;
        for (int i = 0; i < 200; i += 1) {
            long t = i * SAMPLE_MS;
            double phase = (2 * Math.PI * t) / 900.0; // ~1.1 steps/second, slow
            float z = (float) (9.81 + 1.4 * Math.sin(phase));
            if (detector.onSample(0.05f, 0.05f, z, t)) {
                steps += 1;
            }
        }
        assertTrue("slow walking should still count steps, got " + steps,
            steps >= 2 && steps <= 5);
    }

    /** Faster walking cadence within the plausible human band. */
    @Test
    public void fasterWalkingCounts() {
        int steps = 0;
        for (int i = 0; i < 200; i += 1) {
            long t = i * SAMPLE_MS;
            double phase = (2 * Math.PI * t) / 420.0; // ~2.4 steps/second, brisk
            float z = (float) (9.81 + 2.6 * Math.sin(phase));
            if (detector.onSample(0.1f, 0.1f, z, t)) {
                steps += 1;
            }
        }
        assertTrue("brisk walking should count steps, got " + steps,
            steps >= 6 && steps <= 11);
    }

    /** Variable-amplitude walking still counts steps. */
    @Test
    public void variableAmplitudeWalkingStillCounts() {
        int steps = 0;
        for (int i = 0; i < 300; i += 1) {
            long t = i * SAMPLE_MS;
            double phase = (2 * Math.PI * t) / 600.0;
            float amp = (float) (1.6 + 1.0 * Math.abs(Math.sin((double) i / 40.0)));
            float z = (float) (9.81 + amp * Math.sin(phase));
            if (detector.onSample(0.1f, 0.1f, z, t)) {
                steps += 1;
            }
        }
        assertTrue("variable walking should count steps, got " + steps,
            steps >= 5 && steps <= 12);
    }

    /** A single isolated spike is never a step, however large it is. */
    @Test
    public void isolatedSpikeIsNotAWalkStep() {
        for (int i = 0; i < 20; i++) {
            assertFalse("should be quiet before the spike",
                detector.onSample(0f, 0f, 9.81f, i * SAMPLE_MS));
        }
        assertFalse("isolated spike must not become a step",
            detector.onSample(0f, 0f, 40f, 400L));
        for (int i = 0; i < 40; i++) {
            assertFalse("should be quiet after the spike",
                detector.onSample(0f, 0f, 9.81f, 420 + i * SAMPLE_MS));
        }
        assertEquals(0, detector.snapshot().acceptedStepCount);
    }

    /** High-frequency shaking at plausible magnitudes is rejected. */
    @Test
    public void highFrequencyShakingIsRejected() {
        int rejections = 0;
        for (int i = 0; i < 400; i += 1) {
            long t = i * SAMPLE_MS;
            float sign = (i % 2 == 0) ? 1f : -1f;
            float z = 9.81f + sign * 12f;
            if (detector.onSample(0f, 0f, z, t)) {
                fail("high-frequency shaking produced a step at sample " + i);
            }
            if (detector.rejectSnapshot().isReject) {
                rejections += 1;
            }
        }
        assertTrue("high-frequency shaking should be rejected (got " + rejections
            + " rejections)", rejections > 0);
        assertEquals(0, detector.snapshot().acceptedStepCount);
    }

    /** A sustained violent vibration at a frequency nobody walks at must never
     *  become a step.  This is the waveform class that defeated the old single
     *  absolute cap on |magnitude - gravity|: the sample level guard was measured
     *  against the ADAPTIVE gravity estimate, which drifts during the motion. */
    @Test
    public void sustainedViolentVibrationIsRejected() {
        int shakeRejections = 0;
        for (int i = 0; i < 600; i++) {
            long t = i * SAMPLE_MS;
            double phase = (2 * Math.PI * t) / 160.0; // ~6 Hz vibration
            float x = (float) (25.0 * Math.sin(phase)); // tablet shaken sideways
            if (detector.onSample(x, 0f, 9.81f, t)) {
                fail("sustained vibration produced a step at sample " + i);
            }
            if (isShakeReason(detector.rejectSnapshot().reason)) {
                shakeRejections += 1;
            }
        }
        assertEquals("sustained vibration must produce 0 steps", 0,
            detector.snapshot().acceptedStepCount);
        assertTrue("the whole vibration must be refused by the shake guards",
            shakeRejections > 500);
        assertTrue("the sustained slope estimate must exceed its ceiling",
            detector.sustainedJerk() > AccelStepDetector.SUSTAINED_JERK_CEILING);
    }

    /** A moderate vibration that starts from rest can slip a step before the
     *  detector has any history to measure a rate of change from - the same
     *  property that lets the shipped tests accept a step on the very first
     *  sample.  What must NOT happen is the count tracking the vibration: at 6 Hz
     *  a lobe-per-step detector would report ~70 steps over these 12 seconds.
     *  The rate guard has to collapse the count to (at most) a step or two and
     *  keep the rest of the motion rejected. */
    @Test
    public void moderateVibrationCannotDriveTheStepCount() {
        int vertical = 0;
        for (int i = 0; i < 600; i++) {
            long t = i * SAMPLE_MS;
            double phase = (2 * Math.PI * t) / 160.0; // ~6 Hz vibration
            float z = (float) (9.81 + 6.5 * Math.sin(phase));
            if (detector.onSample(0f, 0f, z, t)) vertical += 1;
        }
        assertTrue("a 6 Hz vertical vibration must not drive the step count, got "
            + vertical, vertical <= 2);

        // A SIDEWAYS shake is the harder case: the magnitude is then a rectified
        // signal that crosses the step threshold at TWICE the shake frequency, and
        // every individual sample passes the amplitude and slope guards (the total
        // magnitude never leaves 9.81-11.8).  Only the cadence guard can refuse it.
        AccelStepDetector sideways = new AccelStepDetector();
        int horizontal = 0;
        for (int i = 0; i < 600; i++) {
            long t = i * SAMPLE_MS;
            float x = (float) (6.5 * Math.sin((2 * Math.PI * t) / 160.0));
            if (sideways.onSample(x, 0f, 9.81f, t)) horizontal += 1;
        }
        assertTrue("a 6 Hz sideways shake must not drive the step count, got "
            + horizontal, horizontal <= 2);
    }

    /** Violent alternating motion while the gravity estimate is adapting.
     *
     *  The gravity EMA drifts toward the mean of the motion, so the samples end up
     *  BELOW the adaptive |magnitude - gravity| cap (gravity converges on the
     *  motion mean instead of 9.81).  The guards measured against the CONSTANT
     *  nominal gravity and against the rate of change must therefore do the work. */
    @Test
    public void violentAlternatingMotionIsRejectedWhileGravityAdapts() {
        int shakeRejections = 0;
        for (int i = 0; i < 600; i++) {
            float z = (i % 4 < 2) ? 22f : -6f;
            if (detector.onSample(0f, 0f, z, i * SAMPLE_MS)) {
                fail("violent alternating motion produced a step at sample " + i);
            }
            if (isShakeReason(detector.rejectSnapshot().reason)) {
                shakeRejections += 1;
            }
        }
        assertEquals(0, detector.snapshot().acceptedStepCount);
        assertTrue("the gravity estimate must have adapted during the motion",
            Math.abs(detector.gravityEstimate() - AccelStepDetector.GRAVITY) > 1.0f);
        assertFalse("the motion is valid sensor data, not an invalid sample",
            detector.rejectSnapshot().isInvalid());
        assertTrue("the motion must be refused by the shake guards",
            shakeRejections > 0);
    }

    /** Peaks separated by MORE than the minimum interval are two steps, and the
     *  accepted cadence is reported and scored. */
    @Test
    public void peaksOutsideDebounceIntervalAreAccepted() {
        long t = settle();
        assertTrue("first peak outside any debounce window",
            detector.onSample(0f, 0f, 12.5f, t));
        assertFalse(detector.onSample(0f, 0f, 9.81f, t + 100));
        assertTrue("a peak 400 ms later is a separate step",
            detector.onSample(0f, 0f, 12.5f, t + 400));
        assertEquals("the accepted inter-step interval must be reported",
            400L, detector.lastStepIntervalMs());
        assertTrue("a plausible cadence must build walking confidence",
            detector.cadenceConfidence() > 0f);
    }

    /** A realistic walking cadence is accepted. */
    @Test
    public void walkingCadenceIsAccepted() {
        int steps = 0;
        long t = settle();
        for (int n = 0; n < 5; n++) {
            assertTrue("walking peak should be accepted",
                detector.onSample(0f, 0f, 12.5f, t));
            steps++;
            t += 700;
            detector.onSample(0f, 0f, 9.81f, t);
            t += 700;
        }
        assertEquals(5, steps);
    }

    /** A cold detector demands a clearer peak than a settled one, but never
     *  silently discards samples: the same small excursion that was refused while
     *  the gravity estimate was settling is accepted once it has settled. */
    @Test
    public void coldStartDemandsAClearerPeak() {
        assertFalse("a cold detector must not accept a marginal excursion",
            detector.onSample(0f, 0f, 9.81f + 1.0f, 500L));

        long t = settle();
        assertFalse(detector.lastSampleInvalid());
        assertTrue("the same excursion is a valid small step once settled",
            detector.onSample(0f, 0f, 9.81f + 1.0f, t + 100));
    }

    /** Reset clears the adaptive state and the debounce window. */
    @Test
    public void resetClearsAdaptiveStateCompletely() {
        long warm = settle();
        assertTrue(detector.onSample(0f, 0f, 12.5f, warm));
        assertEquals("the detector must have counted the step before the reset",
            1, detector.snapshot().acceptedStepCount);

        detector.reset();

        StepDetectState resetState = detector.snapshot();
        assertTrue("gravity should be reset to nominal",
            Math.abs(resetState.gravity - AccelStepDetector.GRAVITY) < 1e-3f);
        assertEquals("accepted step count should be cleared", 0,
            resetState.acceptedStepCount);
        assertEquals("sample index should be cleared", 0, resetState.sampleIndex);
        assertEquals("recent peak should be cleared", 0f, resetState.recentPeak, 1e-3f);
        assertEquals("window dynamic peak should be cleared", 0f,
            resetState.windowDynamicPeak, 1e-3f);
        assertEquals("sustained slope estimate should be cleared", 0f,
            resetState.sustainedJerk, 1e-3f);
        assertEquals("last step interval should be cleared", -1L,
            resetState.lastStepIntervalMs);
        assertTrue("reset must re-arm the hysteresis", resetState.armed);

        // After reset the detector must behave exactly like a fresh detector: the
        // same cold-start excursion that was refused at the start of this test is
        // refused again.
        assertFalse("after reset the detector must be cold again",
            detector.onSample(0f, 0f, 9.81f + 1.0f, warm + 1000));
    }

    /** Reset after aggressive shaking clears the corrupted adaptive state. */
    @Test
    public void resetAfterShakingClearsAdaptiveState() {
        for (int i = 0; i < 200; i++) { // pollute every adaptive estimate
            float z = (i % 2 == 0) ? 45f : -20f;
            detector.onSample(z, 30f, z, i * SAMPLE_MS);
        }
        StepDetectState polluted = detector.snapshot();
        assertTrue("gravity should be polluted after shaking",
            Math.abs(polluted.gravity - AccelStepDetector.GRAVITY) > 1.0f);
        assertTrue("the sustained slope estimate should be polluted",
            polluted.sustainedJerk > 0f);

        detector.reset();
        StepDetectState resetState = detector.snapshot();
        assertTrue("gravity should be reset after shaking",
            Math.abs(resetState.gravity - AccelStepDetector.GRAVITY) < 1e-3f);
        assertEquals("accepted step count should be cleared", 0,
            resetState.acceptedStepCount);
        assertEquals("recent peak should be cleared", 0f, resetState.recentPeak, 1e-3f);
        assertEquals("sustained slope estimate should be cleared", 0f,
            resetState.sustainedJerk, 1e-3f);

        // Fresh walking after the polluted reset must still work.
        int steps = 0;
        for (int i = 0; i < 200; i++) {
            long t = i * SAMPLE_MS;
            double phase = (2 * Math.PI * t) / 600.0;
            float z = (float) (9.81 + 2.4 * Math.sin(phase));
            if (detector.onSample(0.1f, 0.1f, z, t)) {
                steps += 1;
            }
        }
        assertTrue("after reset a clean walking waveform should behave like a fresh "
            + "detector, got " + steps, steps >= 4 && steps <= 8);
    }

    /** Diagnostics expose the dynamic magnitude, the threshold and the reason for
     *  the most recent decision, which is what the in-app panel shows. */
    @Test
    public void diagnosticsExposeRejectionReason() {
        long t = settle();
        assertTrue(detector.onSample(0f, 0f, 12.5f, t));
        assertFalse("an accepted sample is not a rejection",
            detector.rejectSnapshot().isReject);
        assertEquals("accepted sample reason should be 'ok'", "ok",
            detector.rejectSnapshot().reason);
        assertTrue("the threshold must be published", detector.highThreshold() > 0f);

        assertFalse("a lone big spike must not be accepted",
            detector.onSample(0f, 0f, 40f, t + 50));
        assertTrue("the spike must be rejected", detector.rejectSnapshot().isReject);
        assertTrue("the rejection reason must be shake related, was "
                + detector.rejectSnapshot().reason,
            isShakeReason(detector.rejectSnapshot().reason));
    }

    /** NaN / infinite / absurd finite samples never advance the count. */
    @Test
    public void infiniteAndAbsurdSamplesNeverCount() {
        assertFalse(detector.onSample(Float.NEGATIVE_INFINITY, 0f, 9.81f, 0L));
        assertTrue(detector.lastSampleInvalid());
        assertFalse(detector.onSample(0f, Float.NaN, 0f, SAMPLE_MS));
        assertTrue(detector.lastSampleInvalid());

        long t = settle();
        assertFalse("an absurd but finite magnitude must not be a step",
            detector.onSample(0f, 0f, Float.MAX_VALUE / 4f, t));
        assertEquals("no step may come from absurd data", 0,
            detector.snapshot().acceptedStepCount);
    }

    private static boolean isShakeReason(String reason) {
        return "high_frequency".equals(reason)
            || "window_dynamic_energy".equals(reason)
            || "violent_dynamic_energy".equals(reason);
    }
}
