/**
 * createFakeOrders.js
 * 
 * Standalone script to create realistic fake orders in Square Sandbox for testing.
 * Run with: node createFakeOrders.js
 * 
 * Requirements:
 * - SQUARE_ACCESS_TOKEN in .env file
 * - SQUARE_ENV=sandbox in .env file (optional, defaults to sandbox)
 */

import 'dotenv/config';
import { SquareClient, SquareEnvironment } from 'square';
import { randomUUID } from 'crypto';

// ============================================================================
// CONFIGURATION - Adjust these values as needed
// ============================================================================

const CONFIG = {
  // Event duration in hours (3-hour event = 12 fifteen-minute intervals)
  eventDurationHours: 3,
  
  // Orders per 15-minute interval (min/max)
  minOrdersPerInterval: 3,
  maxOrdersPerInterval: 6,
  
  // Min/max items per order
  minItemsPerOrder: 1,
  maxItemsPerOrder: 3,
  
  // Min/max quantity per item
  minQuantity: 1,
  maxQuantity: 3,
};

// ============================================================================
// SAMPLE MENU ITEMS - Realistic items with prices (in cents)
// ============================================================================

const MENU_ITEMS = [
  // Cocktails
  { name: 'Mojito', category: 'Cocktails', priceInCents: 1200 },
  { name: 'Old Fashioned', category: 'Cocktails', priceInCents: 1400 },
  { name: 'Margarita', category: 'Cocktails', priceInCents: 1100 },
  { name: 'Manhattan', category: 'Cocktails', priceInCents: 1300 },
  { name: 'Whiskey Sour', category: 'Cocktails', priceInCents: 1100 },
  { name: 'Negroni', category: 'Cocktails', priceInCents: 1200 },
  { name: 'Cosmopolitan', category: 'Cocktails', priceInCents: 1200 },
  { name: 'Mai Tai', category: 'Cocktails', priceInCents: 1300 },
  
  // Beer
  { name: 'IPA Draft', category: 'Beer', priceInCents: 700 },
  { name: 'Lager Draft', category: 'Beer', priceInCents: 600 },
  { name: 'Stout Draft', category: 'Beer', priceInCents: 750 },
  { name: 'Pilsner Bottle', category: 'Beer', priceInCents: 550 },
  { name: 'Craft Ale', category: 'Beer', priceInCents: 800 },
  
  // Shots
  { name: 'Tequila Shot', category: 'Shots', priceInCents: 800 },
  { name: 'Whiskey Shot', category: 'Shots', priceInCents: 900 },
  { name: 'Vodka Shot', category: 'Shots', priceInCents: 700 },
  { name: 'Jagermeister', category: 'Shots', priceInCents: 850 },
  
  // Wine
  { name: 'House Red Wine', category: 'Wine', priceInCents: 900 },
  { name: 'House White Wine', category: 'Wine', priceInCents: 900 },
  { name: 'Prosecco Glass', category: 'Wine', priceInCents: 1000 },
  
  // Non-Alcoholic
  { name: 'Virgin Mojito', category: 'Mocktails', priceInCents: 800 },
  { name: 'Shirley Temple', category: 'Mocktails', priceInCents: 700 },
  { name: 'Soda', category: 'Non-Alcoholic', priceInCents: 300 },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a random integer between min and max (inclusive)
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get a random item from an array
 */
function randomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate a random timestamp within a specific 15-minute interval
 * @param {number} intervalIndex - The interval index (0 = most recent, 11 = 3 hours ago)
 */
function randomTimestampInInterval(intervalIndex) {
  const now = Date.now();
  const intervalMs = 15 * 60 * 1000; // 15 minutes
  
  // Calculate the start of this interval (going back in time)
  const intervalStart = now - ((intervalIndex + 1) * intervalMs);
  const intervalEnd = now - (intervalIndex * intervalMs);
  
  // Random time within this interval
  const randomOffset = Math.random() * intervalMs;
  return new Date(intervalStart + randomOffset).toISOString();
}

/**
 * Generate random line items for an order
 */
function generateLineItems() {
  const numItems = randomInt(CONFIG.minItemsPerOrder, CONFIG.maxItemsPerOrder);
  const lineItems = [];
  
  // Use a Set to avoid duplicate items in the same order
  const usedItems = new Set();
  
  for (let i = 0; i < numItems; i++) {
    let item;
    // Keep picking until we get a unique item
    do {
      item = randomItem(MENU_ITEMS);
    } while (usedItems.has(item.name) && usedItems.size < MENU_ITEMS.length);
    
    usedItems.add(item.name);
    
    const quantity = randomInt(CONFIG.minQuantity, CONFIG.maxQuantity);
    
    lineItems.push({
      name: item.name,
      quantity: String(quantity),
      basePriceMoney: {
        amount: BigInt(item.priceInCents),
        currency: 'USD',
      },
      // Optional: Add note with category
      note: `Category: ${item.category}`,
    });
  }
  
  return lineItems;
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function main() {
  // Calculate total intervals (4 intervals per hour)
  const totalIntervals = CONFIG.eventDurationHours * 4;
  
  console.log('🍹 Square Sandbox Fake Order Generator');
  console.log('======================================');
  console.log(`Event duration: ${CONFIG.eventDurationHours} hours (${totalIntervals} intervals)`);
  console.log(`Orders per interval: ${CONFIG.minOrdersPerInterval}-${CONFIG.maxOrdersPerInterval}`);
  console.log('');

  // Step 1: Initialize Square client
  const squareClient = new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.SQUARE_ENV === 'production' 
      ? SquareEnvironment.Production 
      : SquareEnvironment.Sandbox,
  });

  // Step 2: Get the first location ID
  console.log('📍 Fetching location...');
  const locationsResult = await squareClient.locations.list();
  const locations = locationsResult.locations || [];
  
  if (locations.length === 0) {
    console.error('❌ No locations found in your Square account');
    process.exit(1);
  }
  
  const locationId = locations[0].id;
  console.log(`   Using location: ${locations[0].name} (${locationId})`);
  console.log('');

  // Step 3: Create orders for each 15-minute interval
  const createdOrderIds = [];
  const errors = [];
  let orderCount = 0;

  for (let intervalIdx = 0; intervalIdx < totalIntervals; intervalIdx++) {
    // Calculate time range for this interval for display
    const intervalStart = new Date(Date.now() - ((intervalIdx + 1) * 15 * 60 * 1000));
    const intervalEnd = new Date(Date.now() - (intervalIdx * 15 * 60 * 1000));
    const timeLabel = `${intervalStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${intervalEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    
    // Random number of orders for this interval
    const ordersInInterval = randomInt(CONFIG.minOrdersPerInterval, CONFIG.maxOrdersPerInterval);
    
    console.log(`\n📅 Interval ${intervalIdx + 1}/${totalIntervals}: ${timeLabel} (${ordersInInterval} orders)`);
    
    for (let j = 0; j < ordersInInterval; j++) {
      orderCount++;
      try {
        // Generate random line items
        const lineItems = generateLineItems();
        
        // Generate a timestamp within this specific interval
        const createdAt = randomTimestampInInterval(intervalIdx);
        
        // Create the order with simulated timestamp in metadata
        // Square doesn't allow custom createdAt, so we store it in the referenceId
        const orderResult = await squareClient.orders.create({
          order: {
            locationId: locationId,
            lineItems: lineItems,
            // Store simulated timestamp in referenceId: FAKE|<timestamp>|<interval>|<order>
            referenceId: `FAKE|${createdAt}|${intervalIdx}|${j}`,
            state: 'OPEN',
          },
          idempotencyKey: randomUUID(),
        });

        const orderId = orderResult.order?.id;
        createdOrderIds.push(orderId);
        
        // Log progress
        const itemNames = lineItems.map(li => `${li.quantity}x ${li.name}`).join(', ');
        console.log(`   ✅ Order ${j + 1}: ${itemNames}`);
        
      } catch (error) {
        console.error(`   ❌ Order ${j + 1} failed: ${error.message}`);
        errors.push({ interval: intervalIdx, order: j, error: error.message });
      }
    }
  }

  // Step 4: Summary
  console.log('');
  console.log('======================================');
  console.log('📊 Summary');
  console.log('======================================');
  console.log(`✅ Successfully created: ${createdOrderIds.length} orders across ${totalIntervals} intervals`);
  console.log(`❌ Failed: ${errors.length} orders`);
  
  if (errors.length > 0) {
    console.log('');
    console.log('Errors:');
    errors.forEach(e => console.log(`   - Interval ${e.interval + 1}, Order ${e.order + 1}: ${e.error}`));
  }
  
  console.log('');
  console.log('🎉 Done! You can now test the /api/square/orders-aggregated endpoint.');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
