package app.lovable.svj;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * App-local notification bridge used by the existing JS notification planner.
 *
 * It owns only Android delivery/permission plumbing. The planner remains in
 * TypeScript, where notification content, quiet hours and user preferences are
 * already deterministic and test-covered.
 */
@CapacitorPlugin(
    name = "VjNotifications",
    permissions = {
        @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications")
    }
)
public class VjNotificationsPlugin extends Plugin {

    private static final String PREFS = "svj_notifications";
    private static final String KEY_IDS = "scheduled_ids";

    @Override
    public void load() {
        VjNotificationReceiver.ensureChannels(getContext());
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject out = new JSObject();
        out.put("granted", notificationsGranted());
        call.resolve(out);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (notificationsGranted() || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject out = new JSObject();
            out.put("granted", true);
            call.resolve(out);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject out = new JSObject();
        out.put("granted", notificationsGranted());
        call.resolve(out);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception first) {
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:" + getContext().getPackageName()))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception second) {
                call.reject("Could not open Android notification settings.");
            }
        }
    }

    @PluginMethod
    public void replaceSchedules(PluginCall call) {
        JSArray schedules = call.getArray("schedules");
        if (schedules == null) {
            call.reject("Missing schedules.");
            return;
        }

        cancelTrackedAlarms();

        Set<String> nextIds = new HashSet<>();
        int scheduled = 0;
        for (int i = 0; i < schedules.length(); i++) {
            JSONObject raw = schedules.optJSONObject(i);
            if (raw == null) continue;

            int id = raw.optInt("id", -1);
            long triggerAt = raw.optLong("triggerAt", -1L);
            String title = raw.optString("title", "");
            String body = raw.optString("body", "");
            String channel = raw.optString("channel", "progress");
            String target = raw.optString("target", "challenges");
            int repeatDays = Math.max(0, raw.optInt("repeatDays", 0));

            if (id < 0 || triggerAt <= System.currentTimeMillis() || title.isEmpty()) continue;

            VjNotificationReceiver.schedule(
                getContext(), id, triggerAt, title, body, channel, target, repeatDays);
            nextIds.add(String.valueOf(id));
            scheduled += 1;
        }

        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putStringSet(KEY_IDS, nextIds)
            .apply();

        JSObject out = new JSObject();
        out.put("scheduled", scheduled);
        call.resolve(out);
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        cancelTrackedAlarms();
        NotificationManager manager =
            (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancelAll();
        call.resolve();
    }

    @PluginMethod
    public void notifyNow(PluginCall call) {
        if (!notificationsGranted()) {
            call.reject("Notification permission not granted.");
            return;
        }
        int id = call.getInt("id", 9991);
        String title = call.getString("title", "SVJ");
        String body = call.getString("body", "");
        String channel = call.getString("channel", "progress");
        String target = call.getString("target", "profile");
        VjNotificationReceiver.post(getContext(), id, title, body, channel, target);
        call.resolve();
    }

    private boolean notificationsGranted() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return getPermissionState("notifications") == PermissionState.GRANTED;
    }

    private void cancelTrackedAlarms() {
        Set<String> ids = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getStringSet(KEY_IDS, new HashSet<>());
        AlarmManager alarmManager =
            (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            for (String value : ids) {
                try {
                    int id = Integer.parseInt(value);
                    alarmManager.cancel(VjNotificationReceiver.pendingIntent(getContext(), id, PendingIntent.FLAG_NO_CREATE));
                } catch (Exception ignored) {
                    // A stale/corrupt local id must never block notification cleanup.
                }
            }
        }
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_IDS)
            .apply();
    }
}
