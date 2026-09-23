package app.lovable.svj.wear

/**
 * The versioned phone ↔ watch contract. It mirrors `src/app/lib/wearOs.ts`.
 *
 * Bump [VERSION] whenever the shape of a payload changes; both sides carry the
 * version in the handshake so a mismatched pairing degrades instead of
 * misbehaving.
 */
object WearProtocol {
    const val VERSION = 1

    /** Capability the watch advertises (declared in the wear manifest). */
    const val WATCH_CAPABILITY = "svj_wear_companion"

    /** Capability the phone app advertises (declared in the phone manifest). */
    const val PHONE_CAPABILITY = "svj_phone_app"

    const val PATH_HANDSHAKE = "/svj/wear/handshake"
    const val PATH_SAMPLE = "/svj/wear/sample"
    const val PATH_STATE = "/svj/wear/state"
    const val PATH_SUMMARY = "/svj/wear/summary"
    const val PATH_COMMAND = "/svj/wear/command"

    const val TYPE_HEART_RATE = "heart_rate"
    const val TYPE_STEPS = "steps"
    const val TYPE_DISTANCE = "distance"
    const val TYPE_CALORIES = "calories"

    const val COMMAND_START = "start"
    const val COMMAND_PAUSE = "pause"
    const val COMMAND_RESUME = "resume"
    const val COMMAND_FINISH = "finish"
    const val COMMAND_REQUEST_SUMMARY = "request_summary"

    /** How often live heart rate is forwarded to the phone while recording. */
    const val HEART_RATE_PUSH_INTERVAL_MS = 3_000L
}

/** Marks a value that is already valid JSON (a nested object). */
class RawJson(val json: String)

/**
 * Tiny JSON writer. The payloads are small and fixed, and keeping this
 * dependency-free means the session logic stays unit-testable on the JVM
 * without the Android `org.json` implementation.
 */
object WearJson {

    fun escape(value: String): String {
        val builder = StringBuilder(value.length + 8)
        for (character in value) {
            when (character) {
                '"' -> builder.append("\\\"")
                '\\' -> builder.append("\\\\")
                '\n' -> builder.append("\\n")
                '\r' -> builder.append("\\r")
                '\t' -> builder.append("\\t")
                else ->
                    if (character.code < 0x20) {
                        builder.append(String.format("\\u%04x", character.code))
                    } else {
                        builder.append(character)
                    }
            }
        }
        return builder.toString()
    }

    fun value(input: Any?): String = when (input) {
        null -> "null"
        is RawJson -> input.json
        is String -> "\"" + escape(input) + "\""
        is Boolean -> if (input) "true" else "false"
        is Int, is Long -> input.toString()
        is Float, is Double -> {
            val number = (input as Number).toDouble()
            if (number.isFinite()) {
                if (number == Math.floor(number) && !number.isInfinite()) {
                    number.toLong().toString()
                } else {
                    number.toString()
                }
            } else {
                "null"
            }
        }
        else -> "\"" + escape(input.toString()) + "\""
    }

    fun obj(vararg pairs: Pair<String, Any?>): String =
        pairs.joinToString(separator = ",", prefix = "{", postfix = "}") { (key, value) ->
            "\"" + escape(key) + "\":" + value(value)
        }
}
