package app.lovable.svj.wear

import android.content.Context
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.CapabilityInfo
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import java.nio.charset.StandardCharsets

/**
 * Watch → phone transport over the Wear OS Data Layer.
 *
 * The phone is found through capability discovery (the phone app advertises
 * `svj_phone_app`), never by BLE-scanning the watch's paired phone. When no
 * phone node is reachable every message is queued in
 * [WearSessionStore.enqueue] and flushed as soon as the Data Layer reconnects,
 * so a workout recorded with the phone left at home is never lost.
 */
object WearDataLayer {

    interface PhoneStateListener {
        fun onPhoneState(connected: Boolean, nodeName: String?)
    }

    @Volatile
    var phoneConnected: Boolean = false
        private set

    @Volatile
    var phoneNodeName: String? = null
        private set

    /** Ask the Data Layer who the phone is and report the result. */
    fun refreshPhoneState(context: Context, listener: PhoneStateListener? = null) {
        capability(context) { node ->
            update(node)
            listener?.onPhoneState(phoneConnected, phoneNodeName)
            if (phoneConnected) flush(context)
        }
    }

    /**
     * Send one payload. A failure — or an unreachable phone — queues the
     * message instead of dropping it.
     */
    fun send(context: Context, path: String, payload: String, onSent: ((Boolean) -> Unit)? = null) {
        capability(context) { node ->
            if (node == null) {
                WearSessionStore.enqueue(context, path, payload)
                onSent?.invoke(false)
                return@capability
            }
            Wearable.getMessageClient(context)
                .sendMessage(node.id, path, payload.toByteArray(StandardCharsets.UTF_8))
                .addOnCompleteListener { sent ->
                    val delivered = sent.isSuccessful
                    if (delivered) {
                        // A queued twin of this message is now redundant.
                        WearSessionStore.remove(context, path, payload)
                    } else {
                        WearSessionStore.enqueue(context, path, payload)
                    }
                    onSent?.invoke(delivered)
                }
        }
    }

    /** Retry everything that is still waiting for the phone. */
    fun flush(context: Context) {
        val pending = WearSessionStore.pending(context)
        for ((path, payload) in pending) {
            send(context, path, payload)
        }
    }

    fun outboxSize(context: Context): Int = WearSessionStore.outboxSize(context)

    private fun update(node: Node?) {
        phoneConnected = node != null
        phoneNodeName = node?.displayName
    }

    /** Resolve the reachable SVJ phone node, if there is one. */
    private fun capability(context: Context, onResult: (Node?) -> Unit) {
        Wearable.getCapabilityClient(context)
            .getCapability(WearProtocol.PHONE_CAPABILITY, CapabilityClient.FILTER_REACHABLE)
            .addOnCompleteListener { task ->
                val info: CapabilityInfo? = if (task.isSuccessful) task.result else null
                val nodes: Set<Node> = info?.nodes ?: emptySet()
                onResult(nodes.firstOrNull { it.isNearby } ?: nodes.firstOrNull())
            }
            .addOnFailureListener { onResult(null) }
    }
}
