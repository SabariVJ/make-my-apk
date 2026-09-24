package app.lovable.svj;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
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

import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(
    name = "VjNotifications",
    permissions = {
        @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications")
    }
)
public class VjNotificationsPlugin extends Plugin {
    static final String PREFS = "svj_notifications";
    static final String KEY_IDS = "scheduled_ids";

    @Override
    public void load() {
        createChannels(getContext());
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", permissionGranted());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || permissionGranted()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", permissionGranted());
        call.resolve(result);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open notification settings.", error);
        }
    }

    @PluginMethod
    public void notifyNow(PluginCall call) {
        if (!permissionGranted()) {
            call.reject("Notification permission is not granted.");
            return;
        }
        int id = call.getInt("id", 9991);
        String title = call.getString("title", "SVJ");
        String body = call.getString("body", "");
        String channel = call.getString("channel", "progress");
        String target = call.getString("target", "profile");
        VjNotificationReceiver.postNotification(getContext(), id, title, body, channel, target);
        call.resolve();
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        cancelStoredAlarms(getContext());
        NotificationManager manager =
            (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancelAll();
        call.resolve();
    }

    @PluginMethod
    public void replaceSchedules(PluginCall call) {
        cancelStoredAlarms(getContext());

        JSArray schedules = call.getArray("schedules");
        Set<String> ids = new HashSet<>();
        int scheduled = 0;

        if (schedules != null) {
            for (int i = 0; i < schedules.length(); i++) {
                try {
                    JSObject item = schedules.getJSObject(i);
                    if (item == null) continue;
                    int id = item.optInt("id", -1);
                    long triggerAt = item.optLong("triggerAt", 0L);
                    if (id < 0 || triggerAt <= 0L) continue;

                    String title = item.optString("title", "SVJ");
                    String body = item.optString("body", "");
                    String channel = item.optString("channel", "progress");
                    String target = item.optString("target", "challenges");
                    int repeatDays = Math.max(0, item.optInt("repeatDays", 0));

                    scheduleAlarm(
                        getContext(),
                        id,
                        Math.max(System.currentTimeMillis() + 1000L, triggerAt),
                        title,
                        body,
                        channel,
                        target,
                        repeatDays
                    );
                    ids.add(Integer.toString(id));
                    scheduled += 1;
                } catch (Exception ignored) {
                    // One malformed schedule must not prevent the valid reminders.
                }
            }
        }

        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putStringSet(KEY_IDS, ids)
            .apply();

        JSObject result = new JSObject();
        result.put("scheduled", scheduled);
        call.resolve(result);
    }

    private boolean permissionGranted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || getPermissionState("notifications") == PermissionState.GRANTED;
    }

    static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        manager.createNotificationChannel(
            new NotificationChannel("svj_progress", "SVJ progress", NotificationManager.IMPORTANCE_DEFAULT)
        );
        manager.createNotificationChannel(
            new NotificationChannel("svj_coach", "SVJ coaching", NotificationManager.IMPORTANCE_DEFAULT)
        );
        manager.createNotificationChannel(
            new NotificationChannel("svj_membership", "SVJ membership", NotificationManager.IMPORTANCE_DEFAULT)
        );
    }

    static String channelId(String channel) {
        if ("coach".equals(channel)) return "svj_coach";
        if ("membership".equals(channel)) return "svj_membership";
        return "svj_progress";
    }

    static void scheduleAlarm(
        Context context,
        int id,
        long triggerAt,
        String title,
        String body,
        String channel,
        String target,
        int repeatDays
    ) {
        AlarmManager alarmManager =
            (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent intent = new Intent(context, VjNotificationReceiver.class)
            .setAction("app.lovable.svj.NOTIFY." + id)
            .putExtra("id", id)
            .putExtra("title", title)
            .putExtra("body", body)
            .putExtra("channel", channel)
            .putExtra("target", target)
            .putExtra("repeatDays", repeatDays);

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
    }

    static void cancelStoredAlarms(Context context) {
        Set<String> ids = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getStringSet(KEY_IDS, new HashSet<>());
        AlarmManager alarmManager =
            (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        if (alarmManager != null) {
            for (String raw : new HashSet<>(ids)) {
                try {
                    int id = Integer.parseInt(raw);
                    Intent intent = new Intent(context, VjNotificationReceiver.class)
                        .setAction("app.lovable.svj.NOTIFY." + id);
                    PendingIntent pendingIntent = PendingIntent.getBroadcast(
                        context,
                        id,
                        intent,
                        PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
                    );
                    if (pendingIntent != null) {
                        alarmManager.cancel(pendingIntent);
                        pendingIntent.cancel();
                    }
                } catch (NumberFormatException ignored) {
                    // Ignore corrupt local ids.
                }
            }
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_IDS)
            .apply();
    }
}
