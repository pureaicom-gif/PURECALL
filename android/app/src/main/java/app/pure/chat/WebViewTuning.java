package app.pure.chat;

import android.os.Build;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;

/** 0.9.2 performance settings for the main WebView (GPU layer, HTTP cache, renderer priority, no overscroll glow). */
final class WebViewTuning {
    private WebViewTuning() {}

    static void apply(WebView web) {
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setBackgroundColor(0xFF000000);
        WebSettings s = web.getSettings();
        s.setCacheMode(WebSettings.LOAD_DEFAULT); // honour server Cache-Control/ETag; assets revalidate with 304s
        s.setTextZoom(100);                       // system font scale must not break the layout
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        if (Build.VERSION.SDK_INT >= 23) web.getSettings().setOffscreenPreRaster(true);
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
    }
}
