package app.lovable.svj

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.activity.result.contract.ActivityResultContract
import androidx.annotation.RequiresApi
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * SVJ's Android Health Connect bridge.
 *
 * Health Connect is the Android platform's ON-DEVICE health store, not a
 * third-party fitness service. SVJ only ever READS the record types the user
 * explicitly granted, re-checks the grant before every read (so revocation is
 * respected immediately), and never writes to Health Connect.
 *
 * An imported record is never rewarded on its own: it is handed to the SVJ
 * server, which deduplicates against the user's native SVJ workouts before any
 * XP is granted.
 */
@CapacitorPlugin(name = "VjHealthConnect")
class VjHealthConnectPlugin : Plugin() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    /** Read permission per SVJ record type. Nothing outside this map is asked for. */
    private val readPermissions: Map<String, String> = mapOf(
        "steps" to HealthPermission.getReadPermission(StepsRecord::class),
        "distance" to HealthPermission.getReadPermission(DistanceRecord::class),
        "exerciseSessions" to HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        "heartRate" to HealthPermission.getReadPermission(HeartRateRecord::class),
        "restingHeartRate" to HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        "sleep" to HealthPermission.getReadPermission(SleepSessionRecord::class),
        "calories" to HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        "weight" to HealthPermission.getReadPermission(WeightRecord::class)
    )

    private val permissionContract: ActivityResultContract<Set<String>, Set<String>> =
        PermissionController.createRequestPermissionResultContract()

    /** Permissions requested by the in-flight requestPermissions call. */
    private var pendingPermissionTypes: List<String> = emptyList()

    // ── Availability ────────────────────────────────────────────────────────

    private fun sdkStatus(): Int {
        return try {
            val context = context ?: return HealthConnectClient.SDK_UNAVAILABLE
            HealthConnectClient.getSdkStatus(context)
        } catch (error: Throwable) {
            Log.w(TAG, "getSdkStatus failed", error)
            HealthConnectClient.SDK_UNAVAILABLE
        }
    }

    private fun client(): HealthConnectClient? {
        if (sdkStatus() != HealthConnectClient.SDK_AVAILABLE) return null
        return try {
            val context = context ?: return null
            HealthConnectClient.getOrCreate(context)
        } catch (error: Throwable) {
            Log.w(TAG, "getOrCreate failed", error)
            null
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val status = sdkStatus()
        val result = JSObject()
        result.put("available", status == HealthConnectClient.SDK_AVAILABLE)
        result.put("sdkStatus", status)
        result.put("providerUpdateRequired", status == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED)
        call.resolve(result)
    }

    // ── Permissions ─────────────────────────────────────────────────────────

    private fun requestedTypes(call: PluginCall): List<String> {
        val raw = call.getArray("types")
        if (raw == null || raw.length() == 0) return readPermissions.keys.toList()
        val types = mutableListOf<String>()
        for (index in 0 until raw.length()) {
            val value = raw.optString(index, null) ?: continue
            if (readPermissions.containsKey(value)) types.add(value)
        }
        return if (types.isEmpty()) readPermissions.keys.toList() else types
    }

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        val types = requestedTypes(call)
        scope.launch {
            call.resolve(permissionSnapshot(types))
        }
    }

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        val types = requestedTypes(call)
        val healthClient = client()
        if (healthClient == null) {
            // Nothing to prompt for when Health Connect is not installed.
            scope.launch { call.resolve(permissionSnapshot(types)) }
            return
        }
        val permissions = types.mapNotNull { readPermissions[it] }.toSet()
        if (permissions.isEmpty()) {
            scope.launch { call.resolve(permissionSnapshot(types)) }
            return
        }
        pendingPermissionTypes = types
        try {
            startActivityForResult(
                call,
                permissionContract.createIntent(requireNotNull(context), permissions),
                "healthPermissionResult"
            )
        } catch (error: Throwable) {
            Log.w(TAG, "permission intent failed", error)
            scope.launch { call.resolve(permissionSnapshot(types)) }
        }
    }

    @ActivityCallback
    fun healthPermissionResult(call: PluginCall?, result: ActivityResult) {
        val types = pendingPermissionTypes.ifEmpty { readPermissions.keys.toList() }
        pendingPermissionTypes = emptyList()
        try {
            permissionContract.parseResult(result.resultCode, result.data)
        } catch (error: Throwable) {
            Log.w(TAG, "parseResult failed", error)
        }
        // Always re-read the real grant: the result intent is only a hint.
        scope.launch {
            call?.resolve(permissionSnapshot(types))
        }
    }

    private suspend fun grantedPermissions(): Set<String> {
        val healthClient = client() ?: return emptySet()
        return try {
            withContext(Dispatchers.IO) {
                healthClient.permissionController.getGrantedPermissions()
            }
        } catch (error: Throwable) {
            Log.w(TAG, "getGrantedPermissions failed", error)
            emptySet()
        }
    }

    private fun permissionSnapshotFor(types: List<String>, granted: Set<String>): JSObject {
        val result = JSObject()
        val available = sdkStatus() == HealthConnectClient.SDK_AVAILABLE
        for (type in readPermissions.keys) {
            result.put(type, if (!available) "unavailable" else if (granted.contains(readPermissions[type])) "granted" else "prompt")
        }
        if (types.isEmpty()) return result
        val filtered = JSObject()
        for (type in types) {
            filtered.put(type, if (result.has(type)) result.getString(type) else "unavailable")
        }
        return filtered
    }

    private suspend fun permissionSnapshot(types: List<String>): JSObject {
        return permissionSnapshotFor(types, grantedPermissions())
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            val intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
            val activity = activity
            if (activity != null) {
                activity.startActivity(intent)
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context?.startActivity(intent)
            }
            call.resolve()
        } catch (error: Throwable) {
            Log.w(TAG, "openSettings failed", error)
            // Fall back to the Health Connect Play Store listing.
            try {
                val market = Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("market://details?id=com.google.android.apps.healthdata")
                )
                market.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context?.startActivity(market)
            } catch (inner: Throwable) {
                Log.w(TAG, "market fallback failed", inner)
            }
            call.resolve()
        }
    }

    // ── Records ─────────────────────────────────────────────────────────────

    @PluginMethod
    fun readRecords(call: PluginCall) {
        val type = call.getString("type")
        if (type == null || !readPermissions.containsKey(type)) {
            call.reject("Unknown Health Connect record type.")
            return
        }
        val startMs = call.getLong("startMs") ?: call.getDouble("startMs")?.toLong()
        val endMs = call.getLong("endMs") ?: call.getDouble("endMs")?.toLong()
        if (startMs == null || endMs == null || endMs <= startMs) {
            call.reject("A valid time range is required.")
            return
        }
        val healthClient = client()
        if (healthClient == null) {
            call.reject("Health Connect is not available on this device.")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.reject("Health Connect requires Android 8.0 or newer.")
            return
        }

        scope.launch {
            try {
                // Permission is re-checked on EVERY read: revoking a type in
                // Health Connect stops SVJ from reading it immediately.
                val granted = grantedPermissions()
                val permission = readPermissions[type]
                if (permission == null || !granted.contains(permission)) {
                    call.reject("Health Connect permission for $type was not granted.")
                    return@launch
                }
                val records = withContext(Dispatchers.IO) {
                    readType(healthClient, type, startMs, endMs)
                }
                val result = JSObject()
                result.put("type", type)
                result.put("records", records)
                call.resolve(result)
            } catch (error: Throwable) {
                Log.w(TAG, "readRecords failed for $type", error)
                call.reject("Couldn't read Health Connect records.")
            }
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private suspend fun readType(
        healthClient: HealthConnectClient,
        type: String,
        startMs: Long,
        endMs: Long
    ): JSArray {
        val range = TimeRangeFilter.between(
            java.time.Instant.ofEpochMilli(startMs),
            java.time.Instant.ofEpochMilli(endMs)
        )
        return when (type) {
            "steps" -> {
                val response = healthClient.readRecords(
                    ReadRecordsRequest(recordType = StepsRecord::class, timeRangeFilter = range)
                )
                val array = JSArray()
                for (record in response.records) {
                    array.put(envelope(record, record.startTime, record.endTime).apply {
                        put("stepCount", record.count)
                    })
                }
                array
            }
            "distance" -> {
                val response = healthClient.readRecords(
                    ReadRecordsRequest(recordType = DistanceRecord::class, timeRangeFilter = range)
                )
                val array = JSArray()
                for (record in response.records) {
                    array.put(envelope(record, record.startTime, record.endTime).apply {
                        put("distanceMeters", record.distance.inMeters)
                    })
                }
                array
            }
            "exerciseSessions" -> {
                val response = healthClient.readRecords(
                    ReadRecordsRequest(recordType = ExerciseSessionRecord::class, timeRangeFilter = range)
                )
                val array = JSArray()
                for (record in response.records) {
                    array.put(envelope(record, record.startTime, record.endTime).apply {
                        put("exerciseType", mapExerciseType(record.exerciseType))
                        if (!record.title.isNullOrEmpty()) put("title", record.title)
                        if (!record.notes.isNullOrEmpty()) put("notes", record.notes)
                    })
                }
                array
            }
            "heartRate" -> {
                val response = healthClient.readRecords(
                    ReadRecordsRequest(recordType = HeartRateRecord::class, timeRangeFilter = range)
                )
                val array = JSArray()
                for (record in response.records) {
                    val samples = JSArray()
                    var total = 0L
                    for (sample in record.samples) {
                        total += sample.beatsPerMinute
                        samples.put(JSObject().apply {
                            put("timeMs", sample.time.toEpochMilli())
                            put("beatsPerMinute", sample.beatsPerMinute)
                        })
                    }
                    array.put(envelope(record, record.startTime, record.endTime).apply {
                        if (record.samples.isNotEmpty()) {
                            put("avgHeartRate", (total / record.samples.size).toDouble())
                        }
                        put("samples", samples)
                    })
                }
                array
            }
            "restingHeartRate" -> {
                val response = healthClient.readRecords(
                    ReadRecordsRequest(recordType = RestingHeartRateRecord::class, timeRangeFilter = range)
                )
                val array = JSArray()
                for (record in response.records) {
                    // RestingHeartRateRecord is an INSTANT-time record: it has a
                    // single `time`, not a start/end interval.
                    array.put(envelope(record, record.time, record.time).apply {
                        put("beatsPerMinute", record.beatsPerMinute)
                    })
                }
                array
            }
            "sleep" -> {
                val response = healthClient.readRecords(
                    ReadRecordsRequest(recordType = SleepSessionRecord::class, timeRangeFilter = range)
                )
                val array = JSArray()
                for (record in response.records) {
                    array.put(envelope(record, record.startTime, record.endTime).apply {
                        put("sleepType", "session")
                    })
                }
                array
            }
            "calories" -> {
                val response = healthClient.readRecords(
                    ReadRecordsRequest(recordType = TotalCaloriesBurnedRecord::class, timeRangeFilter = range)
                )
                val array = JSArray()
                for (record in response.records) {
                    array.put(envelope(record, record.startTime, record.endTime).apply {
                        put("caloriesEstimate", record.energy.inKilocalories)
                    })
                }
                array
            }
            "weight" -> {
                val response = healthClient.readRecords(
                    ReadRecordsRequest(recordType = WeightRecord::class, timeRangeFilter = range)
                )
                val array = JSArray()
                for (record in response.records) {
                    // WeightRecord is an INSTANT-time record too.
                    array.put(envelope(record, record.time, record.time).apply {
                        put("weightKg", record.weight.inKilograms)
                    })
                }
                array
            }
            else -> JSArray()
        }
    }

    /**
     * Shared identity/timing fields for any record. Interval records pass their
     * start/end; instant-time records (resting heart rate, weight) pass the same
     * instant twice, so the client always receives a consistent shape.
     */
    @RequiresApi(Build.VERSION_CODES.O)
    private fun envelope(record: Record, startTime: java.time.Instant, endTime: java.time.Instant): JSObject {
        val metadata = record.metadata
        val result = JSObject()
        result.put("id", metadata.id)
        result.put("sourceApp", metadata.dataOrigin.packageName)
        result.put("startTimeMs", startTime.toEpochMilli())
        result.put("endTimeMs", endTime.toEpochMilli())
        result.put("durationSeconds", (endTime.toEpochMilli() - startTime.toEpochMilli()) / 1000.0)
        return result
    }

    /**
     * Map a Health Connect exercise type onto the activity-type strings the SVJ
     * client already understands. Unknown types stay "other" rather than being
     * guessed into a rewarded category.
     */
    private fun mapExerciseType(exerciseType: Int): String {
        return when (exerciseType) {
            ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
            ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "running"
            ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "walking"
            ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "hiking"
            ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
            ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "cycling"
            ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING -> "strength"
            ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "strength"
            ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "yoga"
            ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "hiit"
            else -> "other"
        }
    }

    private val TAG = "VjHealthConnect"
}
