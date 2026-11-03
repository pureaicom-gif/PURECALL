// Magic-byte sniffing so uploads are typed by content, not by the client-declared mime.
import {openSync,readSync,closeSync} from 'node:fs';
export function sniff(buf){
 if(buf.length<12)return null;
 if(buf[0]===0xff&&buf[1]===0xd8&&buf[2]===0xff)return 'image/jpeg';
 if(buf.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return 'image/png';
 if(buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP')return 'image/webp';
 if(buf.toString('ascii',0,6)==='GIF87a'||buf.toString('ascii',0,6)==='GIF89a')return 'image/gif';
 if(buf.toString('ascii',4,8)==='ftyp')return 'video/mp4';
 if(buf[0]===0x1a&&buf[1]===0x45&&buf[2]===0xdf&&buf[3]===0xa3)return 'video/webm';
 return null;
}
export function sniffFile(path){const fd=openSync(path,'r');try{const b=Buffer.alloc(16);const n=readSync(fd,b,0,16,0);return sniff(b.subarray(0,n));}finally{closeSync(fd);}}
