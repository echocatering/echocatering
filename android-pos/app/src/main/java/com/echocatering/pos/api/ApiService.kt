package com.echocatering.pos.api

import com.echocatering.pos.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*
import java.util.concurrent.TimeUnit

// Data classes for API requests/responses

data class ConnectionTokenResponse(
    val secret: String,
    val location: String?
)

data class PaymentIntentRequest(
    val amount: Int,
    val currency: String = "usd",
    val tabId: String? = null,
    val tabName: String? = null,
    val eventId: String? = null,
    val eventName: String? = null,
    val items: List<PaymentItem> = emptyList(),
    val tipAmount: Int = 0
)

data class PaymentItem(
    val name: String,
    val category: String,
    val quantity: Int,
    val price: Double,
    val modifier: String? = null
)

data class PaymentIntentResponse(
    val client_secret: String,
    val payment_intent_id: String
)

data class ConfirmPaymentRequest(
    val payment_intent_id: String
)

data class ConfirmPaymentResponse(
    val success: Boolean,
    val status: String,
    val charge_id: String?,
    val receipt_url: String?,
    val sale_id: String?
)

data class CancelPaymentRequest(
    val payment_intent_id: String
)

data class CancelPaymentResponse(
    val success: Boolean,
    val status: String
)

data class RegisterReaderRequest(
    val label: String,
    val registration_code: String
)

data class RegisterReaderResponse(
    val reader_id: String,
    val label: String,
    val status: String,
    val location: String?
)

data class ReadersResponse(
    val readers: List<ReaderInfo>
)

data class ReaderInfo(
    val id: String,
    val label: String?,
    val status: String,
    val device_type: String?
)

data class LocationResponse(
    val configured: Boolean,
    val location_id: String?,
    val display_name: String?,
    val message: String?
)

data class MenuItem(
    val _id: String,
    val name: String,
    val price: Double,
    val category: String,
    val description: String?,
    val imageUrl: String?,
    val isActive: Boolean?,
    val modifiers: List<ItemModifier>?
)

data class ItemModifier(
    val name: String,
    val priceAdjustment: Double
)

// API Interface
interface EchoApiService {
    
    @POST("stripe/connection-token")
    suspend fun getConnectionToken(): ConnectionTokenResponse
    
    @POST("stripe/payment-intent")
    suspend fun createPaymentIntent(@Body request: PaymentIntentRequest): PaymentIntentResponse
    
    @POST("stripe/confirm-payment")
    suspend fun confirmPayment(@Body request: ConfirmPaymentRequest): ConfirmPaymentResponse
    
    @POST("stripe/cancel-payment")
    suspend fun cancelPayment(@Body request: CancelPaymentRequest): CancelPaymentResponse
    
    @POST("stripe/register-reader")
    suspend fun registerReader(@Body request: RegisterReaderRequest): RegisterReaderResponse
    
    @GET("stripe/readers")
    suspend fun getReaders(): ReadersResponse
    
    @GET("stripe/location")
    suspend fun getLocation(): LocationResponse
    
    @GET("menu-items")
    suspend fun getMenuItems(@Query("includeArchived") includeArchived: Boolean = false): List<MenuItem>
}

// Singleton API client
object ApiClient {
    
    private val okHttpClient: OkHttpClient by lazy {
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }
        
        OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }
    
    private val retrofit: Retrofit by lazy {
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL + "/")
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }
    
    val service: EchoApiService by lazy {
        retrofit.create(EchoApiService::class.java)
    }
}
