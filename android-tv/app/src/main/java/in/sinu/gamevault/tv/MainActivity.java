package in.sinu.gamevault.tv;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String GAMEVAULT_URL = "https://sinuksml.github.io/gamevault/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        openGameVault();
    }

    private void openGameVault() {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(GAMEVAULT_URL));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Install a TV browser such as TV Bro first.", Toast.LENGTH_LONG).show();
        }
        finish();
    }
}
