package app.lovable.svj;

import android.Manifest;
import android.content.Context;
import android.location.Location;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Capacitor bridge for {@link VjWorkoutService}.
 *
 * <p>It exposes the native foreground service to JavaScript and forwards
 * location/state events. It owns no collection logic of its own: starting,
 * pausing, resuming and stopping all go through the service, so location is
 * only ever collected during an explicitly started workout.
 */
@CapacitorPlugin(
    name = "VjWorkout",
    permissions = {
        @Permission(
            strings = {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
            alias = "location"),
        @Permission(strings = {Manifest.permission.ACCESS_BACKGROUND_LOCATION}, alias = "backgroundLocation"),
        @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications")
    })
public class VjWorkoutPlugin extends Plugin implements VjWorkoutService.Listener {

  private static final String TAG = "VjWorkoutPlugin";

  private final Handler main = new Handler(Looper.getMainLooper());
  private boolean attached = false;

  @Override
  public void load() {
    VjWorkoutService.addListener(this);
    attached = true;
    Log.d(TAG, "load(): native workout listener attached");
  }

  @Override
  protected void handleOnDestroy() {
    if (attached) {
      VjWorkoutService.removeListener(this);
      attached = false;
    }
    super.handleOnDestroy();
  }

  // ── Availability + permissions ─────────────────────────────────────────

  @PluginMethod
  public void isAvailable(PluginCall call) {
    JSObject result = new JSObject();
    result.put("available", true);
    result.put("foregroundService", true);
    call.resolve(result);
  }

  @PluginMethod
  public void checkPermissions(PluginCall call) {
    call.resolve(permissionSnapshot());
  }

  @PluginMethod
  public void requestPermissions(PluginCall call) {
    // Background location is deliberately NOT requested here: a foreground
    // service with the location type is enough to record through a locked
    // screen, so SVJ asks only for what the workout actually needs.
    if (getPermissionState("location") != PermissionState.GRANTED) {
      requestPermissionForAlias("location", call, "locationPermCallback");
      return;
    }
    // Notification permission is requested separately by the notification
    // onboarding/feature. Location recording must not unexpectedly trigger an
    // unrelated permission dialog.
    call.resolve(permissionSnapshot());
  }

  @PermissionCallback
  private void locationPermCallback(PluginCall call) {
    call.resolve(permissionSnapshot());
  }

  private JSObject permissionSnapshot() {
    JSObject result = new JSObject();
    result.put("location", stateOf("location"));
    result.put("backgroundLocation", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        ? stateOf("backgroundLocation") : "unavailable");
    result.put("notifications", Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
        ? stateOf("notifications") : "granted");
    return result;
  }

  private String stateOf(String alias) {
    PermissionState state = getPermissionState(alias);
    if (state == null) return "prompt";
    switch (state) {
      case GRANTED:
        return "granted";
      case DENIED:
        return "denied";
      default:
        return "prompt";
    }
  }

  private boolean locationGranted() {
    return getPermissionState("location") == PermissionState.GRANTED;
  }

  // ── Workout control ─────────────────────────────────────────────────────

  @PluginMethod
  public void startWorkout(PluginCall call) {
    String activityId = call.getString("activityId");
    if (activityId == null || activityId.trim().isEmpty()) {
      call.reject("A stable activity id is required to start a workout.");
      return;
    }
    if (!locationGranted()) {
      call.reject("Location permission is required to record an activity.");
      return;
    }
    String activityType = call.getString("activityType", "running");
    String title = call.getString("title", "SVJ is recording your activity");
    boolean autoPause = Boolean.TRUE.equals(call.getBoolean("autoPause", true));

    try {
      VjWorkoutService.start(getContext(), activityId, activityType, title, autoPause);
      call.resolve(stateSnapshot());
    } catch (Exception e) {
      Log.e(TAG, "startWorkout failed", e);
      call.reject("Could not start the workout service: " + e.getMessage());
    }
  }

  @PluginMethod
  public void pauseWorkout(PluginCall call) {
    VjWorkoutService.pause(getContext());
    call.resolve(stateSnapshot());
  }

  @PluginMethod
  public void resumeWorkout(PluginCall call) {
    VjWorkoutService.resume(getContext());
    call.resolve(stateSnapshot());
  }

  @PluginMethod
  public void stopWorkout(PluginCall call) {
    VjWorkoutService.stop(getContext());
    call.resolve();
  }

  @PluginMethod
  public void getState(PluginCall call) {
    call.resolve(stateSnapshot());
  }

  @PluginMethod
  public void getLastLocation(PluginCall call) {
    Location location = VjWorkoutService.lastLocation(getContext());
    if (location == null) {
      call.resolve(new JSObject());
      return;
    }
    call.resolve(sampleOf(location));
  }

  @PluginMethod
  public void getBattery(PluginCall call) {
    JSObject result = new JSObject();
    Integer level = batteryPercent();
    if (level != null) result.put("level", level);
    call.resolve(result);
  }

  @PluginMethod
  public void clearWorkout(PluginCall call) {
    VjWorkoutService.clearState(getContext());
    call.resolve();
  }

  // ── Snapshots ───────────────────────────────────────────────────────────

  private JSObject stateSnapshot() {
    Context context = getContext();
    JSObject result = new JSObject();
    if (context == null) {
      result.put("active", false);
      result.put("activityId", "");
      result.put("activityType", "");
      result.put("startedAtMs", 0);
      result.put("paused", false);
      result.put("pointCount", 0);
      return result;
    }
    android.content.SharedPreferences store = VjWorkoutService.prefs(context);
    boolean active = store.getBoolean("active", false);
    String id = store.getString("activity_id", "");
    result.put("active", active);
    result.put("activityId", id != null ? id : "");
    result.put("activityType", store.getString("activity_type", ""));
    result.put("startedAtMs", store.getLong("started_at", 0L));
    result.put("paused", store.getBoolean("paused", false));
    result.put("pointCount", store.getInt("point_count", 0));
    result.put("lastFixAtMs", store.getLong("last_fix_at", 0L));
    return result;
  }

  private static JSObject sampleOf(Location location) {
    JSObject payload = new JSObject();
    payload.put("lat", location.getLatitude());
    payload.put("lng", location.getLongitude());
    payload.put("timestampMs", location.getTime());
    if (location.hasAccuracy()) payload.put("accuracy", location.getAccuracy());
    if (location.hasAltitude()) payload.put("elevation", location.getAltitude());
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasVerticalAccuracy()) {
      payload.put("verticalAccuracy", location.getVerticalAccuracyMeters());
    }
    return payload;
  }

  private Integer batteryPercent() {
    try {
      Context context = getContext();
      if (context == null) return null;
      BatteryManager manager =
          (BatteryManager) context.getSystemService(Context.BATTERY_SERVICE);
      if (manager == null) return null;
      int level = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
      // -1 (or an out-of-range value) means "unknown", not 0%.
      if (level < 0 || level > 100) return null;
      return level;
    } catch (Exception e) {
      Log.w(TAG, "battery read failed", e);
      return null;
    }
  }

  // ── Service listener ────────────────────────────────────────────────────

  @Override
  public void onLocationSample(Location location) {
    if (location == null) return;
    main.post(() -> notifyListeners("location", sampleOf(location)));
  }

  @Override
  public void onStateChanged() {
    main.post(() -> notifyListeners("workoutState", stateSnapshot()));
  }
}
