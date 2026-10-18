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
    private android.view.inputmethod.InputConnection inputConnection;
    private void resetNativeIme() throws Exception {
        UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        String own="studio.screenplay.writer.mobile/.AcceptanceInputMethod";
        android.content.ComponentName ownComponent=android.content.ComponentName.unflattenFromString(own);
        device.executeShellCommand("ime enable "+own);
        for(String candidate:device.executeShellCommand("ime list -s").trim().split("\\s+")){
            android.content.ComponentName component=android.content.ComponentName.unflattenFromString(candidate);
            if(component!=null&&!component.equals(ownComponent)){device.executeShellCommand("ime set "+candidate);break;}
        }
        device.executeShellCommand("ime set "+own);
        scenario.onActivity(activity->{WebView web=activity.getBridge().getWebView();((android.view.inputmethod.InputMethodManager)activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE)).restartInput(web);});
    }
    private void tapEditor() throws Exception {
        js("document.querySelector('textarea').scrollIntoView({block:'center'})");
        double x=Double.parseDouble(js("document.querySelector('textarea').getBoundingClientRect().left+12"));
        double y=Double.parseDouble(js("document.querySelector('textarea').getBoundingClientRect().top+12"));
        double width=Double.parseDouble(js("innerWidth"));AtomicReference<int[]> point=new AtomicReference<>();
        scenario.onActivity(activity->{WebView web=activity.getBridge().getWebView();int[] position=new int[2];web.getLocationOnScreen(position);double scale=web.getWidth()/width;point.set(new int[]{position[0]+(int)(x*scale),position[1]+(int)(y*scale)});});
        UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).click(point.get()[0],point.get()[1]);
        waitFor("document.activeElement===document.querySelector('textarea') && !document.activeElement.readOnly");
        js("(()=>{const a=document.querySelector('textarea');a.setSelectionRange(a.value.length,a.value.length)})()");
    }
    private void composeNative(String text, boolean commit) throws Exception {
        String expected=new org.json.JSONArray("["+js("document.querySelector('textarea').value")+"]").getString(0);
        long deadline = System.currentTimeMillis() + 10000;
        boolean synchronizedEditor=false;
        do {
            scenario.onActivity(activity -> inputConnection = AcceptanceInputMethod.instance == null ? null : AcceptanceInputMethod.instance.getCurrentInputConnection());
            if (inputConnection != null) {
                android.view.inputmethod.ExtractedText current=inputConnection.getExtractedText(new android.view.inputmethod.ExtractedTextRequest(),0);
                synchronizedEditor=current!=null && current.text!=null && expected.contentEquals(current.text);
                if(synchronizedEditor)break;
            }
            Thread.sleep(100);
        } while (System.currentTimeMillis() < deadline);
        assertTrue("Native input connection must match the currently focused editor", synchronizedEditor);
        android.os.Handler handler = inputConnection.getHandler();
        if (handler == null) handler = new android.os.Handler(android.os.Looper.getMainLooper());
        CountDownLatch done = new CountDownLatch(1); AtomicReference<Boolean> accepted = new AtomicReference<>(false);
        handler.post(() -> { try { accepted.set(commit ? inputConnection.commitText(text, 1) : inputConnection.setComposingText(text, 1)); } finally { done.countDown(); } });
        assertTrue("Android composition callback timed out", done.await(10, TimeUnit.SECONDS));
        assertTrue("Android input connection must accept composition", accepted.get());
    }
    private String js(String source) throws Exception {
        AtomicReference<String> value = new AtomicReference<>(); CountDownLatch latch = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(source, result -> { value.set(result); latch.countDown(); }));
        assertTrue("JavaScript callback timed out", latch.await(10, TimeUnit.SECONDS)); return value.get();
    }
    private void waitFor(String expression) throws Exception {
        long end = System.currentTimeMillis() + 45000;
        while (System.currentTimeMillis() < end) { if ("true".equals(js("Boolean(" + expression + ")"))) return; Thread.sleep(150); }
        fail("Timed out: " + expression + " DOM=" + js("JSON.stringify({body:document.body&&document.body.innerText.slice(0,1800),status:document.querySelector('.document-title span')&&document.querySelector('.document-title span').textContent,values:[...document.querySelectorAll('textarea')].slice(0,2).map(x=>x.value),beforeIme:window.__beforeIme,errors:window.__qaErrors})"));
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
            resetNativeIme();
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
                waitFor("document.querySelector('[role=dialog][aria-label=导入确认工作台]') && document.querySelector('main').getAttribute('aria-busy')==='false'");
                click(".workflow-check input");clickText("确认为新项目");
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
                org.json.JSONArray expected = new org.json.JSONObject(new String(LocalDocumentsPlugin.readBounded(new FileInputStream(fixture("last-bus-final.ssproj")),20*1024*1024),StandardCharsets.UTF_8)).getJSONArray("elements");
                for(int index=0;index<expected.length();index++){
                    assertEquals(name+" paragraph type "+index,expected.getJSONObject(index).getString("type"),project.getJSONArray("elements").getJSONObject(index).getString("type"));
                    assertEquals(name+" paragraph text "+index,expected.getJSONObject(index).getString("text"),project.getJSONArray("elements").getJSONObject(index).getString("text"));
                }
                click("button[aria-label='返回写作']");
                waitFor("!document.querySelector('[role=dialog]')");
                Intents.release(); Intents.init();
            }
            // An IME confirmation Enter must not split or lose the composing text.
            js("(()=>{let a=document.querySelector('textarea');a.focus();a.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));a.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,isComposing:true,bubbles:true}));a.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文省略号……'}));})()");
            assertEquals("No focus loss after composition", "true", js("document.activeElement.tagName==='TEXTAREA'"));
            // Long Chinese candidate selection must undo as a single committed word, not to pinyin.
            js("window.__beforeIme=document.querySelector('textarea').value;window.__imeReady=false;requestAnimationFrame(()=>window.__imeReady=true)");
            waitFor("window.__imeReady===true");
            tapEditor();
            composeNative("zhong",false);
            waitFor("document.querySelector('textarea').value===window.__beforeIme+'zhong'");
            Thread.sleep(1100);
            composeNative("中文……",true);
            waitFor("document.querySelector('textarea').value===window.__beforeIme+'中文……'");
            js("window.__imeReady=false;requestAnimationFrame(()=>window.__imeReady=true)");waitFor("window.__imeReady===true");
            js("document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}))");
            waitFor("document.querySelector('textarea').value===window.__beforeIme");
            js("document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}))");
            waitFor("document.querySelector('textarea').value===window.__beforeIme+'中文……'");
            waitFor("document.querySelector('.document-title span').textContent==='已存至本机'");
            // Inject a transient primary-store outage and verify the unchanged edit is retried.
            File recoveryFile=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),"writing-recovery.json");
            org.json.JSONObject olderRecovery=new org.json.JSONObject(new String(LocalDocumentsPlugin.readBounded(new FileInputStream(recoveryFile),32*1024*1024),StandardCharsets.UTF_8));
            js("(()=>{const open=IDBFactory.prototype.open;window.__failDb=true;IDBFactory.prototype.open=function(...args){if(window.__failDb)throw new DOMException('Injected transient store outage','QuotaExceededError');return open.apply(this,args)};const a=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(a,window.__beforeIme+'自动重试保留……');a.dispatchEvent(new Event('input',{bubbles:true}));})()");
            waitFor("!!document.querySelector('[role=alert]')");js("window.__failDb=false");
            waitFor("document.querySelector('.document-title span').textContent==='已存至本机'");
            olderRecovery.put("updatedAt","2099-01-01T00:00:00.000Z");olderRecovery.put("recoveryPending",false);
            try(OutputStream output=new FileOutputStream(recoveryFile)){output.write(olderRecovery.toString().getBytes(StandardCharsets.UTF_8));}
            scenario.recreate();waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly");
            assertEquals("Clock-skewed old recovery must not replace the newer primary revision","true",js("document.querySelector('textarea').value.includes('自动重试保留')"));
            Thread.sleep(1100);
            org.json.JSONObject invalidRecovery=new org.json.JSONObject(new String(LocalDocumentsPlugin.readBounded(new FileInputStream(recoveryFile),32*1024*1024),StandardCharsets.UTF_8));
            invalidRecovery.put("project",new org.json.JSONObject());
            try(OutputStream output=new FileOutputStream(recoveryFile)){output.write(invalidRecovery.toString().getBytes(StandardCharsets.UTF_8));}
            scenario.recreate();waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly");
            assertEquals("Invalid recovery must leave the valid primary text visible","true",js("document.querySelector('textarea').value.includes('自动重试保留')"));
            // Background rescue must bypass a primary store that never completes, not just a rejected write.
            for(int cycle=0;cycle<3;cycle++){
                String latestText="后台最新中文稿……"+cycle;
                js("(()=>{const open=IDBFactory.prototype.open;IDBFactory.prototype.open=function(...args){const request=open.apply(this,args),add=request.addEventListener;request.addEventListener=function(type,listener,options){if(type==='success')return;return add.call(this,type,listener,options)};return request};const a=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(a,"+org.json.JSONObject.quote(latestText)+");a.dispatchEvent(new Event('input',{bubbles:true}));})()");
                scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
                boolean rescuedLatest=false;long rescueDeadline=System.currentTimeMillis()+10000;
                while(System.currentTimeMillis()<rescueDeadline){
                    try{org.json.JSONObject latest=new org.json.JSONObject(new String(LocalDocumentsPlugin.readBounded(new FileInputStream(recoveryFile),32*1024*1024),StandardCharsets.UTF_8));rescuedLatest=latest.getJSONObject("project").getJSONArray("elements").getJSONObject(0).getString("text").equals(latestText);}catch(Exception pending){}
                    if(rescuedLatest)break;Thread.sleep(100);
                }
                assertTrue("Native pause must write the latest rescue without waiting for IndexedDB",rescuedLatest);
                scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED);scenario.recreate();
                waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly");
                assertEquals("Background draft survives repeated WebView recreation","true",js("document.querySelector('textarea').value==="+org.json.JSONObject.quote(latestText)));
            }
            // Restore the fixture's first scene before the PDF and PNG geometry comparisons.
            js("(()=>{const a=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(a,'内景 便利店 - 夜');a.dispatchEvent(new Event('input',{bubbles:true}));})()");
            waitFor("document.querySelector('.document-title span').textContent==='已存至本机'");
            intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_CANCELED,null));
            click("button[aria-label='功能']");clickText("导出文件");clickText("SSPROJ");
            waitFor("document.querySelector('main').getAttribute('aria-busy')==='false' && document.querySelector('.document-title span').textContent==='已取消导出'");
            click("button[aria-label='返回写作']");Intents.release();Intents.init();
            File diagnostic = File.createTempFile("diagnostic-", ".json", InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir());
            intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent().setData(uri(diagnostic))));
            click("button[aria-label='功能']"); clickText("保存与恢复"); clickText("导出诊断包");
            waitFor("document.querySelector('main').getAttribute('aria-busy')==='false' && document.querySelector('.document-title span').textContent==='已导出'");
            String diagnosticText = new String(LocalDocumentsPlugin.readBounded(new FileInputStream(diagnostic),1024*1024),StandardCharsets.UTF_8);
            org.json.JSONObject diagnosticJson = new org.json.JSONObject(diagnosticText);
            assertEquals("android",diagnosticJson.getString("platform"));
            assertEquals("0.1.8",diagnosticJson.getString("version"));
            assertFalse(diagnosticText.contains("林夏"));
            assertFalse(diagnosticText.contains("/data/"));
            assertFalse(diagnosticJson.getJSONObject("privacy").getBoolean("automaticallyUploaded"));
            click("button[aria-label='返回写作']"); Intents.release(); Intents.init();
            tapEditor(); composeNative("诊断导出后继续输入",true);
            waitFor("document.querySelector('.document-title span').textContent==='已存至本机'");
            // All native text export bridges and per-page PNG writes, using a debug-only SAF provider.
            for (String kind : new String[]{"FDX", "TXT", "FDX", "TXT"}) {
                File saved = File.createTempFile("native-roundtrip-", "."+kind.toLowerCase(java.util.Locale.ROOT),InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir());
                intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent().setData(uri(saved))));
                click("button[aria-label='功能']"); clickText("导出文件"); clickText(kind);
                long savedDeadline=System.currentTimeMillis()+45000;
                while((!saved.isFile() || saved.length()==0) && System.currentTimeMillis()<savedDeadline)Thread.sleep(100);
                assertTrue("Native text export exists: "+kind,saved.isFile() && saved.length()>0);
                waitFor("document.querySelector('main').getAttribute('aria-busy')==='false'");
                String content = new String(LocalDocumentsPlugin.readBounded(new FileInputStream(saved), 20*1024*1024), StandardCharsets.UTF_8);
                assertTrue(content.contains("林夏")); if (kind.equals("FDX")) assertTrue(content.contains("FinalDraft"));
                click("button[aria-label='返回写作']"); Intents.release(); Intents.init();
            }
            Uri tree = android.provider.DocumentsContract.buildTreeDocumentUri("studio.screenplay.writer.mobile.acceptance.documents", "root");
            intending(hasAction(Intent.ACTION_OPEN_DOCUMENT_TREE)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK, new Intent().setData(tree)));
            click("button[aria-label='功能']"); clickText("导出文件"); clickText("PNG");
            long pngDeadline=System.currentTimeMillis()+45000;
            while(System.currentTimeMillis()<pngDeadline){
                File[] roots=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(),"png-acceptance").listFiles();
                File[] pages=roots!=null && roots.length==1 ? roots[0].listFiles() : null;
                if(pages!=null && pages.length==3)break;
                Thread.sleep(100);
            }
            waitFor("document.querySelector('main').getAttribute('aria-busy')==='false'");
            File[] folders = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(),"png-acceptance").listFiles();
            assertNotNull(folders); assertEquals(1,folders.length); File[] pngs=folders[0].listFiles(); assertNotNull(pngs); assertEquals(3,pngs.length);
            for(File png:pngs){android.graphics.BitmapFactory.Options dimensions=new android.graphics.BitmapFactory.Options();dimensions.inJustDecodeBounds=true;android.graphics.BitmapFactory.decodeFile(png.getPath(),dimensions);assertEquals(1632,dimensions.outWidth);assertEquals(2112,dimensions.outHeight);assertTrue(png.length()>10000);}
            click("button[aria-label='返回写作']"); Intents.release(); Intents.init();
            File unicode = fixture("unicode-copy.ssproj");
            intending(hasAction(Intent.ACTION_OPEN_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK,new Intent().setData(uri(unicode))));
            click("button[aria-label='本地剧本']"); clickText("导入文件");
            waitFor("document.querySelector('[role=dialog][aria-label=离线交接检查]') && document.querySelector('main').getAttribute('aria-busy')==='false'");clickText("打开来稿独立副本");
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
            androidx.test.uiautomator.UiObject2 filename = device.wait(Until.findObject(By.clazz("android.widget.EditText")),20000);
            assertNotNull("System output filename",filename);filename.setText("Screenplay-Unicode-QA.pdf");
            androidx.test.uiautomator.UiObject2 save = device.wait(Until.findObject(By.res(java.util.regex.Pattern.compile(".*:id/action_menu_save"))), 20000);
            if (save == null) save = device.wait(Until.findObject(By.text(java.util.regex.Pattern.compile("(?i)save"))), 10000);
            assertNotNull("System destination save control", save); save.click();
            byte[] bytes = new byte[0]; boolean completePdf = false; long pdfDeadline = System.currentTimeMillis()+60000;
            while (System.currentTimeMillis()<pdfDeadline) {
                android.os.ParcelFileDescriptor fd = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("cat /sdcard/Download/Screenplay-Unicode-QA.pdf");
                bytes = LocalDocumentsPlugin.readBounded(new android.os.ParcelFileDescriptor.AutoCloseInputStream(fd), 64*1024*1024);
                if (bytes.length>10000 && new String(bytes,0,5,StandardCharsets.US_ASCII).equals("%PDF-") && new String(bytes,Math.max(0,bytes.length-256),Math.min(bytes.length,256),StandardCharsets.US_ASCII).contains("%%EOF")) {
                    try {
                        try(OutputStream output=new FileOutputStream(pdf)){output.write(bytes);}
                        try(android.os.ParcelFileDescriptor descriptor=android.os.ParcelFileDescriptor.open(pdf,android.os.ParcelFileDescriptor.MODE_READ_ONLY);android.graphics.pdf.PdfRenderer renderer=new android.graphics.pdf.PdfRenderer(descriptor)) {completePdf=renderer.getPageCount()==4;}
                    } catch(IOException incomplete) { completePdf=false; }
                    if(completePdf)break;
                }
                Thread.sleep(300);
            }
            assertTrue("Complete four-page PDF must finish writing before it is collected",completePdf); assertEquals("%PDF-", new String(bytes, 0, 5, StandardCharsets.US_ASCII));
            assertTrue("System PDF save returns to the editor", device.wait(Until.hasObject(By.pkg("studio.screenplay.writer.mobile")), 30000));
            File evidence = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), "native-output.pdf");
            try (OutputStream output = new FileOutputStream(evidence)) { output.write(bytes); }
            waitFor("document.querySelector('main').getAttribute('aria-busy')==='false' && document.querySelector('textarea') && !document.querySelector('textarea').readOnly");
            for(int repeat=0;repeat<2;repeat++){
                click("button[aria-label='导出 PDF']");
                assertNotNull("Repeated PDF opens a fresh print session",device.wait(Until.findObject(By.res("com.android.printspooler","destination_spinner")),60000));
                device.pressBack();
                assertTrue("Canceling repeated PDF returns from the print session",device.wait(Until.gone(By.res("com.android.printspooler","destination_spinner")),30000));
                waitFor("document.querySelector('main').getAttribute('aria-busy')==='false' && !document.querySelector('textarea').readOnly");
            }
            tapEditor();composeNative(" PDF后继续输入……",true);
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
    @Test public void recoveryWriteFailuresNeverReplaceThePreviousDraft() throws Exception {
        java.lang.reflect.Field queue=LocalDocumentsPlugin.class.getDeclaredField("recoveryIo");queue.setAccessible(true);
        assertTrue("Recreated activities share one recovery writer",java.lang.reflect.Modifier.isStatic(queue.getModifiers()));
        assertSame(queue.get(new LocalDocumentsPlugin()),queue.get(new LocalDocumentsPlugin()));
        File base=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(),"recovery-write-acceptance.json");
        byte[] old="上一次完整落盘的中文稿……".getBytes(StandardCharsets.UTF_8), next="最后修改的新稿".getBytes(StandardCharsets.UTF_8);
        RecoveryFile store=new RecoveryFile(base);store.write(old);
        RecoveryFile[] faults={
            new RecoveryFile(base){@Override void writePending(File pending,byte[] bytes)throws IOException{try(FileOutputStream output=new FileOutputStream(pending)){output.write(bytes,0,2);}throw new IOException("Injected partial write");}},
            new RecoveryFile(base){@Override void writePending(File pending,byte[] bytes)throws IOException{
                assertEquals("Storage exhaustion requires explicit emulator-only opt-in","1",InstrumentationRegistry.getArguments().getString("emulatorStorageProbe"));
                assertTrue("Never exhaust storage on a physical device",android.os.Build.HARDWARE.equals("ranchu")||android.os.Build.HARDWARE.equals("goldfish"));
                try(FileOutputStream output=new FileOutputStream(pending)){
                    long unavailable=new android.os.StatFs(pending.getParent()).getAvailableBytes()+64L*1024*1024;
                    try{android.system.Os.posix_fallocate(output.getFD(),0,unavailable);fail("Allocation beyond available emulator storage unexpectedly succeeded");}
                    catch(android.system.ErrnoException error){assertEquals("Kernel must report actual ENOSPC",android.system.OsConstants.ENOSPC,error.errno);System.out.println("RECOVERY_KERNEL_ENOSPC_CONFIRMED");throw new IOException("Kernel ENOSPC",error);}
                }
            }},
            new RecoveryFile(base){@Override void replace(File from,File to)throws IOException{throw new IOException("Injected rename failure");}}
        };
        for(RecoveryFile fault:faults){try{fault.write(next);fail("A failed write must not acknowledge success");}catch(IOException expected){}assertArrayEquals("Previous complete draft survives",old,store.read());}
        try{new RecoveryFile(base){@Override void syncDirectory(File directory)throws IOException{throw new IOException("Injected sync failure");}}.write(next);fail("Directory sync failure must not acknowledge success");}catch(IOException expected){}
        assertArrayEquals("A committed but unacknowledged draft stays complete",next,store.read());
        try(FileOutputStream partial=new FileOutputStream(base+".pending")){partial.write(1);}assertArrayEquals("Process death during a new write does not select a partial temporary file",next,store.read());
        try(FileOutputStream legacy=new FileOutputStream(base+".bak")){legacy.write(old);}assertArrayEquals("Legacy atomic backup is recovered",old,store.read());store.write(next);assertArrayEquals(next,store.read());
        base.delete();new File(base+".pending").delete();
    }
    private org.json.JSONObject checkpoint() throws Exception {
        return new org.json.JSONObject(new String(new RecoveryFile(new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),"writing-recovery.json")).read(),StandardCharsets.UTF_8));
    }
    private void awaitCheckpoint(String text) throws Exception {
        long deadline=System.currentTimeMillis()+15000;
        while(System.currentTimeMillis()<deadline){if(checkpoint().getJSONObject("project").getJSONArray("elements").getJSONObject(0).getString("text").equals(text))return;Thread.sleep(100);}
        fail("Native checkpoint did not include the final visible text");
    }
    private void hangPrimary() throws Exception {
        js("(()=>{const open=IDBFactory.prototype.open;IDBFactory.prototype.open=function(...args){const r=open.apply(this,args),add=r.addEventListener;r.addEventListener=function(type,...rest){if(type==='success')return;return add.call(this,type,...rest)};return r}})()");
    }
    private org.json.JSONArray nativeRecords() throws Exception {
        js("(()=>{window.__qaRecords=null;const r=indexedDB.open('screenplay-mobile-library',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>{window.__qaRecords=q.result;db.close()}}})()");
        waitFor("window.__qaRecords!==null");return new org.json.JSONArray(js("window.__qaRecords"));
    }
    private org.json.JSONObject nativeRecord(String id) throws Exception {
        org.json.JSONArray all=nativeRecords();for(int i=0;i<all.length();i++)if(all.getJSONObject(i).getString("id").equals(id))return all.getJSONObject(i);throw new AssertionError("Missing project "+id);
    }
    private void assertJsonEquals(String location,Object expected,Object actual) throws Exception {
        if(expected instanceof org.json.JSONObject){
            assertTrue(location,actual instanceof org.json.JSONObject);org.json.JSONObject left=(org.json.JSONObject)expected,right=(org.json.JSONObject)actual;assertEquals(location,left.length(),right.length());
            java.util.Iterator<String> keys=left.keys();while(keys.hasNext()){String key=keys.next();assertTrue(location+"."+key,right.has(key));assertJsonEquals(location+"."+key,left.get(key),right.get(key));}
        }else if(expected instanceof org.json.JSONArray){
            assertTrue(location,actual instanceof org.json.JSONArray);org.json.JSONArray left=(org.json.JSONArray)expected,right=(org.json.JSONArray)actual;assertEquals(location,left.length(),right.length());
            for(int i=0;i<left.length();i++)assertJsonEquals(location+"["+i+"]",left.get(i),right.get(i));
        }else if(expected instanceof Number && actual instanceof Number)assertEquals(location,((Number)expected).doubleValue(),((Number)actual).doubleValue(),0);
        else assertEquals(location,expected,actual);
    }
    @Test public void manualFeedbackAndSubmissionReturnToTyping() throws Exception {
        scenario=ActivityScenario.launch(MainActivity.class);Intents.init();
        try {
            waitFor("document.querySelector('textarea') && document.querySelector('.document-title span').textContent==='已存至本机'");resetNativeIme();
            click("button[aria-label='功能']");clickText("使用帮助与 BUG 反馈");clickText("BUG 反馈");
            waitFor("document.querySelector('.feedback-qr').naturalWidth>0");
            assertEquals("true",js("document.querySelector('.workflow-fields textarea[readonly]').value.includes('0.1.8') && !/[A-Z]:\\\\|\\/Users\\//.test(document.querySelector('.workflow-fields textarea[readonly]').value)"));
            click(".workflow-dialog header button");
            click("button[aria-label='功能']");clickText("投稿交付包");
            js("(()=>{const e=document.querySelector('textarea[aria-label=一句话故事]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'末班车之前，母女把话说清楚。');e.dispatchEvent(new Event('input',{bubbles:true}))})()");
            waitFor("document.querySelector('textarea[aria-label=一句话故事]').value.includes('母女')");
            click(".workflow-check input");
            File saved=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir(),"submission-native.zip");
            intending(hasAction(Intent.ACTION_CREATE_DOCUMENT)).respondWith(new Instrumentation.ActivityResult(Activity.RESULT_OK,new Intent().setData(uri(saved))));
            clickText("生成 ZIP 交付包");waitFor("document.querySelector('.workflow-dialog footer [role=status]').textContent.includes('交付包已保存')");
            try(java.util.zip.ZipFile zip=new java.util.zip.ZipFile(saved)){
                assertNotNull(zip.getEntry("script.txt"));assertNotNull(zip.getEntry("script.fdx"));assertNotNull(zip.getEntry("README.txt"));assertNull(zip.getEntry("script.pdf"));
                assertEquals("末班车之前，母女把话说清楚。",new String(LocalDocumentsPlugin.readBounded(zip.getInputStream(zip.getEntry("logline.txt")),200000),StandardCharsets.UTF_8));
            }
            click(".workflow-dialog header button");tapEditor();composeNative(" 交付后继续中文输入……",true);
            waitFor("document.querySelector('textarea').value.endsWith(' 交付后继续中文输入……') && document.querySelector('.document-title span').textContent==='已存至本机'");
            awaitCheckpoint(new org.json.JSONArray("["+js("document.querySelector('textarea').value")+"]").getString(0));
        } finally {Intents.release();if(scenario!=null)scenario.close();}
    }
    @Test public void failedSaveEditingHistorySwitchAndConflict() throws Exception {
        scenario=ActivityScenario.launch(MainActivity.class);
        try{
            waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly && document.querySelector('.document-title span').textContent==='已存至本机'");resetNativeIme();
            org.json.JSONObject original=checkpoint();String id=original.getString("id");
            js("(()=>{window.__qaErrors=[];window.addEventListener('error',e=>window.__qaErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));window.__qaFailWrites=true;const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(window.__qaFailWrites)throw new DOMException('Injected full disk','QuotaExceededError');return put.apply(this,args)}})()");
            tapEditor();composeNative(" 保存失败后中文甲……",false);waitFor("document.querySelector('textarea').value.endsWith(' 保存失败后中文甲……')");composeNative(" 保存失败后中文甲……",true);
            System.out.println("FAILED_SAVE_AFTER_COMMIT="+js("JSON.stringify({text:document.querySelector('textarea').value,status:document.querySelector('.document-title span').textContent,errors:window.__qaErrors})"));
            waitFor("document.querySelector('textarea').value.endsWith(' 保存失败后中文甲……') && document.querySelector('.document-title span').textContent==='仅恢复副本成功，请另存备份'");
            String rescuedText=new org.json.JSONArray("["+js("document.querySelector('textarea').value")+"]").getString(0);awaitCheckpoint(rescuedText);
            assertJsonEquals("Recovery-only status does not confirm the failed primary",original.getJSONObject("project"),nativeRecord(id).getJSONObject("project"));
            assertNotEquals("Recovery-only status must not report primary success","已存至本机",new org.json.JSONArray("["+js("document.querySelector('.document-title span').textContent")+"]").getString(0));
            Thread.sleep(900);tapEditor();composeNative(" 继续输入乙",true);waitFor("document.querySelector('textarea').value.endsWith(' 继续输入乙')");
            String latest=new org.json.JSONArray("["+js("document.querySelector('textarea').value")+"]").getString(0);
            js("document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}))");waitFor("document.querySelector('textarea').value.endsWith(' 保存失败后中文甲……')");
            js("document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}))");waitFor("document.querySelector('textarea').value.endsWith(' 继续输入乙')");awaitCheckpoint(latest);
            assertJsonEquals("Failed primary preserves complete original",original.getJSONObject("project"),nativeRecord(id).getJSONObject("project"));
            click("button[aria-label='本地剧本']");clickText("新建剧本");waitFor("document.querySelector('main').getAttribute('aria-busy')==='false'");
            assertEquals("Failed outgoing save blocks switch","true",js("!!document.querySelector('[role=dialog]')"));assertEquals(id,checkpoint().getString("id"));
            click("button[aria-label='返回写作']");js("window.__qaFailWrites=false");waitFor("document.querySelector('.document-title span').textContent==='已存至本机'");
            click("button[aria-label='本地剧本']");clickText("新建剧本");waitFor("!document.querySelector('[role=dialog]') && document.querySelector('main').getAttribute('aria-busy')==='false' && document.querySelector('.document-title span').textContent==='已存至本机'");
            assertEquals("Project histories are separate","true",js("document.querySelector('button[aria-label=撤销]').disabled"));
            click("button[aria-label='本地剧本']");click(".library-row[data-project-id='"+id+"'] > button:first-child");waitFor("!document.querySelector('[role=dialog]') && document.querySelector('main').getAttribute('aria-busy')==='false' && document.querySelector('.document-title span').textContent==='已存至本机'");assertEquals(latest,new org.json.JSONArray("["+js("document.querySelector('textarea').value")+"]").getString(0));
            org.json.JSONObject pending=checkpoint();pending.put("recoveryPending",true);pending.getJSONObject("project").getJSONArray("elements").getJSONObject(0).put("text","冲突恢复分支……");
            tapEditor();composeNative(" 原稿独立更新",true);waitFor("document.querySelector('textarea').value.endsWith(' 原稿独立更新') && document.querySelector('.document-title span').textContent==='已存至本机'");org.json.JSONObject newer=nativeRecord(id);int count=nativeRecords().length();
            new RecoveryFile(new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),"writing-recovery.json")).write(pending.toString().getBytes(StandardCharsets.UTF_8));
            scenario.recreate();waitFor("document.querySelector('textarea') && document.querySelector('textarea').value==='冲突恢复分支……' && document.querySelector('.document-title span').textContent==='已存至本机'");assertNotEquals(id,checkpoint().getString("id"));assertEquals(count+1,nativeRecords().length());
            resetNativeIme();tapEditor();composeNative(" 复制后继续写",true);waitFor("document.querySelector('textarea').value==='冲突恢复分支…… 复制后继续写' && document.querySelector('.document-title span').textContent==='已存至本机'");
            assertJsonEquals("Conflict copy never changes newer original",newer,nativeRecord(id));
            scenario.recreate();waitFor("document.querySelector('textarea') && document.querySelector('textarea').value==='冲突恢复分支…… 复制后继续写' && document.querySelector('.document-title span').textContent==='已存至本机'");assertEquals(count+1,nativeRecords().length());
            click("button[aria-label='本地剧本']");click(".library-row[data-project-id='"+id+"'] > button:first-child");waitFor("!document.querySelector('[role=dialog]') && document.querySelector('.document-title span').textContent==='已存至本机'");System.out.println("FAILED_SAVE_HISTORY_SWITCH_CONFLICT_PASSED");
        }finally{scenario.close();}
    }
    @Test public void lockScreenCyclesPreserveFinalNativeInput() throws Exception {
        scenario=ActivityScenario.launch(MainActivity.class);UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        try{
            waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly");
            resetNativeIme();
            for(int round=0;round<3;round++){
                waitFor("document.querySelector('.document-title span').textContent==='已存至本机'");
                tapEditor();hangPrimary();composeNative(" 锁屏最后中文"+round+"……",true);
                waitFor("document.querySelector('textarea').value.endsWith("+org.json.JSONObject.quote(" 锁屏最后中文"+round+"……")+")");
                String expected=new org.json.JSONArray("["+js("document.querySelector('textarea').value")+"]").getString(0);
                device.sleep();assertFalse("Display is actually off",device.isScreenOn());awaitCheckpoint(expected);
                device.wakeUp();device.executeShellCommand("wm dismiss-keyguard");Thread.sleep(300);scenario.recreate();
                waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly && document.querySelector('.document-title span').textContent==='已存至本机'");
                assertEquals(expected,new org.json.JSONArray("["+js("document.querySelector('textarea').value")+"]").getString(0));
            }
        }finally{device.wakeUp();device.executeShellCommand("wm dismiss-keyguard");scenario.close();}
    }
    @Test public void seedBeforeProcessKill() throws Exception {
        scenario=ActivityScenario.launch(MainActivity.class);
        waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly && document.querySelector('.document-title span').textContent==='已存至本机'");
        resetNativeIme();
        tapEditor();hangPrimary();composeNative(" 系统回收前最后中文……",true);
        waitFor("document.querySelector('textarea').value.endsWith(' 系统回收前最后中文……')");
        String expected=new org.json.JSONArray("["+js("document.querySelector('textarea').value")+"]").getString(0);
        UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).pressHome();awaitCheckpoint(expected);
        org.json.JSONObject proof=new org.json.JSONObject();proof.put("text",expected);proof.put("id",checkpoint().getString("id"));proof.put("pid",android.os.Process.myPid());
        try(FileOutputStream output=new FileOutputStream(new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),"process-ready.json"))){output.write(proof.toString().getBytes(StandardCharsets.UTF_8));output.getFD().sync();}
        // The external emulator driver terminates this process before starting the verification phase.
        Thread.sleep(120000);fail("External process-death driver did not terminate the seeded process");
    }
    @Test public void verifiesRecoveryAfterProcessKill() throws Exception {
        File marker=new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),"process-ready.json");
        org.json.JSONObject expected=new org.json.JSONObject(new String(LocalDocumentsPlugin.readBounded(new FileInputStream(marker),1024*1024),StandardCharsets.UTF_8));
        assertNotEquals("Verification runs in a new process",expected.getInt("pid"),android.os.Process.myPid());
        scenario=ActivityScenario.launch(MainActivity.class);
        try{
            waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly && document.querySelector('.document-title span').textContent==='已存至本机'");
            assertEquals(expected.getString("text"),new org.json.JSONArray("["+js("document.querySelector('textarea').value")+"]").getString(0));
            assertEquals(expected.getString("id"),checkpoint().getString("id"));
            resetNativeIme();
            tapEditor();composeNative(" 恢复后继续输入",true);waitFor("document.querySelector('textarea').value.includes('恢复后继续输入') && document.querySelector('.document-title span').textContent==='已存至本机'");
        }finally{scenario.close();}
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
            waitFor("document.querySelector('main').getAttribute('aria-busy')==='false' && !document.querySelector('textarea').readOnly");
            js("(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,input.value+' 覆盖升级保留……');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
            waitFor("document.querySelector('textarea').value.includes('覆盖升级保留') && document.querySelector('.document-title span').textContent==='已存至本机'");
        } finally {Intents.release();scenario.close();}
    }
    @Test public void verifiesOldVersionUpgrade() throws Exception {
        scenario=ActivityScenario.launch(MainActivity.class);
        try {
            waitFor("document.querySelector('textarea') && !document.querySelector('textarea').readOnly");
            assertEquals("0.1.8",InstrumentationRegistry.getInstrumentation().getTargetContext().getPackageManager().getPackageInfo("studio.screenplay.writer.mobile",0).versionName);
            assertEquals("true",js("document.querySelector('textarea').value.includes('覆盖升级保留') && document.querySelector('.document-title strong').textContent.includes('末班')"));
        } finally {scenario.close();}
    }
}
