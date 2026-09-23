package app.lovable.svj.wear

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import androidx.core.content.ContextCompat

/**
 * The watch's own sensors, read only while an SVJ workout is recording.
 *
 * The controller reports exactly which sensors exist on this hardware, so the
 * UI and the advertised capabilities can never claim a metric the watch cannot
 * measure. Nothing is collected outside a started workout, and no metric is
 * estimated when a sensor is missing.
 */
class WearSensors(private val context: Context) : SensorEventListener {

    interface Listener {
        /** A plausible heart-rate reading, in beats per minute. */
        fun onHeartRate(bpm: Int, atMs: Long)

        /** Cumulative steps since boot, straight from the hardware counter. */
        fun onStepTotal(totalSinceBoot: Float)
    }

    var listener: Listener? = null

    private val sensorManager: SensorManager? =
        context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager

    private val heartRateSensor: Sensor? = sensorManager?.getDefaultSensor(Sensor.TYPE_HEART_RATE)
    private val stepSensor: Sensor? = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

    private var registered = false

    val hasHeartRateSensor: Boolean get() = heartRateSensor != null
    val hasStepSensor: Boolean get() = stepSensor != null

    /** BODY_SENSORS is a runtime permission and is never assumed. */
    fun hasHeartRatePermission(): Boolean = hasPermission(Manifest.permission.BODY_SENSORS)

    /** ACTIVITY_RECOGNITION is required to read the step counter on API 29+. */
    fun hasActivityPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            hasPermission(Manifest.permission.ACTIVITY_RECOGNITION)

    fun missingPermissions(): List<String> {
        val missing = mutableListOf<String>()
        if (hasHeartRateSensor && !hasHeartRatePermission()) missing.add(Manifest.permission.BODY_SENSORS)
        if (hasStepSensor && !hasActivityPermission()) missing.add(Manifest.permission.ACTIVITY_RECOGNITION)
        return missing
    }

    fun canRecordHeartRate(): Boolean = hasHeartRateSensor && hasHeartRatePermission()

    fun canCountSteps(): Boolean = hasStepSensor && hasActivityPermission()

    /** True when at least one real measurement can be captured. */
    fun canMeasure(): Boolean = canRecordHeartRate() || canCountSteps()

    fun start() {
        if (registered) return
        val manager = sensorManager ?: return
        var any = false
        if (canRecordHeartRate()) {
            any = manager.registerListener(this, heartRateSensor, SensorManager.SENSOR_DELAY_NORMAL) || any
        }
        if (canCountSteps()) {
            any = manager.registerListener(this, stepSensor, SensorManager.SENSOR_DELAY_UI) || any
        }
        registered = any
    }

    fun stop() {
        if (!registered) return
        sensorManager?.unregisterListener(this)
        registered = false
    }

    override fun onSensorChanged(event: SensorEvent) {
        val target = listener ?: return
        when (event.sensor.type) {
            Sensor.TYPE_HEART_RATE -> {
                val bpm = event.values.firstOrNull()?.toInt() ?: return
                // Heart-rate sensors report 0 while they are acquiring a lock.
                if (bpm <= 0) return
                target.onHeartRate(bpm, System.currentTimeMillis())
            }
            Sensor.TYPE_STEP_COUNTER -> {
                val total = event.values.firstOrNull() ?: return
                target.onStepTotal(total)
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Accuracy changes carry no measurement; nothing to surface.
    }

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
}
