/**
 * Currency formatting utilities for Bodega San Martín
 * Provides consistent formatting for PEN (Peruvian Sol) across the application
 */

/**
 * Currency configuration
 */
export const CURRENCY_CONFIG = {
  code: "PEN",
  symbol: "S/",
  locale: "es-PE",
  decimals: 2,
} as const;

/**
 * Format a number as Peruvian Sol currency
 * 
 * @param amount - The numeric amount to format
 * @param options - Optional formatting configuration
 * @returns Formatted currency string (e.g., "S/ 25.50")
 * 
 * @example
 * ```ts
 * formatCurrency(25.5)        // "S/ 25.50"
 * formatCurrency(1250)        // "S/ 1,250.00"
 * formatCurrency(0)           // "S/ 0.00"
 * formatCurrency(25.5, { withSymbol: false }) // "25.50"
 * ```
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  options: {
    withSymbol?: boolean;
    decimals?: number;
    locale?: string;
  } = {}
): string {
  const {
    withSymbol = true,
    decimals = CURRENCY_CONFIG.decimals,
    locale = CURRENCY_CONFIG.locale,
  } = options;

  // Handle null/undefined/invalid inputs
  const numericAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  
  if (numericAmount == null || isNaN(numericAmount)) {
    return withSymbol ? `${CURRENCY_CONFIG.symbol} 0.00` : "0.00";
  }

  // Format with locale-aware thousands separators and decimals
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(numericAmount);

  return withSymbol ? `${CURRENCY_CONFIG.symbol} ${formatted}` : formatted;
}

/**
 * Format currency for compact display (shortened large numbers)
 * 
 * @param amount - The numeric amount to format
 * @returns Compact formatted currency (e.g., "S/ 1.2K", "S/ 3.5M")
 * 
 * @example
 * ```ts
 * formatCurrencyCompact(1200)     // "S/ 1.2K"
 * formatCurrencyCompact(4500000)  // "S/ 4.5M"
 * formatCurrencyCompact(850)      // "S/ 850"
 * ```
 */
export function formatCurrencyCompact(
  amount: number | string | null | undefined
): string {
  const numericAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  
  if (numericAmount == null || isNaN(numericAmount)) {
    return `${CURRENCY_CONFIG.symbol} 0`;
  }

  if (numericAmount >= 1_000_000) {
    const val = numericAmount / 1_000_000;
    const formatted = val % 1 === 0 ? `${val}M` : `${parseFloat(val.toFixed(1))}M`;
    return `${CURRENCY_CONFIG.symbol} ${formatted}`;
  }
  if (numericAmount >= 1_000) {
    const val = numericAmount / 1_000;
    const formatted = val % 1 === 0 ? `${val}K` : `${parseFloat(val.toFixed(1))}K`;
    return `${CURRENCY_CONFIG.symbol} ${formatted}`;
  }

  return `${CURRENCY_CONFIG.symbol} ${Math.round(numericAmount)}`;
}

/**
 * Parse a currency string to a number
 * 
 * @param currencyString - String to parse (e.g., "S/ 25.50", "25,50", "1.250,00")
 * @returns Numeric value or 0 if parsing fails
 * 
 * @example
 * ```ts
 * parseCurrency("S/ 25.50")     // 25.5
 * parseCurrency("1,250.00")     // 1250
 * parseCurrency("invalid")      // 0
 * ```
 */
export function parseCurrency(currencyString: string | null | undefined): number {
  if (!currencyString) return 0;

  // Remove currency symbol and spaces
  let cleaned = currencyString
    .replace(CURRENCY_CONFIG.symbol, "")
    .trim();

  // Handle both comma and period as decimal separator
  // Peruvian format: 1.250,50 (period for thousands, comma for decimals)
  // US format: 1,250.50 (comma for thousands, period for decimals)
  
  // Count occurrences to detect format
  const commaCount = (cleaned.match(/,/g) || []).length;
  const periodCount = (cleaned.match(/\./g) || []).length;

  if (commaCount === 1 && periodCount === 0) {
    // Format: 25,50 (comma as decimal)
    cleaned = cleaned.replace(",", ".");
  } else if (commaCount > 1 || (commaCount === 1 && periodCount === 1)) {
    // Format: 1.250,50 or 1,250.50
    // Remove thousands separator, keep last separator as decimal
    const lastComma = cleaned.lastIndexOf(",");
    const lastPeriod = cleaned.lastIndexOf(".");
    
    if (lastComma > lastPeriod) {
      // Peruvian format: 1.250,50
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // US format: 1,250.50
      cleaned = cleaned.replace(/,/g, "");
    }
  } else {
    // Single separator or no separator - treat as is
    cleaned = cleaned.replace(/,/g, "");
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Calculate discount amount
 * 
 * @param price - Original price
 * @param discountPercent - Discount percentage (0-100)
 * @returns Discount amount
 * 
 * @example
 * ```ts
 * calculateDiscount(100, 20)  // 20
 * calculateDiscount(50, 10)   // 5
 * ```
 */
export function calculateDiscount(
  price: number,
  discountPercent: number
): number {
  if (price <= 0 || discountPercent <= 0) return 0;
  if (discountPercent > 100) return price;
  
  return (price * discountPercent) / 100;
}

/**
 * Apply discount to a price
 * 
 * @param price - Original price
 * @param discountPercent - Discount percentage (0-100)
 * @returns Final price after discount
 * 
 * @example
 * ```ts
 * applyDiscount(100, 20)  // 80
 * applyDiscount(50, 10)   // 45
 * ```
 */
export function applyDiscount(
  price: number,
  discountPercent: number
): number {
  const discount = calculateDiscount(price, discountPercent);
  return Math.max(0, price - discount);
}

/**
 * Format a price range
 * 
 * @param minPrice - Minimum price
 * @param maxPrice - Maximum price
 * @returns Formatted range (e.g., "S/ 10.00 - S/ 50.00")
 * 
 * @example
 * ```ts
 * formatPriceRange(10, 50)  // "S/ 10.00 - S/ 50.00"
 * formatPriceRange(25, 25)  // "S/ 25.00"
 * ```
 */
export function formatPriceRange(
  minPrice: number,
  maxPrice: number
): string {
  if (minPrice === maxPrice) {
    return formatCurrency(minPrice);
  }

  return `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`;
}

/**
 * Round to nearest common price point (e.g., 0.50, 0.90, 0.99)
 * 
 * @param price - Price to round
 * @param strategy - Rounding strategy
 * @returns Rounded price
 * 
 * @example
 * ```ts
 * roundPrice(12.37, "half")   // 12.50
 * roundPrice(12.37, "ninety") // 12.90
 * roundPrice(12.37, "ninetynine") // 12.99
 * ```
 */
export function roundPrice(
  price: number,
  strategy: "half" | "ninety" | "ninetynine" | "whole" = "half"
): number {
  const whole = Math.floor(price);
  
  switch (strategy) {
    case "half":
      // Snap to nearest 0.50 price point (psychological pricing)
      return whole + (price - whole >= 0.25 ? 0.5 : 0);
    case "ninety":
      return whole + 0.9;
    case "ninetynine":
      return whole + 0.99;
    case "whole":
      return Math.round(price);
    default:
      return price;
  }
}

/**
 * Validate if a price is within acceptable range
 * 
 * @param price - Price to validate
 * @param min - Minimum acceptable price (default: 0)
 * @param max - Maximum acceptable price (default: Infinity)
 * @returns true if valid, false otherwise
 */
export function isValidPrice(
  price: number | null | undefined,
  min: number = 0,
  max: number = Infinity
): boolean {
  if (price == null || isNaN(price)) return false;
  return price >= min && price <= max;
}

/**
 * Format currency for invoice/receipt (no thousands separator, always 2 decimals)
 * 
 * @param amount - The numeric amount to format
 * @returns Formatted currency for receipts (e.g., "S/ 25.50")
 */
export function formatCurrencyForReceipt(
  amount: number | string | null | undefined
): string {
  const numericAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  
  if (numericAmount == null || isNaN(numericAmount)) {
    return `${CURRENCY_CONFIG.symbol} 0.00`;
  }

  const formatted = numericAmount.toFixed(CURRENCY_CONFIG.decimals);
  return `${CURRENCY_CONFIG.symbol} ${formatted}`;
}
