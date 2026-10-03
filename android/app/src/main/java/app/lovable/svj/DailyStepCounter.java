package app.lovable.svj;

/** Pure counter arithmetic. A cumulative reading does not contain per-step times. */
public final class DailyStepCounter {
  public long raw = -1, sampleNanos = -1, boot = -1, total = 0, unattributed = 0, measuredAt = 0;
  public String date = "";
  public long accept(long value, long timestampNanos, long bootId, String day) {
    return accept(value, timestampNanos, bootId, day, 0, 0);
  }
  public long accept(long value, long timestampNanos, long bootId, String day, long wallMs, long retainedDayTotal) {
    if (value < 0 || timestampNanos < 0) return 0;
    if (boot == bootId && timestampNanos <= sampleNanos) return 0;
    boolean sameDay = date.equals(day);
    long delta = boot == bootId && raw >= 0 && value >= raw ? value - raw : 0;
    boolean clockChanged = measuredAt > 0 && wallMs > 0 && boot == bootId &&
      Math.abs((wallMs - measuredAt) - (timestampNanos - sampleNanos) / 1000000) > 120000;
    if (!sameDay || clockChanged) { unattributed += delta; if (!sameDay) total = retainedDayTotal; delta = 0; }
    total += delta;
    raw = value; sampleNanos = timestampNanos; boot = bootId; date = day;
    measuredAt = wallMs;
    return delta;
  }
}
