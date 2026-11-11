package com.focus.personal;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Bundle;

/** Forwards Google's system consent result to the Capacitor ActivityCallback. No WebView. */
public class SheetsConsentActivity extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (state != null) return;
        PendingIntent consent = getIntent().getParcelableExtra("consent");
        if (consent == null) { setResult(RESULT_CANCELED); finish(); return; }
        try { startIntentSenderForResult(consent.getIntentSender(), 1, null, 0, 0, 0); }
        catch (Exception error) { setResult(RESULT_CANCELED); finish(); }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 1) { setResult(resultCode, data); finish(); }
    }
}
