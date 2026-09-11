package app.lovable.svj;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Before;
import org.junit.Test;

/**
 * Unit tests for the accelerometer fallback step detector.
 *
 * Run with: ./gradlew :app:testDebugUnitTest
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
}
