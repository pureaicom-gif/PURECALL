package app.pure.chat;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Locale;

/** Hands-free voice: Android SpeechRecognizer (th-TH, prefers on-device) + device TextToSpeech (Thai), with barge-in. JS: window.PureVoice. */
public final class VoiceBridge {
    private final Activity act; private final WebView web; private final Handler ui = new Handler(Looper.getMainLooper());
    private SpeechRecognizer rec; private TextToSpeech tts; private boolean ttsReady; private boolean speaking;

    public VoiceBridge(Activity act, WebView web) {
        this.act = act; this.web = web;
        tts = new TextToSpeech(act, s -> { if (s == TextToSpeech.SUCCESS) { int r = tts.setLanguage(new Locale("th", "TH")); ttsReady = r >= 0; } });
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) {}
            @Override public void onDone(String id) { speaking = false; emit("tts_done", null); }
            @Override public void onError(String id) { speaking = false; emit("tts_done", null); }
        });
    }
    private void emit(String type, JSONObject extra) {
        try { JSONObject o = extra == null ? new JSONObject() : extra; o.put("type", type); final String js = "window.onPureVoiceEvent&&window.onPureVoiceEvent(" + JSONObject.quote(o.toString()) + ")"; ui.post(() -> web.evaluateJavascript(js, null)); } catch (Exception ignored) {}
    }
    @JavascriptInterface public String status() {
        try { return new JSONObject().put("stt", SpeechRecognizer.isRecognitionAvailable(act)).put("onDevice", android.os.Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(act)).put("ttsThai", ttsReady).toString(); } catch (Exception e) { return "{}"; }
    }
    @JavascriptInterface public void listen(String lang) { ui.post(() -> start(lang, false)); }
    /** Listen while TTS plays so the user can interrupt (barge-in). Device echo cancellation quality varies. */
    @JavascriptInterface public void listenDuringSpeech(String lang) { ui.post(() -> start(lang, true)); }
    @JavascriptInterface public void stopListening() { ui.post(() -> { if (rec != null) { rec.cancel(); rec.destroy(); rec = null; } }); }
    @JavascriptInterface public void speak(String text) {
        if (!ttsReady) { emit("error", obj("error", "ไม่มีเสียงพูดภาษาไทยในเครื่อง (ติดตั้ง Google TTS ภาษาไทย)")); emit("tts_done", null); return; }
        speaking = true; tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "pure-voice");
    }
    @JavascriptInterface public void stopSpeaking() { speaking = false; tts.stop(); }

    private static JSONObject obj(String k, String v) { try { return new JSONObject().put(k, v); } catch (Exception e) { return new JSONObject(); } }
    private void start(String lang, boolean bargeIn) {
        if (act.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { act.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 7310); emit("error", obj("error", "permission")); return; }
        if (rec != null) { rec.cancel(); rec.destroy(); }
        boolean onDevice = android.os.Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(act);
        rec = onDevice ? SpeechRecognizer.createOnDeviceSpeechRecognizer(act) : SpeechRecognizer.createSpeechRecognizer(act);
        rec.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle b) { emit("ready", null); }
            @Override public void onBeginningOfSpeech() { if (speaking) { tts.stop(); speaking = false; } emit("speech_start", null); }
            @Override public void onRmsChanged(float rms) { try { emit("level", new JSONObject().put("rms", rms)); } catch (Exception ignored) {} }
            @Override public void onBufferReceived(byte[] b) {}
            @Override public void onEndOfSpeech() {}
            @Override public void onError(int e) { emit("error", obj("error", String.valueOf(e))); }
            @Override public void onResults(Bundle b) { ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); emit("final", obj("text", r == null || r.isEmpty() ? "" : r.get(0))); }
            @Override public void onPartialResults(Bundle b) { ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); if (r != null && !r.isEmpty()) emit("partial", obj("text", r.get(0))); }
            @Override public void onEvent(int t, Bundle b) {}
        });
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang == null || lang.isEmpty() ? "th-TH" : lang).putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        rec.startListening(i);
    }
    public void destroy() { stopListening(); tts.shutdown(); }
}
