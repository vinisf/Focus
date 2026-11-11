package com.focus.personal;

import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.identity.RevokeAccessRequest;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;

/** Google-managed consent UI. Focus never persists OAuth tokens or a client secret. */
@CapacitorPlugin(name = "SheetsAuth")
public class SheetsAuthPlugin extends Plugin {
    private static final String SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
    private boolean authorizing = false;

    @PluginMethod public void authorize(PluginCall call) {
        if (authorizing) { call.reject("Authorization already in progress"); return; }
        authorizing = true;
        getActivity().runOnUiThread(() -> {
            AuthorizationRequest request = AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope(SCOPE))).build();
            Identity.getAuthorizationClient(getActivity()).authorize(request)
                .addOnSuccessListener(result -> {
                    if (result.hasResolution()) {
                        Intent intent = new Intent(getContext(), SheetsConsentActivity.class);
                        intent.putExtra("consent", result.getPendingIntent());
                        startActivityForResult(call, intent, "consentResult");
                    } else resolve(call, result);
                })
                .addOnFailureListener(error -> { authorizing = false; call.reject("Google authorization unavailable; verify Android OAuth configuration"); });
        });
    }
    @ActivityCallback private void consentResult(PluginCall call, ActivityResult result) {
        authorizing = false;
        if (call == null) return;
        try { resolve(call, Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(result.getData())); }
        catch (Exception error) { call.reject("Google consent cancelled or unavailable"); }
    }
    @SuppressWarnings("deprecation")
    private void resolve(PluginCall call, AuthorizationResult result) {
        authorizing = false;
        // This conversion supplies the stable account ID without requesting profile/email scopes.
        com.google.android.gms.auth.api.signin.GoogleSignInAccount account = result.toGoogleSignInAccount();
        if (!result.getGrantedScopes().contains(SCOPE) || result.getAccessToken() == null || account == null || account.getId() == null) {
            call.reject("Read scope or account identity missing"); return;
        }
        JSObject session = new JSObject();
        session.put("accessToken", result.getAccessToken()); session.put("accountId", account.getId());
        call.resolve(session);
    }
    @PluginMethod public void disconnect(PluginCall call) {
        Identity.getAuthorizationClient(getActivity()).revokeAccess(RevokeAccessRequest.builder()
            .setScopes(Collections.singletonList(new Scope(SCOPE))).build())
            .addOnSuccessListener(ignored -> call.resolve())
            .addOnFailureListener(error -> call.reject("Remote revocation unavailable"));
    }
    @PluginMethod public void open(PluginCall call) {
        try {
            Uri uri = Uri.parse(call.getString("url", ""));
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) { call.reject("Invalid HTTPS link"); return; }
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri)); call.resolve();
        } catch (Exception error) { call.reject("Browser unavailable"); }
    }
}
