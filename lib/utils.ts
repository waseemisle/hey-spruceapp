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
  
  // If it's already a string, return it
  if (typeof address === 'string') {
    return address;
  }
  
  // If it's an object, format it
  if (typeof address === 'object') {
    const parts: string[] = [];
    
    if (address.street) parts.push(address.street);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.zip || address.zipCode) parts.push(address.zip || address.zipCode);
    if (address.country && address.country !== 'USA') parts.push(address.country);
    
    return parts.length > 0 ? parts.join(', ') : 'N/A';
  }
  
  return 'N/A';
}