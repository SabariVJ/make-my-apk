package app.lovable.svj.wear

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

/**
 * Receives SVJ phone commands over the Wear OS Data Layer.
 *
 * The watch never requires the phone to record a workout — these commands only
 * let the phone drive (or stop) a session the watch already owns, which keeps
 * both devices on one session id instead of two competing activities.
 */
class WearCommandListenerService : WearableListenerService() {

    override fun onMessageReceived(messageEvent: MessageEvent) {
        if (messageEvent.path != WearProtocol.PATH_COMMAND) return
        val raw = messageEvent.data ?: return
        val payload = String(raw, Charsets.UTF_8)
        val command = try {
            JSONObject(payload)
        } catch (malformed: Exception) {
            return
        }

        when (command.optString("type")) {
            WearProtocol.COMMAND_START -> {
                val activity = WearActivityType.fromServerType(command.optString("activityType"))
                    ?: WearActivityType.RUN
                WearWorkoutService.start(this, activity)
            }
            WearProtocol.COMMAND_PAUSE -> WearWorkoutService.command(this, WearWorkoutService.ACTION_PAUSE)
            WearProtocol.COMMAND_RESUME -> WearWorkoutService.command(this, WearWorkoutService.ACTION_RESUME)
            WearProtocol.COMMAND_FINISH -> WearWorkoutService.command(this, WearWorkoutService.ACTION_FINISH)
            WearProtocol.COMMAND_REQUEST_SUMMARY -> {
                val summary = WearWorkoutHub.lastSummaryJson ?: return
                WearDataLayer.send(this, WearProtocol.PATH_SUMMARY, summary)
            }
        }
    }
}
