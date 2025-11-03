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
    
    // Check if it's a Firestore Timestamp or other special object
    if (address.toString && address.toString() === '[object Object]') {
      // Try to extract properties
      const parts: string[] = [];
      
      if (address.street) parts.push(String(address.street).trim());
      if (address.city) parts.push(String(address.city).trim());
      if (address.state) parts.push(String(address.state).trim());
      if (address.zip || address.zipCode) parts.push(String(address.zip || address.zipCode).trim());
      if (address.country && address.country !== 'USA') parts.push(String(address.country).trim());
      
      return parts.length > 0 ? parts.filter(p => p).join(', ') : 'N/A';
    }
    
    // Normal object handling
    const parts: string[] = [];
    
    if (address.street) parts.push(String(address.street).trim());
    if (address.city) parts.push(String(address.city).trim());
    if (address.state) parts.push(String(address.state).trim());
    if (address.zip || address.zipCode) parts.push(String(address.zip || address.zipCode).trim());
    if (address.country && address.country !== 'USA') parts.push(String(address.country).trim());
    
    const result = parts.filter(p => p).join(', ');
    return result.length > 0 ? result : 'N/A';
  }
  
  // Fallback for any other type
  try {
    return String(address).trim() || 'N/A';
  } catch {
    return 'N/A';
  }
}