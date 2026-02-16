package com.echocatering.pos.terminal

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.echocatering.pos.api.ApiClient
import com.stripe.stripeterminal.Terminal
import com.stripe.stripeterminal.external.callable.*
import com.stripe.stripeterminal.external.models.*
import com.stripe.stripeterminal.log.LogLevel
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Manages Stripe Terminal SDK initialization, reader discovery, and payment processing.
 */
class TerminalManager(private val context: Context) {
    
    companion object {
        private const val TAG = "TerminalManager"
    }
    
    // Terminal state
    private val _terminalState = MutableStateFlow<TerminalState>(TerminalState.NotInitialized)
    val terminalState: StateFlow<TerminalState> = _terminalState.asStateFlow()
    
    // Reader state
    private val _readerState = MutableStateFlow<ReaderState>(ReaderState.Disconnected)
    val readerState: StateFlow<ReaderState> = _readerState.asStateFlow()
    
    // Payment state
    private val _paymentState = MutableStateFlow<PaymentState>(PaymentState.Idle)
    val paymentState: StateFlow<PaymentState> = _paymentState.asStateFlow()
    
    // Discovered readers
    private val _discoveredReaders = MutableStateFlow<List<Reader>>(emptyList())
    val discoveredReaders: StateFlow<List<Reader>> = _discoveredReaders.asStateFlow()
    
    private var discoveryCancelable: Cancelable? = null
    private var paymentCancelable: Cancelable? = null
    private var currentPaymentIntentId: String? = null
    
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    /**
     * Initialize the Terminal SDK
     */
    fun initialize() {
        if (Terminal.isInitialized()) {
            _terminalState.value = TerminalState.Initialized
            Log.d(TAG, "Terminal already initialized")
            return
        }
        
        if (!hasRequiredPermissions()) {
            _terminalState.value = TerminalState.Error("Missing required permissions")
            return
        }
        
        try {
            Terminal.initTerminal(
                context.applicationContext,
                LogLevel.VERBOSE,
                EchoTokenProvider(),
                EchoTerminalListener()
            )
            _terminalState.value = TerminalState.Initialized
            Log.d(TAG, "Terminal initialized successfully")
        } catch (e: TerminalException) {
            Log.e(TAG, "Failed to initialize Terminal", e)
            _terminalState.value = TerminalState.Error(e.errorMessage)
        }
    }
    
    /**
     * Check if required permissions are granted
     */
    fun hasRequiredPermissions(): Boolean {
        val permissions = listOf(
            Manifest.permission.BLUETOOTH_CONNECT,
            Manifest.permission.BLUETOOTH_SCAN,
            Manifest.permission.ACCESS_FINE_LOCATION
        )
        return permissions.all {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
    }
    
    /**
     * Start discovering Bluetooth readers
     */
    fun discoverReaders() {
        if (!Terminal.isInitialized()) {
            _readerState.value = ReaderState.Error("Terminal not initialized")
            return
        }
        
        // Cancel any existing discovery
        discoveryCancelable?.cancel(object : Callback {
            override fun onSuccess() {}
            override fun onFailure(e: TerminalException) {}
        })
        
        _readerState.value = ReaderState.Discovering
        _discoveredReaders.value = emptyList()
        
        val config = DiscoveryConfiguration.BluetoothDiscoveryConfiguration(
            isSimulated = false
        )
        
        discoveryCancelable = Terminal.getInstance().discoverReaders(
            config,
            object : DiscoveryListener {
                override fun onUpdateDiscoveredReaders(readers: List<Reader>) {
                    Log.d(TAG, "Discovered ${readers.size} readers")
                    _discoveredReaders.value = readers
                }
            },
            object : Callback {
                override fun onSuccess() {
                    Log.d(TAG, "Discovery completed")
                    if (_discoveredReaders.value.isEmpty()) {
                        _readerState.value = ReaderState.NoReadersFound
                    }
                }
                
                override fun onFailure(e: TerminalException) {
                    Log.e(TAG, "Discovery failed", e)
                    _readerState.value = ReaderState.Error(e.errorMessage)
                }
            }
        )
    }
    
    /**
     * Connect to a specific reader
     */
    fun connectToReader(reader: Reader) {
        _readerState.value = ReaderState.Connecting(reader.serialNumber ?: "Unknown")
        
        val config = ConnectionConfiguration.BluetoothConnectionConfiguration(
            locationId = reader.location?.id ?: ""
        )
        
        Terminal.getInstance().connectBluetoothReader(
            reader,
            config,
            EchoReaderListener(),
            object : ReaderCallback {
                override fun onSuccess(connectedReader: Reader) {
                    Log.d(TAG, "Connected to reader: ${connectedReader.serialNumber}")
                    _readerState.value = ReaderState.Connected(
                        serialNumber = connectedReader.serialNumber ?: "Unknown",
                        batteryLevel = connectedReader.batteryLevel,
                        deviceType = connectedReader.deviceType.name
                    )
                }
                
                override fun onFailure(e: TerminalException) {
                    Log.e(TAG, "Failed to connect to reader", e)
                    _readerState.value = ReaderState.Error(e.errorMessage)
                }
            }
        )
    }
    
    /**
     * Disconnect from current reader
     */
    fun disconnectReader() {
        Terminal.getInstance().disconnectReader(object : Callback {
            override fun onSuccess() {
                Log.d(TAG, "Disconnected from reader")
                _readerState.value = ReaderState.Disconnected
            }
            
            override fun onFailure(e: TerminalException) {
                Log.e(TAG, "Failed to disconnect", e)
                _readerState.value = ReaderState.Error(e.errorMessage)
            }
        })
    }
    
    /**
     * Process a payment
     */
    fun processPayment(
        amountCents: Int,
        tabId: String?,
        tabName: String?,
        eventId: String?,
        eventName: String?,
        items: List<PaymentItem>,
        tipCents: Int = 0
    ) {
        scope.launch {
            try {
                _paymentState.value = PaymentState.CreatingIntent
                
                // Create payment intent via backend
                val request = com.echocatering.pos.api.PaymentIntentRequest(
                    amount = amountCents,
                    tabId = tabId,
                    tabName = tabName,
                    eventId = eventId,
                    eventName = eventName,
                    items = items.map { 
                        com.echocatering.pos.api.PaymentItem(
                            name = it.name,
                            category = it.category,
                            quantity = it.quantity,
                            price = it.price,
                            modifier = it.modifier
                        )
                    },
                    tipAmount = tipCents
                )
                
                val response = ApiClient.service.createPaymentIntent(request)
                currentPaymentIntentId = response.payment_intent_id
                
                // Retrieve the payment intent in Terminal
                _paymentState.value = PaymentState.RetrievingIntent
                
                Terminal.getInstance().retrievePaymentIntent(
                    response.client_secret,
                    object : PaymentIntentCallback {
                        override fun onSuccess(paymentIntent: PaymentIntent) {
                            collectPayment(paymentIntent)
                        }
                        
                        override fun onFailure(e: TerminalException) {
                            Log.e(TAG, "Failed to retrieve payment intent", e)
                            _paymentState.value = PaymentState.Failed(e.errorMessage)
                        }
                    }
                )
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to create payment intent", e)
                _paymentState.value = PaymentState.Failed(e.message ?: "Unknown error")
            }
        }
    }
    
    private fun collectPayment(paymentIntent: PaymentIntent) {
        _paymentState.value = PaymentState.CollectingPayment
        
        val config = CollectConfiguration.Builder().build()
        
        paymentCancelable = Terminal.getInstance().collectPaymentMethod(
            paymentIntent,
            object : PaymentIntentCallback {
                override fun onSuccess(collectedPaymentIntent: PaymentIntent) {
                    confirmPayment(collectedPaymentIntent)
                }
                
                override fun onFailure(e: TerminalException) {
                    Log.e(TAG, "Failed to collect payment", e)
                    _paymentState.value = PaymentState.Failed(e.errorMessage)
                }
            },
            config
        )
    }
    
    private fun confirmPayment(paymentIntent: PaymentIntent) {
        _paymentState.value = PaymentState.ConfirmingPayment
        
        Terminal.getInstance().confirmPaymentIntent(
            paymentIntent,
            object : PaymentIntentCallback {
                override fun onSuccess(confirmedPaymentIntent: PaymentIntent) {
                    Log.d(TAG, "Payment confirmed: ${confirmedPaymentIntent.id}")
                    
                    // Notify backend of successful payment
                    scope.launch {
                        try {
                            val confirmRequest = com.echocatering.pos.api.ConfirmPaymentRequest(
                                payment_intent_id = confirmedPaymentIntent.id ?: ""
                            )
                            val confirmResponse = ApiClient.service.confirmPayment(confirmRequest)
                            
                            _paymentState.value = PaymentState.Succeeded(
                                paymentIntentId = confirmedPaymentIntent.id ?: "",
                                receiptUrl = confirmResponse.receipt_url
                            )
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to confirm with backend", e)
                            // Payment still succeeded on Stripe, just backend sync failed
                            _paymentState.value = PaymentState.Succeeded(
                                paymentIntentId = confirmedPaymentIntent.id ?: "",
                                receiptUrl = null
                            )
                        }
                    }
                }
                
                override fun onFailure(e: TerminalException) {
                    Log.e(TAG, "Failed to confirm payment", e)
                    _paymentState.value = PaymentState.Failed(e.errorMessage)
                }
            }
        )
    }
    
    /**
     * Cancel the current payment
     */
    fun cancelPayment() {
        paymentCancelable?.cancel(object : Callback {
            override fun onSuccess() {
                Log.d(TAG, "Payment canceled")
                
                // Cancel on backend too
                currentPaymentIntentId?.let { piId ->
                    scope.launch {
                        try {
                            ApiClient.service.cancelPayment(
                                com.echocatering.pos.api.CancelPaymentRequest(piId)
                            )
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to cancel on backend", e)
                        }
                    }
                }
                
                _paymentState.value = PaymentState.Canceled
            }
            
            override fun onFailure(e: TerminalException) {
                Log.e(TAG, "Failed to cancel payment", e)
            }
        })
    }
    
    /**
     * Reset payment state to idle
     */
    fun resetPaymentState() {
        _paymentState.value = PaymentState.Idle
        currentPaymentIntentId = null
    }
    
    /**
     * Clean up resources
     */
    fun cleanup() {
        discoveryCancelable?.cancel(object : Callback {
            override fun onSuccess() {}
            override fun onFailure(e: TerminalException) {}
        })
        paymentCancelable?.cancel(object : Callback {
            override fun onSuccess() {}
            override fun onFailure(e: TerminalException) {}
        })
        scope.cancel()
    }
    
    // Token provider for Stripe Terminal
    private inner class EchoTokenProvider : ConnectionTokenProvider {
        override fun fetchConnectionToken(callback: ConnectionTokenCallback) {
            scope.launch {
                try {
                    val response = ApiClient.service.getConnectionToken()
                    callback.onSuccess(response.secret)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to fetch connection token", e)
                    callback.onFailure(
                        ConnectionTokenException("Failed to fetch connection token: ${e.message}")
                    )
                }
            }
        }
    }
    
    // Terminal event listener
    private inner class EchoTerminalListener : TerminalListener {
        override fun onUnexpectedReaderDisconnect(reader: Reader) {
            Log.w(TAG, "Reader unexpectedly disconnected: ${reader.serialNumber}")
            _readerState.value = ReaderState.Disconnected
        }
    }
    
    // Reader event listener
    private inner class EchoReaderListener : ReaderListener {
        override fun onReportReaderEvent(event: ReaderEvent) {
            Log.d(TAG, "Reader event: ${event.name}")
        }
        
        override fun onRequestReaderInput(options: ReaderInputOptions) {
            Log.d(TAG, "Reader input requested: ${options.toString()}")
        }
        
        override fun onRequestReaderDisplayMessage(message: ReaderDisplayMessage) {
            Log.d(TAG, "Reader display message: ${message.name}")
        }
    }
}

// State classes
sealed class TerminalState {
    object NotInitialized : TerminalState()
    object Initialized : TerminalState()
    data class Error(val message: String) : TerminalState()
}

sealed class ReaderState {
    object Disconnected : ReaderState()
    object Discovering : ReaderState()
    object NoReadersFound : ReaderState()
    data class Connecting(val serialNumber: String) : ReaderState()
    data class Connected(
        val serialNumber: String,
        val batteryLevel: Float?,
        val deviceType: String
    ) : ReaderState()
    data class Error(val message: String) : ReaderState()
}

sealed class PaymentState {
    object Idle : PaymentState()
    object CreatingIntent : PaymentState()
    object RetrievingIntent : PaymentState()
    object CollectingPayment : PaymentState()
    object ConfirmingPayment : PaymentState()
    data class Succeeded(val paymentIntentId: String, val receiptUrl: String?) : PaymentState()
    data class Failed(val message: String) : PaymentState()
    object Canceled : PaymentState()
}

data class PaymentItem(
    val name: String,
    val category: String,
    val quantity: Int,
    val price: Double,
    val modifier: String? = null
)
