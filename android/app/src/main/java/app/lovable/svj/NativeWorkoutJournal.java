package app.lovable.svj;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import org.json.JSONObject;

/** SQLite transactions retain every fix while JavaScript is suspended. */
final class NativeWorkoutJournal extends SQLiteOpenHelper {
  NativeWorkoutJournal(Context c) { super(c, "svj_workout_journal_v2.db", null, 1); }
  @Override public void onCreate(SQLiteDatabase db) { db.execSQL("CREATE TABLE events(owner TEXT NOT NULL, activity TEXT NOT NULL, seq INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,activity,seq))"); }
  @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { throw new IllegalStateException("Unsupported journal version"); }
  synchronized void append(String owner, String activity, String kind, long at, JSONObject payload) {
    SQLiteDatabase db = getWritableDatabase(); db.beginTransaction();
    try {
      long sequence;
      try (Cursor c = db.rawQuery("SELECT COALESCE(MAX(seq),0)+1 FROM events WHERE owner=? AND activity=?", new String[]{owner,activity})) { c.moveToFirst(); sequence = c.getLong(0); }
      payload.put("ownerId", owner); payload.put("activityId", activity); payload.put("sequence", sequence); payload.put("kind", kind); payload.put("timestampMs", at);
      db.execSQL("INSERT INTO events(owner,activity,seq,payload) VALUES(?,?,?,?)", new Object[]{owner,activity,sequence,payload.toString()}); db.setTransactionSuccessful();
    } catch (Exception e) { throw new IllegalStateException("Device storage is unavailable", e); }
    finally { db.endTransaction(); }
  }
  JSArray read(String owner, String activity, long after, int limit) {
    JSArray result = new JSArray();
    try (Cursor c = getReadableDatabase().rawQuery("SELECT payload FROM events WHERE owner=? AND activity=? AND seq>? ORDER BY seq LIMIT ?", new String[]{owner,activity,Long.toString(Math.max(0,after)),Integer.toString(Math.min(500,Math.max(1,limit)))})) {
      while(c.moveToNext()) result.put(new JSObject(c.getString(0)));
    } catch(Exception e) { throw new IllegalStateException("Could not read saved recording",e); }
    return result;
  }
  void clear(String owner, String activity) { getWritableDatabase().delete("events", "owner=? AND activity=?", new String[]{owner,activity}); }
  JSArray list(String owner) {
    JSArray result = new JSArray();
    try (Cursor c = getReadableDatabase().rawQuery("SELECT e.payload,(SELECT payload FROM events x WHERE x.owner=e.owner AND x.activity=e.activity ORDER BY x.seq DESC LIMIT 1) FROM events e WHERE e.owner=? AND e.seq=1 ORDER BY e.rowid", new String[]{owner})) {
      while (c.moveToNext()) { JSObject header = new JSObject(c.getString(0)); header.put("ended", new JSONObject(c.getString(1)).optString("kind").equals("end")); result.put(header); }
    } catch(Exception e) { throw new IllegalStateException("Could not list retained recordings",e); }
    return result;
  }
}
