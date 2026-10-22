package app.pure.chat;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.*;
import javax.crypto.*;
import javax.crypto.spec.*;

/** Bounded encrypted framing shared by Wi-Fi and Bluetooth transports. */
public final class LocalChannel {
    private final DataInputStream input;
    private final DataOutputStream output;
    private final SecretKeySpec sendKey,receiveKey;
    private long sent=0,received=0;
    public LocalChannel(InputStream in,OutputStream out,String pin,boolean host)throws Exception{
        input=new DataInputStream(in);output=new DataOutputStream(out);
        KeyPairGenerator generator=KeyPairGenerator.getInstance("EC");generator.initialize(new ECGenParameterSpec("secp256r1"));KeyPair pair=generator.generateKeyPair();
        byte[] mine=pair.getPublic().getEncoded();writeFrame(mine);byte[] other=readFrame(256);
        PublicKey peer=KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(other));KeyAgreement agreement=KeyAgreement.getInstance("ECDH");agreement.init(pair.getPrivate());agreement.doPhase(peer,true);
        MessageDigest sha=MessageDigest.getInstance("SHA-256");sha.update(agreement.generateSecret());sha.update(pin.getBytes(StandardCharsets.UTF_8));sha.update(host?mine:other);sha.update(host?other:mine);byte[] key=sha.digest();
        writeFrame(mac(key,host?"host-proof":"client-proof"));byte[] proof=readFrame(64);
        if(!MessageDigest.isEqual(proof,mac(key,host?"client-proof":"host-proof")))throw new IOException("รหัสจับคู่ไม่ตรงกัน");
        sendKey=new SecretKeySpec(mac(key,host?"host-send":"client-send"),"AES");receiveKey=new SecretKeySpec(mac(key,host?"client-send":"host-send"),"AES");
    }
    private static byte[] mac(byte[] key,String label)throws Exception{Mac m=Mac.getInstance("HmacSHA256");m.init(new SecretKeySpec(key,"HmacSHA256"));return m.doFinal(label.getBytes(StandardCharsets.UTF_8));}
    private synchronized void writeFrame(byte[] data)throws IOException{output.writeInt(data.length);output.write(data);output.flush();}
    private byte[] readFrame(int max)throws IOException{int size=input.readInt();if(size<1||size>max)throw new IOException("ข้อมูลไม่ถูกต้อง");byte[] data=new byte[size];input.readFully(data);return data;}
    public synchronized void send(String text)throws Exception{byte[] data=text.getBytes(StandardCharsets.UTF_8);if(data.length>8192)throw new IOException("ข้อความยาวเกินไป");byte[] nonce=ByteBuffer.allocate(12).putInt(0).putLong(++sent).array();Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,sendKey,new GCMParameterSpec(128,nonce));writeFrame(c.doFinal(data));}
    public String receive()throws Exception{byte[] data=readFrame(8300);byte[] nonce=ByteBuffer.allocate(12).putInt(0).putLong(++received).array();Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,receiveKey,new GCMParameterSpec(128,nonce));return new String(c.doFinal(data),StandardCharsets.UTF_8);}
}
