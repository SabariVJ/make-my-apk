package app.lovable.svj;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * Health Connect permission-rationale screen.
 *
 * <p>Android / Google Play require an activity that handles
 * {@code androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE} (and, on Android
 * 14+, VIEW_PERMISSION_USAGE with the HEALTH_PERMISSIONS category) so the user
 * can see why SVJ reads health data. Rather than inventing a separate web URL,
 * this opens SVJ's own in-app privacy page (/privacy) through the deep-link
 * scheme the app already declares.
 */
public class HealthPermissionsRationaleActivity extends Activity {

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    try {
      Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("app.lovable.svj://privacy"));
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
      startActivity(intent);
    } catch (Exception ignored) {
      // If the deep link cannot resolve, there is nothing useful to show here;
      // the OS already displays the permission list alongside this screen.
    }
    finish();
  }
}
