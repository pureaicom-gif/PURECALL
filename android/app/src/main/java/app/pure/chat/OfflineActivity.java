package app.pure.chat;

import android.Manifest;
import android.app.*;
import android.os.*;
import android.bluetooth.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import android.text.InputFilter;
import org.json.JSONObject;
import java.net.*;
import java.io.*;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.*;

public class OfflineActivity extends Activity {
    private static final UUID SERVICE=UUID.fromString("731933b8-7456-4d04-9d06-681965a5c155");
    private final ExecutorService work=Executors.newCachedThreadPool();
    private final ExecutorService writes=Executors.newSingleThreadExecutor();
    private volatile LocalChannel channel;
    private volatile Socket wifi;
    private volatile ServerSocket server;
    private volatile BluetoothSocket bluetooth;
    private volatile BluetoothServerSocket btServer;
    private volatile int generation=0;
    private TextView status;
    private LinearLayout transcript;
    private ScrollView scroll;
    private EditText input;
    private Button send;
    private BluetoothAdapter adapter;
    private final Map<String,TextView> pending=new HashMap<>();
    private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density);}
    private TextView label(String s,int size){TextView t=new TextView(this);t.setText(s);t.setTextColor(Color.rgb(220,223,228));t.setTextSize(size);t.setPadding(dp(7),dp(8),dp(7),dp(8));return t;}
    private Button button(String s,Runnable fn){Button b=new Button(this);b.setText(s);b.setTextSize(12);b.setAllCaps(false);b.setTextColor(Color.rgb(232,235,240));android.graphics.drawable.GradientDrawable bg=new android.graphics.drawable.GradientDrawable();bg.setColor(Color.rgb(30,33,40));bg.setCornerRadius(dp(12));bg.setStroke(dp(1),Color.rgb(52,57,67));b.setBackground(new android.graphics.drawable.InsetDrawable(bg,dp(3),dp(4),dp(3),dp(4)));b.setOnClickListener(v->fn.run());return b;}
    @Override public void onCreate(Bundle state){super.onCreate(state);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);BluetoothManager manager=(BluetoothManager)getSystemService(BLUETOOTH_SERVICE);adapter=manager==null?null:manager.getAdapter();LinearLayout root=new LinearLayout(this);root.setOrientation(1);root.setPadding(dp(15),dp(20),dp(15),dp(10));root.setBackgroundColor(Color.rgb(11,12,14));root.setOnApplyWindowInsetsListener((v,i)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets b=i.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());v.setPadding(dp(15)+b.left,dp(12)+b.top,dp(15)+b.right,dp(10)+b.bottom);}return i;});setContentView(root);root.addView(label("PURE  /  NEARBY",27));root.addView(label("ข้อความใกล้ตัว ไม่ต้องมีอินเทอร์เน็ต",12));LinearLayout wifiButtons=new LinearLayout(this);wifiButtons.addView(button("สร้างห้อง Wi-Fi",this::hostWifi),new LinearLayout.LayoutParams(0,dp(47),1));wifiButtons.addView(button("เข้าห้อง Wi-Fi",this::joinWifi),new LinearLayout.LayoutParams(0,dp(47),1));root.addView(wifiButtons);LinearLayout btButtons=new LinearLayout(this);btButtons.addView(button("รอรับ Bluetooth",()->{if(btReady())hostBluetooth();}),new LinearLayout.LayoutParams(0,dp(47),1));btButtons.addView(button("เชื่อม Bluetooth",()->{if(btReady())joinBluetooth();}),new LinearLayout.LayoutParams(0,dp(47),1));root.addView(btButtons);status=label("Wi-Fi: ต่อวงเดียวกัน / ฮอตสปอต\nBluetooth: จับคู่ในตั้งค่าระบบก่อน",11);root.addView(status);root.addView(button("ยกเลิกการเชื่อมต่อ / ปิดห้อง",()->{disconnect();status.setText("ปิดการเชื่อมต่อแล้ว");}));scroll=new ScrollView(this);transcript=new LinearLayout(this);transcript.setOrientation(1);scroll.addView(transcript);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));LinearLayout compose=new LinearLayout(this);input=new EditText(this);input.setTextSize(14);input.setHint("พิมพ์ข้อความ…");input.setMaxLines(3);input.setFilters(new InputFilter[]{new InputFilter.LengthFilter(1500)});compose.addView(input,new LinearLayout.LayoutParams(0,-2,1));send=button("ส่ง ↗",this::sendMessage);send.setEnabled(false);compose.addView(send);root.addView(compose);root.addView(label("ข้อความอยู่เฉพาะหน้านี้ • ปิดหน้าแล้วไม่เก็บประวัติ",10));}
    private String newPin(){return String.format(Locale.US,"%06d",new SecureRandom().nextInt(1000000));}
    private void status(String s){runOnUiThread(()->status.setText(s));}
    private TextView bubble(String message,boolean own){TextView t=label(message,14);android.graphics.drawable.GradientDrawable bg=new android.graphics.drawable.GradientDrawable();bg.setColor(own?Color.rgb(231,234,240):Color.rgb(35,39,47));bg.setCornerRadius(dp(14));t.setBackground(bg);t.setTextColor(own?Color.rgb(19,22,28):Color.rgb(227,231,237));t.setPadding(dp(14),dp(11),dp(14),dp(11));t.setMaxWidth(getResources().getDisplayMetrics().widthPixels-dp(85));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,-2);lp.gravity=own?Gravity.END:Gravity.START;lp.setMargins(dp(3),dp(6),dp(3),dp(6));t.setLayoutParams(lp);return t;}
    private void row(String message){runOnUiThread(()->{transcript.addView(message.startsWith("—")?label(message,11):bubble(message,false));trim();scroll.post(()->scroll.fullScroll(View.FOCUS_DOWN));});}
    private void trim(){while(transcript.getChildCount()>150)transcript.removeViewAt(0);}
    private void sendMessage(){String text=input.getText().toString().trim();LocalChannel current=channel;int gen=generation;if(text.isEmpty()||current==null)return;String id=UUID.randomUUID().toString();TextView bubble=bubble("คุณ · กำลังส่ง\n"+text,true);transcript.addView(bubble);trim();pending.put(id,bubble);input.setText("");writes.execute(()->{try{JSONObject packet=new JSONObject();packet.put("type","message");packet.put("id",id);packet.put("text",text);current.send(packet.toString());}catch(Exception e){runOnUiThread(()->{pending.remove(id);bubble.setText("ส่งไม่สำเร็จ · "+text);});fail(gen,e);}});}
    private void openChannel(InputStream in,OutputStream out,String pin,boolean host,int gen)throws Exception{LocalChannel established=new LocalChannel(in,out,pin,host);if(gen!=generation)return;channel=established;status("เชื่อมต่อแล้ว · ส่งข้อความได้เลย");runOnUiThread(()->{if(gen==generation)send.setEnabled(true);});row("— เริ่มบทสนทนาใหม่ —");while(gen==generation){JSONObject p=new JSONObject(established.receive());if("message".equals(p.optString("type"))){String text=p.getString("text"),id=p.getString("id");if(text.length()>1500||id.length()>80)throw new IOException("ข้อมูลผิดรูปแบบ");row("เพื่อน\n"+text);established.send(new JSONObject().put("type","ack").put("id",id).toString());}else if("ack".equals(p.optString("type"))){String id=p.getString("id");runOnUiThread(()->{TextView b=pending.remove(id);if(b!=null)b.setText(b.getText().toString().replace("คุณ · กำลังส่ง","คุณ · ถึงเครื่องเพื่อนแล้ว"));});}}}
    private void fail(int gen,Exception e){if(gen!=generation)return;runOnUiThread(()->{if(gen!=generation)return;disconnect();status.setText("เชื่อมต่อสิ้นสุด / ไม่สำเร็จ\nตรวจรหัสจับคู่ ระยะสัญญาณ และเปิดแอปทั้งสองเครื่อง");});}
    private void hostWifi(){disconnect();int gen=generation;String pin=newPin();work.execute(()->{try{ServerSocket listener=new ServerSocket();listener.setReuseAddress(true);listener.bind(new InetSocketAddress(39876));if(gen!=generation){listener.close();return;}server=listener;status("รอเพื่อนผ่าน Wi-Fi\nIP: "+localIps()+"\nรหัสจับคู่: "+pin+" · บอกให้เพื่อนกรอก");Socket accepted=listener.accept();if(gen!=generation){accepted.close();return;}wifi=accepted;listener.close();wifi.setSoTimeout(20000); // handshake deadline
                InputStream in=wifi.getInputStream();OutputStream out=wifi.getOutputStream();
                // Reset the timeout after the authenticated handshake, before the receive loop.
                openWifiChannel(in,out,pin,true,gen);
            }catch(Exception e){fail(gen,e);}});}
    private void openWifiChannel(InputStream in,OutputStream out,String pin,boolean host,int gen)throws Exception{
        // A watchdog closes connections that never complete authentication. Once connected it does nothing.
        work.execute(()->{try{Thread.sleep(20000);if(gen==generation&&channel==null&&wifi!=null)wifi.close();}catch(Exception ignored){}});
        wifi.setSoTimeout(0);openChannel(in,out,pin,host,gen);
    }
    private String localIps()throws Exception{List<String> ips=new ArrayList<>();for(NetworkInterface n:Collections.list(NetworkInterface.getNetworkInterfaces()))for(InetAddress a:Collections.list(n.getInetAddresses()))if(!a.isLoopbackAddress()&&a instanceof Inet4Address)ips.add(a.getHostAddress());return ips.isEmpty()?"ยังไม่มี IP — เปิด Wi-Fi / ฮอตสปอต":String.join(" / ",ips);}
    private void joinWifi(){LinearLayout form=new LinearLayout(this);form.setOrientation(1);form.setPadding(dp(20),0,dp(20),0);EditText ip=new EditText(this);ip.setHint("IP ที่แสดงบนเครื่องเพื่อน");ip.setSingleLine();ip.setInputType(17);EditText pin=new EditText(this);pin.setHint("รหัสจับคู่ 6 หลัก");pin.setInputType(2);pin.setFilters(new InputFilter[]{new InputFilter.LengthFilter(6)});form.addView(ip);form.addView(pin);new AlertDialog.Builder(this).setTitle("เข้าห้อง Wi-Fi / ฮอตสปอต").setView(form).setNegativeButton("ยกเลิก",null).setPositiveButton("เชื่อมต่อ",(d,w)->{String host=ip.getText().toString().trim(),code=pin.getText().toString();if(!host.matches("\\d{1,3}(\\.\\d{1,3}){3}")||!code.matches("\\d{6}")){status("กรอก IP และรหัส 6 หลักให้ครบ");return;}disconnect();int gen=generation;status("กำลังเชื่อมต่อ "+host);work.execute(()->{try{Socket s=new Socket();if(gen!=generation){s.close();return;}wifi=s;s.connect(new InetSocketAddress(host,39876),10000);openWifiChannel(s.getInputStream(),s.getOutputStream(),code,false,gen);}catch(Exception e){fail(gen,e);}});}).show();}
    private boolean btReady(){if(adapter==null){status("เครื่องนี้ไม่มี Bluetooth");return false;}if(Build.VERSION.SDK_INT>=31&&checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT},21);return false;}if(!adapter.isEnabled()){startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));status("เปิด Bluetooth แล้วกลับมากดอีกครั้ง");return false;}return true;}
    private void hostBluetooth(){disconnect();int gen=generation;String pin=newPin();status("รอ Bluetooth · รหัสจับคู่ "+pin+"\nให้เพื่อนเลือกเครื่องนี้ในรายการที่จับคู่แล้ว");work.execute(()->{try{BluetoothServerSocket listener=adapter.listenUsingRfcommWithServiceRecord("PURE Nearby",SERVICE);if(gen!=generation){listener.close();return;}btServer=listener;BluetoothSocket s=listener.accept();if(gen!=generation){s.close();return;}bluetooth=s;listener.close();btWatchdog(gen);openChannel(s.getInputStream(),s.getOutputStream(),pin,true,gen);}catch(Exception e){fail(gen,e);}});}
    private void btWatchdog(int gen){work.execute(()->{try{Thread.sleep(20000);if(gen==generation&&channel==null&&bluetooth!=null)bluetooth.close();}catch(Exception ignored){}});}
    private void joinBluetooth(){List<BluetoothDevice> devices=new ArrayList<>(adapter.getBondedDevices());if(devices.isEmpty()){new AlertDialog.Builder(this).setMessage("จับคู่โทรศัพท์ทั้งสองเครื่องในตั้งค่า Bluetooth ก่อน แล้วกลับมาเลือกเชื่อมต่อ").setPositiveButton("เปิดตั้งค่า",(d,w)->startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS))).setNegativeButton("ปิด",null).show();return;}String[] names=devices.stream().map(d->d.getName()+"\n"+d.getAddress()).toArray(String[]::new);new AlertDialog.Builder(this).setTitle("เลือกเพื่อนที่เปิด PURE รอรับอยู่").setItems(names,(dialog,index)->{EditText pin=new EditText(this);pin.setHint("รหัส 6 หลักจากเครื่องเพื่อน");pin.setInputType(2);pin.setFilters(new InputFilter[]{new InputFilter.LengthFilter(6)});new AlertDialog.Builder(this).setTitle("รหัสจับคู่ PURE").setView(pin).setPositiveButton("เชื่อมต่อ",(d,w)->{String code=pin.getText().toString();if(!code.matches("\\d{6}")){status("กรุณากรอกรหัส 6 หลัก");return;}disconnect();int gen=generation;status("กำลังเชื่อมต่อ Bluetooth…");work.execute(()->{try{BluetoothSocket s=devices.get(index).createRfcommSocketToServiceRecord(SERVICE);if(gen!=generation){s.close();return;}bluetooth=s;btWatchdog(gen);s.connect();openChannel(s.getInputStream(),s.getOutputStream(),code,false,gen);}catch(Exception e){fail(gen,e);}});}).setNegativeButton("ยกเลิก",null).show();}).setNegativeButton("ปิด",null).show();}
    private void disconnect(){generation++;channel=null;send.setEnabled(false);for(Closeable c:new Closeable[]{wifi,server,bluetooth,btServer})if(c!=null)try{c.close();}catch(Exception ignored){}wifi=null;server=null;bluetooth=null;btServer=null;for(TextView t:pending.values())t.setText(t.getText().toString().replace("กำลังส่ง","ไม่ยืนยันการรับ"));pending.clear();}
    @Override public void onRequestPermissionsResult(int code,String[] p,int[] results){super.onRequestPermissionsResult(code,p,results);if(code==21)status("กดปุ่ม Bluetooth อีกครั้งเพื่อเชื่อมต่อ");}
    @Override protected void onDestroy(){disconnect();work.shutdownNow();writes.shutdownNow();super.onDestroy();}
}
