package app.lovable.svj;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;

/**
 * SVJ local smart notifications.
 *
 * The web layer decides what is useful to remind the signed-in user about.
 * This native layer only owns Android permission, durable alarms, channels,
 * delivery and safe deep links back into SVJ.
 *
 * No exact-alarm permission is requested: reminders tolerate Android's normal
 * battery-aware delivery window and do not claim alarm-clock privileges.
 */
@CapacitorPlugin(
    name = "VjNotifications",
    permissions = {
        @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications")
    }
)
public class VjNotificationsPlugin extends Plugin {

    private static final String TAG = "VjNotifications";
    private static final String PREFS = "svj_notifications";
    static final String PREF_SCHEDULES = "schedules";
    static final String ACTION_FIRE = "app.lovable.svj.NOTIFICATION_FIRE";
    static final String EXTRA_ID = "notification_id";
    private static final int MAX_SCHEDULES = 64;

    private static final Set<String> CHANNELS = new HashSet<>();
    private static final Set<String> TARGETS = new HashSet<>();

    static {
        CHANNELS.add("progress");
        CHANNELS.add("coach");
        CHANNELS.add("membership");

        TARGETS.add("challenges");
        TARGETS.add("activity");
        TARGETS.add("workouts");
        TARGETS.add("nutrition");
        TARGETS.add("profile");
        TARGETS.add("earn");
    }

    @Override
    public void load() {
        Context context = getContext();
        if (context == null) return;
        ensureChannels(context);
        restoreSchedules(context);
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", notificationsEnabled(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
            return;
        }
        resolvePermission(call);
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        resolvePermission(call);
    }

    private void resolvePermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", notificationsEnabled(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void replaceSchedules(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Notification context unavailable.");
            return;
        }

        JSArray incoming = call.getArray("schedules");
        JSONArray validated = new JSONArray();
        Set<Integer> ids = new HashSet<>();

        try {
            if (incoming != null) {
                if (incoming.length() > MAX_SCHEDULES) {
                    call.reject("Too many notification schedules.");
                    return;
                }
                for (int i = 0; i < incoming.length(); i++) {
                    JSONObject raw = incoming.getJSONObject(i);
                    JSONObject schedule = validateSchedule(raw);
                    int id = schedule.getInt("id");
                    if (!ids.add(id)) {
                        call.reject("Notification schedule ids must be unique.");
                        return;
                    }
                    validated.put(schedule);
                }
            }
        } catch (JSONException e) {
            call.reject("Invalid notification schedule.", e);
            return;
        }

        cancelStoredAlarms(context);
        writeSchedules(context, validated);

        int scheduled = 0;
        for (int i = 0; i < validated.length(); i++) {
            JSONObject schedule = validated.optJSONObject(i);
            if (schedule != null && scheduleOne(context, schedule)) scheduled += 1;
        }

        JSObject result = new JSObject();
        result.put("scheduled", scheduled);
        call.resolve(result);
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        Context context = getContext();
        if (context != null) {
            cancelStoredAlarms(context);
            writeSchedules(context, new JSONArray());
            NotificationManagerCompat.from(context).cancelAll();
        }
        call.resolve();
    }

    @PluginMethod
    public void notifyNow(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Notification context unavailable.");
            return;
        }
        if (!notificationsEnabled(context)) {
            call.reject("NOTIFICATION_PERMISSION_REQUIRED");
            return;
        }

        int id = call.getInt("id", -1);
        String title = cleanText(call.getString("title"), 80);
        String body = cleanText(call.getString("body"), 240);
        String channel = call.getString("channel", "progress");
        String target = call.getString("target", "profile");
        if (id <= 0 || title.isEmpty() || body.isEmpty()
                || !CHANNELS.contains(channel) || !TARGETS.contains(target)) {
            call.reject("Invalid notification.");
            return;
        }

        postNotification(context, id, title, body, channel, target);
        call.resolve();
    }

    private static JSONObject validateSchedule(JSONObject raw) throws JSONException {
        int id = raw.optInt("id", -1);
        String title = cleanText(raw.optString("title", ""), 80);
        String body = cleanText(raw.optString("body", ""), 240);
        long triggerAt = raw.optLong("triggerAt", 0L);
        int repeatDays = Math.max(0, raw.optInt("repeatDays", 0));
        String channel = raw.optString("channel", "");
        String target = raw.optString("target", "");

        if (id <= 0 || title.isEmpty() || body.isEmpty() || triggerAt <= 0L) {
            throw new JSONException("Missing required schedule fields.");
        }
        if (repeatDays > 365) throw new JSONException("Repeat interval is too large.");
        if (!CHANNELS.contains(channel)) throw new JSONException("Unknown notification channel.");
        if (!TARGETS.contains(target)) throw new JSONException("Unknown notification target.");

        JSONObject normalized = new JSONObject();
        normalized.put("id", id);
        normalized.put("title", title);
        normalized.put("body", body);
        normalized.put("triggerAt", triggerAt);
        if (repeatDays > 0) normalized.put("repeatDays", repeatDays);
        normalized.put("channel", channel);
        normalized.put("target", target);
        return normalized;
    }

    static void restoreSchedules(Context context) {
        if (context == null) return;
        ensureChannels(context);
        JSONArray schedules = readSchedules(context);
        for (int i = 0; i < schedules.length(); i++) {
            JSONObject schedule = schedules.optJSONObject(i);
            if (schedule != null) scheduleOne(context, schedule);
        }
    }

    static void fireSchedule(Context context, int id) {
        if (context == null || id <= 0) return;
        JSONArray current = readSchedules(context);
        JSONArray next = new JSONArray();
        JSONObject matched = null;

        for (int i = 0; i < current.length(); i++) {
            JSONObject schedule = current.optJSONObject(i);
            if (schedule == null) continue;
            if (schedule.optInt("id", -1) == id) matched = schedule;
            else next.put(schedule);
        }
        if (matched == null) return;

        if (notificationsEnabled(context)) {
            postNotification(
                context,
                id,
                matched.optString("title", "SVJ"),
                matched.optString("body", ""),
                matched.optString("channel", "progress"),
                matched.optString("target", "profile")
            );
        }

        int repeatDays = Math.max(0, matched.optInt("repeatDays", 0));
        if (repeatDays > 0) {
            long nextTrigger = nextFutureTrigger(
                matched.optLong("triggerAt", System.currentTimeMillis()),
                repeatDays,
                System.currentTimeMillis()
            );
            try {
                matched.put("triggerAt", nextTrigger);
                next.put(matched);
            } catch (JSONException e) {
                Log.w(TAG, "Could not persist repeat trigger", e);
            }
            writeSchedules(context, next);
            scheduleOne(context, matched);
        } else {
            writeSchedules(context, next);
        }
    }

    private static boolean scheduleOne(Context context, JSONObject schedule) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return false;

        int id = schedule.optInt("id", -1);
        long triggerAt = schedule.optLong("triggerAt", 0L);
        int repeatDays = Math.max(0, schedule.optInt("repeatDays", 0));
        if (id <= 0 || triggerAt <= 0L) return false;

        long now = System.currentTimeMillis();
        if (triggerAt <= now) {
            if (repeatDays <= 0) return false;
            triggerAt = nextFutureTrigger(triggerAt, repeatDays, now);
        }

        try {
            alarms.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAt,
                alarmPendingIntent(context, id)
            );
            return true;
        } catch (Exception e) {
            Log.w(TAG, "Could not schedule notification " + id, e);
            return false;
        }
    }

    private static long nextFutureTrigger(long triggerAt, int repeatDays, long now) {
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(triggerAt);
        while (calendar.getTimeInMillis() <= now) {
            calendar.add(Calendar.DAY_OF_YEAR, Math.max(1, repeatDays));
        }
        return calendar.getTimeInMillis();
    }

    private static PendingIntent alarmPendingIntent(Context context, int id) {
        Intent intent = new Intent(context, VjNotificationReceiver.class);
        intent.setAction(ACTION_FIRE);
        intent.putExtra(EXTRA_ID, id);
        return PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static void cancelStoredAlarms(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        JSONArray schedules = readSchedules(context);
        for (int i = 0; i < schedules.length(); i++) {
            JSONObject schedule = schedules.optJSONObject(i);
            if (schedule == null) continue;
            int id = schedule.optInt("id", -1);
            if (id <= 0) continue;
            PendingIntent pending = alarmPendingIntent(context, id);
            alarms.cancel(pending);
            pending.cancel();
        }
    }

    private static void postNotification(
        Context context,
        int id,
        String title,
        String body,
        String channel,
        String target
    ) {
        if (context == null) return;
        ensureChannels(context);

        String safeChannel = CHANNELS.contains(channel) ? channel : "progress";
        String safeTarget = TARGETS.contains(target) ? target : "profile";

        Intent launch = new Intent(
            Intent.ACTION_VIEW,
            Uri.parse("app.lovable.svj://notification/" + Uri.encode(safeTarget)),
            context,
            MainActivity.class
        );
        launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            id,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            channelId(safeChannel)
        )
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(cleanText(title, 80))
            .setContentText(cleanText(body, 240))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(cleanText(body, 240)))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(contentIntent);

        try {
            NotificationManagerCompat.from(context).notify(id, builder.build());
        } catch (SecurityException e) {
            Log.w(TAG, "Notification permission denied at delivery time", e);
        }
    }

    private static String channelId(String channel) {
        switch (channel) {
            case "coach":
                return "svj_coach";
            case "membership":
                return "svj_membership";
            default:
                return "svj_progress";
        }
    }

    private static void ensureChannels(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        NotificationChannel progress = new NotificationChannel(
            "svj_progress",
            "SVJ progress",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        progress.setDescription("Progress, momentum and weekly recap reminders.");

        NotificationChannel coach = new NotificationChannel(
            "svj_coach",
            "SVJ coach",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        coach.setDescription("Training, recovery, nutrition and daily coaching reminders.");

        NotificationChannel membership = new NotificationChannel(
            "svj_membership",
            "SVJ membership",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        membership.setDescription("SVJ Plus expiry and membership reminders.");

        manager.createNotificationChannel(progress);
        manager.createNotificationChannel(coach);
        manager.createNotificationChannel(membership);
    }

    private static boolean notificationsEnabled(Context context) {
        if (context == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    private static JSONArray readSchedules(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = prefs.getString(PREF_SCHEDULES, "[]");
            return new JSONArray(raw == null ? "[]" : raw);
        } catch (Exception e) {
            Log.w(TAG, "Could not read persisted schedules", e);
            return new JSONArray();
        }
    }

    private static void writeSchedules(Context context, JSONArray schedules) {
        try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(PREF_SCHEDULES, schedules.toString())
                .apply();
        } catch (Exception e) {
            Log.w(TAG, "Could not persist schedules", e);
        }
    }

    private static String cleanText(String value, int maxLength) {
        if (value == null) return "";
        String cleaned = value.trim().replaceAll("\\s+", " ");
        return cleaned.length() <= maxLength ? cleaned : cleaned.substring(0, maxLength);
    }
}
