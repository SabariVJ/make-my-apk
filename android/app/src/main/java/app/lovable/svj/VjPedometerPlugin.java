package app.lovable.svj;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
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
 * Android step source for SVJ, with an automatic sensor hierarchy:
 *
 *   1. TYPE_STEP_COUNTER - hardware step counter (cumulative).
 *   2. TYPE_STEP_DETECTOR - one event per detected step.
 *   3. TYPE_ACCELEROMETER - software step detection (estimated).
 *
 * Exactly one mode is active at a time, so a physical step is never counted
 * twice. Registering this plugin happens in MainActivity (app-local plugin).
 */
@CapacitorPlugin(
    name = "VjPedometer",
    permissions = {
        @Permission(strings = {android.Manifest.permission.ACTIVITY_RECOGNITION}, alias = "activityRecognition")
    }
)
public class VjPedometerPlugin extends Plugin implements SensorEventListener {

    private static final String TAG = "VjPedometer";
    private static final String PREFS = "svj_pedometer";
    private static final String KEY_MODE = "mode";
    private static final String KEY_FIRST_RAW = "first_raw";
    private static final String KEY_LAST_RAW = "last_raw";
    private static final String KEY_DAILY_STEPS = "daily_steps";
    private static final String KEY_GUARDED_LAST_RAW = "guarded_last_raw";
    private static final String KEY_START_DATE_MS = "start_date_ms";
    private static final String KEY_LAST_EVENT_MS = "last_event_ms";
    private static final String KEY_LAST_ERROR = "last_error";

    public static final String MODE_COUNTER = "counter";
    public static final String MODE_DETECTOR = "detector";
    public static final String MODE_ACCELEROMETER = "accelerometer";
    public static final String MODE_NONE = "none";

    private final Object lock = new Object();
    private final AccelStepDetector accelDetector = new AccelStepDetector();

    private SensorManager sensorManager;
    private Sensor selectedSensor;
    private int selectedSensorType = -1;
    private String selectedMode = MODE_NONE;
    private boolean sensorAvailable = false;

    private boolean listenerRegistered = false;
    private boolean sensorStarted = false;

    /**
     * User-controlled tracking. The sensor listener only exists between an
     * explicit startUpdates() (START TRACKING) and stopUpdates()/pause/destroy.
     * There is no foreground service, no polling, and no automatic restart.
     */
    private boolean trackingRequested = false;
    private boolean listenerRemoved = false;
    private long sessionBaselineRaw = -1;
    private long sessionCarrySteps = 0;
    private long sessionSteps = 0;
    private long trackedDayBase = 0;
    private long sessionStartedMs = -1;
    private long sessionStoppedMs = -1;

    private long firstRaw = -1;
    private long lastRaw = -1;
    private long dailySteps = 0;
    private long guardedLastRaw = -1;
    private long startDateMs = -1;
    private long lastEventMs = -1;
    private String lastError = null;

    private int ownedSteps = 0;
    private long lastStepAtMs = -1;
    private int accelEvents = 0;

    @Override
    public void load() {
        Log.d(TAG, "load()");
        Context context = getContext();
        if (context == null) {
            Log.w(TAG, "Context is null in load()");
            setLastError("Context is null in load()");
            return;
        }

        sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager == null) {
            Log.w(TAG, "SensorManager unavailable");
            setLastError("SensorManager unavailable on this device.");
            return;
        }
        Log.d(TAG, "SensorManager obtained");
        try {
            selectBestSensor();
        } catch (Exception e) {
            Log.w(TAG, "Sensor selection failed", e);
            setLastError("Sensor selection failed: " + e.getMessage());
        }
    }

    /**
     * Sensor priority: counter -> detector -> accelerometer. The first sensor the
     * device actually reports wins; nothing is hard-coded per device.
     */
    private void selectBestSensor() {
        Sensor counter = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        Sensor detector = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);
        Sensor accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);

        Log.d(TAG, "Sensors: counter=" + describe(counter) + " detector=" + describe(detector) + " accelerometer=" + describe(accelerometer));

        if (counter != null) {
            selectedSensor = counter;
            selectedSensorType = Sensor.TYPE_STEP_COUNTER;
            selectedMode = MODE_COUNTER;
            sensorAvailable = true;
            Log.i(TAG, "Selected TYPE_STEP_COUNTER: " + describe(counter));
            return;
        }
        if (detector != null) {
            selectedSensor = detector;
            selectedSensorType = Sensor.TYPE_STEP_DETECTOR;
            selectedMode = MODE_DETECTOR;
            sensorAvailable = true;
            Log.i(TAG, "Selected TYPE_STEP_DETECTOR: " + describe(detector));
            return;
        }
        if (accelerometer != null) {
            selectedSensor = accelerometer;
            selectedSensorType = Sensor.TYPE_ACCELEROMETER;
            selectedMode = MODE_ACCELEROMETER;
            sensorAvailable = true;
            Log.i(TAG, "Selected TYPE_ACCELEROMETER (estimated): " + describe(accelerometer));
            return;
        }

        selectedSensor = null;
        selectedSensorType = -1;
        selectedMode = MODE_NONE;
        sensorAvailable = false;
        Log.w(TAG, "No compatible step sensor found");
    }

    private static String describe(Sensor sensor) {
        if (sensor == null) return "null";
        return sensor.getName() + " / " + sensor.getVendor() + " / v" + sensor.getVersion();
    }

    private int sensorDelayForMode() {
        // The accelerometer fallback needs a much higher sample rate than the
        // dedicated step sensors.
        return selectedSensorType == Sensor.TYPE_ACCELEROMETER
            ? SensorManager.SENSOR_DELAY_GAME
            : SensorManager.SENSOR_DELAY_NORMAL;
    }

    private boolean isDebuggable() {
        try {
            Context context = getContext();
            if (context == null) return false;
            ApplicationInfo info = context.getApplicationInfo();
            return (info.flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        } catch (Exception e) {
            return false;
        }
    }

    private void loadPersistedState() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        dailySteps = prefs.getLong(KEY_DAILY_STEPS, 0);
        firstRaw = prefs.getLong(KEY_FIRST_RAW, -1);
        lastRaw = prefs.getLong(KEY_LAST_RAW, -1);
        guardedLastRaw = prefs.getLong(KEY_GUARDED_LAST_RAW, -1);
        startDateMs = prefs.getLong(KEY_START_DATE_MS, -1);
        lastEventMs = prefs.getLong(KEY_LAST_EVENT_MS, -1);
        lastError = prefs.getString(KEY_LAST_ERROR, null);
        Log.d(TAG, "Persisted state: mode=" + selectedMode + " dailySteps=" + dailySteps + " firstRaw=" + firstRaw + " lastRaw=" + lastRaw);
    }

    private void persistState() {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            prefs.edit()
                .putString(KEY_MODE, selectedMode)
                .putLong(KEY_FIRST_RAW, firstRaw)
                .putLong(KEY_LAST_RAW, lastRaw)
                .putLong(KEY_DAILY_STEPS, dailySteps)
                .putLong(KEY_GUARDED_LAST_RAW, guardedLastRaw)
                .putLong(KEY_START_DATE_MS, startDateMs)
                .putLong(KEY_LAST_EVENT_MS, lastEventMs)
                .putString(KEY_LAST_ERROR, lastError)
                .apply();
        } catch (Exception e) {
            Log.w(TAG, "Failed to persist pedometer state", e);
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("stepCounting", selectedSensorType == Sensor.TYPE_STEP_COUNTER);
        result.put("sensorManager", sensorManager != null);
        call.resolve(result);
    }

    @PluginMethod
    public void getSensorInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("mode", selectedMode);
        result.put("available", sensorAvailable);
        result.put("debug", isDebuggable());
        if (selectedSensor != null) {
            result.put("name", selectedSensor.getName());
            result.put("vendor", selectedSensor.getVendor());
            result.put("type", selectedSensorType);
        } else {
            result.put("name", "");
            result.put("vendor", "");
            result.put("type", -1);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("activityRecognition", activityRecognitionState());
        call.resolve(result);
    }

    private String activityRecognitionState() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return "granted";
        }
        PermissionState state = getPermissionState("activityRecognition");
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

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            PermissionState current = getPermissionState("activityRecognition");
            if (current != PermissionState.GRANTED) {
                requestPermissionForAlias("activityRecognition", call, "permCallback");
            } else {
                JSObject result = new JSObject();
                result.put("activityRecognition", "granted");
                call.resolve(result);
            }
        } else {
            JSObject result = new JSObject();
            result.put("activityRecognition", "granted");
            call.resolve(result);
        }
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("activityRecognition", activityRecognitionState());
        call.resolve(result);
    }

    @PluginMethod
    public void startUpdates(PluginCall call) {
        Log.d(TAG, "startUpdates() called (mode=" + selectedMode + ")");
        synchronized (lock) {
            if (sensorManager == null) {
                Log.w(TAG, "startUpdates() rejected: SensorManager unavailable");
                setLastError("SensorManager unavailable on this device.");
                call.reject("SensorManager unavailable on this device.");
                return;
            }
            if (!sensorAvailable || selectedSensor == null) {
                Log.w(TAG, "startUpdates() rejected: no compatible sensor");
                setLastError("No compatible step sensor found.");
                call.reject("No compatible step sensor found.");
                return;
            }

            String permission = activityRecognitionState();
            Log.d(TAG, "ACTIVITY_RECOGNITION permission=" + permission);
            if (!hasActivityRecognitionPermission()) {
                Log.w(TAG, "startUpdates() rejected: permission=" + permission);
                setLastError("Activity recognition permission not granted.");
                call.reject("Activity recognition permission not granted.");
                return;
            }

            // Exactly one listener: any stale registration is removed first.
            if (listenerRegistered) {
                Log.d(TAG, "startUpdates(): removing stale listener before re-registering");
                unregisterLocked("startUpdates-stale");
            }

            loadPersistedState();
            sensorStarted = false;
            listenerRegistered = false;

            boolean registered;
            try {
                // Never assume success: registerListener() returns a boolean.
                registered = sensorManager.registerListener(this, selectedSensor, sensorDelayForMode());
            } catch (Exception e) {
                Log.e(TAG, "registerListener threw", e);
                setLastError("registerListener failed: " + e.getMessage());
                call.reject("registerListener failed: " + e.getMessage());
                return;
            }

            Log.i(TAG, "registerListener(" + selectedMode + ") returned " + registered);
            if (!registered) {
                setLastError("registerListener returned false for " + selectedMode);
                call.reject("registerListener returned false for " + selectedMode);
                return;
            }

            long now = System.currentTimeMillis();
            // Fresh session: a new baseline is established, so steps taken
            // before START are never counted.
            if (startDateMs > 0 && startDateMs < dayStartMs(now)) {
                Log.i(TAG, "midnight rollover on session start");
                dailySteps = 0;
            }
            startDateMs = now;
            trackedDayBase = dailySteps;
            sessionBaselineRaw = -1;
            sessionCarrySteps = 0;
            sessionSteps = 0;
            sessionStartedMs = now;
            sessionStoppedMs = -1;
            accelDetector.reset();
            accelEvents = 0;
            ownedSteps = 0;

            trackingRequested = true;
            listenerRemoved = false;
            listenerRegistered = true;
            sensorStarted = true;
            lastError = null;
            Log.i(TAG, "tracking session started (mode=" + selectedMode + ", trackedDayBase=" + trackedDayBase + ")");
            persistState();
            call.resolve();
        }
    }

    @PluginMethod
    public void stopUpdates(PluginCall call) {
        Log.d(TAG, "stopUpdates() called");
        synchronized (lock) {
            unregisterLocked("stopUpdates");
            persistState();
            call.resolve();
        }
    }

    /**
     * Physically unregisters the SensorEventListener — events stop arriving at
     * the native layer, they are not merely ignored in JavaScript.
     */
    private void unregisterLocked(String reason) {
        if (sensorManager != null && listenerRegistered) {
            try {
                sensorManager.unregisterListener(this);
                Log.i(TAG, "unregisterListener() done (" + reason + ")");
            } catch (Exception e) {
                Log.w(TAG, "unregisterListener failed during " + reason, e);
            }
        }
        if (listenerRegistered || trackingRequested) {
            sessionStoppedMs = System.currentTimeMillis();
        }
        listenerRegistered = false;
        sensorStarted = false;
        trackingRequested = false;
        listenerRemoved = true;
        sessionBaselineRaw = -1;
        accelDetector.reset();
        accelEvents = 0;
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject result = new JSObject();
        synchronized (lock) {
            result.put("sensorAvailable", sensorAvailable);
            result.put("listenerRegistered", listenerRegistered);
            result.put("sensorStarted", sensorStarted);
            result.put("trackingRequested", trackingRequested);
            result.put("trackingActive", trackingRequested && listenerRegistered);
            result.put("listenerRemoved", listenerRemoved);
            result.put("sessionBaselineRaw", sessionBaselineRaw);
            result.put("sessionSteps", sessionSteps);
            result.put("sessionStartedMs", sessionStartedMs);
            result.put("sessionStoppedMs", sessionStoppedMs);
            result.put("mode", selectedMode);
            result.put("firstRaw", firstRaw);
            result.put("lastRaw", lastRaw);
            result.put("dailySteps", dailySteps);
            result.put("guardedLastRaw", guardedLastRaw);
            result.put("startDateMs", startDateMs);
            result.put("lastEventMs", lastEventMs);
            result.put("lastError", lastError != null ? lastError : "");
            result.put("debug", isDebuggable());
            if (selectedSensor != null) {
                result.put("sensorName", selectedSensor.getName());
                result.put("sensorVendor", selectedSensor.getVendor());
            } else {
                result.put("sensorName", "");
                result.put("sensorVendor", "");
            }
        }
        call.resolve(result);
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor == null || event.values == null) {
            return;
        }
        long now = System.currentTimeMillis();
        int type = event.sensor.getType();
        if (selectedSensorType != type) {
            return;
        }
        switch (type) {
            case Sensor.TYPE_STEP_COUNTER:
                handleCounterEvent(now, event);
                break;
            case Sensor.TYPE_STEP_DETECTOR:
                handleDetectorEvent(now, event);
                break;
            case Sensor.TYPE_ACCELEROMETER:
                handleAccelerometerEvent(now, event);
                break;
            default:
                break;
        }
    }

    private void handleCounterEvent(long now, SensorEvent event) {
        if (!listenerRegistered) return;
        if (event.values.length < 1) return;
        long raw = (long) event.values[0];
        Log.d(TAG, "counter event raw=" + raw);

        synchronized (lock) {
            if (firstRaw < 0) {
                firstRaw = raw;
                startDateMs = now;
                Log.i(TAG, "first raw sensor value=" + raw);
            }

            // Device reboot / counter reset.
            if (guardedLastRaw >= 0 && raw < guardedLastRaw) {
                Log.w(TAG, "counter reset detected: guarded=" + guardedLastRaw + " raw=" + raw);
                firstRaw = raw;
                startDateMs = now;
                guardedLastRaw = raw;
            }

            lastRaw = raw;
            if (guardedLastRaw < 0 || raw > guardedLastRaw) {
                guardedLastRaw = raw;
            }

            if (startDateMs > 0) {
                long dayStart = dayStartMs(now);
                if (startDateMs < dayStart) {
                    Log.i(TAG, "midnight rollover: start=" + startDateMs + " dayStart=" + dayStart);
                    startDateMs = dayStart;
                    firstRaw = raw;
                }
                dailySteps = Math.max(0, raw - firstRaw);
                Log.d(TAG, "calculated dailySteps=" + dailySteps + " (raw=" + raw + " baseline=" + firstRaw + ")");
            }

            lastEventMs = now;
            persistState();
            emitMeasurement(now, raw, dailySteps);
        }
    }

    private void handleDetectorEvent(long now, SensorEvent event) {
        if (!listenerRegistered) return;
        if (event.values.length < 1) return;
        boolean stepDetected = event.values[0] == 1.0f;
        if (!stepDetected) return;

        synchronized (lock) {
            long dayStart = dayStartMs(now);
            if (startDateMs < dayStart) {
                Log.i(TAG, "midnight rollover for detector");
                startDateMs = dayStart;
                dailySteps = 0;
            }
            if (startDateMs < 0) startDateMs = now;
            dailySteps += 1;
            lastEventMs = now;
            Log.d(TAG, "detector step -> dailySteps=" + dailySteps);
            persistState();
            // rawValue stays 1: each detector event is exactly one step.
            emitMeasurement(now, 1, dailySteps);
        }
    }

    private void handleAccelerometerEvent(long now, SensorEvent event) {
        if (!listenerRegistered) return;
        if (event.values.length < 3) return;

        boolean step = false;
        synchronized (lock) {
            accelEvents += 1;
            step = accelDetector.onSample(event.values[0], event.values[1], event.values[2], now);
            if (step) {
                long dayStart = dayStartMs(now);
                if (startDateMs < dayStart) {
                    Log.i(TAG, "midnight rollover for accelerometer");
                    startDateMs = dayStart;
                    dailySteps = 0;
                }
                if (startDateMs < 0) startDateMs = now;
                dailySteps += 1;
                ownedSteps += 1;
                lastStepAtMs = now;
                lastEventMs = now;
                lastRaw = dailySteps;
                persistState();
            }
        }

        if (step) {
            Log.d(TAG, "accelerometer step detected -> dailySteps=" + dailySteps + " (events=" + accelEvents + ")");
            synchronized (lock) {
                emitMeasurement(now, dailySteps, dailySteps);
            }
        }
    }

    private void emitMeasurement(long now, long rawValue, long steps) {
        JSObject payload = new JSObject();
        payload.put("mode", selectedMode);
        payload.put("timestamp", now);
        payload.put("rawValue", rawValue);
        payload.put("steps", steps);
        payload.put("sensorAvailable", sensorAvailable);
        payload.put("listenerRegistered", listenerRegistered);
        payload.put("sensorStarted", sensorStarted);
        payload.put("sensorName", selectedSensor != null ? selectedSensor.getName() : "");
        payload.put("sensorVendor", selectedSensor != null ? selectedSensor.getVendor() : "");
        payload.put("lastError", lastError != null ? lastError : "");
        notifyListeners("measurement", payload);
        Log.d(TAG, "emitted measurement mode=" + selectedMode + " raw=" + rawValue + " steps=" + steps);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // no-op
    }

    @Override
    public void handleOnPause() {
        Log.d(TAG, "handleOnPause()");
        synchronized (lock) {
            unregisterLocked("onPause");
        }
        super.handleOnPause();
    }

    @Override
    public void handleOnResume() {
        Log.d(TAG, "handleOnResume()");
        super.handleOnResume();
        synchronized (lock) {
            if (sensorManager == null || !sensorAvailable || selectedSensor == null) return;
            if (listenerRegistered) return;
            if (!hasActivityRecognitionPermission()) return;
            try {
                boolean registered = sensorManager.registerListener(this, selectedSensor, sensorDelayForMode());
                listenerRegistered = registered;
                sensorStarted = registered;
                Log.i(TAG, "re-registered on resume (" + selectedMode + ") -> " + registered);
            } catch (Exception e) {
                Log.w(TAG, "re-register on resume failed", e);
                setLastError("re-register on resume failed: " + e.getMessage());
            }
        }
    }

    @Override
    public void handleOnDestroy() {
        Log.d(TAG, "handleOnDestroy()");
        synchronized (lock) {
            unregisterLocked("onDestroy");
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void clearState(PluginCall call) {
        Log.d(TAG, "clearState() called");
        synchronized (lock) {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            prefs.edit()
                .putLong(KEY_FIRST_RAW, -1)
                .putLong(KEY_LAST_RAW, -1)
                .putLong(KEY_DAILY_STEPS, 0)
                .putLong(KEY_GUARDED_LAST_RAW, -1)
                .putLong(KEY_START_DATE_MS, -1)
                .putLong(KEY_LAST_EVENT_MS, -1)
                .putString(KEY_LAST_ERROR, null)
                .apply();
            firstRaw = -1;
            lastRaw = -1;
            dailySteps = 0;
            guardedLastRaw = -1;
            startDateMs = -1;
            lastEventMs = -1;
            lastError = null;
            ownedSteps = 0;
            lastStepAtMs = -1;
            accelEvents = 0;
            accelDetector.reset();
        }
        call.resolve();
    }

    private void setLastError(String message) {
        lastError = message;
        persistState();
    }

    private boolean hasActivityRecognitionPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return getPermissionState("activityRecognition") == PermissionState.GRANTED;
    }

    private static long dayStartMs(long nowMs) {
        long day = nowMs / 86400000;
        return day * 86400000;
    }
}
