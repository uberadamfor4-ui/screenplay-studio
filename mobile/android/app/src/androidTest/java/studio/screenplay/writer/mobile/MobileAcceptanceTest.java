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
    private void click(String selector) throws Exception { String expression="document.querySelector("+org.json.JSONObject.quote(selector)+")"; waitFor(expression+" && !"+expression+".disabled"); js(expression+".click()"); }
    private void clickText(String title) throws Exception { String expression="Array.from(document.querySelectorAll('button')).find(x=>x.textContent==="+org.json.JSONObject.quote(title)+" && !x.disabled)"; waitFor(expression); js(expression+".click()"); }
    private void tapNative(androidx.test.uiautomator.BySelector selector) throws Exception {
        UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()); long deadline=System.currentTimeMillis()+30000;
        while(System.currentTimeMillis()<deadline) { androidx.test.uiautomator.UiObject2 node=device.findObject(selector); if(node!=null)try{node.click();return;}catch(androidx.test.uiautomator.StaleObjectException changed){} Thread.sleep(150); }
        fail("Native control did not settle: "+selector);
    }
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
            double initialViewport = Double.parseDouble(js("window.visualViewport ? window.visualViewport.height : innerHeight"));
            double cssX = Double.parseDouble(js("document.querySelector('textarea').getBoundingClientRect().left+12"));
            double cssY = Double.parseDouble(js("document.querySelector('textarea').getBoundingClientRect().top+12"));
            double cssWidth = Double.parseDouble(js("innerWidth"));
            AtomicReference<int[]> tap = new AtomicReference<>();
            scenario.onActivity(activity -> {
                WebView web = activity.getBridge().getWebView(); availableHeight.set(web.getHeight()); web.requestFocus();
                int[] position = new int[2]; web.getLocationOnScreen(position); double scale = web.getWidth()/cssWidth;
                tap.set(new int[]{position[0]+(int)(cssX*scale),position[1]+(int)(cssY*scale)});
            });
            UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).click(tap.get()[0],tap.get()[1]);
            Thread.sleep(2500);
            waitFor("(window.visualViewport ? window.visualViewport.height : innerHeight) < " + (initialViewport-60));
            System.out.println("MOBILE_KEYBOARD_GEOMETRY="+js("JSON.stringify({height:innerHeight,visual:window.visualViewport&&window.visualViewport.height,offset:window.visualViewport&&window.visualViewport.offsetTop,app:document.querySelector('main').getBoundingClientRect().toJSON(),toolbar:document.querySelector('.writing-toolbar').getBoundingClientRect().toJSON()})"));
            UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).takeScreenshot(new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "native-keyboard.png"));
            assertEquals("Toolbar stays above keyboard", "true", js("document.querySelector('.writing-toolbar').getBoundingClientRect().bottom <= (window.visualViewport ? window.visualViewport.height : innerHeight)+2"));
            scenario.onActivity(activity -> {
                WebView web = activity.getBridge().getWebView();
                assertTrue("Keyboard must leave a visible editor", web.getHeight() > 150);
                ((android.view.inputmethod.InputMethodManager)activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(web.getWindowToken(), 0);
            });
            Thread.sleep(500);
            for (String name : new String[]{"last-bus-import.docx", "last-bus-import.txt", "last-bus.fountain"}) {
                File input = fixture(name);
                intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent().setData(uri(input))));
                click("button[aria-label='本地剧本']");
                waitFor("document.querySelector('[role=dialog]')");
                clickText("导入文件");
                String expectedTitle = name.endsWith(".fountain") ? "末班车" : "last-bus-import";
                waitFor("!document.querySelector('[role=dialog]') && document.querySelector('.document-title strong').textContent===" + org.json.JSONObject.quote(expectedTitle));
                waitFor("document.querySelector('.document-title span').textContent==='已存至本机'");
                // Export through the real native bridge and re-read the complete project, beyond virtualized rows.
                File saved = new File(input.getParentFile(), "roundtrip-"+name+".ssproj");
                intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent().setData(uri(saved))));
                click("button[aria-label='功能']"); clickText("导出文件");
                clickText("SSPROJ");
                waitFor("document.querySelector('.document-title span').textContent==='已导出' && document.querySelector('main').getAttribute('aria-busy')==='false'");
                org.json.JSONObject project = new org.json.JSONObject(new String(LocalDocumentsPlugin.readBounded(new FileInputStream(saved), 20*1024*1024), StandardCharsets.UTF_8));
                assertEquals(43, project.getJSONArray("elements").length());
                click("button[aria-label='返回写作']");
                waitFor("!document.querySelector('[role=dialog]')");
                Intents.release(); Intents.init();
            }
            // An IME confirmation Enter must not split or lose the composing text.
            js("(()=>{let a=document.querySelector('textarea');a.focus();a.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));a.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,isComposing:true,bubbles:true}));a.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文省略号……'}));})()");
            assertEquals("No focus loss after composition", "true", js("document.activeElement.tagName==='TEXTAREA'"));
            // All native text export bridges and per-page PNG writes, using a debug-only SAF provider.
            for (String kind : new String[]{"FDX", "TXT"}) {
                File saved = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(), "native-roundtrip."+kind.toLowerCase(java.util.Locale.ROOT));
                intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent().setData(uri(saved))));
                click("button[aria-label='功能']"); clickText("导出文件"); clickText(kind);
                waitFor("document.querySelector('main').getAttribute('aria-busy')==='false' && document.querySelector('.document-title span').textContent==='已导出'");
                String content = new String(LocalDocumentsPlugin.readBounded(new FileInputStream(saved), 20*1024*1024), StandardCharsets.UTF_8);
                assertTrue(content.contains("林夏")); if (kind.equals("FDX")) assertTrue(content.contains("FinalDraft"));
                click("button[aria-label='返回写作']"); Intents.release(); Intents.init();
            }
            Uri tree = android.provider.DocumentsContract.buildTreeDocumentUri("studio.screenplay.writer.mobile.acceptance.documents", "root");
            intending(hasAction(Intent.ACTION_OPEN_DOCUMENT_TREE)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent().setData(tree)));
            click("button[aria-label='功能']"); clickText("导出文件"); clickText("PNG");
            waitFor("document.querySelector('main').getAttribute('aria-busy')==='false' && document.querySelector('.document-title span').textContent==='已导出'");
            File[] folders = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(),"png-acceptance").listFiles();
            assertNotNull(folders); assertEquals(1,folders.length); File[] pngs=folders[0].listFiles(); assertNotNull(pngs); assertEquals(3,pngs.length);
            for(File png:pngs){android.graphics.BitmapFactory.Options dimensions=new android.graphics.BitmapFactory.Options();dimensions.inJustDecodeBounds=true;android.graphics.BitmapFactory.decodeFile(png.getPath(),dimensions);assertEquals(1632,dimensions.outWidth);assertEquals(2112,dimensions.outHeight);assertTrue(png.length()>10000);}
            click("button[aria-label='返回写作']"); Intents.release(); Intents.init();
            File unicode = fixture("unicode-copy.ssproj");
            intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK,new Intent().setData(uri(unicode))));
            click("button[aria-label='本地剧本']"); clickText("导入文件");
            waitFor("!document.querySelector('[role=dialog]') && document.querySelector('.document-title span').textContent==='已存至本机'");
            // Print actual local HTML to a native PDF and return from the picker.
            UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).takeScreenshot(new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "native-writing.png"));
            File pdf = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(), "native-output.pdf");
            Intents.release(); Intents.init();
            click("button[aria-label='导出 PDF']");
            UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
            Thread.sleep(7000);
            File evidenceDir = InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null);
            device.dumpWindowHierarchy(new File(evidenceDir, "print-ui.xml")); device.takeScreenshot(new File(evidenceDir, "print-ui.png"));
            androidx.test.uiautomator.UiObject2 destination = device.wait(Until.findObject(By.res("com.android.printspooler", "destination_spinner")), 60000);
            assertNotNull("System print destination", destination); tapNative(By.res("com.android.printspooler", "destination_spinner"));
            androidx.test.uiautomator.UiObject2 pdfDestination = device.wait(Until.findObject(By.text(java.util.regex.Pattern.compile("(?i)save as pdf"))), 15000);
            assertNotNull("Save as PDF destination", pdfDestination); tapNative(By.text(java.util.regex.Pattern.compile("(?i)save as pdf")));
            // PrintSpooler can enable Save before its asynchronous page adapter has selected pages.
            assertTrue("A selected preview page must exist before final output", device.wait(Until.hasObject(By.res("com.android.printspooler", "page_content").selected(true)), 60000));
            device.dumpWindowHierarchy(new File(evidenceDir, "ready-print-ui.xml")); device.takeScreenshot(new File(evidenceDir, "ready-print-ui.png"));
            androidx.test.uiautomator.UiObject2 print = device.wait(Until.findObject(By.res(java.util.regex.Pattern.compile(".*:id/print_button")).enabled(true)), 30000);
            if (print == null) print = device.wait(Until.findObject(By.desc(java.util.regex.Pattern.compile("(?i).*(save|print).*(pdf|file).*"))), 10000);
            assertNotNull("System Save-as-PDF control", print); tapNative(By.res(java.util.regex.Pattern.compile(".*:id/print_button")).enabled(true));
            androidx.test.uiautomator.UiObject2 save = device.wait(Until.findObject(By.res(java.util.regex.Pattern.compile(".*:id/action_menu_save"))), 20000);
            if (save == null) save = device.wait(Until.findObject(By.text(java.util.regex.Pattern.compile("(?i)save"))), 10000);
            assertNotNull("System destination save control", save); save.click();
            byte[] bytes = new byte[0]; long pdfDeadline = System.currentTimeMillis()+45000;
            while (System.currentTimeMillis()<pdfDeadline) {
                android.os.ParcelFileDescriptor fd = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("cat /sdcard/Download/末班车.pdf");
                bytes = LocalDocumentsPlugin.readBounded(new android.os.ParcelFileDescriptor.AutoCloseInputStream(fd), 64*1024*1024);
                if (bytes.length>10000 && new String(bytes,0,5,StandardCharsets.US_ASCII).equals("%PDF-")) break;
                Thread.sleep(300);
            }
            assertTrue(bytes.length > 10000); assertEquals("%PDF-", new String(bytes, 0, 5, StandardCharsets.US_ASCII));
            assertTrue("System PDF save returns to the editor", device.wait(Until.hasObject(By.pkg("studio.screenplay.writer.mobile")), 30000));
            File evidence = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "native-output.pdf");
            try (OutputStream output = new FileOutputStream(evidence)) { output.write(bytes); }
            waitFor("document.querySelector('main').getAttribute('aria-busy')==='false' && document.querySelector('textarea') && !document.querySelector('textarea').readOnly");
            js("(()=>{const input=document.querySelector('textarea');input.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,input.value+' PDF后继续输入……');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
            waitFor("document.querySelector('textarea').value.includes('PDF后继续输入')");
            js("document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}))");
            waitFor("!document.querySelector('textarea').value.includes('PDF后继续输入')");
            js("document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}))");
            waitFor("document.querySelector('textarea').value.includes('PDF后继续输入') && document.querySelector('.document-title span').textContent==='已存至本机'");
            scenario.recreate(); waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly");
            assertEquals("true", js("document.querySelector('.document-title strong').textContent.includes('末班')"));
            click("button[aria-label='本地剧本']");
            intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_CANCELED, null));
            clickText("导入文件"); waitFor("!document.querySelector('main').getAttribute('aria-busy').includes('true')");
            assertEquals("true", js("document.querySelector('.document-title strong').textContent.includes('末班')"));
        } finally {
            UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()); File evidenceDir=InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null);
            device.dumpWindowHierarchy(new File(evidenceDir,"last-ui.xml")); device.takeScreenshot(new File(evidenceDir,"last-ui.png"));
            Intents.release();
            try { scenario.close(); }
            catch (NullPointerException cleanup) { if (cleanup.getMessage() == null || !cleanup.getMessage().contains("Current state was null unexpectedly")) throw cleanup; System.out.println("ActivityScenario close reported its known cross-task lifecycle limitation; functional assertions remain authoritative."); }
        }
    }
    @Test public void rejectsOversizedAndUnsafeFiles() throws Exception {
        try { LocalDocumentsPlugin.safeFileName("../overwrite"); fail("Unsafe filename accepted"); } catch (IOException expected) {}
        try { LocalDocumentsPlugin.readBounded(new ByteArrayInputStream(new byte[1025]), 1024); fail("Oversize input accepted"); } catch (IOException expected) {}
        try { LocalDocumentsPlugin.validateWord(new byte[]{1,2,3}); fail("Invalid Word accepted"); } catch (IOException expected) {}
        LocalDocumentsPlugin.validateWord(LocalDocumentsPlugin.readBounded(new FileInputStream(fixture("last-bus-import.docx")), 20*1024*1024));
    }
    @Test public void retainsProjectAfterOverwrite() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        try {
            waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly");
            assertEquals("Saved project survives package replacement", "true", js("document.querySelector('.document-title strong').textContent.includes('末班')"));
        } finally { scenario.close(); }
    }
    @Test public void seedOldVersionForUpgrade() throws Exception {
        scenario=ActivityScenario.launch(MainActivity.class); Intents.init();
        try {
            waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly");
            File input=fixture("last-bus-final.ssproj");
            intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK,new Intent().setData(uri(input))));
            click("button[aria-label='本地剧本']");clickText("导入文件");waitFor("!document.querySelector('[role=dialog]') && document.querySelector('.document-title strong').textContent.includes('末班')");
            js("(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,input.value+' 覆盖升级保留……');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
            waitFor("document.querySelector('textarea').value.includes('覆盖升级保留') && document.querySelector('.document-title span').textContent==='已存至本机'");
        } finally {Intents.release();scenario.close();}
    }
    @Test public void verifiesOldVersionUpgrade() throws Exception {
        scenario=ActivityScenario.launch(MainActivity.class);
        try {
            waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly");
            assertEquals("0.1.1",InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageManager().getPackageInfo("studio.screenplay.writer.mobile",0).versionName);
            assertEquals("true",js("document.querySelector('textarea').value.includes('覆盖升级保留') && document.querySelector('.document-title strong').textContent.includes('末班')"));
        } finally {scenario.close();}
    }
}
