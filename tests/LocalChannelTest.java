import app.pure.chat.LocalChannel;
import java.net.*;
import java.util.concurrent.*;

public class LocalChannelTest {
 public static void main(String[] args)throws Exception{
  exchange("123456","123456",true);exchange("123456","654321",false);
  System.out.println("PASS: offline encrypted bidirectional framing, Unicode, wrong pairing code");
 }
 static void exchange(String hostPin,String clientPin,boolean success)throws Exception{
  try(ServerSocket server=new ServerSocket(0)){ExecutorService pool=Executors.newSingleThreadExecutor();
   Future<Boolean> host=pool.submit(()->{try(Socket socket=server.accept()){socket.setSoTimeout(5000);LocalChannel c=new LocalChannel(socket.getInputStream(),socket.getOutputStream(),hostPin,true);if(!c.receive().equals("สวัสดี PURE 🐈"))throw new AssertionError();c.send("hello back");return true;}catch(Exception e){return false;}});
   boolean connected=false;try(Socket socket=new Socket("127.0.0.1",server.getLocalPort())){socket.setSoTimeout(5000);LocalChannel c=new LocalChannel(socket.getInputStream(),socket.getOutputStream(),clientPin,false);c.send("สวัสดี PURE 🐈");if(!c.receive().equals("hello back"))throw new AssertionError();connected=true;}catch(Exception e){if(success)throw e;}
   if(connected!=success||host.get(10,TimeUnit.SECONDS)!=success)throw new AssertionError("pairing result");pool.shutdownNow();
  }
 }
}
