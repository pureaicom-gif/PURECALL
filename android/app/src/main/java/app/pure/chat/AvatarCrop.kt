package app.pure.chat

import android.graphics.Bitmap
import java.io.ByteArrayOutputStream

/** Center-crop to a square and scale to 512px JPEG (server limit 3 MB). */
object AvatarCrop {
    fun squareJpeg(src: Bitmap, size: Int = 512): ByteArray {
        val s = minOf(src.width, src.height)
        val sq = Bitmap.createBitmap(src, (src.width - s) / 2, (src.height - s) / 2, s, s)
        val out = Bitmap.createScaledBitmap(sq, size, size, true)
        return ByteArrayOutputStream().also { out.compress(Bitmap.CompressFormat.JPEG, 88, it) }.toByteArray()
    }
}
