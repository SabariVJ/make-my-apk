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

  public static final String TAG = "VjWorkout";

  public static final String ACTION_START = "app.lovable.svj.workout.START";
  public static final String ACTION_PAUSE = "app.lovable.svj.workout.PAUSE";
  public static final String ACTION_RESUME = "app.lovable.svj.workout.RESUME";
  public static final String ACTION_STOP = "app.lovable.svj.workout.STOP";

  public static final String EXTRA_ACTIVITY_ID = "activityId";
  public static final String EXTRA_ACTIVITY_TYPE = "activityType";
  public static final String EXTRA_TITLE = "title";
  public static final String EXTRA_AUTO_PAUSE = "autoPause";

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
    Intent intent = new Intent(context, VjWorkoutService.class);
    intent.setAction(ACTION_START);
    intent.putExtra(EXTRA_ACTIVITY_ID, activityId);
    intent.putExtra(EXTRA_ACTIVITY_TYPE, activityType);
    intent.putExtra(EXTRA_TITLE, title);
    intent.putExtra(EXTRA_AUTO_PAUSE, autoPause);
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

  private static void sendAction(Context context, String action) {
    try {
      Intent intent = new Intent(context, VjWorkoutService.class);
      intent.setAction(action);
      context.startService(intent);
    } catch (Exception e) {
      Log.w(TAG, "Could not deliver action " + action, e);
    }
  }

  /** Persisted snapshot, readable without binding to the service. */
  public static SharedPreferences prefs(Context context) {
    return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  public static void clearState(Context context) {
    prefs(context).edit().clear().apply();
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
    // A restarted service (START_STICKY after a process kill) restores the same
    // workout rather than inventing a new one.
    restoreFromPrefs();
    if (active) {
      startForegroundNotification();
      if (!paused) beginLocationUpdates();
    }
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String action = intent != null ? intent.getAction() : null;
    if (ACTION_START.equals(action)) {
      handleStart(intent);
    } else if (ACTION_PAUSE.equals(action)) {
      handlePause();
    } else if (ACTION_RESUME.equals(action)) {
      handleResume();
    } else if (ACTION_STOP.equals(action)) {
      handleStop();
      return START_NOT_STICKY;
    } else if (active) {
      // Restarted by the system without a command: keep the workout alive.
      startForegroundNotification();
      if (!paused) beginLocationUpdates();
    }
    return START_STICKY;
  }

  private void handleStart(Intent intent) {
    boolean alreadySame = active && activityId.equals(intent.getStringExtra(EXTRA_ACTIVITY_ID));
    if (alreadySame) {
      // Idempotent: a repeated START must not reset the workout or its counter.
      startForegroundNotification();
      dispatchStateChanged();
      return;
    }
    // A previous workout that was never stopped is replaced, never merged.
    stopLocationUpdates();

    String id = intent.getStringExtra(EXTRA_ACTIVITY_ID);
    String type = intent.getStringExtra(EXTRA_ACTIVITY_TYPE);
    String label = intent.getStringExtra(EXTRA_TITLE);
    activityId = id != null ? id : "";
    activityType = type != null ? type : "";
    if (label != null && !label.trim().isEmpty()) title = label;
    autoPause = intent.getBooleanExtra(EXTRA_AUTO_PAUSE, true);
    startedAtMs = System.currentTimeMillis();
    lastFixAtMs = 0L;
    pointCount = 0;
    paused = false;
    active = true;
    persist();
    startForegroundNotification();
    beginLocationUpdates();
    dispatchStateChanged();
  }

  private void handlePause() {
    if (!active || paused) return;
    paused = true;
    stopLocationUpdates();
    persist();
    updateNotification();
    dispatchStateChanged();
  }

  private void handleResume() {
    if (!active || !paused) return;
    paused = false;
    persist();
    updateNotification();
    beginLocationUpdates();
    dispatchStateChanged();
  }

  private void handleStop() {
    stopLocationUpdates();
    boolean wasActive = active;
    active = false;
    paused = false;
    activityId = "";
    activityType = "";
    pointCount = 0;
    startedAtMs = 0L;
    lastFixAtMs = 0L;
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
    if (active) persist();
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
      Log.w(TAG, "No location provider is enabled");
      return;
    }

    // LocationManager does not guarantee that the first callback arrives
    // promptly. Seed the UI with a recent provider fix while a fresh GPS fix is
    // acquired, otherwise the map can remain blank for minutes on some OEMs.
    Location seed = newestRecentLastKnownLocation();
    if (seed != null) {
      seed.setTime(System.currentTimeMillis());
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
    pointCount += 1;
    lastFixAtMs = System.currentTimeMillis();
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

  // ── Notification ────────────────────────────────────────────────────────

  private void startForegroundNotification() {
    ensureChannel();
    int type = 0;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      type = ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
    }
    try {
      ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type);
    } catch (Exception e) {
      Log.e(TAG, "startForeground failed", e);
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
    prefs(this).edit()
        .putBoolean(KEY_ACTIVE, active)
        .putString(KEY_ACTIVITY_ID, activityId)
        .putString(KEY_ACTIVITY_TYPE, activityType)
        .putString(KEY_TITLE, title)
        .putBoolean(KEY_PAUSED, paused)
        .putBoolean(KEY_AUTO_PAUSE, autoPause)
        .putLong(KEY_STARTED_AT, startedAtMs)
        .putInt(KEY_POINT_COUNT, pointCount)
        .putLong(KEY_LAST_FIX_AT, lastFixAtMs)
        .apply();
  }

  private void restoreFromPrefs() {
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
