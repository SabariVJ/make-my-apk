package app.lovable.svj;

import android.content.Context;
import android.hardware.*;
import android.os.SystemClock;
import com.getcapacitor.*;
import java.lang.reflect.Field;

/** Exercises VjPedometerPlugin itself, using only test doubles for Android/Capacitor. */
public final class NativeLifecycleHarness {
    static final int COUNTER=Sensor.TYPE_STEP_COUNTER, DETECTOR=Sensor.TYPE_STEP_DETECTOR, ACCEL=Sensor.TYPE_ACCELEROMETER;
    static SensorManager sensors;
    static VjPedometerPlugin plugin;
    static long timestamp;
    static void setup(int... modes) {
        sensors=new SensorManager(modes);
        plugin=new VjPedometerPlugin(); plugin.context=new Context(sensors); plugin.load();
        SystemClock.nanos=1_000_000_000L; timestamp=SystemClock.nanos;
    }
    static JSObject state(){PluginCall c=new PluginCall();plugin.getState(c);return c.value;}
    static long number(String key){return ((Number)state().get(key)).longValue();}
    static boolean flag(String key){return Boolean.TRUE.equals(state().get(key));}
    static void check(boolean value,String message){if(!value)throw new AssertionError(message+" state="+state());}
    static void equal(long expected,long actual){check(expected==actual,"expected "+expected+", got "+actual);}
    static void start(String id){SystemClock.nanos=timestamp;PluginCall c=new PluginCall(id);plugin.startTracking(c);check(c.error==null,"START: "+c.error);}
    static void stop(){PluginCall c=new PluginCall();plugin.stopTracking(c);check(c.error==null,"STOP: "+c.error);}
    static void sample(int mode,float... values){timestamp+=20_000_000L;sensors.deliver(mode,timestamp,values);}
    static Object field(String name)throws Exception {Field f=VjPedometerPlugin.class.getDeclaredField(name);f.setAccessible(true);return f.get(plugin);}

    public static void main(String[] args)throws Exception {
        switch(args[0]) {
            case "passive":
                setup(COUNTER,DETECTOR,ACCEL);
                plugin.getSensorInfo(new PluginCall()); plugin.checkPermissions(new PluginCall()); plugin.handleOnResume();
                equal(0,sensors.registrations); check(!flag("trackingRequested"),"load/resume is stopped");
                check(field("accelDetector")==null,"no accelerometer initialization at load");
                check("counter".equals(state().get("mode")),"sensor hierarchy");
                break;
            case "baseline":
                setup(COUNTER); sample(COUNTER,9000); start("first");
                equal(-1,number("sessionBaselineRaw")); sample(COUNTER,10000);
                equal(10000,number("sessionBaselineRaw")); equal(0,number("sessionSteps"));
                sample(COUNTER,10025); equal(25,number("sessionSteps")); equal(25,number("dailySteps"));
                check("first".equals(plugin.measurements.get(0).get("sessionId")),"session ID on measurements");
                break;
            case "duplicate_start":
                setup(COUNTER); start("first");sample(COUNTER,100);sample(COUNTER,104);start("second");
                equal(1,sensors.registrations);equal(100,number("sessionBaselineRaw"));equal(4,number("sessionSteps"));
                check("first".equals(state().get("sessionId")),"idempotent START preserves session");break;
            case "stop":
                setup(COUNTER);start("first");sample(COUNTER,100);sample(COUNTER,107);
                int emitted=plugin.measurements.size();stop();
                equal(0,sensors.listeners.size());equal(1,sensors.removals);
                check(flag("listenerRemoved")&&!flag("listenerRegistered")&&!flag("trackingActive"),"physical unregister confirmed");
                sample(COUNTER,10000);
                plugin.onSensorChanged(new SensorEvent(new Sensor(COUNTER),timestamp+1,20000));
                equal(7,number("sessionSteps"));equal(emitted,plugin.measurements.size());stop();equal(1,sensors.removals);break;
            case "second_start":
                setup(COUNTER);start("first");sample(COUNTER,1000);sample(COUNTER,1010);stop();
                sample(COUNTER,5000);timestamp+=1_000_000_000L;start("second");sample(COUNTER,6000);
                equal(6000,number("sessionBaselineRaw"));equal(0,number("sessionSteps"));equal(10,number("dailySteps"));
                sample(COUNTER,6003);equal(3,number("sessionSteps"));equal(13,number("dailySteps"));equal(1,sensors.listeners.size());break;
            case "reset":
                setup(COUNTER);start("reset");sample(COUNTER,1000);sample(COUNTER,1010);sample(COUNTER,2);
                equal(10,number("sessionSteps"));equal(2,number("sessionBaselineRaw"));sample(COUNTER,7);equal(15,number("sessionSteps"));
                sample(COUNTER,Float.NaN);sample(COUNTER,Float.POSITIVE_INFINITY);sample(COUNTER,-1);equal(15,number("sessionSteps"));break;
            case "stale_samples":
                setup(COUNTER);start("first");
                sensors.deliver(COUNTER,timestamp-10,90);sensors.deliver(COUNTER,timestamp-5,100);
                equal(0,number("sessionSteps"));sample(COUNTER,103);equal(3,number("sessionSteps"));
                sensors.deliver(COUNTER,timestamp-1,1);equal(3,number("sessionSteps"));
                SensorEventListener oldListener=sensors.listeners.iterator().next();
                stop();timestamp+=1_000_000_000L;start("second");
                oldListener.onSensorChanged(new SensorEvent(new Sensor(COUNTER),timestamp-1,105));
                equal(-1,number("sessionBaselineRaw")); // stale callback cannot establish the new baseline
                sample(COUNTER,200);sample(COUNTER,202);
                sensors.deliver(COUNTER,1,1);equal(2,number("sessionSteps"));break;
            case "detector":
                setup(DETECTOR,ACCEL);start("detector");check("detector".equals(state().get("mode")),"detector before accel");
                sensors.deliver(DETECTOR,timestamp-1,1);equal(0,number("sessionSteps"));sample(DETECTOR,1);
                sensors.deliver(DETECTOR,timestamp,1);sample(DETECTOR,0);equal(1,number("sessionSteps"));
                stop();sample(DETECTOR,1);equal(1,number("sessionSteps"));equal(0,sensors.listeners.size());
                start("detector2");sample(DETECTOR,1);equal(1,number("sessionSteps"));equal(2,number("dailySteps"));break;
            case "accelerometer":
                setup(ACCEL);check(field("accelDetector")==null,"initially null");start("accel");
                AccelStepDetector detector=(AccelStepDetector)field("accelDetector");check(detector!=null,"START initializes detector");
                for(int i=0;i<200;i++)sample(ACCEL,.1f,.1f,(float)(9.81+2.4*Math.sin(2*Math.PI*i*20/600.0)));
                check(number("sessionSteps")>=4&&number("sessionSteps")<=8,"walking waveform");
                long steps=number("sessionSteps");stop();check(field("accelDetector")==null,"STOP releases detector");
                check(Math.abs(detector.gravityEstimate()-AccelStepDetector.GRAVITY)<.001,"STOP resets adaptive state");
                for(int i=0;i<1000;i++)sample(ACCEL,1,2,45);
                equal(steps,number("sessionSteps"));start("accel2");
                check(field("accelDetector")!=detector,"second START creates fresh detector");equal(0,number("sessionSteps"));break;
            case "pause_destroy_reopen":
                setup(COUNTER);start("first");sample(COUNTER,100);sample(COUNTER,110);plugin.handleOnPause();
                equal(0,sensors.listeners.size());check(!flag("trackingRequested"),"pause stopped");plugin.handleOnResume();equal(1,sensors.registrations);
                start("second");plugin.handleOnDestroy();equal(0,sensors.listeners.size());
                Context context=plugin.context;plugin=new VjPedometerPlugin();plugin.context=context;plugin.load();plugin.handleOnResume();
                equal(2,sensors.registrations);check(!flag("trackingRequested"),"reopen does not restart");
                start("third");sample(COUNTER,1);sample(COUNTER,3);equal(2,number("sessionSteps"));equal(12,number("dailySteps"));break;
            case "failed_start":
                setup(ACCEL);sensors.registerOk=false;PluginCall failed=new PluginCall();plugin.startTracking(failed);
                check(failed.error!=null,"failed registration rejected");equal(0,sensors.listeners.size());check(field("accelDetector")==null,"failed START releases detector");
                check(!flag("trackingActive")&&!flag("trackingRequested"),"failed START stays stopped");
                sensors.registerOk=true;sensors.registerThrows=true;failed=new PluginCall();plugin.startTracking(failed);
                check(failed.error!=null,"throw rejected");equal(0,sensors.listeners.size());break;
            case "failed_stop":
                setup(DETECTOR);start("first");sample(DETECTOR,1);sensors.unregisterFails=true;
                PluginCall failedStop=new PluginCall();plugin.stopTracking(failedStop);
                check(failedStop.error!=null,"STOP reports failure");check(!flag("listenerRemoved")&&flag("listenerRegistered"),"never fake removal");
                sample(DETECTOR,1);equal(1,number("sessionSteps"));sensors.unregisterFails=false;stop();equal(0,sensors.listeners.size());break;
            case "midnight":
                setup(COUNTER);start("first");sample(COUNTER,100);sample(COUNTER,103);
                Field day=VjPedometerPlugin.class.getDeclaredField("startDateMs");day.setAccessible(true);day.setLong(plugin,System.currentTimeMillis()-86400000L);
                sample(COUNTER,104);equal(4,number("sessionSteps"));equal(1,number("dailySteps"));break;
            case "permission_unavailable":
                setup(COUNTER);plugin.permission=PermissionState.DENIED;PluginCall denied=new PluginCall();plugin.startTracking(denied);
                check(denied.error!=null,"denied permission");equal(0,sensors.registrations);
                setup();PluginCall missing=new PluginCall();plugin.startTracking(missing);check(missing.error!=null,"missing sensor");equal(0,sensors.registrations);break;
            default: throw new AssertionError("unknown test: "+args[0]);
        }
        System.out.println("PASS "+args[0]);
    }
}
