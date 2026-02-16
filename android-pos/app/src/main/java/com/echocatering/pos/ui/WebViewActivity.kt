package com.echocatering.pos.ui

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.echocatering.pos.BuildConfig
import com.echocatering.pos.EchoPosApplication
import com.echocatering.pos.databinding.ActivityWebviewBinding
import com.echocatering.pos.terminal.PaymentItem
import com.echocatering.pos.terminal.PaymentState
import com.echocatering.pos.terminal.ReaderState
import com.google.gson.Gson
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class WebViewActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityWebviewBinding
    private val terminalManager by lazy { EchoPosApplication.instance.terminalManager }
    private val gson = Gson()
    private var hasRedirected = false
    
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityWebviewBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
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
                cacheMode = WebSettings.LOAD_DEFAULT
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
    }
    
    data class PaymentItemDto(
        val name: String,
        val category: String,
        val quantity: Int,
        val price: Double,
        val modifier: String?
    )
}
