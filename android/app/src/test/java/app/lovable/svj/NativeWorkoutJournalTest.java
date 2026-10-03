package app.lovable.svj;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk = 35)
public class NativeWorkoutJournalTest {
  @Test public void databaseSurvivesReopenAndPagesOnlyTheOwnedWorkout() throws Exception {
    android.content.Context context = RuntimeEnvironment.getApplication(); context.deleteDatabase("svj_workout_journal_v2.db");
    try (NativeWorkoutJournal writer = new NativeWorkoutJournal(context)) {
      for (int i=0;i<301;i++) writer.append("account-a", "workout-a", i == 0 ? "start" : "point", 1000+i, new JSObject().put("lat",1).put("lng",2));
      writer.append("account-b", "workout-b", "point", 2000, new JSObject().put("lat",2).put("lng",3));
    }
    try (NativeWorkoutJournal reader = new NativeWorkoutJournal(context)) {
      JSArray first = reader.read("account-a","workout-a",0,250); assertEquals(250, first.length());
      JSArray second = reader.read("account-a","workout-a",250,250); assertEquals(51,second.length()); assertEquals(301, second.getJSONObject(50).getLong("sequence"));
      assertEquals(0,reader.read("account-b","workout-a",0,500).length());
      reader.clear("account-a","workout-a"); assertEquals(1,reader.read("account-b","workout-b",0,500).length());
    }
  }
  @Test public void dailySnapshotsAreAccountScopedAndPermissionDenialIsTruthful() throws Exception {
    android.content.Context c = RuntimeEnvironment.getApplication(); DailyStepService.prefs(c).edit().clear().commit();
    DailyStepService.prefs(c).edit().putString("owner","account-a").putBoolean("enabled",true).putString("data:account-a", "{\"date\":\""+DailyStepService.day(System.currentTimeMillis())+"\",\"total\":100,\"raw\":999}").commit();
    assertEquals(100,DailyStepService.snapshot(c,"account-a").getLong("steps"));
    assertEquals(0,DailyStepService.snapshot(c,"account-b").getLong("steps"));
    assertFalse(DailyStepService.snapshot(c,"account-b").getBoolean("enabled"));
    assertFalse(DailyStepService.snapshot(c,"account-a").getBoolean("listening"));
    DailyStepService.disable(c); assertEquals(100,DailyStepService.snapshot(c,"account-a").getLong("steps"));
    assertEquals(-1,DailyStepService.snapshot(c,"account-a").getLong("raw"));
  }
}
