package app.lovable.svj;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.hardware.*;
import android.os.*;
import android.provider.Settings;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.*;

/** A daily counter owned by native Android, independent of the WebView/session sensor. */
public class DailyStepService extends Service implements SensorEventListener {
  static final String PREFS = "svj_daily_steps_v2", CHANNEL = "svj_daily_steps";
  static volatile DailyStepService running;
  private SensorManager manager;
  private DailyStepCounter counter;
  private String owner;
  private boolean listening;
  private long enabledAt;
  private long enabledNanos;
  static android.content.SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, MODE_PRIVATE); }
  static String day(long time) { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(time)); }
  static boolean permitted(Context c) { return Build.VERSION.SDK_INT < 29 || c.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED; }
  static boolean available(Context c) { SensorManager m = (SensorManager)c.getSystemService(SENSOR_SERVICE); return m != null && m.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null; }
  static void enable(Context c, String owner) {
    if (owner == null || owner.isEmpty()) throw new IllegalArgumentException("Sign in first.");
    if (!permitted(c)) throw new IllegalStateException("Motion permission is required.");
    if (!available(c)) throw new IllegalStateException("This device has no compatible step counter. Connect Health Connect if available.");
    ContextCompat.startForegroundService(c, new Intent(c, DailyStepService.class).putExtra("owner", owner));
  }
  static void disable(Context c) {
    if (running != null) running.stopCounting();
    String owner = prefs(c).getString("owner", "");
    try {
      JSONObject data = new JSONObject(prefs(c).getString("data:" + owner, "{}")); data.put("raw", -1); data.put("sampleNanos", -1);
      if (!prefs(c).edit().putBoolean("enabled", false).putString("data:" + owner, data.toString()).commit()) throw new IllegalStateException("Could not save tracking preference.");
    } catch (org.json.JSONException e) { throw new IllegalStateException("Could not save tracking preference.", e); }
    c.stopService(new Intent(c, DailyStepService.class));
  }
  static JSObject snapshot(Context c, String requestedOwner) {
    String currentOwner = prefs(c).getString("owner", "");
    JSONObject data;
    try { data = new JSONObject(prefs(c).getString("data:" + requestedOwner, "{}")); } catch(Exception e) { data = new JSONObject(); }
    String today = day(System.currentTimeMillis());
    JSObject result = new JSObject();
    result.put("version", 2); result.put("ownerId", requestedOwner);
    result.put("enabled", currentOwner.equals(requestedOwner) && prefs(c).getBoolean("enabled", false));
    result.put("available", available(c)); result.put("listening", running != null && running.listening && requestedOwner.equals(running.owner));
    result.put("permission", permitted(c) ? "granted" : "denied"); result.put("dateKey", today);
    result.put("steps", today.equals(data.optString("date")) ? data.optLong("total") : 0);
    result.put("raw", data.has("raw") ? data.optLong("raw") : JSONObject.NULL);
    result.put("measurementAt", today.equals(data.optString("date")) && data.has("measurementAt") ? data.optLong("measurementAt") : JSONObject.NULL);
    result.put("source", "Hardware step counter");
    result.put("error", prefs(c).getString("error", null));
    return result;
  }
  @Override public int onStartCommand(Intent intent, int flags, int id) {
    if (intent != null && "STOP".equals(intent.getAction())) { disable(this); return START_NOT_STICKY; }
    String requested = intent == null ? prefs(this).getString("owner", "") : intent.getStringExtra("owner");
    if (requested == null || requested.isEmpty() || !permitted(this)) { stopSelf(); return START_NOT_STICKY; }
    if (listening && requested.equals(owner)) return START_STICKY;
    stopCounting(); owner = requested;
    try {
      NotificationManager nm = getSystemService(NotificationManager.class);
      if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Daily step tracking", NotificationManager.IMPORTANCE_LOW));
      int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH : 0;
      ServiceCompat.startForeground(this, 8472, notification(0), type);
      manager = (SensorManager)getSystemService(SENSOR_SERVICE);
      Sensor sensor = manager == null ? null : manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
      if (sensor == null) throw new IllegalStateException("No compatible step sensor.");
      JSONObject data = new JSONObject(prefs(this).getString("data:" + owner, "{}"));
      counter = new DailyStepCounter(); counter.raw = data.optLong("raw", -1); counter.sampleNanos = data.optLong("sampleNanos", -1);
      counter.boot = data.optLong("boot", -1); counter.date = data.optString("date", ""); counter.total = data.optLong("total"); counter.unattributed = data.optLong("unattributed");
      counter.measuredAt = data.optLong("measurementAt");
      enabledNanos = SystemClock.elapsedRealtimeNanos();
      if (!manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)) throw new IllegalStateException("Could not listen to the sensor.");
      listening = true; enabledAt = System.currentTimeMillis(); running = this;
      if (!prefs(this).edit().putString("owner", owner).putBoolean("enabled", true).remove("error").commit()) throw new IllegalStateException("Device storage is unavailable.");
      return START_STICKY;
    } catch (Exception e) {
      prefs(this).edit().putString("error", "Open SVJ to resume tracking. Check Motion permission and device storage.").putBoolean("enabled", false).commit();
      stopCounting(); ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE); stopSelf(); return START_NOT_STICKY;
    }
  }
  private Notification notification(long total) {
    PendingIntent stop = PendingIntent.getService(this, 8472, new Intent(this, DailyStepService.class).setAction("STOP"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    PendingIntent open = PendingIntent.getActivity(this, 8472, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    return new NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_stat_workout).setContentTitle("SVJ daily steps")
      .setContentText(total + " steps today").setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).addAction(0, "Stop", stop).build();
  }
  @Override public void onSensorChanged(SensorEvent event) {
    if (!listening || counter == null || event.timestamp < enabledNanos) return;
    try {
      if (!permitted(this)) { disable(this); return; }
      long at = System.currentTimeMillis() - (SystemClock.elapsedRealtimeNanos() - event.timestamp) / 1000000;
      long boot = Settings.Global.getInt(getContentResolver(), Settings.Global.BOOT_COUNT, -1);
      if (boot < 0) boot = (System.currentTimeMillis() - SystemClock.elapsedRealtime()) / 60000;
      if (counter.boot == boot && event.timestamp <= counter.sampleNanos) return;
      String previousDate = counter.date; long previousTotal = counter.total;
      if (!Float.isFinite(event.values[0]) || event.values[0] < 0) return;
      counter.accept((long)event.values[0], event.timestamp, boot, day(at), at, prefs(this).getLong("history:" + owner + ":" + day(at), 0));
      JSONObject data = new JSONObject();
      data.put("raw", counter.raw); data.put("sampleNanos", counter.sampleNanos); data.put("boot", counter.boot);
      data.put("date", counter.date); data.put("total", counter.total); data.put("unattributed", counter.unattributed); data.put("measurementAt", at);
      android.content.SharedPreferences.Editor edit = prefs(this).edit().putString("data:" + owner, data.toString()).putLong("history:" + owner + ":" + counter.date, counter.total);
      if (!previousDate.isEmpty() && !previousDate.equals(counter.date)) edit.putLong("history:" + owner + ":" + previousDate, previousTotal);
      if (!edit.commit()) throw new IllegalStateException("Storage full");
      getSystemService(NotificationManager.class).notify(8472, notification(counter.total));
    } catch (Exception e) { prefs(this).edit().putString("error", "Tracking paused: check permission and device storage.").commit(); disable(this); }
  }
  @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}
  private void stopCounting() { if (manager != null) manager.unregisterListener(this); listening = false; if (running == this) running = null; }
  @Override public void onDestroy() { stopCounting(); super.onDestroy(); }
  @Override public IBinder onBind(Intent intent) { return null; }
  public static class Restore extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent intent) {
      if (!prefs(c).getBoolean("enabled", false) || !permitted(c)) return;
      try { enable(c, prefs(c).getString("owner", "")); }
      catch (Exception e) { prefs(c).edit().putString("error", "Open SVJ to resume daily steps.").commit(); }
    }
  }
}
