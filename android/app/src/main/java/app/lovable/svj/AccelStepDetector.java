package app.lovable.svj;

/**
 * Software step detection for devices that expose neither TYPE_STEP_COUNTER nor
 * TYPE_STEP_DETECTOR.  It is a FALLBACK only: the plugin never runs it when a
 * dedicated Android step sensor exists.
 *
 * Deliberately free of Android imports so the maths is unit testable without a
 * device (see {@code AccelStepDetectorTest}).
 *
 * Algorithm
 * ---------
 * 1. Orientation tolerant signal: acceleration magnitude |a|, which is
 *    independent of how the tablet is held.
 * 2. Gravity / dynamic separation.  Gravity is a SLOW exponential low-pass of
 *    the magnitude (alpha = {@link #GRAVITY_ALPHA}, ~0.4 Hz at 50 Hz).  Because
 *    the coefficient is small, violent short-duration motion cannot drag the
 *    gravity estimate onto the dynamic acceleration.  The high-pass signal
 *    "lin = |a| - gravity" is the dynamic (linear) acceleration that walking
 *    cadence has to explain.
 * 3. Temporal guards, applied BEFORE any step logic.  They are rate based and do
 *    not depend on the gravity estimate, which is exactly the property the
 *    previous absolute |lin| cap lacked:
 *      a. instantaneous magnitude slope (jerk) above
 *         {@link #HARD_JERK_CEILING} m/s^2 per second   -> "high_frequency"
 *         (real human walking peaks at roughly 25-100 m/s^2/s; shake/saw motion is
 *         an order of magnitude above it, even while gravity is adapting.  A real
 *         step survives this guard because its steep edges are rejected while the
 *         peak itself - where the slope is near zero - is still evaluated),
 *      b. |lin| above {@link #VIOLENT_DYNAMIC_CEILING}, or |magnitude - nominal
 *         gravity| above {@link #ABSOLUTE_DYNAMIC_CEILING}
 *                                                      -> "violent_dynamic_energy"
 *         (backstop for a single huge excursion).  The second form is measured
 *         against the CONSTANT 9.81 instead of the adaptive estimate, so it works
 *         even on the very first sample - when no rate of change exists yet - and
 *         it cannot be defeated by the gravity estimate drifting while violent
 *         motion is being processed,
 *      c. sustained jerk (EMA of the magnitude slope) above
 *         {@link #SUSTAINED_JERK_CEILING}              -> "window_dynamic_energy"
 *         (catches prolonged wobble whose individual samples stay under the
 *         instant ceiling, e.g. vigorous shaking at 3-6 Hz),
 *      d. two threshold crossings closer together than
 *         {@link #MIN_CROSSING_INTERVAL_MS}            -> "high_frequency"
 *         (the cadence guard: no human takes two steps 150 ms apart, 6.7/s.  A
 *         sideways shake is the case that needs it - its magnitude is a rectified
 *         signal that crosses the threshold at TWICE the shake frequency, so a
 *         6 Hz shake looks like 12 crossings per second even though every single
 *         sample passes the amplitude and slope guards).
 * 4. Cold start: while the gravity estimate is still settling (the first
 *    {@link #WARMUP_SAMPLES} samples) a higher floor ({@link #WARMUP_MIN_PEAK})
 *    is demanded instead of ignoring the samples outright.  Ignoring them would
 *    silently lose a step taken while the app is starting, and no UI can explain
 *    a step that was thrown away; a higher floor can neither lose a real step
 *    (walking peaks are 1.5-4 m/s^2) nor invent one.
 * 5. Signed walking peak detection.  Only the positive lobe counts as a step, so
 *    one walking cycle (up AND down) produces exactly one step instead of two.
 *    An adaptive threshold `high = max(MIN_PEAK, PEAK_TO_HIGH * recentPeak)`
 *    follows the current walking intensity (recentPeak is the largest positive
 *    lin over the last {@link #WINDOW_SAMPLES} samples, ~1.3 s at 50 Hz), so
 *    variable stride amplitude still crosses it.
 * 6. Re-arm hysteresis: after a peak is consumed the signal must fall back below
 *    {@link #REARM_RATIO} * high before another peak can be counted.  This is
 *    what makes an isolated spike - or a plateau of noise - not a step.
 * 7. Debounce: {@link #MIN_STEP_INTERVAL_MS} is the minimum gap between accepted
 *    steps, so a second peak inside the interval is rejected ("debounce") while
 *    peaks outside it are accepted.
 * 8. Cadence tracking: the accepted inter-step interval is kept and scored into a
 *    walking-consistency confidence, exposed for diagnostics.
 *
 * Every decision is reported through {@link #rejectSnapshot()} so tests and the
 * in-app diagnostics panel can show WHY a sample was accepted or rejected
 * instead of only the resulting count.
 *
 * This detector produces an ESTIMATE.  It never claims hardware accuracy, and the
 * UI labels the resulting count as estimated.
 */
public final class AccelStepDetector {

    /** Plausible gravity at rest (m/s^2). */
    public static final float GRAVITY = 9.80665f;

    /** Minimum gap between accepted steps: 4 steps/second is already faster than
     *  a run, so anything closer together is one physical step (decay of the same
     *  peak) or vibration, never two steps. */
    public static final long MIN_STEP_INTERVAL_MS = 250L;

    /** Upper bound of the plausible walking cadence band.  A longer gap simply
     *  means the user paused; it is not rejected, only scored as a new cadence. */
    public static final long MAX_STEP_INTERVAL_MS = 2000L;

    /** Samples during which the gravity estimate is still settling.  A cold
     *  detector demands {@link #WARMUP_MIN_PEAK} rather than ignoring samples, so a
     *  step taken while the app starts is never silently dropped. */
    public static final int WARMUP_SAMPLES = 20;

    // ---- algorithm constants (package visible for the unit tests) ----

    /** Slow low-pass coefficient for the gravity / DC estimate. */
    static final float GRAVITY_ALPHA = 0.05f;

    /** Absolute floor of the adaptive step threshold (m/s^2). */
    static final float MIN_PEAK = 0.6f;

    /** Higher floor demanded while the gravity estimate is still settling.  Real
     *  walking peaks are 1.5-4 m/s^2, so this stays below them. */
    static final float WARMUP_MIN_PEAK = 1.2f;

    /** Adaptive threshold as a fraction of the recent walking dynamic peak. */
    static final float PEAK_TO_HIGH = 0.6f;

    /** Fraction of the threshold the signal must fall below before re-arming. */
    static final float REARM_RATIO = 0.4f;

    /** |lin| above this can never be a walking step. */
    static final float VIOLENT_DYNAMIC_CEILING = 12.0f;

    /** |magnitude - nominal gravity| above this is not human locomotion.  Walking
     *  peaks at 1.5-4 m/s^2, a jog around 6, so 8 leaves room for a hard step while
     *  refusing a shake.  Because 9.81 is a constant - and the magnitude is
     *  orientation tolerant - this guard is valid on the first sample and cannot be
     *  dodged by the gravity estimate drifting toward the mean of violent motion. */
    static final float ABSOLUTE_DYNAMIC_CEILING = 8.0f;

    /** Instantaneous magnitude slope ceiling (m/s^2 per second).  Walking peaks
     *  at 25-100, a hard heel strike or a jog can reach ~150, while shaking is
     *  200-1500 - so this separates them without being able to lose a real peak
     *  (a peak is rejected only at its steep edges, where the step is still
     *  evaluated a sample or two later, at the top of the lobe). */
    static final float HARD_JERK_CEILING = 200.0f;

    /** Sustained magnitude slope ceiling (EMA, m/s^2 per second).  Walking settles
     *  at 15-45 and brisk walking at ~40; a single hard heel strike reaches ~150 but
     *  only for one sample.  A vibration above ~3 Hz sustains 150-900, so 80
     *  separates them with margin on both sides. */
    static final float SUSTAINED_JERK_CEILING = 80.0f;

    /** EMA coefficient for the sustained slope estimate.  Fast enough to recognise a
     *  vibration within two or three samples - a slower estimate would leave the
     *  first lobe of a shake free to be counted as a step, which is exactly what the
     *  original absolute cap allowed.  One isolated hard step still only reaches
     *  ~0.35 * 150 = 53, well under the ceiling. */
    static final float SUSTAINED_JERK_ALPHA = 0.35f;

    /** Smoothing of the exposed conditioned energy (diagnostics only). */
    static final float CONDITIONED_ALPHA = 0.3f;

    /** Adaptive-threshold window (~1.3 s at 50 Hz). */
    static final int WINDOW_SAMPLES = 64;

    /** Shortest plausible gap between two threshold crossings: 6.7 crossings per
     *  second, where four steps a second is already a sprint.  Real walking crosses
     *  every 400-1000 ms, so this only fires on vibration. */
    static final long MIN_CROSSING_INTERVAL_MS = 150L;

    /** Plausible walking cadence band used by the confidence score. */
    static final long MIN_PLAUSIBLE_CADENCE_MS = 300L;
    static final long MAX_PLAUSIBLE_CADENCE_MS = MAX_STEP_INTERVAL_MS;

    // ---- state ----

    private float gravity = GRAVITY;
    private float linear = 0f;
    private float conditioned = 0f;

    private float prevMagnitude = -1f;
    private long prevTimestampMs = -1L;

    private float jerkEma = 0f;
    private float lastJerkRate = 0f;

    /** Ring buffer of recent high-pass samples (adaptive threshold window). */
    private float[] window = new float[WINDOW_SAMPLES];
    private int windowHead = 0;
    private int windowCount = 0;

    /** Largest positive high-pass value in the window. */
    private float recentPeak = 0f;

    /** True when the hysteresis has re-armed and a new peak may be counted. */
    private boolean armed = true;

    /** Timestamp of the last threshold crossing, debounced or not - this is what
     *  makes the cadence guard independent of the debounce. */
    private long lastCrossingMs = Long.MIN_VALUE;

    private long lastAcceptedStepMs = Long.MIN_VALUE;
    private long lastStepIntervalMs = -1L;
    private int acceptedStepCount = 0;
    private int sampleIndex = 0;
    private float cadenceConfidence = 0f;

    private StepRejectSnapshot rejectSnapshot = StepRejectSnapshot.none();

    // ---- public API ----

    /**
     * Feed one accelerometer sample.
     *
     * @param x           acceleration on the x axis (m/s^2)
     * @param y           acceleration on the y axis (m/s^2)
     * @param z           acceleration on the z axis (m/s^2)
     * @param timestampMs monotonic timestamp in milliseconds
     * @return true when this sample completes a new detected step
     */
    public boolean onSample(float x, float y, float z, long timestampMs) {
        if (Float.isNaN(x) || Float.isNaN(y) || Float.isNaN(z)
                || Float.isInfinite(x) || Float.isInfinite(y) || Float.isInfinite(z)) {
            return rejectState("invalid_sample", "NaN/infinite axis");
        }

        float magnitude = (float) Math.sqrt((double) x * x + (double) y * y + (double) z * z);
        if (!Float.isFinite(magnitude) || magnitude <= 0.5f) {
            return rejectState("invalid_sample", "non-finite/zero magnitude");
        }

        // 1. Rate of change of the magnitude.  This is deliberately computed from
        //    the raw magnitude so it stays valid while the gravity estimate is
        //    still adapting to violent motion.
        float jerkRate = 0f;
        if (prevTimestampMs >= 0L && timestampMs > prevTimestampMs) {
            float dtSeconds = (timestampMs - prevTimestampMs) / 1000f;
            jerkRate = Math.abs(magnitude - prevMagnitude) / dtSeconds;
        }
        lastJerkRate = jerkRate;
        if (jerkRate > 0f) {
            jerkEma = jerkEma + (jerkRate - jerkEma) * SUSTAINED_JERK_ALPHA;
        }
        prevMagnitude = magnitude;
        prevTimestampMs = timestampMs;
        sampleIndex++;

        // 2. Gravity / dynamic separation.
        gravity = gravity + GRAVITY_ALPHA * (magnitude - gravity);
        linear = magnitude - gravity;
        conditioned = conditioned + CONDITIONED_ALPHA * (Math.abs(linear) - conditioned);

        // 3. Adaptive threshold reference (largest positive high-pass value in
        //    the recent window).
        window[windowHead] = linear;
        windowHead = (windowHead + 1) % WINDOW_SAMPLES;
        if (windowCount < WINDOW_SAMPLES) windowCount++;
        recentPeak = windowPeak();

        // 4. Temporal guards: shaking is rejected for temporal reasons first.
        if (jerkRate > HARD_JERK_CEILING) {
            return rejectState("high_frequency",
                "jerk=" + jerkRate + " ceiling=" + HARD_JERK_CEILING);
        }
        if (Math.abs(linear) > VIOLENT_DYNAMIC_CEILING) {
            return rejectState("violent_dynamic_energy",
                "lin=" + linear + " ceiling=" + VIOLENT_DYNAMIC_CEILING);
        }
        // Same guard against the CONSTANT nominal gravity, so it also protects the
        // very first sample (no rate of change available yet) and stays valid while
        // the gravity estimate is being dragged around by violent motion.
        float absoluteDynamic = Math.abs(magnitude - GRAVITY);
        if (absoluteDynamic > ABSOLUTE_DYNAMIC_CEILING) {
            return rejectState("violent_dynamic_energy",
                "abs=" + absoluteDynamic + " ceiling=" + ABSOLUTE_DYNAMIC_CEILING);
        }
        if (jerkEma > SUSTAINED_JERK_CEILING) {
            return rejectState("window_dynamic_energy",
                "jerkEma=" + jerkEma + " ceiling=" + SUSTAINED_JERK_CEILING);
        }

        // 5. Cold start settles the gravity estimate with a higher floor rather
        //    than dropping samples (see effectiveThreshold()).

        // 6. Signed peak detection with re-arm hysteresis.
        float high = effectiveThreshold();
        float low = high * REARM_RATIO;
        if (linear < low) {
            armed = true;
        }

        if (armed && linear >= high) {
            armed = false;

            // 7. Cadence guard: crossings this close together are vibration, not
            //    steps.  Checked on EVERY crossing - including ones the debounce
            //    would have rejected - so a signal that keeps crossing faster than a
            //    human can step is refused even when the debounce would otherwise
            //    let one crossing through every so often.
            long crossingGap = lastCrossingMs == Long.MIN_VALUE
                ? -1L
                : timestampMs - lastCrossingMs;
            lastCrossingMs = timestampMs;
            if (crossingGap >= 0L && crossingGap < MIN_CROSSING_INTERVAL_MS) {
                return rejectState("high_frequency",
                    "crossing gap=" + crossingGap + " min=" + MIN_CROSSING_INTERVAL_MS);
            }

            long gap = lastAcceptedStepMs == Long.MIN_VALUE
                ? -1L
                : timestampMs - lastAcceptedStepMs;

            // 8. Debounce: a peak inside the minimum interval is the same physical
            //    step (or vibration), never a second step.
            if (gap >= 0L && gap < MIN_STEP_INTERVAL_MS) {
                return rejectState("debounce", "gap=" + gap + " min=" + MIN_STEP_INTERVAL_MS);
            }

            acceptedStepCount++;
            lastAcceptedStepMs = timestampMs;
            lastStepIntervalMs = gap;
            if (gap >= 0L) {
                boolean plausible =
                    gap >= MIN_PLAUSIBLE_CADENCE_MS && gap <= MAX_PLAUSIBLE_CADENCE_MS;
                cadenceConfidence = clamp01(cadenceConfidence + (plausible ? 0.25f : -0.25f));
            }
            rejectSnapshot = StepRejectSnapshot.accept("ok",
                "lin=" + linear + " high=" + high + " gap=" + gap);
            return true;
        }

        if (!armed) {
            return rejectState("not_rearmed", "lin=" + linear + " low=" + low);
        }
        return rejectState("below_threshold", "lin=" + linear + " high=" + high);
    }

    /** True when the most recent sample was dropped as invalid sensor data. */
    public boolean lastSampleInvalid() {
        return rejectSnapshot.isInvalid();
    }

    /** Current adaptive high threshold, exposed for diagnostics and tests. */
    public float highThreshold() {
        return Math.max(MIN_PEAK, recentPeak * PEAK_TO_HIGH);
    }

    /** Threshold actually applied to the current sample: the adaptive threshold,
     *  raised to {@link #WARMUP_MIN_PEAK} while the detector is still cold. */
    private float effectiveThreshold() {
        float high = highThreshold();
        if (sampleIndex <= WARMUP_SAMPLES && high < WARMUP_MIN_PEAK) {
            return WARMUP_MIN_PEAK;
        }
        return high;
    }

    /** Conditioned (smoothed) dynamic energy, exposed for diagnostics. */
    public float conditionedSignal() {
        return conditioned;
    }

    /** Current high-pass / dynamic acceleration (|a| - gravity). */
    public float dynamicMagnitude() {
        return linear;
    }

    /** Current signed dynamic acceleration, same quantity as the peak signal. */
    public float linearAcceleration() {
        return linear;
    }

    /** Current gravity (DC) estimate. */
    public float gravityEstimate() {
        return gravity;
    }

    /** Recent walking dynamic peak (adaptive threshold reference). */
    public float recentPeak() {
        return recentPeak;
    }

    /** Instantaneous magnitude slope of the last sample (m/s^2 per second). */
    public float lastJerkRate() {
        return lastJerkRate;
    }

    /** Sustained magnitude slope estimate (m/s^2 per second). */
    public float sustainedJerk() {
        return jerkEma;
    }

    /** Last accepted inter-step interval in ms, or -1 when unknown. */
    public long lastStepIntervalMs() {
        return lastStepIntervalMs;
    }

    /** Estimated cadence in ms per accepted step, or -1 when unknown. */
    public long estimatedCadenceMs() {
        return lastStepIntervalMs;
    }

    /** 0..1 walking-consistency score derived from accepted step intervals. */
    public float cadenceConfidence() {
        return cadenceConfidence;
    }

    /** Current rejection/acceptance snapshot for the most recent sample. */
    public StepRejectSnapshot rejectSnapshot() {
        return rejectSnapshot;
    }

    /** Diagnostic snapshot for the in-app panel and for tests. */
    public StepDetectState snapshot() {
        return new StepDetectState(
            gravity,
            linear,
            conditioned,
            highThreshold(),
            recentPeak,
            windowPeak(),
            rejectSnapshot,
            lastAcceptedStepMs,
            acceptedStepCount,
            sampleIndex,
            windowCount,
            meanWindowMagnitude(),
            countWindowSignFlips(),
            jerkEma,
            lastJerkRate,
            lastStepIntervalMs,
            cadenceConfidence,
            armed);
    }

    /** Clears ALL adaptive state so the detector behaves exactly like a fresh one. */
    public void reset() {
        gravity = GRAVITY;
        linear = 0f;
        conditioned = 0f;
        prevMagnitude = -1f;
        prevTimestampMs = -1L;
        jerkEma = 0f;
        lastJerkRate = 0f;
        window = new float[WINDOW_SAMPLES];
        windowHead = 0;
        windowCount = 0;
        recentPeak = 0f;
        armed = true;
        lastCrossingMs = Long.MIN_VALUE;
        lastAcceptedStepMs = Long.MIN_VALUE;
        lastStepIntervalMs = -1L;
        acceptedStepCount = 0;
        sampleIndex = 0;
        cadenceConfidence = 0f;
        rejectSnapshot = StepRejectSnapshot.none();
    }

    // ---- internal helpers ----

    private boolean rejectState(String reason, String detail) {
        rejectSnapshot = StepRejectSnapshot.reject(reason, detail);
        return false;
    }

    private float windowPeak() {
        float peak = 0f;
        for (int i = 0; i < windowCount; i++) {
            if (window[i] > peak) peak = window[i];
        }
        return peak;
    }

    private float meanWindowMagnitude() {
        if (windowCount <= 0) return 0f;
        float sum = 0f;
        for (int i = 0; i < windowCount; i++) {
            sum += Math.abs(window[i]);
        }
        return sum / windowCount;
    }

    /** Sign flips of the high-pass signal across the recent window: walking has
     *  a handful, high frequency vibration has many. */
    private int countWindowSignFlips() {
        int flips = 0;
        boolean previousNegative = false;
        boolean havePrevious = false;
        for (int i = 0; i < windowCount; i++) {
            int index = ((windowHead - windowCount + i) % WINDOW_SAMPLES + WINDOW_SAMPLES)
                % WINDOW_SAMPLES;
            boolean negative = window[index] < 0f;
            if (havePrevious && negative != previousNegative) flips++;
            previousNegative = negative;
            havePrevious = true;
        }
        return flips;
    }

    private static float clamp01(float v) {
        if (v < 0f) return 0f;
        if (v > 1f) return 1f;
        return v;
    }

    /** Rejection / acceptance diagnostic for the most recent sample. */
    public static final class StepRejectSnapshot {
        public final boolean isReject;
        public final String reason;
        public final String detail;

        private StepRejectSnapshot(boolean isReject, String reason, String detail) {
            this.isReject = isReject;
            this.reason = reason;
            this.detail = detail;
        }

        public static StepRejectSnapshot none() {
            return new StepRejectSnapshot(false, "none", "");
        }

        public static StepRejectSnapshot reject(String reason, String detail) {
            return new StepRejectSnapshot(true, reason, detail);
        }

        public static StepRejectSnapshot accept(String reason, String detail) {
            return new StepRejectSnapshot(false, reason, detail);
        }

        public boolean isInvalid() {
            return isReject && "invalid_sample".equals(reason);
        }

        @Override
        public String toString() {
            return "StepRejectSnapshot{isReject=" + isReject + ", reason=" + reason
                + ", detail=" + detail + "}";
        }
    }

    /** Snapshot of the current detection state. */
    public static final class StepDetectState {
        public final float gravity;
        public final float dynamic;
        public final float conditioned;
        public final float highThreshold;
        public final float recentPeak;
        public final float windowDynamicPeak;
        public final StepRejectSnapshot reject;
        public final long lastAcceptedStepMs;
        public final int acceptedStepCount;
        public final int sampleIndex;
        public final int peakTimestampCount;
        public final float meanRecentDynamic;
        public final int signFlips;
        public final float sustainedJerk;
        public final float lastJerkRate;
        public final long lastStepIntervalMs;
        public final float cadenceConfidence;
        public final boolean armed;

        public StepDetectState(
                float gravity,
                float dynamic,
                float conditioned,
                float highThreshold,
                float recentPeak,
                float windowDynamicPeak,
                StepRejectSnapshot reject,
                long lastAcceptedStepMs,
                int acceptedStepCount,
                int sampleIndex,
                int peakTimestampCount,
                float meanRecentDynamic,
                int signFlips,
                float sustainedJerk,
                float lastJerkRate,
                long lastStepIntervalMs,
                float cadenceConfidence,
                boolean armed) {
            this.gravity = gravity;
            this.dynamic = dynamic;
            this.conditioned = conditioned;
            this.highThreshold = highThreshold;
            this.recentPeak = recentPeak;
            this.windowDynamicPeak = windowDynamicPeak;
            this.reject = reject;
            this.lastAcceptedStepMs = lastAcceptedStepMs;
            this.acceptedStepCount = acceptedStepCount;
            this.sampleIndex = sampleIndex;
            this.peakTimestampCount = peakTimestampCount;
            this.meanRecentDynamic = meanRecentDynamic;
            this.signFlips = signFlips;
            this.sustainedJerk = sustainedJerk;
            this.lastJerkRate = lastJerkRate;
            this.lastStepIntervalMs = lastStepIntervalMs;
            this.cadenceConfidence = cadenceConfidence;
            this.armed = armed;
        }

        @Override
        public String toString() {
            return "StepDetectState{gravity=" + gravity + " dynamic=" + dynamic
                + " conditioned=" + conditioned + " highThreshold=" + highThreshold
                + " recentPeak=" + recentPeak + " windowDynamicPeak=" + windowDynamicPeak
                + " reject=" + reject + " lastStep=" + lastAcceptedStepMs
                + " accepted=" + acceptedStepCount + " samples=" + sampleIndex
                + " windowSamples=" + peakTimestampCount + " meanDyn=" + meanRecentDynamic
                + " signFlips=" + signFlips + " sustainedJerk=" + sustainedJerk
                + " lastJerk=" + lastJerkRate + " interval=" + lastStepIntervalMs
                + " confidence=" + cadenceConfidence + " armed=" + armed + "}";
        }
    }
}
