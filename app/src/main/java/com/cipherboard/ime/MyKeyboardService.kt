package com.cipherboard.ime

import android.graphics.Color
import android.inputmethodservice.InputMethodService
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient

class MyKeyboardService : InputMethodService() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var webView: WebView? = null

    /**
     * Finds where the built web app lives inside this APK.
     * Capacitor copies the web build to assets/public, plain Gradle builds use assets/www.
     */
    private fun resolveIndexUrl(): String {
        val candidates = listOf(
            "file:///android_asset/public/index.html", // Capacitor layout
            "file:///android_asset/www/index.html"     // plain Gradle layout
        )
        for (url in candidates) {
            val relative = url.removePrefix("file:///android_asset/")
            val exists = try {
                assets.open(relative).use { true }
            } catch (_: Exception) {
                false
            }
            if (exists) return url
        }
        return candidates.last()
    }

    override fun onCreateInputView(): View {
        val imeWebView = WebView(this)
        imeWebView.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )

        imeWebView.settings.javaScriptEnabled = true
        imeWebView.settings.domStorageEnabled = true
        imeWebView.settings.allowFileAccess = true
        imeWebView.settings.allowContentAccess = true

        // The web app body is transparent, so give the IME window a solid dark surface.
        imeWebView.setBackgroundColor(Color.parseColor("#0B1220"))

        imeWebView.webViewClient = WebViewClient()
        imeWebView.webChromeClient = WebChromeClient()
        imeWebView.addJavascriptInterface(AndroidKeyboardBridge(), "AndroidKeyboard")
        imeWebView.loadUrl(resolveIndexUrl())

        webView = imeWebView
        return imeWebView
    }

    // The IME window must never enter fullscreen mode, it only lives at the bottom of the screen.
    override fun onEvaluateFullscreenMode(): Boolean {
        return false
    }

    override fun onDestroy() {
        webView?.removeJavascriptInterface("AndroidKeyboard")
        webView?.destroy()
        webView = null
        super.onDestroy()
    }

    inner class AndroidKeyboardBridge {

        @JavascriptInterface
        fun commitText(text: String) {
            mainHandler.post {
                currentInputConnection?.commitText(text, 1)
            }
        }

        @JavascriptInterface
        fun deleteText() {
            mainHandler.post {
                val connection = currentInputConnection ?: return@post
                val deleted = connection.deleteSurroundingText(1, 0)
                if (!deleted) {
                    connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DEL))
                    connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DEL))
                }
            }
        }

        @JavascriptInterface
        fun sendEnter() {
            mainHandler.post {
                val connection = currentInputConnection ?: return@post
                val didAction = connection.performEditorAction(EditorInfo.IME_ACTION_DONE)
                if (!didAction) {
                    connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER))
                    connection.sendKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER))
                }
            }
        }
    }
}