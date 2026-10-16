package studio.screenplay.writer.mobile;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override public void onPause() {
        if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('android-background'))", null);
        super.onPause();
    }

    @Override public void onResume() {
        super.onResume();
        if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('android-foreground'))", null);
    }

    @Override public void onCreate(Bundle state) {
        registerPlugin(LocalDocumentsPlugin.class);
        super.onCreate(state);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        View content = findViewById(android.R.id.content);
        if (android.os.Build.VERSION.SDK_INT < 30) {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        } else {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return insets;
            });
        }
        ViewCompat.requestApplyInsets(content);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('android-back'))", null); }
        });
    }
}
