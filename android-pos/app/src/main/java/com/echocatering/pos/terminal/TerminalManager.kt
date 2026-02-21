package com.echocatering.pos.terminal

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.echocatering.pos.api.ApiClient
import com.stripe.stripeterminal.Terminal
import com.stripe.stripeterminal.external.callable.Callback
import com.stripe.stripeterminal.external.callable.Cancelable
import com.stripe.stripeterminal.external.callable.ConnectionTokenCallback
import com.stripe.stripeterminal.external.callable.ConnectionTokenProvider
import com.stripe.stripeterminal.external.callable.DiscoveryListener
import com.stripe.stripeterminal.external.callable.MobileReaderListener
import com.stripe.stripeterminal.external.callable.PaymentIntentCallback
import com.stripe.stripeterminal.external.callable.ReaderCallback
import com.stripe.stripeterminal.external.callable.TerminalListener
import com.stripe.stripeterminal.external.models.BatteryStatus
import com.stripe.stripeterminal.external.models.ConnectionConfiguration
import com.stripe.stripeterminal.external.models.ConnectionStatus
import com.stripe.stripeterminal.external.models.ConnectionTokenException
import com.stripe.stripeterminal.external.models.DisconnectReason
import com.stripe.stripeterminal.external.models.DiscoveryConfiguration
import com.stripe.stripeterminal.external.models.PaymentIntent
import com.stripe.stripeterminal.external.models.PaymentStatus
import com.stripe.stripeterminal.external.models.Reader
import com.stripe.stripeterminal.external.models.ReaderDisplayMessage
import com.stripe.stripeterminal.external.models.ReaderEvent
import com.stripe.stripeterminal.external.models.ReaderInputOptions
import com.stripe.stripeterminal.external.models.ReaderSoftwareUpdate
import com.stripe.stripeterminal.external.models.TerminalException
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
            Terminal.init(
                context.applicationContext,
                LogLevel.VERBOSE,
                EchoTokenProvider(),
                EchoTerminalListener(),
                null // offlineListener - not using offline mode
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
        Log.d(TAG, "discoverReaders() called")
        Log.d(TAG, "Terminal.isInitialized(): ${Terminal.isInitialized()}")
        Log.d(TAG, "hasRequiredPermissions(): ${hasRequiredPermissions()}")
        
        if (!Terminal.isInitialized()) {
            Log.e(TAG, "Terminal not initialized - attempting to initialize")
            initialize()
            if (!Terminal.isInitialized()) {
                _readerState.value = ReaderState.Error("Terminal not initialized")
                return
            }
        }
        
        // Cancel any existing discovery
        discoveryCancelable?.cancel(object : Callback {
            override fun onSuccess() {
                Log.d(TAG, "Previous discovery canceled successfully")
            }
            override fun onFailure(e: TerminalException) {
                Log.w(TAG, "Failed to cancel previous discovery: ${e.errorMessage}")
            }
        })
        
        _readerState.value = ReaderState.Discovering
        _discoveredReaders.value = emptyList()
        
        Log.d(TAG, "Starting Bluetooth discovery...")
        
        val config = DiscoveryConfiguration.BluetoothDiscoveryConfiguration(
            timeout = 30, // 30 second timeout instead of infinite
            isSimulated = false
        )
        
        discoveryCancelable = Terminal.getInstance().discoverReaders(
            config,
            object : DiscoveryListener {
                override fun onUpdateDiscoveredReaders(readers: List<Reader>) {
                    Log.d(TAG, "onUpdateDiscoveredReaders: ${readers.size} readers found")
                    readers.forEachIndexed { index, reader ->
                        Log.d(TAG, "  Reader $index: ${reader.serialNumber}, type: ${reader.deviceType?.name}, location: ${reader.location?.id}")
                    }
                    _discoveredReaders.value = readers
                }
            },
            object : Callback {
                override fun onSuccess() {
                    Log.d(TAG, "Discovery completed successfully")
                    if (_discoveredReaders.value.isEmpty()) {
                        Log.w(TAG, "No readers found after discovery completed")
                        _readerState.value = ReaderState.NoReadersFound
                    } else {
                        Log.d(TAG, "Found ${_discoveredReaders.value.size} readers")
                    }
                }
                
                override fun onFailure(e: TerminalException) {
                    Log.e(TAG, "Discovery failed: ${e.errorMessage}", e)
                    Log.e(TAG, "Discovery error code: ${e.errorCode}")
                    _readerState.value = ReaderState.Error(e.errorMessage)
                }
            }
        )
        
        Log.d(TAG, "discoverReaders() started discovery process")
    }
    
    /**
     * Connect to a specific reader
     */
    fun connectToReader(reader: Reader) {
        _readerState.value = ReaderState.Connecting(reader.serialNumber ?: "Unknown")
        
        // Fetch location ID from backend for unregistered readers
        scope.launch {
            try {
                val locationResponse = ApiClient.service.getLocation()
                val locationId = locationResponse.location_id ?: ""
                
                if (locationId.isEmpty()) {
                    Log.e(TAG, "No location configured on backend")
                    _readerState.value = ReaderState.Error("No location configured. Please set up a Stripe Terminal location.")
                    return@launch
                }
                
                Log.d(TAG, "Using location ID: $locationId")
                Log.d(TAG, "Reader serial: ${reader.serialNumber}, deviceType: ${reader.deviceType?.name}")
                Log.d(TAG, "Reader location before connect: ${reader.location?.id}")
                
                val config = ConnectionConfiguration.BluetoothConnectionConfiguration(
                    locationId = locationId,
                    autoReconnectOnUnexpectedDisconnect = true,
                    bluetoothReaderListener = EchoMobileReaderListener()
                )
                
                Log.d(TAG, "Calling Terminal.connectReader()...")
                
                Terminal.getInstance().connectReader(
                    reader,
                    config,
                    object : ReaderCallback {
                        override fun onSuccess(connectedReader: Reader) {
                            Log.d(TAG, "SUCCESS! Connected to reader: ${connectedReader.serialNumber}")
                            _readerState.value = ReaderState.Connected(
                                serialNumber = connectedReader.serialNumber ?: "Unknown",
                                batteryLevel = connectedReader.batteryLevel,
                                deviceType = connectedReader.deviceType.name
                            )
                        }
                        
                        override fun onFailure(e: TerminalException) {
                            Log.e(TAG, "FAILED to connect to reader: ${e.errorMessage}")
                            Log.e(TAG, "Error code: ${e.errorCode}")
                            Log.e(TAG, "Full exception: ", e)
                            _readerState.value = ReaderState.Error(e.errorMessage)
                        }
                    }
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to fetch location for connection", e)
                _readerState.value = ReaderState.Error("Failed to fetch location: ${e.message}")
            }
        }
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
                Log.d(TAG, "processPayment called: amount=$amountCents, tip=$tipCents")
                
                // Check if reader is connected
                val connectedReader = Terminal.getInstance().connectedReader
                if (connectedReader == null) {
                    Log.e(TAG, "No reader connected - cannot process payment")
                    _paymentState.value = PaymentState.Failed("No reader connected. Please connect a reader first.")
                    return@launch
                }
                Log.d(TAG, "Reader connected: ${connectedReader.serialNumber}")
                
                _paymentState.value = PaymentState.CreatingIntent
                Log.d(TAG, "Creating payment intent...")
                
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
                Log.d(TAG, "Payment intent created: ${response.payment_intent_id}")
                
                // Retrieve the payment intent in Terminal
                _paymentState.value = PaymentState.RetrievingIntent
                Log.d(TAG, "Retrieving payment intent from Terminal...")
                
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
        Log.d(TAG, "collectPayment: Starting to collect payment method - reader should now be waiting for card")
        _paymentState.value = PaymentState.CollectingPayment
        
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
            }
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
        override fun onConnectionStatusChange(status: ConnectionStatus) {
            Log.d(TAG, "Connection status changed: ${status.name}")
        }
        
        override fun onPaymentStatusChange(status: PaymentStatus) {
            Log.d(TAG, "Payment status changed: ${status.name}")
        }
    }
    
    // Mobile reader event listener for Bluetooth readers
    private inner class EchoMobileReaderListener : MobileReaderListener {
        override fun onReportReaderEvent(event: ReaderEvent) {
            Log.d(TAG, "Reader event: ${event.name}")
        }
        
        override fun onRequestReaderInput(options: ReaderInputOptions) {
            Log.d(TAG, "Reader input requested: $options")
        }
        
        override fun onRequestReaderDisplayMessage(message: ReaderDisplayMessage) {
            Log.d(TAG, "Reader display message: ${message.name}")
        }
        
        override fun onStartInstallingUpdate(update: ReaderSoftwareUpdate, cancelable: Cancelable?) {
            Log.d(TAG, "Starting reader update: ${update.version}")
        }
        
        override fun onReportReaderSoftwareUpdateProgress(progress: Float) {
            Log.d(TAG, "Reader update progress: ${(progress * 100).toInt()}%")
        }
        
        override fun onFinishInstallingUpdate(update: ReaderSoftwareUpdate?, e: TerminalException?) {
            if (e != null) {
                Log.e(TAG, "Reader update failed", e)
            } else {
                Log.d(TAG, "Reader update completed: ${update?.version}")
            }
        }
        
        override fun onBatteryLevelUpdate(batteryLevel: Float, batteryStatus: BatteryStatus, isCharging: Boolean) {
            Log.d(TAG, "Battery: ${(batteryLevel * 100).toInt()}%, status: ${batteryStatus.name}, charging: $isCharging")
        }
        
        override fun onReportLowBatteryWarning() {
            Log.w(TAG, "Low battery warning")
        }
        
        override fun onDisconnect(reason: DisconnectReason) {
            Log.w(TAG, "Reader disconnected: ${reason.name}")
            _readerState.value = ReaderState.Disconnected
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
