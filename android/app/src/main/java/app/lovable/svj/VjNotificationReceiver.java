package app.lovable.svj;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Durable Android scheduler/delivery receiver for SVJ notifications.
 *
 * The TypeScript planner decides WHAT should be scheduled. This receiver owns
 * only native persistence, AlarmManager delivery, reboot/app-update restore and
 * notification channel creation.
 */
public class VjNotificationReceiver extends BroadcastReceiver {

    private static final String ACTION_FIRE = "app.lovable.svj.action.SVJ_NOTIFICATION";
    private static final String PREFS = "svj_native_notifications_v1";
    private static final String KEY_SCHEDULES = "schedules";

    private static final String CHANNEL_PROGRESS = "svj_progress";
    private static final String CHANNEL_COACH = "svj_coach";
    private static final String CHANNEL_MEMBERSHIP = "svj_membership";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            ensureChannels(context);
            reschedulePersisted(context);
            return;
        }
        if (!ACTION_FIRE.equals(action)) return;

        int id = intent.getIntExtra("id", 0);
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        String channel = intent.getStringExtra("channel");
        String target = intent.getStringExtra("target");
        long triggerAt = intent.getLongExtra("triggerAt", 0L);
        int repeatDays = intent.getIntExtra("repeatDays", 0);

        if (id <= 0 || title == null || body == null) return;

        postNotification(
            context,
            id,
            title,
            body,
            channel != null ? channel : "progress",
            target != null ? target : "profile"
        );
        advanceOrRemove(context, id, triggerAt, repeatDays);
    }

    static int replaceSchedules(Context context, JSArray source) throws Exception {
        cancelAll(context);

        JSONArray persisted = new JSONArray();
        int scheduled = 0;
        long now = System.currentTimeMillis();

        for (int index = 0; index < source.length(); index++) {
            JSONObject raw = source.optJSONObject(index);
            if (raw == null) continue;

            int id = raw.optInt("id", 0);
            String title = raw.optString("title", "").trim();
            String body = raw.optString("body", "").trim();
            String channel = raw.optString("channel", "progress");
            String target = raw.optString("target", "profile");
            long triggerAt = raw.optLong("triggerAt", 0L);
            int repeatDays = Math.max(0, raw.optInt("repeatDays", 0));

            if (id <= 0 || title.isEmpty() || body.isEmpty() || triggerAt <= now) continue;

            JSONObject normalized = scheduleObject(
                id, title, body, channel, target, triggerAt, repeatDays
            );
            persisted.put(normalized);
            scheduleAlarm(context, normalized);
            scheduled += 1;
        }

        saveSchedules(context, persisted);
        return scheduled;
    }

    static void cancelAll(Context context) {
        JSONArray schedules = loadSchedules(context);
        AlarmManager alarms =
            (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) {
            for (int index = 0; index < schedules.length(); index++) {
                JSONObject item = schedules.optJSONObject(index);
                if (item == null) continue;
                int id = item.optInt("id", 0);
                long triggerAt = item.optLong("triggerAt", 0L);
                if (id <= 0 || triggerAt <= 0) continue;
                alarms.cancel(alarmPendingIntent(context, id, triggerAt, item));
            }
        }
        saveSchedules(context, new JSONArray());
    }

    static void reschedulePersisted(Context context) {
        JSONArray existing = loadSchedules(context);
        JSONArray future = new JSONArray();
        long now = System.currentTimeMillis();

        for (int index = 0; index < existing.length(); index++) {
            JSONObject item = existing.optJSONObject(index);
            if (item == null) continue;

            int id = item.optInt("id", 0);
            long triggerAt = item.optLong("triggerAt", 0L);
            int repeatDays = Math.max(0, item.optInt("repeatDays", 0));
            if (id <= 0 || triggerAt <= 0) continue;

            if (triggerAt <= now && repeatDays > 0) {
                triggerAt = rollForward(triggerAt, repeatDays, now);
                try {
                    item.put("triggerAt", triggerAt);
                } catch (Exception ignored) {
                    continue;
                }
            }
            if (triggerAt <= now) continue;

            future.put(item);
            scheduleAlarm(context, item);
        }

        saveSchedules(context, future);
    }

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        NotificationChannel progress = new NotificationChannel(
            CHANNEL_PROGRESS,
            "Progress",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        progress.setDescription("SVJ progress, streak and weekly summary reminders");

        NotificationChannel coach = new NotificationChannel(
            CHANNEL_COACH,
            "Coach",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        coach.setDescription("SVJ challenge, training, recovery and nutrition reminders");

        NotificationChannel membership = new NotificationChannel(
            CHANNEL_MEMBERSHIP,
            "Membership",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        membership.setDescription("SVJ membership status reminders");

        manager.createNotificationChannel(progress);
        manager.createNotificationChannel(coach);
        manager.createNotificationChannel(membership);
    }

    static void postNotification(
        Context context,
        int id,
        String title,
        String body,
        String channel,
        String target
    ) {
        if (!notificationPermissionGranted(context)) return;

        ensureChannels(context);
        String channelId = channelId(channel);

        Intent open = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .putExtra("svj_notification_target", target)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notificationPendingIntentCode(id),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_workout)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentIntent)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        try {
            NotificationManagerCompat.from(context).notify(id, builder.build());
        } catch (SecurityException ignored) {
            // Permission may have been revoked after the alarm was scheduled.
        }
    }

    private static boolean notificationPermissionGranted(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    private static void scheduleAlarm(Context context, JSONObject item) {
        AlarmManager alarms =
            (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;

        long triggerAt = item.optLong("triggerAt", 0L);
        if (triggerAt <= System.currentTimeMillis()) return;

        PendingIntent pendingIntent = alarmPendingIntent(
            context,
            item.optInt("id", 0),
            triggerAt,
            item
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
        } else {
            alarms.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
        }
    }

    private static PendingIntent alarmPendingIntent(
        Context context,
        int id,
        long triggerAt,
        JSONObject item
    ) {
        Intent intent = new Intent(context, VjNotificationReceiver.class)
            .setAction(ACTION_FIRE)
            .putExtra("id", id)
            .putExtra("title", item.optString("title", "SVJ"))
            .putExtra("body", item.optString("body", "Open SVJ to continue."))
            .putExtra("channel", item.optString("channel", "progress"))
            .putExtra("target", item.optString("target", "profile"))
            .putExtra("triggerAt", triggerAt)
            .putExtra("repeatDays", Math.max(0, item.optInt("repeatDays", 0)));

        return PendingIntent.getBroadcast(
            context,
            alarmPendingIntentCode(id, triggerAt),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static int alarmPendingIntentCode(int id, long triggerAt) {
        long mixed = 31L * id + triggerAt;
        return (int) (mixed ^ (mixed >>> 32));
    }

    private static int notificationPendingIntentCode(int id) {
        return 0x53000000 ^ id;
    }

    private static String channelId(String channel) {
        if ("coach".equals(channel)) return CHANNEL_COACH;
        if ("membership".equals(channel)) return CHANNEL_MEMBERSHIP;
        return CHANNEL_PROGRESS;
    }

    private static JSONObject scheduleObject(
        int id,
        String title,
        String body,
        String channel,
        String target,
        long triggerAt,
        int repeatDays
    ) throws Exception {
        JSONObject item = new JSONObject();
        item.put("id", id);
        item.put("title", title);
        item.put("body", body);
        item.put("channel", channel);
        item.put("target", target);
        item.put("triggerAt", triggerAt);
        if (repeatDays > 0) item.put("repeatDays", repeatDays);
        return item;
    }

    private static JSONArray loadSchedules(Context context) {
        SharedPreferences prefs =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_SCHEDULES, "[]");
        try {
            return new JSONArray(raw != null ? raw : "[]");
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private static void saveSchedules(Context context, JSONArray schedules) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SCHEDULES, schedules.toString())
            .apply();
    }

    private static void advanceOrRemove(
        Context context,
        int id,
        long firedAt,
        int repeatDays
    ) {
        JSONArray existing = loadSchedules(context);
        JSONArray updated = new JSONArray();
        long now = System.currentTimeMillis();

        for (int index = 0; index < existing.length(); index++) {
            JSONObject item = existing.optJSONObject(index);
            if (item == null) continue;

            boolean same =
                item.optInt("id", 0) == id
                && item.optLong("triggerAt", 0L) == firedAt;

            if (!same) {
                updated.put(item);
                continue;
            }

            if (repeatDays <= 0) continue;

            long next = rollForward(firedAt, repeatDays, now);
            try {
                item.put("triggerAt", next);
                updated.put(item);
                scheduleAlarm(context, item);
            } catch (Exception ignored) {
                // If a malformed persisted item cannot advance, drop it.
            }
        }

        saveSchedules(context, updated);
    }

    private static long rollForward(long previous, int repeatDays, long now) {
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(previous);
        do {
            calendar.add(Calendar.DAY_OF_YEAR, repeatDays);
        } while (calendar.getTimeInMillis() <= now);
        return calendar.getTimeInMillis();
    }
}
