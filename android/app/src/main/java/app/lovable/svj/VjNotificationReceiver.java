package app.lovable.svj;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/**
 * Receives alarms scheduled by VjNotificationsPlugin and posts the actual
 * Android notification. Repeating reminders reschedule themselves only after
 * a successful delivery, so app process death does not cancel them.
 */
public class VjNotificationReceiver extends BroadcastReceiver {

    private static final String EXTRA_ID = "id";
    private static final String EXTRA_TITLE = "title";
    private static final String EXTRA_BODY = "body";
    private static final String EXTRA_CHANNEL = "channel";
    private static final String EXTRA_TARGET = "target";
    private static final String EXTRA_REPEAT_DAYS = "repeatDays";

    @Override
    public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra(EXTRA_ID, -1);
        if (id < 0) return;

        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        String channel = intent.getStringExtra(EXTRA_CHANNEL);
        String target = intent.getStringExtra(EXTRA_TARGET);
        int repeatDays = Math.max(0, intent.getIntExtra(EXTRA_REPEAT_DAYS, 0));

        post(
            context,
            id,
            title != null ? title : "SVJ",
            body != null ? body : "",
            channel != null ? channel : "progress",
            target != null ? target : "challenges"
        );

        if (repeatDays > 0) {
            long next = System.currentTimeMillis() + repeatDays * 86_400_000L;
            schedule(
                context, id, next,
                title != null ? title : "SVJ",
                body != null ? body : "",
                channel != null ? channel : "progress",
                target != null ? target : "challenges",
                repeatDays
            );
        }
    }

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        manager.createNotificationChannel(new NotificationChannel(
            "coach", "SVJ coaching", NotificationManager.IMPORTANCE_DEFAULT));
        manager.createNotificationChannel(new NotificationChannel(
            "progress", "SVJ progress", NotificationManager.IMPORTANCE_DEFAULT));
        manager.createNotificationChannel(new NotificationChannel(
            "membership", "SVJ membership", NotificationManager.IMPORTANCE_DEFAULT));
    }

    static void schedule(
        Context context,
        int id,
        long triggerAt,
        String title,
        String body,
        String channel,
        String target,
        int repeatDays
    ) {
        AlarmManager manager =
            (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;

        PendingIntent pi = pendingIntent(context, id, PendingIntent.FLAG_UPDATE_CURRENT,
            title, body, channel, target, repeatDays);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        } else {
            manager.set(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        }
    }

    static PendingIntent pendingIntent(Context context, int id, int baseFlags) {
        return pendingIntent(context, id, baseFlags, "", "", "progress", "challenges", 0);
    }

    static PendingIntent pendingIntent(
        Context context,
        int id,
        int baseFlags,
        String title,
        String body,
        String channel,
        String target,
        int repeatDays
    ) {
        Intent intent = new Intent(context, VjNotificationReceiver.class)
            .setAction("app.lovable.svj.NOTIFICATION." + id)
            .putExtra(EXTRA_ID, id)
            .putExtra(EXTRA_TITLE, title)
            .putExtra(EXTRA_BODY, body)
            .putExtra(EXTRA_CHANNEL, channel)
            .putExtra(EXTRA_TARGET, target)
            .putExtra(EXTRA_REPEAT_DAYS, repeatDays);
        int flags = baseFlags | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, id, intent, flags);
    }

    static void post(
        Context context,
        int id,
        String title,
        String body,
        String channel,
        String target
    ) {
        ensureChannels(context);

        Intent open = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("svj_notification_target", target);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            id + 10_000,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(context, channelId(channel))
            .setSmallIcon(R.drawable.ic_stat_workout)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build();

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(id, notification);
    }

    private static String channelId(String requested) {
        if ("coach".equals(requested) || "membership".equals(requested)) return requested;
        return "progress";
    }
}
