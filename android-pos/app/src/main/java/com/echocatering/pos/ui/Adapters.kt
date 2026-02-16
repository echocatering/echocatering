package com.echocatering.pos.ui

import android.app.AlertDialog
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageButton
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.echocatering.pos.R
import com.echocatering.pos.api.MenuItem
import com.stripe.stripeterminal.external.models.Reader

// Category Adapter
class CategoryAdapter(
    private val categories: List<Category>,
    private val onCategorySelected: (Category) -> Unit
) : RecyclerView.Adapter<CategoryAdapter.ViewHolder>() {
    
    private var selectedPosition = 0
    
    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val button: Button = view.findViewById(R.id.categoryButton)
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_category, parent, false)
        return ViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val category = categories[position]
        holder.button.text = category.name
        holder.button.isSelected = position == selectedPosition
        
        holder.button.setOnClickListener {
            val oldPosition = selectedPosition
            selectedPosition = holder.adapterPosition
            notifyItemChanged(oldPosition)
            notifyItemChanged(selectedPosition)
            onCategorySelected(category)
        }
    }
    
    override fun getItemCount() = categories.size
}

// Menu Item Adapter
class MenuItemAdapter(
    private val onItemClick: (MenuItem, String?) -> Unit
) : ListAdapter<MenuItem, MenuItemAdapter.ViewHolder>(MenuItemDiffCallback()) {
    
    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val nameText: TextView = view.findViewById(R.id.itemName)
        val priceText: TextView = view.findViewById(R.id.itemPrice)
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_menu, parent, false)
        return ViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = getItem(position)
        holder.nameText.text = item.name
        holder.priceText.text = String.format("$%.2f", item.price)
        
        holder.itemView.setOnClickListener {
            val modifiers = item.modifiers
            if (modifiers.isNullOrEmpty()) {
                onItemClick(item, null)
            } else {
                showModifierDialog(holder.itemView, item, modifiers)
            }
        }
    }
    
    private fun showModifierDialog(view: View, item: MenuItem, modifiers: List<com.echocatering.pos.api.ItemModifier>) {
        val context = view.context
        val options = mutableListOf("Base ($${String.format("%.2f", item.price)})")
        options.addAll(modifiers.map { mod ->
            val adjustedPrice = item.price + mod.priceAdjustment
            "${mod.name} ($${String.format("%.2f", adjustedPrice)})"
        })
        
        AlertDialog.Builder(context)
            .setTitle(item.name)
            .setItems(options.toTypedArray()) { _, which ->
                if (which == 0) {
                    onItemClick(item, null)
                } else {
                    onItemClick(item, modifiers[which - 1].name)
                }
            }
            .show()
    }
    
    class MenuItemDiffCallback : DiffUtil.ItemCallback<MenuItem>() {
        override fun areItemsTheSame(oldItem: MenuItem, newItem: MenuItem) = oldItem._id == newItem._id
        override fun areContentsTheSame(oldItem: MenuItem, newItem: MenuItem) = oldItem == newItem
    }
}

// Cart Adapter
class CartAdapter(
    private val onRemove: (Int) -> Unit
) : ListAdapter<CartItem, CartAdapter.ViewHolder>(CartItemDiffCallback()) {
    
    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val nameText: TextView = view.findViewById(R.id.cartItemName)
        val modifierText: TextView = view.findViewById(R.id.cartItemModifier)
        val priceText: TextView = view.findViewById(R.id.cartItemPrice)
        val removeButton: ImageButton = view.findViewById(R.id.removeButton)
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_cart, parent, false)
        return ViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = getItem(position)
        holder.nameText.text = item.name
        holder.priceText.text = String.format("$%.2f", item.price)
        
        if (item.modifier != null) {
            holder.modifierText.text = item.modifier
            holder.modifierText.visibility = View.VISIBLE
        } else {
            holder.modifierText.visibility = View.GONE
        }
        
        holder.removeButton.setOnClickListener {
            onRemove(holder.adapterPosition)
        }
    }
    
    class CartItemDiffCallback : DiffUtil.ItemCallback<CartItem>() {
        override fun areItemsTheSame(oldItem: CartItem, newItem: CartItem) = oldItem.id == newItem.id
        override fun areContentsTheSame(oldItem: CartItem, newItem: CartItem) = oldItem == newItem
    }
}

// Reader List Adapter
class ReaderListAdapter(
    private val onReaderClick: (Reader) -> Unit
) : ListAdapter<Reader, ReaderListAdapter.ViewHolder>(ReaderDiffCallback()) {
    
    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val serialText: TextView = view.findViewById(R.id.readerSerial)
        val typeText: TextView = view.findViewById(R.id.readerType)
        val batteryText: TextView = view.findViewById(R.id.readerBattery)
    }
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_reader, parent, false)
        return ViewHolder(view)
    }
    
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val reader = getItem(position)
        holder.serialText.text = reader.serialNumber ?: "Unknown"
        holder.typeText.text = reader.deviceType.name
        
        reader.batteryLevel?.let { battery ->
            holder.batteryText.text = "${(battery * 100).toInt()}%"
            holder.batteryText.visibility = View.VISIBLE
        } ?: run {
            holder.batteryText.visibility = View.GONE
        }
        
        holder.itemView.setOnClickListener {
            onReaderClick(reader)
        }
    }
    
    class ReaderDiffCallback : DiffUtil.ItemCallback<Reader>() {
        override fun areItemsTheSame(oldItem: Reader, newItem: Reader) = 
            oldItem.serialNumber == newItem.serialNumber
        override fun areContentsTheSame(oldItem: Reader, newItem: Reader) = 
            oldItem.serialNumber == newItem.serialNumber && oldItem.batteryLevel == newItem.batteryLevel
    }
}
