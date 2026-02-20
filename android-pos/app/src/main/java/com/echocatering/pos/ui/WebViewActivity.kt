package com.echocatering.pos.ui

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.echocatering.pos.BuildConfig
import com.echocatering.pos.EchoPosApplication
import com.echocatering.pos.cache.VideoCacheManager
import com.echocatering.pos.databinding.ActivityWebviewBinding
import com.echocatering.pos.terminal.PaymentItem
import com.echocatering.pos.terminal.PaymentState
import com.echocatering.pos.terminal.ReaderState
import com.google.gson.Gson
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileInputStream

class WebViewActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityWebviewBinding
    private val terminalManager by lazy { EchoPosApplication.instance.terminalManager }
    private val gson = Gson()
    private var hasRedirected = false
    private lateinit var videoCacheManager: VideoCacheManager
    
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityWebviewBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        // Initialize video cache manager
        videoCacheManager = VideoCacheManager(applicationContext)
        
        setupWebView()
        observeTerminalState()
        
        // Initialize Terminal SDK
        terminalManager.initialize()
        
        // Load the web POS
        binding.webView.loadUrl("https://echocatering.com/admin/pos")
    }
    
    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        binding.webView.apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                
                // Enable proper viewport sizing for orientation detection
                useWideViewPort = true
                loadWithOverviewMode = true
                
                // Enable aggressive caching for videos and media
                cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
                
                // Enable media playback without user gesture
                mediaPlaybackRequiresUserGesture = false
                
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            }
            
            // Add JavaScript interface for Stripe Terminal
            addJavascriptInterface(StripeTerminalBridge(), "stripeBridge")
            
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    
                    // Redirect to POS after login - only redirect once and only if on /admin exactly
                    if (!hasRedirected && url == "https://echocatering.com/admin") {
                        hasRedirected = true
                        view?.loadUrl("https://echocatering.com/admin/pos")
                    } else {
                        // Inject reader status on page load
                        updateReaderStatus()
                    }
                }
                
                override fun shouldInterceptRequest(
                    view: WebView?,
                    request: WebResourceRequest?
                ): WebResourceResponse? {
                    val url = request?.url?.toString() ?: return null
                    
                    // Intercept video requests from Cloudinary
                    if (url.contains("cloudinary") && (url.endsWith(".mp4") || url.contains("/video/"))) {
                        val cachedPath = videoCacheManager.getCachedVideoPath(url)
                        
                        if (cachedPath != null) {
                            // Serve from cache
                            try {
                                val file = File(cachedPath)
                                val inputStream = FileInputStream(file)
                                return WebResourceResponse(
                                    "video/mp4",
                                    "UTF-8",
                                    inputStream
                                )
                            } catch (e: Exception) {
                                // Fall through to network request
                            }
                        } else {
                            // Cache the video for next time
                            videoCacheManager.cacheVideo(url)
                        }
                    }
                    
                    // Intercept map images from Cloudinary (PNG files)
                    if (url.contains("cloudinary") && (url.endsWith(".png") || url.contains("/image/"))) {
                        val cachedPath = videoCacheManager.getCachedVideoPath(url)
                        
                        if (cachedPath != null) {
                            // Serve from cache
                            try {
                                val file = File(cachedPath)
                                val inputStream = FileInputStream(file)
                                return WebResourceResponse(
                                    "image/png",
                                    "UTF-8",
                                    inputStream
                                )
                            } catch (e: Exception) {
                                // Fall through to network request
                            }
                        } else {
                            // Cache the image for next time
                            videoCacheManager.cacheVideo(url)
                        }
                    }
                    
                    return super.shouldInterceptRequest(view, request)
                }
                
                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    super.onReceivedError(view, request, error)
                    Toast.makeText(
                        this@WebViewActivity,
                        "Error loading page: ${error?.description}",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
            
            webChromeClient = WebChromeClient()
        }
    }
    
    private fun observeTerminalState() {
        lifecycleScope.launch {
            terminalManager.readerState.collectLatest { state ->
                updateReaderStatus()
            }
        }
        
        lifecycleScope.launch {
            terminalManager.paymentState.collectLatest { state ->
                when (state) {
                    is PaymentState.Succeeded -> {
                        notifyWebPaymentComplete(true, state.paymentIntentId)
                    }
                    is PaymentState.Failed -> {
                        notifyWebPaymentComplete(false, state.message)
                    }
                    is PaymentState.Canceled -> {
                        notifyWebPaymentComplete(false, "Payment canceled")
                    }
                    else -> {}
                }
            }
        }
    }
    
    private fun updateReaderStatus() {
        val state = terminalManager.readerState.value
        val status = when (state) {
            is ReaderState.Connected -> {
                """{"connected": true, "serialNumber": "${state.serialNumber}", "batteryLevel": ${state.batteryLevel ?: 0}}"""
            }
            else -> {
                """{"connected": false}"""
            }
        }
        
        runOnUiThread {
            binding.webView.evaluateJavascript(
                "if (window.onReaderStatusUpdate) window.onReaderStatusUpdate($status);",
                null
            )
        }
    }
    
    private fun notifyWebPaymentComplete(success: Boolean, data: String) {
        val result = if (success) {
            """{"success": true, "transactionId": "$data"}"""
        } else {
            """{"success": false, "error": "$data"}"""
        }
        
        runOnUiThread {
            binding.webView.evaluateJavascript(
                "if (window.onPaymentComplete) window.onPaymentComplete($result);",
                null
            )
        }
    }
    
    override fun onBackPressed() {
        if (binding.webView.canGoBack()) {
            binding.webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
    
    /**
     * JavaScript Bridge for Stripe Terminal
     */
    inner class StripeTerminalBridge {
        
        @JavascriptInterface
        fun discoverReaders() {
            runOnUiThread {
                terminalManager.discoverReaders()
            }
        }
        
        @JavascriptInterface
        fun connectReader(readerIndex: Int) {
            runOnUiThread {
                val readers = terminalManager.discoveredReaders.value
                if (readerIndex in readers.indices) {
                    terminalManager.connectToReader(readers[readerIndex])
                }
            }
        }
        
        @JavascriptInterface
        fun disconnectReader() {
            runOnUiThread {
                terminalManager.disconnectReader()
            }
        }
        
        @JavascriptInterface
        fun processPayment(amountCents: Int, currency: String) {
            processPaymentWithDetails(amountCents, currency, null, null, null, null, "[]", 0)
        }
        
        @JavascriptInterface
        fun processPaymentWithDetails(
            amountCents: Int,
            currency: String,
            tabId: String?,
            tabName: String?,
            eventId: String?,
            eventName: String?,
            itemsJson: String,
            tipCents: Int
        ) {
            runOnUiThread {
                try {
                    val items = gson.fromJson(itemsJson, Array<PaymentItemDto>::class.java)
                        .map { PaymentItem(it.name, it.category, it.quantity, it.price, it.modifier) }
                    
                    terminalManager.processPayment(
                        amountCents = amountCents,
                        tabId = tabId,
                        tabName = tabName,
                        eventId = eventId,
                        eventName = eventName,
                        items = items,
                        tipCents = tipCents
                    )
                } catch (e: Exception) {
                    Toast.makeText(
                        this@WebViewActivity,
                        "Payment error: ${e.message}",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
        
        @JavascriptInterface
        fun cancelPayment() {
            runOnUiThread {
                terminalManager.cancelPayment()
            }
        }
        
        @JavascriptInterface
        fun getReaderStatus(): String {
            val state = terminalManager.readerState.value
            return when (state) {
                is ReaderState.Connected -> {
                    """{"connected": true, "serialNumber": "${state.serialNumber}", "batteryLevel": ${state.batteryLevel ?: 0}}"""
                }
                else -> {
                    """{"connected": false}"""
                }
            }
        }
        
        @JavascriptInterface
        fun openReaderSetup() {
            runOnUiThread {
                startActivity(android.content.Intent(this@WebViewActivity, ReaderSetupActivity::class.java))
            }
        }
        
        @JavascriptInterface
        fun openDiagnostics() {
            runOnUiThread {
                startActivity(android.content.Intent(this@WebViewActivity, DiagnosticsActivity::class.java))
            }
        }
        
        @JavascriptInterface
        fun getDiscoveredReaders(): String {
            val readers = terminalManager.discoveredReaders.value
            val readerList = readers.mapIndexed { index, reader ->
                """{"index": $index, "serialNumber": "${reader.serialNumber ?: "Unknown"}", "deviceType": "${reader.deviceType?.name ?: "Unknown"}"}"""
            }
            return "[${readerList.joinToString(",")}]"
        }
    }
    
    data class PaymentItemDto(
        val name: String,
        val category: String,
        val quantity: Int,
        val price: Double,
        val modifier: String?
    )
}
