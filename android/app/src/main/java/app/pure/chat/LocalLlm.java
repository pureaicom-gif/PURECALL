package app.pure.chat;

/** Thin JNI facade over llama.cpp (libpure_llm.so). All calls must come from one worker thread. */
public final class LocalLlm {
    private static boolean loaded;
    private static String loadError;
    static {
        try { System.loadLibrary("pure_llm"); loaded = true; } catch (Throwable t) { loadError = String.valueOf(t); }
    }
    public interface Sink { boolean onBytes(byte[] utf8); }
    public static boolean available() { return loaded; }
    public static String loadError() { return loadError; }
    static native long nativeLoad(String path, int nCtx, int threads);
    static native void nativeFree(long handle);
    static native void nativeStop(long handle);
    static native String nativeGenerate(long handle, byte[][] roles, byte[][] contents, int maxTokens, float temp, Sink sink);
}
