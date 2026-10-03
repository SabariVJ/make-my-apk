package app.lovable.svj;
import org.junit.Test;
import static org.junit.Assert.*;

public class DailyStepCounterTest {
  @Test public void baselineDuplicatesAndRestart() {
    DailyStepCounter c = new DailyStepCounter(); c.accept(100, 1, 1, "2026-10-03"); c.accept(115, 2, 1, "2026-10-03");
    assertEquals(15, c.total); c.accept(115, 2, 1, "2026-10-03"); c.accept(114, 1, 1, "2026-10-03"); assertEquals(15, c.total);
    DailyStepCounter restored = new DailyStepCounter(); restored.raw=c.raw; restored.total=c.total; restored.sampleNanos=c.sampleNanos; restored.boot=c.boot; restored.date=c.date;
    restored.accept(125, 3, 1, "2026-10-03"); assertEquals(25, restored.total);
  }
  @Test public void rebootAndMidnightDoNotInventTodaysSteps() {
    DailyStepCounter c = new DailyStepCounter(); c.accept(100, 1, 1, "2026-10-03"); c.accept(110, 2, 1, "2026-10-03");
    c.accept(150, 3, 1, "2026-10-04"); assertEquals(0, c.total); assertEquals(40, c.unattributed);
    c.accept(160, 4, 1, "2026-10-04"); assertEquals(10, c.total); c.accept(10, 1, 2, "2026-10-04"); assertEquals(10, c.total);
    c.accept(12, 2, 2, "2026-10-04"); assertEquals(12, c.total);
  }
  @Test public void clockChangesAndReturningToADateRetainHistoryWithoutDoubleCounting() {
    DailyStepCounter c = new DailyStepCounter(); c.accept(100, 1000000000L, 1, "2026-10-03", 1000000, 0);
    c.accept(120, 2000000000L, 1, "2026-10-03", 1001000, 0); assertEquals(20,c.total);
    c.accept(130, 3000000000L, 1, "2026-10-03", 800000, 0); assertEquals(20,c.total); assertEquals(10,c.unattributed);
    c.accept(140, 4000000000L, 1, "2026-10-02", 801000, 15); assertEquals(15,c.total);
    c.accept(150, 5000000000L, 1, "2026-10-03", 802000, 20); assertEquals(20,c.total);
  }
  @Test public void dailyAndWorkoutSourcesHaveIndependentBaselines() {
    DailyStepCounter daily = new DailyStepCounter(); WorkoutStepCounter workout = new WorkoutStepCounter();
    daily.accept(100,1,1,"day"); daily.accept(200,2,1,"day"); workout.accept(200,2); workout.accept(210,3); daily.accept(210,3,1,"day");
    assertEquals(110,daily.total); assertEquals(10,workout.total); workout.pause(); workout.accept(230,4); workout.accept(240,5); assertEquals(20,workout.total);
  }
}
