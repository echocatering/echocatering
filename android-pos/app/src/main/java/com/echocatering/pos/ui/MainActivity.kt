package com.echocatering.pos.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import com.echocatering.pos.EchoPosApplication
import com.echocatering.pos.R
import com.echocatering.pos.api.ApiClient
import com.echocatering.pos.api.MenuItem
import com.echocatering.pos.databinding.ActivityMainBinding
import com.echocatering.pos.terminal.ReaderState
import com.echocatering.pos.terminal.TerminalState
import com.google.gson.Gson
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityMainBinding
    private val terminalManager by lazy { EchoPosApplication.instance.terminalManager }
    
    private lateinit var menuAdapter: MenuItemAdapter
    private lateinit var cartAdapter: CartAdapter
    private lateinit var categoryAdapter: CategoryAdapter
    
    private val cartItems = mutableListOf<CartItem>()
    private var allMenuItems = listOf<MenuItem>()
    private var currentCategory = "cocktails"
    
    private val categories = listOf(
        Category("cocktails", "Cocktails"),
        Category("spirits", "Spirits"),
        Category("beer", "Beer"),
        Category("wine", "Wine"),
        Category("nonalcoholic", "Non-Alc")
    )
    
    private val requiredPermissions = arrayOf(
        Manifest.permission.BLUETOOTH_CONNECT,
        Manifest.permission.BLUETOOTH_SCAN,
        Manifest.permission.ACCESS_FINE_LOCATION
    )
    
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.all { it.value }
        if (allGranted) {
            initializeTerminal()
        } else {
            Toast.makeText(this, "Permissions required for card reader", Toast.LENGTH_LONG).show()
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        setupUI()
        setupObservers()
        checkPermissionsAndInitialize()
        loadMenuItems()
    }
    
    private fun setupUI() {
        // Category tabs
        categoryAdapter = CategoryAdapter(categories) { category ->
            currentCategory = category.id
            filterMenuItems()
        }
        binding.categoryRecycler.apply {
            layoutManager = LinearLayoutManager(this@MainActivity, LinearLayoutManager.HORIZONTAL, false)
            adapter = categoryAdapter
        }
        
        // Menu items grid
        menuAdapter = MenuItemAdapter { menuItem, modifier ->
            addToCart(menuItem, modifier)
        }
        binding.menuRecycler.apply {
            layoutManager = GridLayoutManager(this@MainActivity, 3)
            adapter = menuAdapter
        }
        
        // Cart list
        cartAdapter = CartAdapter(
            onRemove = { position -> removeFromCart(position) }
        )
        binding.cartRecycler.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = cartAdapter
        }
        
        // Reader status click
        binding.readerStatus.setOnClickListener {
            startActivity(Intent(this, ReaderSetupActivity::class.java))
        }
        
        // Checkout button
        binding.checkoutButton.setOnClickListener {
            if (cartItems.isEmpty()) {
                Toast.makeText(this, "Cart is empty", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            
            val readerState = terminalManager.readerState.value
            if (readerState !is ReaderState.Connected) {
                Toast.makeText(this, "Connect a card reader first", Toast.LENGTH_LONG).show()
                startActivity(Intent(this, ReaderSetupActivity::class.java))
                return@setOnClickListener
            }
            
            // Start checkout
            val intent = Intent(this, CheckoutActivity::class.java).apply {
                putExtra(CheckoutActivity.EXTRA_SUBTOTAL_CENTS, calculateSubtotalCents())
                putExtra(CheckoutActivity.EXTRA_ITEMS_JSON, cartItemsToJson())
            }
            startActivityForResult(intent, REQUEST_CHECKOUT)
        }
        
        // Clear cart button
        binding.clearCartButton.setOnClickListener {
            cartItems.clear()
            updateCart()
        }
    }
    
    private fun setupObservers() {
        lifecycleScope.launch {
            terminalManager.readerState.collectLatest { state ->
                updateReaderStatusUI(state)
            }
        }
        
        lifecycleScope.launch {
            terminalManager.terminalState.collectLatest { state ->
                when (state) {
                    is TerminalState.Error -> {
                        binding.readerStatus.text = "Terminal Error"
                    }
                    else -> {}
                }
            }
        }
    }
    
    private fun updateReaderStatusUI(state: ReaderState) {
        when (state) {
            is ReaderState.Connected -> {
                binding.readerStatus.text = "Reader: ${state.serialNumber.takeLast(8)}"
                binding.readerStatus.setCompoundDrawablesWithIntrinsicBounds(
                    R.drawable.ic_bluetooth_connected, 0, 0, 0
                )
            }
            is ReaderState.Connecting -> {
                binding.readerStatus.text = "Connecting..."
            }
            is ReaderState.Discovering -> {
                binding.readerStatus.text = "Scanning..."
            }
            else -> {
                binding.readerStatus.text = "No Reader"
                binding.readerStatus.setCompoundDrawablesWithIntrinsicBounds(
                    R.drawable.ic_bluetooth_disconnected, 0, 0, 0
                )
            }
        }
    }
    
    private fun checkPermissionsAndInitialize() {
        val missingPermissions = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        
        if (missingPermissions.isEmpty()) {
            initializeTerminal()
        } else {
            permissionLauncher.launch(missingPermissions.toTypedArray())
        }
    }
    
    private fun initializeTerminal() {
        terminalManager.initialize()
    }
    
    private fun loadMenuItems() {
        lifecycleScope.launch {
            try {
                binding.loadingIndicator.visibility = View.VISIBLE
                allMenuItems = ApiClient.service.getMenuItems()
                    .filter { it.isActive != false }
                filterMenuItems()
            } catch (e: Exception) {
                Toast.makeText(this@MainActivity, "Failed to load menu: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                binding.loadingIndicator.visibility = View.GONE
            }
        }
    }
    
    private fun filterMenuItems() {
        val filtered = allMenuItems.filter { 
            it.category.lowercase() == currentCategory.lowercase() 
        }
        menuAdapter.submitList(filtered)
    }
    
    private fun addToCart(menuItem: MenuItem, modifier: String?) {
        val price = if (modifier != null) {
            val modifierObj = menuItem.modifiers?.find { it.name == modifier }
            menuItem.price + (modifierObj?.priceAdjustment ?: 0.0)
        } else {
            menuItem.price
        }
        
        val cartItem = CartItem(
            id = "${menuItem._id}_${System.currentTimeMillis()}",
            name = menuItem.name,
            category = menuItem.category,
            price = price,
            modifier = modifier
        )
        
        cartItems.add(cartItem)
        updateCart()
        
        // Scroll to bottom of cart
        binding.cartRecycler.scrollToPosition(cartItems.size - 1)
    }
    
    private fun removeFromCart(position: Int) {
        if (position in cartItems.indices) {
            cartItems.removeAt(position)
            updateCart()
        }
    }
    
    private fun updateCart() {
        cartAdapter.submitList(cartItems.toList())
        
        val subtotal = cartItems.sumOf { it.price }
        binding.subtotalText.text = String.format("$%.2f", subtotal)
        
        binding.checkoutButton.isEnabled = cartItems.isNotEmpty()
        binding.clearCartButton.visibility = if (cartItems.isNotEmpty()) View.VISIBLE else View.GONE
        
        // Update item count
        binding.cartItemCount.text = "${cartItems.size} items"
    }
    
    private fun calculateSubtotalCents(): Int {
        return (cartItems.sumOf { it.price } * 100).toInt()
    }
    
    private fun cartItemsToJson(): String {
        return Gson().toJson(cartItems)
    }
    
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_CHECKOUT && resultCode == RESULT_OK) {
            // Payment successful - clear cart
            cartItems.clear()
            updateCart()
            Toast.makeText(this, "Payment completed!", Toast.LENGTH_SHORT).show()
        }
    }
    
    companion object {
        private const val REQUEST_CHECKOUT = 1001
    }
}

// Data classes
data class Category(val id: String, val name: String)

data class CartItem(
    val id: String,
    val name: String,
    val category: String,
    val price: Double,
    val modifier: String?
)
