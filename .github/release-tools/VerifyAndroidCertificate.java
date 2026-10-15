import com.android.apksig.ApkVerifier;
import java.io.File;
import java.io.FileInputStream;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Arrays;

public class VerifyAndroidCertificate {
    public static void main(String[] args) throws Exception {
        ApkVerifier.Result result = new ApkVerifier.Builder(new File(args[0])).setMinCheckedPlatformVersion(24).build().verify();
        if (!result.isVerified() || result.getSignerCertificates().size() != 1) throw new IllegalStateException("APK signature invalid");
        X509Certificate expected;
        try (FileInputStream input = new FileInputStream(args[1])) { expected = (X509Certificate)CertificateFactory.getInstance("X.509").generateCertificate(input); }
        if (!Arrays.equals(expected.getEncoded(), result.getSignerCertificates().get(0).getEncoded())) throw new IllegalStateException("Unexpected signing certificate");
        System.out.println("APK signature and exact public certificate verified. No file hashes generated.");
    }
}
