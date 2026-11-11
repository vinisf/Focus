package com.focus.personal;

import android.content.Intent;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "IemaVault")
public class IemaVaultPlugin extends Plugin {
    private static final String ALIAS = "focus.iema.token.v1";
    private File file() { return new File(getContext().getNoBackupFilesDir(), "iema-vault"); }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    @PluginMethod public void set(PluginCall call) {
        try {
            String value = call.getString("value");
            if (value == null || value.isEmpty()) { call.reject("Credential required"); return; }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String packed = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP);
            android.util.AtomicFile atomic = new android.util.AtomicFile(file());
            java.io.FileOutputStream stream = atomic.startWrite();
            try { stream.write(packed.getBytes(StandardCharsets.UTF_8)); atomic.finishWrite(stream); }
            catch (Exception e) { atomic.failWrite(stream); throw e; }
            call.resolve();
        } catch (Exception e) { call.reject("Secure credential storage unavailable"); }
    }
    @PluginMethod public void get(PluginCall call) {
        try {
            JSObject result = new JSObject();
            if (!file().exists()) { result.put("value", JSObject.NULL); call.resolve(result); return; }
            String packed;
            try (java.io.FileInputStream input = new android.util.AtomicFile(file()).openRead(); java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
                byte[] buffer = new byte[1024]; int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                packed = output.toString("UTF-8");
            }
            String[] parts = packed.split(":");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            result.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception e) { call.reject("Secure credential unavailable; reconnect"); }
    }
    @PluginMethod public void remove(PluginCall call) {
        try {
            new android.util.AtomicFile(file()).delete();
            if (file().exists()) throw new Exception();
            KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null); store.deleteEntry(ALIAS); call.resolve();
        } catch (Exception e) { call.reject("Could not remove secure credential"); }
    }
    @PluginMethod public void open(PluginCall call) {
        try {
            Uri uri = Uri.parse(call.getString("url", ""));
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null) { call.reject("Invalid HTTPS URL"); return; }
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri)); call.resolve();
        } catch (Exception e) { call.reject("Browser unavailable"); }
    }
}
