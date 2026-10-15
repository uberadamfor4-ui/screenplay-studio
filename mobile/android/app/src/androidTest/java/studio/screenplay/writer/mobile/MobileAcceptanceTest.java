package studio.screenplay.writer.mobile;

import static org.junit.Assert.*;
import static androidx.test.espresso.intent.Intents.intending;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasAction;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.espresso.intent.Intents;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.Until;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class MobileAcceptanceTest {
    private ActivityScenario<MainActivity> scenario;
    private String js(String source) throws Exception {
        AtomicReference<String> value = new AtomicReference<>(); CountDownLatch latch = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(source, result -> { value.set(result); latch.countDown(); }));
        assertTrue("JavaScript callback timed out", latch.await(10, TimeUnit.SECONDS)); return value.get();
    }
    private void waitFor(String expression) throws Exception {
        long end = System.currentTimeMillis() + 45000;
        while (System.currentTimeMillis() < end) { if ("true".equals(js("Boolean(" + expression + ")"))) return; Thread.sleep(150); }
        fail("Timed out: " + expression + " DOM=" + js("document.body.innerText.slice(0,1800)"));
    }
    private void click(String selector) throws Exception { js("document.querySelector(" + org.json.JSONObject.quote(selector) + ").click()"); }
    private File fixture(String name) throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext(); File target = new File(context.getCacheDir(), name);
        try (InputStream input = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open(name); OutputStream output = new FileOutputStream(target)) { byte[] buffer = new byte[8192]; int size; while ((size = input.read(buffer)) != -1) output.write(buffer, 0, size); }
        return target;
    }
    private Uri uri(File file) { android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext(); return FileProvider.getUriForFile(context, context.getPackageName()+".fileprovider", file); }
    @Test public void nativeWritingImportRecoveryAndPdf() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class); Intents.init();
        try {
            waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly");
            assertEquals("Network permission must be absent", PackageManager.PERMISSION_DENIED, InstrumentationRegistry.getInstrumentation().getTargetContext().checkSelfPermission("android.permission.INTERNET"));
            js("document.querySelector('textarea').focus()");
            AtomicReference<Integer> availableHeight = new AtomicReference<>();
            scenario.onActivity(activity -> {
                WebView web = activity.getBridge().getWebView(); availableHeight.set(web.getHeight()); web.requestFocus();
                ((android.view.inputmethod.InputMethodManager)activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE)).showSoftInput(web, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);
            });
            Thread.sleep(1500);
            scenario.onActivity(activity -> {
                WebView web = activity.getBridge().getWebView();
                assertTrue("Keyboard must leave a visible editor", web.getHeight() > 150);
                assertTrue("Keyboard must resize the writing surface", web.getHeight() < availableHeight.get()-100);
                ((android.view.inputmethod.InputMethodManager)activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(web.getWindowToken(), 0);
            });
            Thread.sleep(500);
            for (String name : new String[]{"last-bus-import.docx", "last-bus-import.txt", "last-bus.fountain"}) {
                File input = fixture(name);
                intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent().setData(uri(input))));
                click("button[aria-label='本地剧本']");
                waitFor("document.querySelector('[role=dialog]')");
                js("Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='导入文件').click()");
                String expectedTitle = name.endsWith(".fountain") ? "末班车" : "last-bus-import";
                waitFor("!document.querySelector('[role=dialog]') && document.querySelector('.document-title strong').textContent===" + org.json.JSONObject.quote(expectedTitle));
                waitFor("document.querySelector('.document-title span').textContent==='已存至本机'");
                // Export through the real native bridge and re-read the complete project, beyond virtualized rows.
                File saved = new File(input.getParentFile(), "roundtrip-"+name+".ssproj");
                intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent().setData(uri(saved))));
                click("button[aria-label='功能']"); js("Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='导出文件').click()");
                js("Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='SSPROJ').click()");
                waitFor("document.querySelector('.document-title span').textContent==='已导出'");
                org.json.JSONObject project = new org.json.JSONObject(new String(LocalDocumentsPlugin.readBounded(new FileInputStream(saved), 20*1024*1024), StandardCharsets.UTF_8));
                assertEquals(43, project.getJSONArray("elements").length());
                click("button[aria-label='返回写作']");
                Intents.release(); Intents.init();
            }
            // An IME confirmation Enter must not split or lose the composing text.
            js("(()=>{let a=document.querySelector('textarea');a.focus();a.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));a.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,isComposing:true,bubbles:true}));a.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文省略号……'}));})()");
            assertEquals("No focus loss after composition", "true", js("document.activeElement.tagName==='TEXTAREA'"));
            // Print actual local HTML to a native PDF and return from the picker.
            File pdf = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(), "native-output.pdf");
            Intents.release(); Intents.init();
            click("button[aria-label='导出 PDF']");
            UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
            Thread.sleep(7000);
            File evidenceDir = InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null);
            device.dumpWindowHierarchy(new File(evidenceDir, "print-ui.xml")); device.takeScreenshot(new File(evidenceDir, "print-ui.png"));
            androidx.test.uiautomator.UiObject2 print = device.wait(Until.findObject(By.res(java.util.regex.Pattern.compile(".*:id/print_button"))), 15000);
            if (print == null) print = device.wait(Until.findObject(By.desc(java.util.regex.Pattern.compile("(?i).*(save|print).*(pdf|file).*"))), 10000);
            assertNotNull("System Save-as-PDF control", print); print.click();
            androidx.test.uiautomator.UiObject2 save = device.wait(Until.findObject(By.res(java.util.regex.Pattern.compile(".*:id/action_menu_save"))), 20000);
            if (save == null) save = device.wait(Until.findObject(By.text(java.util.regex.Pattern.compile("(?i)save"))), 10000);
            assertNotNull("System destination save control", save); save.click(); Thread.sleep(2500);
            byte[] bytes;
            try (android.os.ParcelFileDescriptor fd = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("cat /sdcard/Download/末班车.pdf")) { bytes = LocalDocumentsPlugin.readBounded(new FileInputStream(fd.getFileDescriptor()), 64*1024*1024); }
            assertTrue(bytes.length > 10000); assertEquals("%PDF-", new String(bytes, 0, 5, StandardCharsets.US_ASCII));
            File evidence = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "native-output.pdf");
            try (OutputStream output = new FileOutputStream(evidence)) { output.write(bytes); }
            scenario.recreate(); waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly");
            assertEquals("true", js("document.querySelector('.document-title strong').textContent.includes('末班')"));
            click("button[aria-label='本地剧本']");
            intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_CANCELED, null));
            js("Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='导入文件').click()"); waitFor("!document.querySelector('main').getAttribute('aria-busy').includes('true')");
            assertEquals("true", js("document.querySelector('.document-title strong').textContent.includes('末班')"));
        } finally { Intents.release(); scenario.close(); }
    }
    @Test public void rejectsOversizedAndUnsafeFiles() throws Exception {
        try { LocalDocumentsPlugin.safeFileName("../overwrite"); fail("Unsafe filename accepted"); } catch (IOException expected) {}
        try { LocalDocumentsPlugin.readBounded(new ByteArrayInputStream(new byte[1025]), 1024); fail("Oversize input accepted"); } catch (IOException expected) {}
        try { LocalDocumentsPlugin.validateWord(new byte[]{1,2,3}); fail("Invalid Word accepted"); } catch (IOException expected) {}
        LocalDocumentsPlugin.validateWord(LocalDocumentsPlugin.readBounded(new FileInputStream(fixture("last-bus-import.docx")), 20*1024*1024));
    }
}
