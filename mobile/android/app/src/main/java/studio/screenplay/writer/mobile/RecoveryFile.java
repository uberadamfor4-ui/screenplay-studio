package studio.screenplay.writer.mobile;

import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import java.io.*;
import java.util.Arrays;

class RecoveryFile {
    private static final int LIMIT = 32 * 1024 * 1024;
    private final File base;
    RecoveryFile(File base) { this.base = base; }

    private void migrateBackup() throws IOException {
        File legacy = new File(base + ".bak");
        if (legacy.exists()) replace(legacy, base);
    }

    byte[] read() throws IOException {
        migrateBackup();
        if (!base.exists()) return null;
        return LocalDocumentsPlugin.readBounded(new FileInputStream(base), LIMIT);
    }

    void write(byte[] bytes) throws IOException {
        if (bytes.length > LIMIT) throw new IOException("恢复文件过大。");
        migrateBackup();
        File pending = new File(base + ".pending");
        try {
            writePending(pending, bytes);
            if (!Arrays.equals(bytes, LocalDocumentsPlugin.readBounded(new FileInputStream(pending), LIMIT))) throw new IOException("恢复副本校验失败。");
            replace(pending, base);
            syncDirectory(base.getParentFile());
            if (!Arrays.equals(bytes, read())) throw new IOException("恢复副本校验失败。");
        } finally { if (pending.isFile()) pending.delete(); }
    }

    void writePending(File pending, byte[] bytes) throws IOException {
        try (FileOutputStream output = new FileOutputStream(pending)) {
            output.write(bytes);
            output.getFD().sync();
        }
    }

    void replace(File from, File to) throws IOException {
        try { Os.rename(from.getPath(), to.getPath()); }
        catch (ErrnoException error) { throw new IOException("无法提交恢复副本。", error); }
    }

    void syncDirectory(File directory) throws IOException {
        FileDescriptor descriptor = null;
        try { descriptor = Os.open(directory.getPath(), OsConstants.O_RDONLY | OsConstants.O_DIRECTORY, 0); Os.fsync(descriptor); }
        catch (ErrnoException error) { throw new IOException("恢复副本未能同步到存储。", error); }
        finally { if (descriptor != null) try { Os.close(descriptor); } catch (ErrnoException error) { throw new IOException("恢复存储未能关闭。", error); } }
    }
}
