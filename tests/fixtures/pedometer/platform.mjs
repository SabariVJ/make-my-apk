// Minimal platform doubles for compiling the REAL native plugin on a JVM.
// There is no step/session algorithm here. SensorManager records physical
// register/unregister calls and can deliver late callbacks deliberately.
export const platformSources = {
  "android/Manifest.java": `package android; public class Manifest { public static class permission { public static final String ACTIVITY_RECOGNITION="activity"; } }`,
  "android/content/pm/ApplicationInfo.java": `package android.content.pm; public class ApplicationInfo { public static final int FLAG_DEBUGGABLE=2; public int flags=2; }`,
  "android/content/SharedPreferences.java": `package android.content;
    import java.util.*;
    public class SharedPreferences {
      final Map<String,Object> data=new HashMap<>();
      public long getLong(String k,long d){return data.containsKey(k)?((Number)data.get(k)).longValue():d;}
      public String getString(String k,String d){return (String)data.getOrDefault(k,d);}
      public Editor edit(){return new Editor();}
      public class Editor {
        public Editor putLong(String k,long v){data.put(k,v);return this;}
        public Editor putString(String k,String v){data.put(k,v);return this;}
        public void apply(){}
      }
    }`,
  "android/content/Context.java": `package android.content;
    import android.hardware.SensorManager; import android.content.pm.ApplicationInfo;
    public class Context {
      public static final int MODE_PRIVATE=0; public static final String SENSOR_SERVICE="sensor";
      public SensorManager sensors; public SharedPreferences prefs=new SharedPreferences();
      public Context(SensorManager s){sensors=s;}
      public Object getSystemService(String s){return sensors;}
      public ApplicationInfo getApplicationInfo(){return new ApplicationInfo();}
      public SharedPreferences getSharedPreferences(String n,int m){return prefs;}
    }`,
  "android/os/Build.java": `package android.os; public class Build { public static class VERSION { public static int SDK_INT=36; } public static class VERSION_CODES { public static final int Q=29; } }`,
  "android/os/SystemClock.java": `package android.os; public class SystemClock { public static long nanos=1000000000L; public static long elapsedRealtimeNanos(){return nanos;} }`,
  "android/util/Log.java": `package android.util; public class Log {
    public static int d(String t,String m){return 0;} public static int i(String t,String m){return 0;}
    public static int w(String t,String m){return 0;} public static int w(String t,String m,Throwable e){return 0;}
    public static int e(String t,String m,Throwable e){return 0;}
  }`,
  "android/hardware/Sensor.java": `package android.hardware; public class Sensor {
    public static final int TYPE_STEP_COUNTER=19,TYPE_STEP_DETECTOR=18,TYPE_ACCELEROMETER=1;
    final int type; public Sensor(int t){type=t;} public int getType(){return type;}
    public String getName(){return "Test sensor";} public String getVendor(){return "Test vendor";} public int getVersion(){return 1;}
  }`,
  "android/hardware/SensorEvent.java": `package android.hardware; public class SensorEvent {
    public Sensor sensor; public float[] values; public long timestamp;
    public SensorEvent(Sensor s,long t,float... v){sensor=s;timestamp=t;values=v;}
  }`,
  "android/hardware/SensorEventListener.java": `package android.hardware; public interface SensorEventListener { void onSensorChanged(SensorEvent e); void onAccuracyChanged(Sensor s,int a); }`,
  "android/hardware/SensorManager.java": `package android.hardware; import java.util.*;
    public class SensorManager {
      public static final int SENSOR_DELAY_GAME=1,SENSOR_DELAY_NORMAL=3;
      public final Map<Integer,Sensor> sensors=new HashMap<>();
      public final Set<SensorEventListener> listeners=new HashSet<>();
      public int registrations=0,removals=0; public boolean registerOk=true,unregisterFails=false,registerThrows=false;
      public SensorManager(int... types){for(int t:types)sensors.put(t,new Sensor(t));}
      public Sensor getDefaultSensor(int t){return sensors.get(t);}
      public boolean registerListener(SensorEventListener l,Sensor s,int d){
        registrations++; listeners.add(l);
        if(registerThrows)throw new RuntimeException("registration failed");
        return registerOk;
      }
      public void unregisterListener(SensorEventListener l){removals++;if(unregisterFails)throw new RuntimeException("removal failed");listeners.remove(l);}
      public void deliver(int type,long time,float... values){for(SensorEventListener l:new ArrayList<>(listeners))l.onSensorChanged(new SensorEvent(sensors.get(type),time,values));}
    }`,
  "com/getcapacitor/JSObject.java": `package com.getcapacitor; import java.util.*; public class JSObject extends HashMap<String,Object> { @Override public JSObject put(String k,Object v){super.put(k,v);return this;} }`,
  "com/getcapacitor/PermissionState.java": `package com.getcapacitor; public enum PermissionState { GRANTED,DENIED,PROMPT }`,
  "com/getcapacitor/PluginCall.java": `package com.getcapacitor; public class PluginCall {
    public JSObject value; public String error; public final String id;
    public PluginCall(){this("test");} public PluginCall(String s){id=s;}
    public String getString(String k,String d){return id==null?d:id;}
    public void resolve(){value=new JSObject();} public void resolve(JSObject v){value=v;}
    public void reject(String e){error=e;}
  }`,
  "com/getcapacitor/Plugin.java": `package com.getcapacitor; import android.content.Context; import java.util.*;
    public class Plugin {
      public Context context; public PermissionState permission=PermissionState.GRANTED;
      public List<JSObject> measurements=new ArrayList<>(),states=new ArrayList<>();
      public Context getContext(){return context;} public void load(){}
      public void checkPermissions(PluginCall c){} public void requestPermissions(PluginCall c){}
      public PermissionState getPermissionState(String n){return permission;}
      public void requestPermissionForAlias(String n,PluginCall c,String m){}
      public void notifyListeners(String name,JSObject value){if(name.equals("measurement"))measurements.add(value);else states.add(value);}
      public void handleOnPause(){} public void handleOnResume(){} public void handleOnDestroy(){}
    }`,
  "com/getcapacitor/PluginMethod.java": `package com.getcapacitor; public @interface PluginMethod {}`,
  "com/getcapacitor/annotation/Permission.java": `package com.getcapacitor.annotation; public @interface Permission { String[] strings(); String alias(); }`,
  "com/getcapacitor/annotation/PermissionCallback.java": `package com.getcapacitor.annotation; public @interface PermissionCallback {}`,
  "com/getcapacitor/annotation/CapacitorPlugin.java": `package com.getcapacitor.annotation; public @interface CapacitorPlugin { String name(); Permission[] permissions(); }`,
};
