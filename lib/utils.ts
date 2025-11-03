import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats an address object or string into a readable address string
 * Handles both object format {street, city, state, zip, country} and string format
 */
export function formatAddress(address: any): string {
  if (!address) return 'N/A';
  
  // If it's already a string, return it (trimmed)
  if (typeof address === 'string') {
    return address.trim() || 'N/A';
  }
  
  // If it's an object, format it
  if (typeof address === 'object') {
    // Handle case where address might be null or undefined
    if (address === null || address === undefined) {
      return 'N/A';
    }
    
    // Check if it's an array (shouldn't happen, but handle it)
    if (Array.isArray(address)) {
      return address.filter(item => item).join(', ') || 'N/A';
    }
    
    // Try to extract address properties
    const parts: string[] = [];
    
    // Check for street (could be street, address, or addressLine1)
    if (address.street) parts.push(String(address.street).trim());
    else if (address.address) parts.push(String(address.address).trim());
    else if (address.addressLine1) parts.push(String(address.addressLine1).trim());
    
    // Check for city
    if (address.city) parts.push(String(address.city).trim());
    
    // Check for state
    if (address.state) parts.push(String(address.state).trim());
    
    // Check for zip (could be zip, zipCode, postalCode)
    if (address.zip) parts.push(String(address.zip).trim());
    else if (address.zipCode) parts.push(String(address.zipCode).trim());
    else if (address.postalCode) parts.push(String(address.postalCode).trim());
    
    // Check for country (only add if not USA)
    if (address.country && String(address.country).trim().toUpperCase() !== 'USA') {
      parts.push(String(address.country).trim());
    }
    
    // Filter out empty parts and join
    const result = parts.filter(p => p && p.length > 0).join(', ');
    
    // If we got a result, return it
    if (result.length > 0) {
      return result;
    }
    
    // If no parts were found, check if it's a stringified object
    // This handles cases where the object might have been incorrectly stored
    try {
      const stringified = JSON.stringify(address);
      if (stringified && stringified !== '{}' && stringified !== 'null') {
        // Try to parse it as JSON and extract address info
        const parsed = JSON.parse(stringified);
        if (parsed && typeof parsed === 'object') {
          return formatAddress(parsed); // Recursive call with parsed object
        }
      }
    } catch {
      // JSON parsing failed, continue to fallback
    }
    
    // Final fallback
    return 'N/A';
  }
  
  // Fallback for any other type
  try {
    return String(address).trim() || 'N/A';
  } catch {
    return 'N/A';
  }
}