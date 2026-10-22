import app.pure.chat.LocalChannel;
import java.net.*;
import java.util.regex.*;

public class NearbyTestPeer {
 public static void main(String[] args)throws Exception{
  Socket socket;ServerSocket listener=null;
  boolean host=args[0].equals("host");
  if(host){listener=new ServerSocket(39876);System.out.println("LISTENING");socket=listener.accept();}
  else socket=new Socket("127.0.0.1",39877);
  try(socket){socket.setSoTimeout(45000);LocalChannel c=new LocalChannel(socket.getInputStream(),socket.getOutputStream(),args[1],host);
   c.send("{\"type\":\"message\",\"id\":\"test-1\",\"text\":\"สวัสดีจากโหมดออฟไลน์ PURE\"}");
   String ack=c.receive();if(!ack.contains("ack"))throw new AssertionError(ack);System.out.println("ANDROID_ACK_RECEIVED");
   String msg=c.receive();if(!msg.contains("Hello-nearby"))throw new AssertionError(msg);
   Matcher id=Pattern.compile("\"id\":\"([^\"]+)\"").matcher(msg);if(!id.find())throw new AssertionError(msg);
   c.send("{\"type\":\"ack\",\"id\":\""+id.group(1)+"\"}");System.out.println("PASS_NATIVE_BIDIRECTIONAL");
   Thread.sleep(8000);
  }finally{if(listener!=null)listener.close();}
 }
}
