package studio.screenplay.writer.mobile;

import android.inputmethodservice.InputMethodService;
import android.view.Gravity;
import android.view.View;
import android.widget.TextView;

/** Deterministic test driver: excluded from release builds. */
public class AcceptanceInputMethod extends InputMethodService {
    static volatile AcceptanceInputMethod instance;

    @Override public void onCreate() { super.onCreate(); instance = this; }
    @Override public void onDestroy() { if (instance == this) instance = null; super.onDestroy(); }
    @Override public boolean onEvaluateFullscreenMode() { return false; }
    @Override public View onCreateInputView() {
        TextView view = new TextView(this);
        view.setText("Android input acceptance");
        view.setGravity(Gravity.CENTER);
        view.setTextSize(18);
        view.setTextColor(android.graphics.Color.rgb(35, 50, 45));
        view.setBackgroundColor(android.graphics.Color.rgb(235, 239, 237));
        view.setHeight(Math.round(220 * getResources().getDisplayMetrics().density));
        return view;
    }
}
