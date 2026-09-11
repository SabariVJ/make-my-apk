package app.lovable.svj;

/**
 * Pure accelerometer step detection for devices with no dedicated step sensor.
 *
 * Deliberately free of Android imports so the maths is unit testable without a
 * device (see {@code AccelStepDetectorTest}).
 *
 * Algorithm:
 *  1. Signal: magnitude of the three axes.
 *  2. Gravity tracking: slow low-pass filter of the magnitude.
 *  3. Linear acceleration: magnitude - gravity estimate, then a fast low-pass
 *     to remove per-sample jitter.
 *  4. Adaptive peak detection with hysteresis: a step needs the smoothed signal
 *     to rise above a peak-derived high threshold and then fall back below a low
 *     threshold before the next step can be counted (so one physical step is
 *     counted exactly once).
 *  5. Debounce: at least {@link #MIN_STEP_INTERVAL_MS} between steps, which caps
 *     the cadence at 4 steps/second.
 *  6. Noise rejection: the first samples are ignored while the gravity estimate
 *     settles, non-finite or zero magnitudes are dropped, and absurd spikes
 *     (a dropped tablet, shaking) do not count as steps.
 *
 * This is an estimate only - it is never used when the device exposes
 * TYPE_STEP_COUNTER or TYPE_STEP_DETECTOR.
 */
public final class AccelStepDetector {

    /** Plausible gravity at rest (m/s^2). */
    static final float GRAVITY = 9.80665f;
    /** 4 steps/second is already faster than a run. */
    public static final long MIN_STEP_INTERVAL_MS = 250L;

    private static final float GRAVITY_SMOOTHING = 0.9f;
    private static final float SIGNAL_SMOOTHING = 0.25f;
    /** Floor for the peak threshold, so slow shuffles still register. */
    private static final float MIN_HIGH_THRESHOLD = 1.1f;
    /** Anything above this is treated as violent motion, not walking. */
    private static final float MAX_PEAK = 8.0f;
    private static final float PEAK_DECAY = 0.98f;
    private static final float PEAK_TO_HIGH = 0.6f;
    private static final float REARM_RATIO = 0.4f;
    /** Samples ignored while the gravity estimate converges (~0.4s at 50Hz). */
    private static final int WARMUP_SAMPLES = 20;

    private float gravity = GRAVITY;
    private float smoothed = 0f;
    private float peak = 0f;
    private boolean armed = true;
    private int samples = 0;
    private long lastStepMs = Long.MIN_VALUE;
    private boolean lastSampleInvalid = false;

    /**
     * Feed one accelerometer sample.
     *
     * @return true when this sample completes a new step.
     */
    public boolean onSample(float x, float y, float z, long timestampMs) {
        if (Float.isNaN(x) || Float.isNaN(y) || Float.isNaN(z) || Float.isInfinite(x) || Float.isInfinite(y) || Float.isInfinite(z)) {
            lastSampleInvalid = true;
            return false;
        }

        float magnitude = (float) Math.sqrt(x * x + y * y + z * z);
        if (!Float.isFinite(magnitude) || magnitude <= 0.5f) {
            // Flat/dead sensor data must never fabricate steps.
            lastSampleInvalid = true;
            return false;
        }
        lastSampleInvalid = false;

        gravity = gravity * GRAVITY_SMOOTHING + magnitude * (1f - GRAVITY_SMOOTHING);
        float linear = magnitude - gravity;
        smoothed = smoothed + SIGNAL_SMOOTHING * (linear - smoothed);

        samples += 1;
        if (samples <= WARMUP_SAMPLES) {
            return false;
        }

        float magnitudeOfSignal = Math.abs(smoothed);
        peak = Math.max(magnitudeOfSignal, peak * PEAK_DECAY);
        float high = Math.max(MIN_HIGH_THRESHOLD, peak * PEAK_TO_HIGH);
        float low = high * REARM_RATIO;

        if (!armed) {
            if (magnitudeOfSignal < low) {
                armed = true;
            }
            return false;
        }

        if (magnitudeOfSignal >= high) {
            // Consume the peak either way so a debounced peak cannot fire later.
            armed = false;
            if (magnitudeOfSignal > MAX_PEAK) {
                return false;
            }
            if (lastStepMs != Long.MIN_VALUE && timestampMs - lastStepMs < MIN_STEP_INTERVAL_MS) {
                return false;
            }
            lastStepMs = timestampMs;
            return true;
        }

        return false;
    }

    /** True when the most recent sample was dropped as invalid. */
    public boolean lastSampleInvalid() {
        return lastSampleInvalid;
    }

    /** Current adaptive high threshold, exposed for diagnostics and tests. */
    public float highThreshold() {
        return Math.max(MIN_HIGH_THRESHOLD, peak * PEAK_TO_HIGH);
    }

    public void reset() {
        gravity = GRAVITY;
        smoothed = 0f;
        peak = 0f;
        armed = true;
        samples = 0;
        lastStepMs = Long.MIN_VALUE;
        lastSampleInvalid = false;
    }
}
