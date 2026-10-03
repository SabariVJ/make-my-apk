package app.lovable.svj;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import java.util.concurrent.CopyOnWriteArrayList;

/**
 * SVJ's real Android foreground workout service.
 *
 * <p>This is the only place SVJ collects location. It starts exclusively from an
 * explicit user "Start workout" action, shows a persistent
 * "SVJ is recording your activity" notification, and stops the moment the
 * workout ends. There is no passive or background collection anywhere.
 *
 * <p>Because it is a foreground service of type {@code location}, recording
 * survives screen lock, app backgrounding and WebView recreation. State is
 * mirrored into {@link SharedPreferences} so a restarted service (or a
 * reattached WebView) can recover the same workout instead of silently
 * beginning a second one.
 */
public class VjWorkoutService extends Service {
  private static VjWorkoutService running;
  public static boolean isRunning() { return running != null && running.active; }
  private android.hardware.SensorManager stepManager;
  private android.hardware.SensorEventListener stepListener;
  private final WorkoutStepCounter steps = new WorkoutStepCounter();

  public static final String TAG = "VjWorkout";

  public static final String ACTION_START = "app.lovable.svj.workout.START";
  public static final String ACTION_PAUSE = "app.lovable.svj.workout.PAUSE";
  public static final String ACTION_RESUME = "app.lovable.svj.workout.RESUME";
  public static final String ACTION_STOP = "app.lovable.svj.workout.STOP";

  public static final String EXTRA_ACTIVITY_ID = "activityId";
  public static final String EXTRA_ACTIVITY_TYPE = "activityType";
  public static final String EXTRA_TITLE = "title";
  public static final String EXTRA_AUTO_PAUSE = "autoPause";
  private String ownerId = "";
  private NativeWorkoutJournal journal;

  private static final String PREFS = "svj_workout";
  private static final String KEY_ACTIVE = "active";
  private static final String KEY_ACTIVITY_ID = "activity_id";
  private static final String KEY_ACTIVITY_TYPE = "activity_type";
  private static final String KEY_TITLE = "title";
  private static final String KEY_PAUSED = "paused";
  private static final String KEY_STARTED_AT = "started_at";
  private static final String KEY_POINT_COUNT = "point_count";
  private static final String KEY_LAST_FIX_AT = "last_fix_at";
  private static final String KEY_LAST_LAT = "last_lat";
  private static final String KEY_LAST_LNG = "last_lng";
  private static final String KEY_LAST_ACCURACY = "last_accuracy";
  private static final String KEY_LAST_ALTITUDE = "last_altitude";
  private static final String KEY_AUTO_PAUSE = "auto_pause";

  private static final String CHANNEL_ID = "svj_workout";
  private static final int NOTIFICATION_ID = 8471;
  private static final long MIN_TIME_MS = 2000L;
  private static final float MIN_DISTANCE_M = 3f;

  /** Registered observers (the Capacitor plugin). Same process, no binding. */
  public interface Listener {
    void onLocationSample(Location location);

    void onStateChanged();
  }

  private static final CopyOnWriteArrayList<Listener> LISTENERS = new CopyOnWriteArrayList<>();

  public static void addListener(Listener listener) {
    if (listener != null && !LISTENERS.contains(listener)) LISTENERS.add(listener);
  }

  public static void removeListener(Listener listener) {
    LISTENERS.remove(listener);
  }

  private final Handler main = new Handler(Looper.getMainLooper());

  private LocationManager locationManager;

  private boolean active = false;
  private boolean paused = false;
  private boolean autoPause = true;
  private String activityId = "";
  private String activityType = "";
  private String title = "SVJ is recording your activity";
  private long startedAtMs = 0L;
  private long lastFixAtMs = 0L;
  private int pointCount = 0;

  @Nullable
  private LocationListener locationListener;

  // ── Static control surface (used by the plugin) ──────────────────────────

  public static void start(Context context, String activityId, String activityType,
                           String title, boolean autoPause) {
    start(context, activityId, activityType, title, autoPause, "", 0L, null);
  }

  public static void start(Context context, String activityId, String activityType,
                           String title, boolean autoPause, String ownerId, long startedAtMs, android.os.ResultReceiver callback) {
    Intent intent = new Intent(context, VjWorkoutService.class);
    intent.setAction(ACTION_START);
    intent.putExtra(EXTRA_ACTIVITY_ID, activityId);
    intent.putExtra(EXTRA_ACTIVITY_TYPE, activityType);
    intent.putExtra(EXTRA_TITLE, title);
    intent.putExtra(EXTRA_AUTO_PAUSE, autoPause);
    intent.putExtra("ownerId", ownerId);
    intent.putExtra("startedAtMs", startedAtMs);
    intent.putExtra("callback", callback);
    ContextCompat.startForegroundService(context, intent);
  }

  public static void pause(Context context) {
    sendAction(context, ACTION_PAUSE);
  }

  public static void resume(Context context) {
    sendAction(context, ACTION_RESUME);
  }

  public static void stop(Context context) {
    sendAction(context, ACTION_STOP);
  }

  public static void sendAction(Context context, String action, android.os.ResultReceiver callback) {
      sendAction(context, action, prefs(context).getString("owner_id", ""), prefs(context).getString("activity_id", ""), callback);
  }

  public static void sendAction(Context context, String action, String owner, String id, android.os.ResultReceiver callback) {
      Intent intent = new Intent(context, VjWorkoutService.class);
      intent.setAction(action);
      intent.putExtra("callback", callback);
      intent.putExtra("ownerId", owner);
      intent.putExtra(EXTRA_ACTIVITY_ID, id);
      context.startService(intent);
  }

  private static void sendAction(Context context, String action) { sendAction(context, action, null); }

  /** Persisted snapshot, readable without binding to the service. */
  public static SharedPreferences prefs(Context context) {
    return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  public static void clearState(Context context) {
    if (!prefs(context).edit().clear().commit()) throw new IllegalStateException("Device storage unavailable");
  }

  /** Last fix retained for WebView/plugin reattachment. Never starts collection. */
  @Nullable
  public static Location lastLocation(Context context) {
    SharedPreferences store = prefs(context);
    if (!store.getBoolean(KEY_ACTIVE, false)) return null;
    if (!store.contains(KEY_LAST_LAT) || !store.contains(KEY_LAST_LNG)) return null;
    Location location = new Location("svj-cache");
    location.setLatitude(Double.longBitsToDouble(store.getLong(KEY_LAST_LAT, 0L)));
    location.setLongitude(Double.longBitsToDouble(store.getLong(KEY_LAST_LNG, 0L)));
    location.setTime(store.getLong(KEY_LAST_FIX_AT, 0L));
    if (store.contains(KEY_LAST_ACCURACY)) location.setAccuracy(store.getFloat(KEY_LAST_ACCURACY, 0f));
    if (store.contains(KEY_LAST_ALTITUDE)) {
      location.setAltitude(Double.longBitsToDouble(store.getLong(KEY_LAST_ALTITUDE, 0L)));
    }
    return location;
  }

  // ── Service lifecycle ───────────────────────────────────────────────────

  @Override
  public void onCreate() {
    super.onCreate();
    locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
    journal = new NativeWorkoutJournal(this);
    // A restarted service (START_STICKY after a process kill) restores the same
    // workout rather than inventing a new one.
    restoreFromPrefs();
    // A newly created service is recovered paused. Only a foreground command resumes it.
    if (active) { active = false; paused = true; }
    steps.total = prefs(this).getLong("step_total", 0);
    running = this;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    android.os.ResultReceiver callback = intent == null ? null : (android.os.ResultReceiver)intent.getParcelableExtra("callback");
    try {
    String action = intent != null ? intent.getAction() : null;
    if (action != null && !ACTION_START.equals(action) && (!ownerId.equals(intent.getStringExtra("ownerId")) || !activityId.equals(intent.getStringExtra(EXTRA_ACTIVITY_ID)))) {
      if (callback != null) { Bundle failure = new Bundle(); failure.putString("error", "This command belongs to another recording."); callback.send(1, failure); }
      if (!active) stopSelf();
      return active ? START_STICKY : START_NOT_STICKY;
    }
    if (ACTION_START.equals(action) && active && (!activityId.equals(intent.getStringExtra(EXTRA_ACTIVITY_ID)) || !ownerId.equals(intent.getStringExtra("ownerId")))) {
      if (callback != null) { Bundle failure = new Bundle(); failure.putString("error", "Finish the active workout first."); callback.send(1, failure); }
      return START_STICKY;
    }
    if (ACTION_START.equals(action)) {
      handleStart(intent);
    } else if (ACTION_PAUSE.equals(action)) {
      handlePause();
    } else if (ACTION_RESUME.equals(action)) {
      handleResume();
    } else if (ACTION_STOP.equals(action)) {
      handleStop();
      if (callback != null) callback.send(0, new Bundle());
      return START_NOT_STICKY;
    } else if (action == null) {
      active = false; paused = true; persist(); stopSelf(); return START_NOT_STICKY;
    }
    if (callback != null) callback.send(0, new Bundle());
    return START_STICKY;
    } catch (Exception error) {
      stopLocationUpdates(); stopStepUpdates(); active = false; paused = true;
      try { if (!ownerId.isEmpty() && !activityId.isEmpty()) journal.append(ownerId, activityId, "pause", System.currentTimeMillis(), new com.getcapacitor.JSObject()); } catch (Exception ignored) {}
      prefs(this).edit().putBoolean(KEY_ACTIVE, false).putBoolean(KEY_PAUSED, true).putString("last_error", "Recording paused. Check location permission and device storage.").commit();
      if (callback != null) { Bundle failure = new Bundle(); failure.putString("error", "Could not confirm recording command. Check location permission and storage."); callback.send(1, failure); }
      dispatchStateChanged(); ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE); stopSelf(); return START_NOT_STICKY;
    }
  }

  private void handleStart(Intent intent) {
    boolean alreadySame = active && activityId.equals(intent.getStringExtra(EXTRA_ACTIVITY_ID)) && ownerId.equals(intent.getStringExtra("ownerId"));
    if (alreadySame) {
      // Idempotent: a repeated START must not reset the workout or its counter.
      startForegroundNotification();
      dispatchStateChanged();
      return;
    }
    if (active) throw new IllegalStateException("Finish the active workout first.");
    if (!activityId.isEmpty() && !activityId.equals(intent.getStringExtra(EXTRA_ACTIVITY_ID)) && prefs(this).getBoolean("unfinished", false)) throw new IllegalStateException("Save or discard the recovered workout first.");
    // A previous workout that was never stopped is replaced, never merged.
    stopLocationUpdates();

    String id = intent.getStringExtra(EXTRA_ACTIVITY_ID);
    String type = intent.getStringExtra(EXTRA_ACTIVITY_TYPE);
    String label = intent.getStringExtra(EXTRA_TITLE);
    activityId = id != null ? id : "";
    activityType = type != null ? type : "";
    if (label != null && !label.trim().isEmpty()) title = label;
    autoPause = intent.getBooleanExtra(EXTRA_AUTO_PAUSE, true);
    ownerId = intent.getStringExtra("ownerId");
    if (ownerId == null || ownerId.isEmpty()) throw new IllegalArgumentException("Signed-in account required.");
    startedAtMs = intent.getLongExtra("startedAtMs", System.currentTimeMillis());
    lastFixAtMs = 0L;
    pointCount = 0;
    steps.total = 0; steps.pause();
    paused = false;
    active = true;
    com.getcapacitor.JSObject header = new com.getcapacitor.JSObject();
    header.put("activityType", activityType); header.put("startedAtMs", startedAtMs);
    journal.append(ownerId, activityId, "start", startedAtMs, header);
    prefs(this).edit().putString("owner_id", ownerId).remove("last_error").commit();
    persist();
    startForegroundNotification();
    beginLocationUpdates();
    beginStepUpdates();
    dispatchStateChanged();
  }

  private void handlePause() {
    if (!active || paused) return;
    paused = true;
    stopLocationUpdates();
    stopStepUpdates();
    journal.append(ownerId, activityId, "pause", System.currentTimeMillis(), new com.getcapacitor.JSObject());
    persist();
    updateNotification();
    dispatchStateChanged();
  }

  private void handleResume() {
    if (active && !paused) return;
    if (activityId.isEmpty() || ownerId.isEmpty() || !prefs(this).getBoolean("unfinished", false)) throw new IllegalStateException("No unfinished workout to resume.");
    active = true;
    paused = false;
    journal.append(ownerId, activityId, "resume", System.currentTimeMillis(), new com.getcapacitor.JSObject());
    persist();
    startForegroundNotification();
    beginLocationUpdates();
    beginStepUpdates();
    dispatchStateChanged();
  }

  private void handleStop() {
    stopLocationUpdates();
    stopStepUpdates();
    boolean wasActive = active;
    if (!activityId.isEmpty() && prefs(this).getBoolean("unfinished", false)) {
      journal.append(ownerId, activityId, "end", System.currentTimeMillis(), new com.getcapacitor.JSObject());
      if (!prefs(this).edit().putBoolean("unfinished", false).commit()) throw new IllegalStateException("Device storage unavailable");
    }
    active = false;
    paused = false;
    // Retain metadata and journal until canonical save or explicit discard.
    persist();
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
    // No "active: false" broadcast here: an explicit stop is expected, and the
    // recorder must not treat it as an unexpected service death.
    if (wasActive) dispatchStateChanged();
    stopSelf();
  }

  @Override
  public void onDestroy() {
    stopLocationUpdates();
    stopStepUpdates();
    if (active) persist();
    if (running == this) running = null;
    journal.close();
    super.onDestroy();
  }

  @Nullable
  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  // ── Location ────────────────────────────────────────────────────────────

  private void beginLocationUpdates() {
    if (locationManager == null || locationListener != null) return;
    locationListener = new LocationListener() {
      @Override
      public void onLocationChanged(Location location) {
        onFix(location);
      }

      @Override
      public void onStatusChanged(String provider, int status, Bundle extras) {}

      @Override
      public void onProviderEnabled(String provider) {}

      @Override
      public void onProviderDisabled(String provider) {}
    };
    boolean registered = false;
    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
        != PackageManager.PERMISSION_GRANTED) {
      Log.w(TAG, "Fine location permission is not available");
    } else {
      try {
        if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
          locationManager.requestLocationUpdates(
              LocationManager.GPS_PROVIDER, MIN_TIME_MS, MIN_DISTANCE_M,
              locationListener, Looper.getMainLooper());
          registered = true;
        }
      } catch (SecurityException e) {
        Log.w(TAG, "GPS permission was revoked", e);
      } catch (IllegalArgumentException e) {
        Log.w(TAG, "GPS provider unavailable", e);
      }
    }
    if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
        != PackageManager.PERMISSION_GRANTED) {
      Log.w(TAG, "Coarse location permission is not available");
    } else {
      try {
        if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
          locationManager.requestLocationUpdates(
              LocationManager.NETWORK_PROVIDER, MIN_TIME_MS, MIN_DISTANCE_M,
              locationListener, Looper.getMainLooper());
          registered = true;
        }
      } catch (SecurityException e) {
        Log.w(TAG, "Network location permission was revoked", e);
      } catch (IllegalArgumentException e) {
        Log.w(TAG, "Network provider unavailable", e);
      }
    }
    if (!registered) {
      locationListener = null;
      throw new IllegalStateException("Enable location services and allow location permission.");
    }

    // LocationManager does not guarantee that the first callback arrives
    // promptly. Seed the UI with a recent provider fix while a fresh GPS fix is
    // acquired, otherwise the map can remain blank for minutes on some OEMs.
    Location seed = newestRecentLastKnownLocation();
    if (seed != null) {
      main.post(() -> onFix(seed));
    }
  }

  @Nullable
  private Location newestRecentLastKnownLocation() {
    if (locationManager == null) return null;
    Location newest = null;
    String[] providers = {LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER,
        LocationManager.PASSIVE_PROVIDER};
    for (String provider : providers) {
      try {
        Location candidate = locationManager.getLastKnownLocation(provider);
        if (candidate != null && (newest == null || candidate.getTime() > newest.getTime())) {
          newest = candidate;
        }
      } catch (SecurityException | IllegalArgumentException e) {
        Log.w(TAG, "Could not read last location from " + provider, e);
      }
    }
    // Do not draw a stale position from an earlier trip.
    if (newest == null || System.currentTimeMillis() - newest.getTime() > 5 * 60_000L) return null;
    return newest;
  }

  private void stopLocationUpdates() {
    if (locationManager != null && locationListener != null) {
      try {
        locationManager.removeUpdates(locationListener);
      } catch (Exception e) {
        Log.w(TAG, "removeUpdates failed", e);
      }
    }
    locationListener = null;
  }

  private void onFix(Location location) {
    if (!active || paused || location == null) return;
    if (location.getTime() < startedAtMs || location.getTime() <= lastFixAtMs) return;
    try {
      com.getcapacitor.JSObject point = new com.getcapacitor.JSObject();
      point.put("lat", location.getLatitude()); point.put("lng", location.getLongitude());
      if (location.hasAccuracy()) point.put("accuracy", location.getAccuracy());
      if (location.hasAltitude()) point.put("elevation", location.getAltitude());
      journal.append(ownerId, activityId, "point", location.getTime(), point);
    } catch (Exception e) {
      stopLocationUpdates(); active = false; paused = true;
      prefs(this).edit().putBoolean(KEY_ACTIVE, false).putBoolean(KEY_PAUSED, true).putString("last_error", "Storage is full. Your recorded route is retained.").commit(); dispatchStateChanged(); return;
    }
    pointCount += 1;
    lastFixAtMs = location.getTime();
    SharedPreferences.Editor editor = prefs(this).edit()
        .putInt(KEY_POINT_COUNT, pointCount)
        .putLong(KEY_LAST_FIX_AT, location.getTime())
        .putLong(KEY_LAST_LAT, Double.doubleToRawLongBits(location.getLatitude()))
        .putLong(KEY_LAST_LNG, Double.doubleToRawLongBits(location.getLongitude()));
    if (location.hasAccuracy()) editor.putFloat(KEY_LAST_ACCURACY, location.getAccuracy());
    if (location.hasAltitude()) {
      editor.putLong(KEY_LAST_ALTITUDE, Double.doubleToRawLongBits(location.getAltitude()));
    }
    editor.apply();
    for (Listener listener : LISTENERS) {
      try {
        listener.onLocationSample(location);
      } catch (Exception e) {
        Log.w(TAG, "Listener failed on location sample", e);
      }
    }
  }

  private void beginStepUpdates() {
    if (stepListener != null || (Build.VERSION.SDK_INT >= 29 && checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED)) return;
    stepManager = (android.hardware.SensorManager)getSystemService(SENSOR_SERVICE);
    android.hardware.Sensor sensor = stepManager == null ? null : stepManager.getDefaultSensor(android.hardware.Sensor.TYPE_STEP_COUNTER);
    if (sensor == null) return;
    steps.pause();
    stepListener = new android.hardware.SensorEventListener() {
      public void onAccuracyChanged(android.hardware.Sensor sensor, int accuracy) {}
      public void onSensorChanged(android.hardware.SensorEvent event) {
        if (!active || paused || !Float.isFinite(event.values[0])) return;
        if (!steps.accept((long)event.values[0], event.timestamp)) return;
        try {
          com.getcapacitor.JSObject value = new com.getcapacitor.JSObject(); value.put("steps", steps.total);
          long at = System.currentTimeMillis() - (android.os.SystemClock.elapsedRealtimeNanos() - event.timestamp) / 1000000;
          journal.append(ownerId, activityId, "steps", at, value);
          persist(); dispatchStateChanged();
        } catch (Exception e) { stopStepUpdates(); prefs(VjWorkoutService.this).edit().putString("last_error", "Workout steps paused: check device storage.").commit(); dispatchStateChanged(); }
      }
    };
    if (!stepManager.registerListener(stepListener, sensor, android.hardware.SensorManager.SENSOR_DELAY_NORMAL)) stepListener = null;
  }
  private void stopStepUpdates() {
    if (stepManager != null && stepListener != null) stepManager.unregisterListener(stepListener);
    stepListener = null; steps.pause();
  }

  // ── Notification ────────────────────────────────────────────────────────

  private void startForegroundNotification() {
    ensureChannel();
    int type = 0;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      type = ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
      if (Build.VERSION.SDK_INT >= 34 && checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH;
    }
    try {
      ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type);
    } catch (Exception e) {
      throw new IllegalStateException("Could not start recording notification", e);
    }
  }

  private void updateNotification() {
    try {
      NotificationManager manager =
          (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification());
    } catch (Exception e) {
      Log.w(TAG, "notify failed", e);
    }
  }

  private Notification buildNotification() {
    PendingIntent contentIntent = null;
    try {
      Intent launch = new Intent(this, MainActivity.class);
      launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
      int flags = PendingIntent.FLAG_UPDATE_CURRENT;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        flags |= PendingIntent.FLAG_IMMUTABLE;
      }
      contentIntent = PendingIntent.getActivity(this, 0, launch, flags);
    } catch (Exception e) {
      Log.w(TAG, "PendingIntent failed", e);
    }

    NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_workout)
        .setContentTitle(title)
        .setContentText(paused ? "Paused — tap to resume in SVJ" : "Recording your route")
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setCategory(NotificationCompat.CATEGORY_SERVICE);
    if (contentIntent != null) builder.setContentIntent(contentIntent);
    return builder.build();
  }

  private void ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    try {
      NotificationManager manager =
          (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (manager == null) return;
      if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
      NotificationChannel channel = new NotificationChannel(
          CHANNEL_ID, "SVJ activity recording", NotificationManager.IMPORTANCE_LOW);
      channel.setDescription("Shown while SVJ records your activity.");
      manager.createNotificationChannel(channel);
    } catch (Exception e) {
      Log.w(TAG, "createNotificationChannel failed", e);
    }
  }

  // ── Persistence + dispatch ──────────────────────────────────────────────

  private void persist() {
    boolean saved = prefs(this).edit()
        .putBoolean(KEY_ACTIVE, active)
        .putString(KEY_ACTIVITY_ID, activityId)
        .putString(KEY_ACTIVITY_TYPE, activityType)
        .putString(KEY_TITLE, title)
        .putBoolean(KEY_PAUSED, paused)
        .putBoolean(KEY_AUTO_PAUSE, autoPause)
        .putLong(KEY_STARTED_AT, startedAtMs)
        .putInt(KEY_POINT_COUNT, pointCount)
        .putLong(KEY_LAST_FIX_AT, lastFixAtMs)
        .putLong("step_total", steps.total)
        .putString("owner_id", ownerId)
        .putBoolean("unfinished", active || paused || prefs(this).getBoolean("unfinished", false))
        .commit();
    if (!saved) throw new IllegalStateException("Device storage is unavailable");
  }

  private void restoreFromPrefs() {
    ownerId = prefs(this).getString("owner_id", "");
    SharedPreferences store = prefs(this);
    active = store.getBoolean(KEY_ACTIVE, false);
    paused = store.getBoolean(KEY_PAUSED, false);
    autoPause = store.getBoolean(KEY_AUTO_PAUSE, true);
    activityId = store.getString(KEY_ACTIVITY_ID, "");
    activityType = store.getString(KEY_ACTIVITY_TYPE, "");
    String storedTitle = store.getString(KEY_TITLE, null);
    if (storedTitle != null && !storedTitle.trim().isEmpty()) title = storedTitle;
    startedAtMs = store.getLong(KEY_STARTED_AT, 0L);
    pointCount = store.getInt(KEY_POINT_COUNT, 0);
    lastFixAtMs = store.getLong(KEY_LAST_FIX_AT, 0L);
  }

  private void dispatchStateChanged() {
    main.post(() -> {
      for (Listener listener : LISTENERS) {
        try {
          listener.onStateChanged();
        } catch (Exception e) {
          Log.w(TAG, "Listener failed on state change", e);
        }
      }
    });
  }
}
