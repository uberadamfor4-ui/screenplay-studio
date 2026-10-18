package studio.screenplay.writer.mobile;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@CapacitorPlugin(name = "LocalDocuments")
public class LocalDocumentsPlugin extends Plugin {
    static final int IMPORT_LIMIT = 20 * 1024 * 1024;
    static final int EXPORT_LIMIT = 64 * 1024 * 1024;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private static final ExecutorService recoveryIo = Executors.newSingleThreadExecutor();
    private final AtomicBoolean pickerBusy = new AtomicBoolean(false);
    private final Map<String, Uri> pngFolders = new HashMap<>();
    private byte[] pendingBytes;
    private String pendingMime;
    private File pendingPdf;

    @Override protected void handleOnDestroy() { io.shutdown(); super.handleOnDestroy(); }

    static byte[] readBounded(InputStream input, int max) throws IOException {
        try (InputStream source = input; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            if (source == null) throw new IOException("无法读取所选文件。");
            byte[] buffer = new byte[32768]; int size;
            while ((size = source.read(buffer)) != -1) { if (bytes.size() + size > max) throw new IOException("文件超过安全大小上限。"); bytes.write(buffer, 0, size); }
            return bytes.toByteArray();
        }
    }

    static void validateWord(byte[] bytes) throws IOException {
        int count = 0, total = 0; boolean document = false, types = false;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry; byte[] buffer = new byte[32768];
            while ((entry = zip.getNextEntry()) != null) {
                if (++count > 2000) throw new IOException("Word 包含过多文件。");
                document |= entry.getName().equals("word/document.xml"); types |= entry.getName().equals("[Content_Types].xml");
                int size = 0, chunk;
                while ((chunk = zip.read(buffer)) != -1) { size += chunk; total += chunk; if (size > 16 * 1024 * 1024 || total > 48 * 1024 * 1024) throw new IOException("Word 解压内容超过安全上限。"); }
                zip.closeEntry();
            }
        }
        if (!document || !types) throw new IOException("不是有效的 DOCX 文件。");
    }

    static String safeFileName(String name) throws IOException {
        if (name == null || name.isEmpty() || name.length() > 160 || name.contains("/") || name.contains("\\") || name.equals(".") || name.equals("..") || name.matches(".*[\\p{Cntrl}].*")) throw new IOException("文件名无效。");
        return name;
    }
    private boolean begin(PluginCall call) { if (!pickerBusy.compareAndSet(false, true)) { call.reject("已有文件操作正在进行。"); return false; } return true; }
    private void fail(PluginCall call, Exception error) { clearPending(); call.reject(error.getMessage() == null ? "本地文件操作失败。" : error.getMessage()); }
    private void clearPending() { pendingBytes = null; pendingMime = null; if (pendingPdf != null) { pendingPdf.delete(); pendingPdf = null; } pickerBusy.set(false); }
    private JSObject canceled(boolean value) { JSObject result = new JSObject(); result.put("canceled", value); return result; }
    private Intent localIntent(String action) { Intent intent = new Intent(action); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.putExtra(Intent.EXTRA_LOCAL_ONLY, true); return intent; }

    @PluginMethod public void openDocument(PluginCall call) {
        if (!begin(call)) return;
        Intent intent = localIntent(Intent.ACTION_OPEN_DOCUMENT); intent.setType("*/*");
        try { startActivityForResult(call, intent, "opened"); } catch (Exception error) { fail(call, error); }
    }
    @ActivityCallback private void opened(PluginCall call, ActivityResult result) {
        if (call == null) { clearPending(); return; }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) { clearPending(); call.resolve(canceled(true)); return; }
        Uri uri = result.getData().getData();
        io.execute(() -> {
            try {
                String name = "document.txt";
                try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) { name = cursor.getString(0); if (!cursor.isNull(1) && cursor.getLong(1) > IMPORT_LIMIT) throw new IOException("移动端导入文件不能超过 20 MB。"); }
                }
                String lower = name.toLowerCase(Locale.ROOT);
                if (!lower.matches(".*\\.(ssproj|fdx|docx|txt|fountain|md|markdown|srt)$")) throw new IOException("请选择 SSProj、FDX、DOCX、TXT 或 Fountain 文件。");
                byte[] bytes = readBounded(getContext().getContentResolver().openInputStream(uri), IMPORT_LIMIT);
                if (lower.endsWith(".docx")) validateWord(bytes);
                JSObject response = canceled(false); response.put("name", name); response.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP)); clearPending(); call.resolve(response);
            } catch (Exception error) { fail(call, error); }
        });
    }
    @PluginMethod public void saveDocument(PluginCall call) {
        if (!begin(call)) return;
        try {
            String name = safeFileName(call.getString("name")), data = call.getString("data", "");
            if (data.length() > EXPORT_LIMIT * 4L / 3 + 4) throw new IOException("导出文件过大。");
            pendingBytes = Base64.decode(data, Base64.DEFAULT); pendingMime = call.getString("mime", "application/octet-stream");
            if (pendingBytes.length > EXPORT_LIMIT) throw new IOException("导出文件过大。");
            if (name.endsWith(".ssproj") && pendingBytes.length > IMPORT_LIMIT) throw new IOException("此项目超过移动端 20 MB 限制，请在桌面版保存。");
            createOutput(call, name, pendingMime);
        } catch (Exception error) { fail(call, error); }
    }
    private void createOutput(PluginCall call, String name, String mime) {
        Intent intent = localIntent(Intent.ACTION_CREATE_DOCUMENT); intent.setType(mime); intent.putExtra(Intent.EXTRA_TITLE, name); startActivityForResult(call, intent, "saved");
    }
    @ActivityCallback private void saved(PluginCall call, ActivityResult result) {
        if (call == null) { clearPending(); return; }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) { clearPending(); call.resolve(canceled(true)); return; }
        Uri uri = result.getData().getData(); byte[] bytes = pendingBytes; File pdf = pendingPdf;
        io.execute(() -> {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (output == null) throw new IOException("无法写入所选位置。");
                if (pdf != null) { try (InputStream source = new FileInputStream(pdf)) { byte[] buffer = new byte[32768]; int size; while ((size = source.read(buffer)) != -1) output.write(buffer, 0, size); } }
                else if (bytes != null) output.write(bytes); else throw new IOException("导出内容已失效，请重试。");
                output.flush();
            } catch (Exception error) { try { DocumentsContract.deleteDocument(getContext().getContentResolver(), uri); } catch (Exception ignored) {} fail(call, error); return; }
            clearPending(); call.resolve(canceled(false));
        });
    }

    @PluginMethod public void choosePngFolder(PluginCall call) {
        if (!begin(call)) return;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE); intent.putExtra(Intent.EXTRA_LOCAL_ONLY, true);
        try { startActivityForResult(call, intent, "folderChosen"); } catch (Exception error) { fail(call, error); }
    }
    @ActivityCallback private void folderChosen(PluginCall call, ActivityResult result) {
        if (call == null) { clearPending(); return; }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) { clearPending(); call.resolve(canceled(true)); return; }
        Uri tree = result.getData().getData();
        io.execute(() -> {
            try {
                Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
                Uri folder = DocumentsContract.createDocument(getContext().getContentResolver(), parent, DocumentsContract.Document.MIME_TYPE_DIR, "Screenplay-PNG-" + System.currentTimeMillis());
                if (folder == null) throw new IOException("无法创建图片文件夹。");
                String token = UUID.randomUUID().toString(); synchronized (pngFolders) { pngFolders.put(token, folder); }
                JSObject response = canceled(false); response.put("token", token); clearPending(); call.resolve(response);
            } catch (Exception error) { fail(call, error); }
        });
    }
    @PluginMethod public void writePngPage(PluginCall call) {
        io.execute(() -> {
            Uri uri = null;
            try {
                Uri folder; synchronized (pngFolders) { folder = pngFolders.get(call.getString("token")); }
                if (folder == null) throw new IOException("图片导出操作已失效。");
                String name = safeFileName(call.getString("name")), data = call.getString("data", "");
                if (!name.endsWith(".png") || data.length() > EXPORT_LIMIT * 4L / 3 + 4) throw new IOException("图片无效或过大。");
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                if (bytes.length < 8 || bytes[0] != (byte)137 || bytes[1] != 80 || bytes[2] != 78 || bytes[3] != 71) throw new IOException("不是有效的 PNG 图片。");
                uri = DocumentsContract.createDocument(getContext().getContentResolver(), folder, "image/png", name);
                if (uri == null) throw new IOException("无法创建图片。");
                try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) { if (output == null) throw new IOException("无法写入图片。"); output.write(bytes); output.flush(); }
                call.resolve();
            } catch (Exception error) { if (uri != null) try { DocumentsContract.deleteDocument(getContext().getContentResolver(), uri); } catch (Exception ignored) {} call.reject(error.getMessage()); }
        });
    }
    @PluginMethod public void finishPngFolder(PluginCall call) { synchronized (pngFolders) { pngFolders.remove(call.getString("token")); } call.resolve(); }

    @PluginMethod public void saveRecovery(PluginCall call) {
        String content = call.getString("content", "");
        recoveryIo.execute(() -> {
            try { new RecoveryFile(new File(getContext().getFilesDir(), "writing-recovery.json")).write(content.getBytes(StandardCharsets.UTF_8)); call.resolve(); }
            catch (Exception error) { call.reject("恢复副本未能写入；可能存储空间不足。请释放空间或导出项目备份。"); }
        });
    }
    @PluginMethod public void loadRecovery(PluginCall call) {
        recoveryIo.execute(() -> {
            try { byte[] bytes = new RecoveryFile(new File(getContext().getFilesDir(), "writing-recovery.json")).read(); JSObject response = new JSObject(); if (bytes != null) response.put("content", new String(bytes, StandardCharsets.UTF_8)); call.resolve(response); }
            catch (Exception error) { call.reject("无法读取恢复副本。本地项目库仍保留。"); }
        });
    }

    @PluginMethod public void runtimeInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("systemVersion", android.os.Build.VERSION.RELEASE);
        call.resolve(result);
    }
    @PluginMethod public void backgroundApp(PluginCall call) { getActivity().runOnUiThread(() -> { getActivity().moveTaskToBack(true); call.resolve(); }); }
    @PluginMethod public void exportPdf(PluginCall call) {
        if (!begin(call)) return;
        try {
            String name = safeFileName(call.getString("name")), html = call.getString("html", "");
            if (!name.endsWith(".pdf") || html.length() > 24 * 1024 * 1024) throw new IOException("PDF 内容过大或文件名无效。");
            getActivity().runOnUiThread(() -> renderPdf(call, name, html));
        } catch (Exception error) { fail(call, error); }
    }
    private void renderPdf(PluginCall call, String name, String html) {
        WebView view = new WebView(getContext());
        view.getSettings().setJavaScriptEnabled(true); view.getSettings().setAllowFileAccess(false); view.getSettings().setAllowContentAccess(false);
        view.layout(0, 0, 816, 1056);
        Handler handler = new Handler(Looper.getMainLooper()); AtomicBoolean done = new AtomicBoolean(false); AtomicBoolean started = new AtomicBoolean(false);
        CancellationSignal cancel = new CancellationSignal();
        Runnable timedOut = () -> { if (done.compareAndSet(false, true)) { cancel.cancel(); view.destroy(); fail(call, new IOException("PDF 排版超时，请拆分剧本后重试。")); } };
        handler.postDelayed(timedOut, 90000);
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView web, WebResourceRequest request) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView web, WebResourceRequest request) {
                Uri uri = request.getUrl(); String path = uri.getPath();
                if (request.isForMainFrame() && "https".equals(uri.getScheme()) && "localhost".equals(uri.getHost()) && "/__screenplay_print__.html".equals(path)) return new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
                if ("data".equals(uri.getScheme()) && uri.toString().startsWith("data:font/")) return null;
                if ("https".equals(uri.getScheme()) && "localhost".equals(uri.getHost()) && path != null && path.startsWith("/assets/") && !path.contains("..") && !path.contains("\\")) {
                    try { String mime = path.endsWith(".otf") ? "font/otf" : path.endsWith(".woff2") ? "font/woff2" : "application/octet-stream"; return new WebResourceResponse(mime, null, getContext().getAssets().open("public" + path)); } catch (IOException ignored) {}
                }
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", null, new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageFinished(WebView web, String url) {
                if (!started.compareAndSet(false, true)) return;
                Runnable fonts = new Runnable() { int attempts = 0; @Override public void run() {
                    if (done.get()) return;
                    web.evaluateJavascript("!!document.querySelector('.page .script-line') && document.fonts.size >= 6 && document.fonts.status === 'loaded' && document.fonts.check('12px \"Screenplay CJK\"')", value -> {
                        if (done.get()) return;
                        if (!"true".equals(value)) { if (++attempts > 160) timedOut.run(); else handler.postDelayed(this, 250); return; }
                        printDocument(web);
                    });
                }}; handler.postDelayed(fonts, 100);
            }
            private void printDocument(WebView web) {
                try {
                    PrintDocumentAdapter adapter = web.createPrintDocumentAdapter(name);
                    PrintAttributes attributes = new PrintAttributes.Builder().setMediaSize(Boolean.TRUE.equals(call.getBoolean("a4")) ? PrintAttributes.MediaSize.ISO_A4 : PrintAttributes.MediaSize.NA_LETTER).setResolution(new PrintAttributes.Resolution("screenplay", "Screenplay", 300, 300)).setMinMargins(PrintAttributes.Margins.NO_MARGINS).build();
                    PrintDocumentAdapter managed = new PrintDocumentAdapter() {
                        @Override public void onStart() { adapter.onStart(); }
                        @Override public void onLayout(PrintAttributes old, PrintAttributes next, CancellationSignal signal, LayoutResultCallback callback, Bundle extras) { adapter.onLayout(old, next, signal, callback, extras); }
                        @Override public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal signal, WriteResultCallback callback) { adapter.onWrite(pages, destination, signal, callback); }
                        @Override public void onFinish() { adapter.onFinish(); web.destroy(); }
                    };
                    PrintManager manager = (PrintManager)getActivity().getSystemService(android.content.Context.PRINT_SERVICE);
                    if (manager == null) throw new IOException("此设备没有系统打印服务，无法另存 PDF。");
                    manager.print(name, managed, attributes);
                    done.set(true); handler.removeCallbacks(timedOut); clearPending(); JSObject response = canceled(false); response.put("openedPrintDialog", true); call.resolve(response);
                } catch (Exception error) { if (done.compareAndSet(false, true)) { handler.removeCallbacks(timedOut); web.destroy(); fail(call, error); } }
            }
        });
        view.loadUrl("https://localhost/__screenplay_print__.html");
    }
}
