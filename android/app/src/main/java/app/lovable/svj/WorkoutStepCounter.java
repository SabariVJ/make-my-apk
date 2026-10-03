package app.lovable.svj;

/** Workout-local segments; daily totals are never used for activity rewards. */
public final class WorkoutStepCounter {
  public long total = 0, raw = -1, atNanos = -1;
  public void pause() { raw = -1; atNanos = -1; }
  public boolean accept(long value, long at) {
    if (value < 0 || at <= atNanos) return false;
    if (raw >= 0 && value >= raw) total += value - raw;
    raw = value; atNanos = at; return true;
  }
}
