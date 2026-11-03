package app.pure.chat;

/** Pure-Java version helpers (no Android deps) so they can be unit-tested on a plain JVM. Mirrors public/update-core.js. */
public final class VersionUtil {
    private VersionUtil() {}

    public static int compare(String a, String b) {
        String[] pa = core(a), pb = core(b);
        int n = Math.max(pa.length, pb.length);
        for (int i = 0; i < n; i++) {
            int x = i < pa.length ? num(pa[i]) : 0, y = i < pb.length ? num(pb[i]) : 0;
            if (x != y) return x > y ? 1 : -1;
        }
        String ra = pre(a), rb = pre(b);
        if (ra.equals(rb)) return 0;
        if (ra.isEmpty()) return 1;
        if (rb.isEmpty()) return -1;
        return ra.compareTo(rb) > 0 ? 1 : -1;
    }

    /** "none" | "optional" | "force" */
    public static String evaluate(int manifestCode, int minSupported, int current) {
        if (current < minSupported) return "force";
        return manifestCode > current ? "optional" : "none";
    }

    public static boolean isSha256Hex(String s) { return s != null && s.toLowerCase().matches("[0-9a-f]{64}"); }

    public static boolean isHttpsUrl(String s) { return s != null && s.startsWith("https://") && s.length() > 9 && !s.contains(" "); }

    private static String strip(String v) { v = v == null ? "" : v.trim(); return v.startsWith("v") || v.startsWith("V") ? v.substring(1) : v; }
    private static String[] core(String v) { String s = strip(v); int i = s.indexOf('-'); return (i >= 0 ? s.substring(0, i) : s).split("\\."); }
    private static String pre(String v) { String s = strip(v); int i = s.indexOf('-'); return i >= 0 ? s.substring(i + 1) : ""; }
    private static int num(String s) { try { return Integer.parseInt(s.trim()); } catch (Exception e) { return 0; } }
}
