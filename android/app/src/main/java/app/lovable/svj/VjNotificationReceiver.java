package app.lovable.svj;

import android.Manifest;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

public class VjNotificationReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        int id = intent.getIntExtra("id", 0);
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        String channel = intent.getStringExtra("channel");
        String target = intent.getStringExtra("target");
        int repeatDays = Math.max(0, intent.getIntExtra("repeatDays", 0));

        postNotification(
            context,
            id,
            title == null ? "SVJ" : title,
            body == null ? "" : body,
            channel == null ? "progress" : channel,
            target == null ? "challenges" : target
        );

        if (repeatDays > 0) {
            long next = System.currentTimeMillis() + repeatDays * 86_400_000L;
            VjNotificationsPlugin.scheduleAlarm(
                context,
                id,
                next,
                title == null ? "SVJ" : title,
                body == null ? "" : body,
                channel == null ? "progress" : channel,
                target == null ? "challenges" : target,
                repeatDays
            );
        }
    }

    static void postNotification(
        Context context,
        int id,
        String title,
        String body,
        String channel,
        String target
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        VjNotificationsPlugin.createChannels(context);

        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch == null) launch = new Intent(context, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launch.putExtra("svj_notification_target", target);

        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            id,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder =
            new NotificationCompat.Builder(context, VjNotificationsPlugin.channelId(channel))
                .setSmallIcon(R.drawable.ic_stat_workout)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(id, builder.build());
    }
}
