package app.lovable.svj;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Receives only SVJ's own alarm PendingIntents plus protected Android system
 * broadcasts used to restore alarms after time/reboot/package changes.
 */
public class VjNotificationReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();

        if (VjNotificationsPlugin.ACTION_FIRE.equals(action)) {
            int id = intent.getIntExtra(VjNotificationsPlugin.EXTRA_ID, -1);
            VjNotificationsPlugin.fireSchedule(context, id);
            return;
        }

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            VjNotificationsPlugin.restoreSchedules(context);
        }
    }
}
