package studio.screenplay.writer.mobile;

import android.database.Cursor;
import android.database.MatrixCursor;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract.Document;
import android.provider.DocumentsContract.Root;
import android.provider.DocumentsProvider;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/** Debug-only local provider exercises SAF PNG writes without a vendor picker dependency. */
public class AcceptanceDocumentsProvider extends DocumentsProvider {
    private static final String[] COLUMNS = {Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE, Document.COLUMN_FLAGS, Document.COLUMN_SIZE};
    private File root() { File file = new File(getContext().getCacheDir(), "png-acceptance"); file.mkdirs(); return file; }
    private File file(String id) throws FileNotFoundException {
        try {
            File base = root().getCanonicalFile(), target = id.equals("root") ? base : new File(base, id.substring(5)).getCanonicalFile();
            if (!id.equals("root") && (!id.startsWith("root/") || !target.getPath().startsWith(base.getPath()+File.separator))) throw new IOException("Unsafe document");
            return target;
        } catch (Exception error) { throw new FileNotFoundException(error.toString()); }
    }
    private void row(MatrixCursor cursor, String id) throws FileNotFoundException {
        File file = file(id); MatrixCursor.RowBuilder row = cursor.newRow();
        for (String column : cursor.getColumnNames()) {
            if (column.equals(Document.COLUMN_DOCUMENT_ID)) row.add(id);
            else if (column.equals(Document.COLUMN_DISPLAY_NAME)) row.add(file.getName());
            else if (column.equals(Document.COLUMN_MIME_TYPE)) row.add(file.isDirectory() ? Document.MIME_TYPE_DIR : "image/png");
            else if (column.equals(Document.COLUMN_FLAGS)) row.add(file.isDirectory() ? Document.FLAG_DIR_SUPPORTS_CREATE : Document.FLAG_SUPPORTS_WRITE);
            else if (column.equals(Document.COLUMN_SIZE)) row.add(file.length());
            else row.add(null);
        }
    }
    @Override public boolean onCreate() { return true; }
    @Override public boolean isChildDocument(String parent, String child) { try { return file(child).getPath().startsWith(file(parent).getPath()+File.separator); } catch (FileNotFoundException error) { return false; } }
    @Override public Cursor queryRoots(String[] projection) {
        MatrixCursor cursor = new MatrixCursor(new String[]{Root.COLUMN_ROOT_ID, Root.COLUMN_DOCUMENT_ID, Root.COLUMN_TITLE, Root.COLUMN_FLAGS});
        cursor.addRow(new Object[]{"root", "root", "Acceptance", Root.FLAG_LOCAL_ONLY | Root.FLAG_SUPPORTS_CREATE}); return cursor;
    }
    @Override public Cursor queryDocument(String id, String[] projection) throws FileNotFoundException { MatrixCursor cursor = new MatrixCursor(projection == null ? COLUMNS : projection); row(cursor,id); return cursor; }
    @Override public Cursor queryChildDocuments(String id, String[] projection, String sort) throws FileNotFoundException {
        MatrixCursor cursor = new MatrixCursor(projection == null ? COLUMNS : projection); File[] files = file(id).listFiles();
        if (files != null) for (File child : files) row(cursor,id+"/"+child.getName()); return cursor;
    }
    @Override public String createDocument(String parent, String mime, String name) throws FileNotFoundException {
        try {
            LocalDocumentsPlugin.safeFileName(name); File child = new File(file(parent), name);
            boolean created = mime.equals(Document.MIME_TYPE_DIR) ? child.mkdir() : child.createNewFile();
            if (!created) throw new IOException("Document already exists"); return parent+"/"+name;
        } catch (IOException error) { throw new FileNotFoundException(error.toString()); }
    }
    @Override public ParcelFileDescriptor openDocument(String id, String mode, CancellationSignal signal) throws FileNotFoundException { return ParcelFileDescriptor.open(file(id),ParcelFileDescriptor.parseMode(mode)); }
}
