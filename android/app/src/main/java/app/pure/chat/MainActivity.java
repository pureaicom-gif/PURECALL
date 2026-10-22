package app.pure.chat;

import android.Manifest;
import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.InsetDrawable;
import android.net.Uri;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import android.media.AudioManager;
import java.util.*;

public class MainActivity extends Activity {
    private WebView web;
    private LinearLayout root;
    private String serverOrigin = "";
    private PermissionRequest mediaRequest;
    private ValueCallback<Uri[]> fileCallback;
    private boolean showingSetup = true;
    private boolean isScanning = false;
    private View topBar;
    private WebView scannerWeb;
    private boolean scannerFromChat = false;
    private android.speech.tts.TextToSpeech tts;
    private boolean ttsReady = false;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    private void initVoice() {
        if (tts != null) return;
        tts = new android.speech.tts.TextToSpeech(this, result -> {
            if (result == android.speech.tts.TextToSpeech.SUCCESS) {
                int language = tts.setLanguage(Locale.forLanguageTag("th-TH"));
                ttsReady = language >= 0;
                if (!ttsReady) {
                    language = tts.setLanguage(new Locale("th", "TH"));
                    ttsReady = language >= 0;
                }
                if (!ttsReady) {
                    tts.setLanguage(Locale.getDefault());
                    ttsReady = true;
                }
                tts.setSpeechRate(1.05f);
                tts.setPitch(1.22f);
                tts.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener() {
                    public void onStart(String id) { voiceEvent(id, "start"); }
                    public void onDone(String id) { voiceEvent(id, "done"); }
                    public void onError(String id) { voiceEvent(id, "error"); }
                });
            }
        });
    }

    private void voiceEvent(String id, String state) {
        runOnUiThread(() -> {
            if (web != null && web.getUrl() != null && sameOrigin(Uri.parse(web.getUrl()))) {
                web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pure-tts-state',{detail:{id:" + org.json.JSONObject.quote(id) + ",state:" + org.json.JSONObject.quote(state) + "}}));", null);
            }
        });
    }

    private boolean speakTextInternal(String text, float rate, float pitch, String utteranceId) {
        try {
            if (tts == null) initVoice();
            if (tts != null) {
                float r = (rate > 0.5f && rate < 2.0f) ? rate : 1.05f;
                float p = (pitch > 0.5f && pitch < 2.0f) ? pitch : 1.22f;
                tts.setSpeechRate(r);
                tts.setPitch(p);
                String id = utteranceId != null ? utteranceId : ("pet_" + System.currentTimeMillis());
                tts.speak(text, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, id);
                return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    private boolean voiceUrl(WebView v, WebResourceRequest request) {
        Uri u = request.getUrl();
        if (!"pure-tts".equals(u.getScheme())) return false;
        if ("stop".equals(u.getHost())) {
            if (tts != null) tts.stop();
            return true;
        }
        String text = u.getQueryParameter("text"), id = u.getQueryParameter("id");
        if (id == null || !id.matches("[a-zA-Z0-9-]{1,64}")) return true;
        if (text == null || text.trim().isEmpty()) {
            voiceEvent(id, "error");
            return true;
        }
        float rate = 1.05f, pitch = 1.22f;
        try {
            if (u.getQueryParameter("rate") != null) rate = Float.parseFloat(u.getQueryParameter("rate"));
            if (u.getQueryParameter("pitch") != null) pitch = Float.parseFloat(u.getQueryParameter("pitch"));
        } catch (NumberFormatException ignored) {}
        speakTextInternal(text, rate, pitch, id);
        return true;
    }


    private Integer previousAudioMode;
    private boolean previousSpeaker;
    private void resetAudioRoute() {
        AudioManager manager=(AudioManager)getSystemService(AUDIO_SERVICE);
        if(previousAudioMode==null)return;
        if(Build.VERSION.SDK_INT>=31)manager.clearCommunicationDevice();
        manager.setSpeakerphoneOn(previousSpeaker);
        manager.setMode(previousAudioMode);
        previousAudioMode=null;
    }

    private boolean applySpeakerphone(boolean on) {
        try {
            AudioManager manager = (AudioManager) getSystemService(AUDIO_SERVICE);
            if (previousAudioMode == null) {
                previousAudioMode = manager.getMode();
                previousSpeaker = manager.isSpeakerphoneOn();
            }
            manager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            if (Build.VERSION.SDK_INT >= 31) {
                try {
                    if (!on) {
                        manager.clearCommunicationDevice();
                    }
                    int type = on ? android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER : android.media.AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
                    for (android.media.AudioDeviceInfo device : manager.getAvailableCommunicationDevices()) {
                        if (device.getType() == type) {
                            manager.setCommunicationDevice(device);
                            break;
                        }
                    }
                } catch (Exception ignored) {}
            }
            manager.setSpeakerphoneOn(on);
            if (web != null) {
                web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pure-audio-state',{detail:{speaker:" + on + "}}))", null);
            }
            return true;
        } catch (Exception error) {
            if (web != null) {
                web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pure-audio-state',{detail:{error:'เปลี่ยนอุปกรณ์เสียงไม่ได้'}}))", null);
            }
            return false;
        }
    }

    private boolean audioUrl(WebView v, WebResourceRequest request) {
        Uri uri=request.getUrl();if(!"pure-audio".equals(uri.getScheme()))return false;
        try {
            if("settings".equals(uri.getHost())) {
                NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
                nm.createNotificationChannel(new NotificationChannel("pure_messages","PURE Messages",NotificationManager.IMPORTANCE_DEFAULT));
                Intent intent=new Intent(android.provider.Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS);
                intent.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,getPackageName());
                intent.putExtra(android.provider.Settings.EXTRA_CHANNEL_ID,"pure_messages");startActivity(intent);return true;
            }
            if("reset".equals(uri.getHost())){resetAudioRoute();return true;}
            if(!"speaker".equals(uri.getHost()))return true;
            boolean on="true".equals(uri.getQueryParameter("on"));
            applySpeakerphone(on);
        }catch(Exception error){v.evaluateJavascript("window.dispatchEvent(new CustomEvent('pure-audio-state',{detail:{error:'เปลี่ยนอุปกรณ์เสียงไม่ได้'}}))",null);}
        return true;
    }
    @Override protected void onPause(){CookieManager.getInstance().flush();super.onPause();}

    private int dp(int n) {
        return (int) (getResources().getDisplayMetrics().density * n);
    }

    private TextView text(String s, int size) {
        TextView v = new TextView(this);
        v.setText(s);
        v.setTextColor(Color.WHITE);
        v.setTextSize(size);
        v.setPadding(0, dp(6), 0, dp(6));
        return v;
    }

    private Button button(String s, Runnable action) {
        return button(s, Color.rgb(237, 239, 242), Color.rgb(15, 17, 21), action);
    }

    private Button button(String s, int bgColor, int textColor, Runnable action) {
        Button b = new Button(this);
        b.setText(s);
        b.setTextColor(textColor);
        b.setAllCaps(false);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(bgColor);
        bg.setCornerRadius(dp(12));
        b.setBackground(new InsetDrawable(bg, dp(2), dp(4), dp(2), dp(4)));
        b.setOnClickListener(v -> action.run());
        return b;
    }

    private boolean isEmulator() {
        return Build.FINGERPRINT.startsWith("generic")
                || Build.FINGERPRINT.startsWith("unknown")
                || Build.MODEL.contains("google_sdk")
                || Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("Android SDK built for x86");
    }

    private String normalizeUrl(String input) {
        if (input == null) return null;
        String s = input.trim();
        if (s.isEmpty()) return null;
        s = s.replaceAll("^[<\"']+|[>\"']+$", "");
        if (!s.startsWith("http://") && !s.startsWith("https://")) {
            if (s.matches("^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(:\\d+)?.*") || s.startsWith("localhost")) {
                s = "http://" + s;
            } else {
                s = "https://" + s;
            }
        }
        try {
            Uri u = Uri.parse(s);
            if (u.getHost() == null) return null;
            int port = u.getPort();
            String scheme = u.getScheme() != null ? u.getScheme().toLowerCase() : "https";
            if (!"http".equals(scheme) && !"https".equals(scheme)) return null;
            if (port != -1 && port != 80 && port != 443) {
                return scheme + "://" + u.getHost() + ":" + port;
            }
            return scheme + "://" + u.getHost();
        } catch (Exception e) {
            return null;
        }
    }

    private void vibrateFeedback() {
        try {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= 26) {
                    v.vibrate(VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(80);
                }
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onCreate(Bundle saved) {
        super.onCreate(saved);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        initVoice();
        createNotificationChannel();
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 21);
            }
        }
        showSetup();
        handleNotificationIntent(getIntent());
    }

    private void base() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(11, 12, 14));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets b = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(b.left, b.top, b.right, b.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        setContentView(root);
    }

    private void showSetup() {
        if (tts != null) tts.stop();
        showingSetup = true;
        isScanning = false;
        scannerFromChat = false;
        if (scannerWeb != null) {
            scannerWeb.destroy();
            scannerWeb = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        base();

        ScrollView scroll = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24), dp(28), dp(24), dp(24));
        scroll.addView(content);
        root.addView(scroll);

        TextView logo = text("PURE", 42);
        logo.setTypeface(null, 1);
        content.addView(logo);
        content.addView(text("YOUR PEOPLE. A LITTLE CLOSER.", 11));

        TextView heading = text("ใกล้กันได้ ทุกที่ทุกเวลา", 26);
        heading.setTypeface(null, 1);
        content.addView(heading);
        content.addView(text("ออนไลน์ • แชต โทร กล้อง AI สัตว์เลี้ยง และแอดมิน\nออฟไลน์ • ส่งข้อความระยะใกล้ผ่าน Wi-Fi / Bluetooth", 13));

        View divider = new View(this);
        divider.setBackgroundColor(Color.rgb(44, 51, 64));
        LinearLayout.LayoutParams divParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1));
        divParams.setMargins(0, dp(16), 0, dp(16));
        content.addView(divider, divParams);

        // Section 1: Internet Connection (Primary)
        TextView netTitle = text(" ลิงก์ออนไลน์ผ่านอินเทอร์เน็ต (Cloudflare HTTPS)", 15);
        netTitle.setTypeface(null, 1);
        netTitle.setTextColor(Color.rgb(74, 222, 128));
        content.addView(netTitle);
        content.addView(text("ใช้ได้จากทุกที่ทั่วโลก ทั้งเน็ตมือถือ 4G/5G และ Wi-Fi ทุกที่", 12));

        EditText address = new EditText(this);
        address.setSingleLine();
        address.setTextSize(14);
        address.setInputType(17);
        address.setTextColor(Color.WHITE);
        address.setHintTextColor(Color.rgb(110, 120, 135));
        address.setHint("วางลิงก์ https://...trycloudflare.com หรือสแกน QR");

        String defaultServer = BuildConfig.PURE_SERVER_URL.isEmpty()
                ? (isEmulator() ? "http://10.0.2.2:3000" : "")
                : normalizeUrl(BuildConfig.PURE_SERVER_URL);
        String saved = getPreferences(0).getString("server", defaultServer == null ? "" : defaultServer);
        address.setText(saved);
        content.addView(address);

        // Primary: SCAN QR CODE BUTTON (Gold / Standout)
        Button scanBtn = button(" สแกน QR Code เซิร์ฟเวอร์", Color.rgb(255, 209, 102), Color.rgb(17, 20, 26), () -> {
            openScanner();
        });
        scanBtn.setTypeface(null, 1);
        scanBtn.setTextSize(15);
        content.addView(scanBtn);

        // Clipboard Paste Button
        content.addView(button(" หรือวางลิงก์จากคลิปบอร์ด", Color.rgb(38, 45, 56), Color.rgb(240, 243, 248), () -> {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null && cm.hasPrimaryClip() && cm.getPrimaryClip().getItemCount() > 0) {
                    CharSequence clip = cm.getPrimaryClip().getItemAt(0).getText();
                    if (clip != null && clip.length() > 0) {
                        String clean = normalizeUrl(clip.toString());
                        if (clean != null) {
                            address.setText(clean);
                            Toast.makeText(this, "วางลิงก์: " + clean, Toast.LENGTH_SHORT).show();
                        } else {
                            address.setText(clip.toString().trim());
                        }
                        return;
                    }
                }
                Toast.makeText(this, "ยังไม่มีลิงก์ในคลิปบอร์ด กรุณาคัดลอกจากคอมก่อน", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "ไม่สามารถอ่านคลิปบอร์ดได้", Toast.LENGTH_SHORT).show();
            }
        }));

        // Connect Button
        Button connectBtn = button(" เชื่อมต่อเซิร์ฟเวอร์  ", Color.rgb(240, 243, 248), Color.rgb(17, 20, 26), () -> {
            String raw = address.getText().toString().trim();
            if (raw.isEmpty()) {
                Toast.makeText(this, "กรุณาใส่ลิงก์เซิร์ฟเวอร์ก่อน", Toast.LENGTH_LONG).show();
                return;
            }
            String url = normalizeUrl(raw);
            if (url == null) {
                Toast.makeText(this, "รูปแบบ URL ไม่ถูกต้อง ตัวอย่าง: https://xxxx.trycloudflare.com", Toast.LENGTH_LONG).show();
                return;
            }
            getPreferences(0).edit().putString("server", url).apply();
            openServer(url);
        });
        connectBtn.setTypeface(null, 1);
        content.addView(connectBtn);

        // Section 2: Local Wi-Fi Preset Helper
        TextView localTitle = text(" หรือเชื่อมต่อผ่าน Wi-Fi ในบ้านเดียวกัน (LAN)", 13);
        localTitle.setPadding(0, dp(14), 0, dp(4));
        content.addView(localTitle);

        content.addView(button(" ใช้ IP ในวง Wi-Fi บ้าน", Color.rgb(26, 30, 38), Color.rgb(200, 210, 225), () -> {
            final EditText ipInput = new EditText(this);
            ipInput.setHint("192.168.x.x หรือ IP คอมพิวเตอร์");
            ipInput.setTextColor(Color.BLACK);
            new AlertDialog.Builder(this)
                .setTitle("ระบุ IP คอมพิวเตอร์ในวง Wi-Fi")
                .setMessage("ใส่ IP คอมพิวเตอร์ของท่าน (เช่น 192.168.31.94):")
                .setView(ipInput)
                .setPositiveButton("ใช้ IP นี้", (d, w) -> {
                    String ip = ipInput.getText().toString().trim();
                    if (!ip.isEmpty()) {
                        String localUrl = normalizeUrl(ip.contains(":") ? ip : (ip + ":3000"));
                        if (localUrl != null) {
                            address.setText(localUrl);
                            getPreferences(0).edit().putString("server", localUrl).apply();
                            openServer(localUrl);
                        }
                    }
                })
                .setNegativeButton("ยกเลิก", null)
                .show();
        }));

        // Section 3: Offline Mode
        TextView offlineTitle = text(" หรือคุยโดยไม่ใช้อินเทอร์เน็ต (ออฟไลน์)", 13);
        offlineTitle.setPadding(0, dp(14), 0, dp(4));
        content.addView(offlineTitle);

        content.addView(button("ออฟไลน์ · Wi-Fi / Bluetooth", Color.rgb(26, 30, 38), Color.rgb(200, 210, 225), () -> {
            startActivity(new Intent(this, OfflineActivity.class));
        }));

        content.addView(text("PURE 0.6.0 • สแกน QR Code เข้าได้ทันที\nสายเรียกเข้าออนไลน์ต้องเปิดแอปไว้", 11));
    }

    private void closeScannerView() {
        isScanning = false;
        scannerFromChat = false;
        if (scannerWeb != null) {
            root.removeView(scannerWeb);
            scannerWeb.destroy();
            scannerWeb = null;
        }
        if (topBar != null) topBar.setVisibility(View.VISIBLE);
        if (web != null) web.setVisibility(View.VISIBLE);
    }

    private void openScanner() {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, 20);
            return;
        }

        if (web != null && !showingSetup) {
            scannerFromChat = true;
            isScanning = true;
            if (topBar != null) topBar.setVisibility(View.GONE);
            web.setVisibility(View.GONE);
        } else {
            scannerFromChat = false;
            showingSetup = false;
            isScanning = true;
            if (web != null) {
                web.destroy();
                web = null;
            }
            base();
        }

        if (scannerWeb != null) {
            root.removeView(scannerWeb);
            scannerWeb.destroy();
            scannerWeb = null;
        }

        scannerWeb = new WebView(this);
        root.addView(scannerWeb, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings s = scannerWeb.getSettings();
        s.setJavaScriptEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setDomStorageEnabled(true);

        scannerWeb.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest r) {
                runOnUiThread(() -> {
                    List<String> need = new ArrayList<>();
                    for (String resource : r.getResources()) {
                        if (resource.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                            need.add(Manifest.permission.CAMERA);
                        }
                    }
                    if (need.isEmpty()) r.grant(r.getResources());
                    else r.deny();
                });
            }
        });

        scannerWeb.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void onScanned(String data) {
                runOnUiThread(() -> {
                    vibrateFeedback();
                    if (data == null || data.trim().isEmpty()) return;
                    String trimmed = data.trim();

                    // 1. Friend QR check
                    String friendHandle = null;
                    if (trimmed.startsWith("pure:friend:")) {
                        friendHandle = trimmed.substring(12).replace("@", "").trim();
                    } else if (trimmed.contains("?add=") || trimmed.contains("&add=")) {
                        try {
                            Uri u = Uri.parse(trimmed);
                            friendHandle = u.getQueryParameter("add");
                            if (friendHandle != null) friendHandle = friendHandle.replace("@", "").trim();
                        } catch (Exception ignored) {}
                    }

                    if (friendHandle != null && !friendHandle.isEmpty()) {
                        if (scannerFromChat && web != null) {
                            closeScannerView();
                            Toast.makeText(MainActivity.this, "พบ QR เพื่อน @" + friendHandle, Toast.LENGTH_SHORT).show();
                            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pure-add-friend',{detail:{handle:" + org.json.JSONObject.quote(friendHandle) + "}}));", null);
                            return;
                        } else {
                            String cleanServer = normalizeUrl(trimmed);
                            if (cleanServer != null) {
                                Toast.makeText(MainActivity.this, "กำลังเชื่อมต่อเพื่อเพิ่มเพื่อน...", Toast.LENGTH_SHORT).show();
                                getPreferences(0).edit().putString("server", cleanServer).apply();
                                openServer(cleanServer + "/?add=" + friendHandle);
                                return;
                            }
                        }
                    }

                    // 2. Server URL check
                    String clean = normalizeUrl(trimmed);
                    if (clean != null) {
                        Toast.makeText(MainActivity.this, "สแกนสำเร็จ! กำลังเชื่อมต่อ...", Toast.LENGTH_SHORT).show();
                        getPreferences(0).edit().putString("server", clean).apply();
                        openServer(clean);
                    } else {
                        new AlertDialog.Builder(MainActivity.this)
                            .setTitle("ข้อมูล QR Code ไม่ถูกต้อง")
                            .setMessage("QR Code ที่สแกนได้ไม่ใช่ที่อยู่เซิร์ฟเวอร์ PURE หรือ QR เพื่อน:\n\n" + data)
                            .setPositiveButton("ลองใหม่", (d, w) -> openScanner())
                            .setNegativeButton("กลับ", (d, w) -> {
                                if (scannerFromChat && web != null) closeScannerView();
                                else showSetup();
                            })
                            .show();
                    }
                });
            }

            @JavascriptInterface
            public void closeScanner() {
                runOnUiThread(() -> {
                    if (scannerFromChat && web != null) closeScannerView();
                    else showSetup();
                });
            }
        }, "PureScanner");

        scannerWeb.loadUrl("file:///android_asset/scanner.html");
    }

    private boolean sameOrigin(Uri u) {
        Uri a = Uri.parse(serverOrigin);
        return Objects.equals(a.getScheme(), u.getScheme())
                && Objects.equals(a.getHost(), u.getHost())
                && port(a) == port(u);
    }

    private int port(Uri u) {
        return u.getPort() != -1 ? u.getPort() : "https".equals(u.getScheme()) ? 443 : 80;
    }

    private void showErrorScreen(String targetUrl, String reason) {
        runOnUiThread(() -> {
            showingSetup = true;
            isScanning = false;
            if (web != null) {
                web.destroy();
                web = null;
            }
            base();

            ScrollView scroll = new ScrollView(this);
            LinearLayout content = new LinearLayout(this);
            content.setOrientation(LinearLayout.VERTICAL);
            content.setPadding(dp(24), dp(32), dp(24), dp(24));
            scroll.addView(content);
            root.addView(scroll);

            TextView errIcon = text("", 40);
            content.addView(errIcon);

            TextView errTitle = text("เชื่อมต่อกับเซิร์ฟเวอร์ไม่ได้", 22);
            errTitle.setTypeface(null, 1);
            errTitle.setTextColor(Color.rgb(248, 113, 113));
            content.addView(errTitle);

            content.addView(text("ที่อยู่ที่พยายามเชื่อมต่อ:\n" + targetUrl, 13));
            if (reason != null && !reason.isEmpty()) {
                TextView r = text("สาเหตุ: " + reason, 12);
                r.setTextColor(Color.rgb(180, 185, 195));
                content.addView(r);
            }

            View divider = new View(this);
            divider.setBackgroundColor(Color.rgb(44, 51, 64));
            LinearLayout.LayoutParams divParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1));
            divParams.setMargins(0, dp(12), 0, dp(12));
            content.addView(divider, divParams);

            TextView guide = text(" วิธีแก้ไข:\n" +
                    "1. ตรวจสอบว่าเปิด 'START-ONLINE.cmd' บนคอมพิวเตอร์ทิ้งไว้แล้วหรือยัง\n" +
                    "2. ใช้ปุ่ม [ สแกน QR Code] เพื่อสแกน QR Code ล่าสุดบนหน้าจอคอม\n" +
                    "3. หากลิงก์เปลี่ยน (เมื่อเปิด START-ONLINE ใหม่) ให้สแกนใหม่อีกครั้ง\n" +
                    "4. ตรวจสอบว่าสัญญาณอินเทอร์เน็ตบนมือถือใช้งานได้ปกติ", 12);
            guide.setTextColor(Color.rgb(200, 210, 225));
            content.addView(guide);

            content.addView(button(" สแกน QR Code ใหม่", Color.rgb(255, 209, 102), Color.rgb(17, 20, 26), () -> {
                openScanner();
            }));

            content.addView(button(" ลองเชื่อมต่อใหม่อีกครั้ง", Color.rgb(240, 243, 248), Color.rgb(17, 20, 26), () -> {
                openServer(targetUrl);
            }));

            content.addView(button(" กลับไปแก้ไขที่อยู่เซิร์ฟเวอร์", Color.rgb(38, 45, 56), Color.rgb(240, 243, 248), () -> {
                showSetup();
            }));

            content.addView(button(" สลับไปใช้งานโหมดออฟไลน์", Color.rgb(26, 30, 38), Color.rgb(200, 210, 225), () -> {
                startActivity(new Intent(this, OfflineActivity.class));
            }));
        });
    }

    private void openServer(String url) {
        showingSetup = false;
        isScanning = false;
        serverOrigin = url;
        base();

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(Color.rgb(17, 18, 20));
        bar.setPadding(dp(6), dp(4), dp(6), dp(4));

        Button home = button(" ตั้งค่า", Color.rgb(38, 45, 56), Color.rgb(240, 243, 248), () -> {
            new AlertDialog.Builder(this)
                .setMessage("กลับหน้าตั้งค่า? สายที่กำลังโทรจะสิ้นสุด")
                .setPositiveButton("กลับ", (d, w) -> showSetup())
                .setNegativeButton("ยกเลิก", null)
                .show();
        });
        home.setTextSize(10);
        bar.addView(home, new LinearLayout.LayoutParams(0, dp(36), 1));

        Button scanNav = button(" สแกน", Color.rgb(255, 209, 102), Color.rgb(17, 20, 26), () -> {
            openScanner();
        });
        scanNav.setTextSize(10);
        bar.addView(scanNav, new LinearLayout.LayoutParams(0, dp(36), 1));

        Button chatBtn = button(" แชต", Color.rgb(38, 45, 56), Color.rgb(240, 243, 248), () -> {
            if (web != null) web.loadUrl(serverOrigin);
        });
        chatBtn.setTextSize(10);
        bar.addView(chatBtn, new LinearLayout.LayoutParams(0, dp(36), 1));

        Button adminBtn = button(" แอดมิน", Color.rgb(50, 40, 20), Color.rgb(255, 209, 102), () -> {
            if (web != null) web.loadUrl(serverOrigin + "/admin");
        });
        adminBtn.setTextSize(10);
        bar.addView(adminBtn, new LinearLayout.LayoutParams(0, dp(36), 1));

        Button offline = button(" ออฟไลน์", Color.rgb(38, 45, 56), Color.rgb(240, 243, 248), () -> {
            if (web != null) web.loadUrl("about:blank");
            showSetup();
            startActivity(new Intent(this, OfflineActivity.class));
        });
        offline.setTextSize(10);
        bar.addView(offline, new LinearLayout.LayoutParams(0, dp(36), 1));

        topBar = bar;
        root.addView(bar);

        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setGeolocationEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " PUREAndroid/0.6.2");
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void notifyMessage(String title, String body, String peerId, String groupId) {
                runOnUiThread(() -> showNotification(title, body, peerId, groupId));
            }

            @JavascriptInterface
            public void openScanner() {
                runOnUiThread(() -> MainActivity.this.openScanner());
            }

            @JavascriptInterface
            public boolean setSpeakerphone(boolean on) {
                runOnUiThread(() -> applySpeakerphone(on));
                return true;
            }

            @JavascriptInterface
            public boolean isSpeakerphoneOn() {
                AudioManager manager = (AudioManager) getSystemService(AUDIO_SERVICE);
                return manager.isSpeakerphoneOn();
            }

            @JavascriptInterface
            public void resetAudio() {
                runOnUiThread(() -> resetAudioRoute());
            }

            @JavascriptInterface
            public boolean speakText(String text, float rate, float pitch) {
                if (text == null || text.trim().isEmpty()) return false;
                runOnUiThread(() -> speakTextInternal(text, rate, pitch, null));
                return true;
            }

            @JavascriptInterface
            public void stopSpeak() {
                runOnUiThread(() -> { if (tts != null) tts.stop(); });
            }
        }, "PureAndroid");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setBackgroundColor(Color.rgb(11, 12, 14));

        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v,String url){CookieManager.getInstance().flush();super.onPageFinished(v,url);}
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (audioUrl(v, r) || voiceUrl(v, r)) return true;
                return !sameOrigin(r.getUrl());
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r != null && r.isForMainFrame()) {
                    showErrorScreen(serverOrigin, e != null && Build.VERSION.SDK_INT >= 23 ? e.getDescription().toString() : "เชื่อมต่อไม่ได้");
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView v, String u, String m, JsResult r) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("PURE")
                        .setMessage(m)
                        .setPositiveButton("ตกลง", (d, w) -> r.confirm())
                        .setOnCancelListener(d -> r.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView v, String u, String m, JsResult r) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("PURE")
                        .setMessage(m)
                        .setPositiveButton("ยืนยัน", (d, w) -> r.confirm())
                        .setNegativeButton("ยกเลิก", (d, w) -> r.cancel())
                        .setOnCancelListener(d -> r.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView v, String u, String m, String def, JsPromptResult r) {
                final EditText input = new EditText(MainActivity.this);
                input.setText(def != null ? def : "");
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("PURE")
                        .setMessage(m)
                        .setView(input)
                        .setPositiveButton("ตกลง", (d, w) -> r.confirm(input.getText().toString()))
                        .setNegativeButton("ยกเลิก", (d, w) -> r.cancel())
                        .setOnCancelListener(d -> r.cancel())
                        .show();
                return true;
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!sameOrigin(Uri.parse(origin))) {
                    callback.invoke(origin, false, false);
                    return;
                }
                if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                    return;
                }
                if (geoCallback != null) geoCallback.invoke(geoOrigin, false, false);
                geoCallback = callback;
                geoOrigin = origin;
                requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION}, 12);
            }

            @Override
            public void onPermissionRequest(PermissionRequest r) {
                runOnUiThread(() -> {
                    if (!sameOrigin(r.getOrigin())) {
                        r.deny();
                        return;
                    }
                    if (mediaRequest != null) mediaRequest.deny();
                    mediaRequest = r;
                    List<String> need = new ArrayList<>();
                    for (String resource : r.getResources()) {
                        String permission = resource.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE) ? Manifest.permission.RECORD_AUDIO
                                : resource.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) ? Manifest.permission.CAMERA : null;
                        if (permission != null && checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                            need.add(permission);
                        }
                    }
                    if (need.isEmpty()) grantMedia();
                    else requestPermissions(need.toArray(new String[0]), 10);
                });
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest r) {
                if (mediaRequest == r) mediaRequest = null;
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(p.createIntent(), 11);
                } catch (Exception e) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                }
                return true;
            }
        });

        web.setDownloadListener((download, userAgent, disposition, mime, length) -> {
            if (!sameOrigin(Uri.parse(download))) return;
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(download));
                request.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(download));
                request.setMimeType(mime);
                String filename = URLUtil.guessFileName(download, disposition, mime);
                request.setTitle(filename);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, filename);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
                Toast.makeText(this, "กำลังดาวน์โหลด ดูในแจ้งเตือนระบบ", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "ดาวน์โหลดไม่สำเร็จ", Toast.LENGTH_SHORT).show();
            }
        });

        web.loadUrl(url);
    }

    private void grantMedia() {
        if (mediaRequest == null) return;
        List<String> allowed = new ArrayList<>();
        for (String r : mediaRequest.getResources()) {
            if (r.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                allowed.add(r);
            }
            if (r.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                allowed.add(r);
            }
        }
        mediaRequest.grant(allowed.toArray(new String[0]));
        mediaRequest = null;
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] p, int[] g) {
        super.onRequestPermissionsResult(code, p, g);
        if (code == 10) grantMedia();
        if (code == 12 && geoCallback != null) {
            geoCallback.invoke(geoOrigin, checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED, false);
            geoCallback = null;
        }
        if (code == 20) {
            if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                openScanner();
            } else {
                Toast.makeText(this, "จำเป็นต้องอนุญาตการใช้กล้องเพื่อสแกน QR Code", Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == 11 && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (isScanning) {
            if (scannerFromChat && web != null) {
                closeScannerView();
            } else {
                showSetup();
            }
            return;
        }
        if (!showingSetup) {
            if (web != null && web.canGoBack()) web.goBack();
            else showSetup();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNotificationIntent(intent);
    }

    private void handleNotificationIntent(Intent intent) {
        if (intent == null || web == null) return;
        String peerId = intent.getStringExtra("peerId");
        String groupId = intent.getStringExtra("groupId");
        if (peerId != null && !peerId.isEmpty()) {
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pure-open-peer',{detail:{peerId:" + org.json.JSONObject.quote(peerId) + "}}));", null);
        } else if (groupId != null && !groupId.isEmpty()) {
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pure-open-group',{detail:{groupId:" + org.json.JSONObject.quote(groupId) + "}}));", null);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                "pure_messages",
                "ข้อความ PURE",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("การแจ้งเตือนข้อความใหม่และ PURE AI");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 150, 100, 150});
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    public void showNotification(String title, String body, String peerId, String groupId) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                return;
            }
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            Intent intent = new Intent(this, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            if (peerId != null && !peerId.isEmpty()) intent.putExtra("peerId", peerId);
            if (groupId != null && !groupId.isEmpty()) intent.putExtra("groupId", groupId);

            PendingIntent pi = PendingIntent.getActivity(
                this,
                (int) System.currentTimeMillis(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                b = new Notification.Builder(this, "pure_messages");
            } else {
                b = new Notification.Builder(this);
                b.setPriority(Notification.PRIORITY_HIGH);
            }

            b.setContentTitle(title != null && !title.isEmpty() ? title : "PURE")
             .setContentText(body != null ? body : "")
             .setSmallIcon(getApplicationInfo().icon != 0 ? getApplicationInfo().icon : android.R.drawable.ic_dialog_info)
             .setAutoCancel(true)
             .setContentIntent(pi);

            if (Build.VERSION.SDK_INT >= 21) {
                b.setCategory(Notification.CATEGORY_MESSAGE);
            }

            int notifyId = 1000 + (int) (System.currentTimeMillis() % 10000);
            nm.notify(notifyId, b.build());
        } catch (Exception ignored) {}
    }

    @Override
    protected void onDestroy() {
        resetAudioRoute();CookieManager.getInstance().flush();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        if (geoCallback != null) {
            geoCallback.invoke(geoOrigin, false, false);
            geoCallback = null;
        }
        if (mediaRequest != null) mediaRequest.deny();
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (scannerWeb != null) {
            scannerWeb.destroy();
            scannerWeb = null;
        }
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
