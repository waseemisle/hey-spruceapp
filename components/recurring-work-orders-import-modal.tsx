'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, FileText, AlertCircle, CheckCircle, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Plus, ChevronDown, ChevronUp, ArrowRight, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, getDocs, where } from 'firebase/firestore';

interface ParsedRow {
  restaurant: string;
  serviceType: string;
  lastServiced: string | number;
  nextServiceDates: (string | number)[];
  frequencyLabel: string;
  scheduling: string;
  notes: string;
  rowNumber: number;
  errors: string[];
  subcontractorId?: string; // Pre-selected subcontractor for this row
  clientId?: string; // Pre-selected client for this row
}

interface Subcontractor {
  id: string;
  fullName: string;
  email: string;
}

interface Client {
  id: string;
  fullName: string;
  email: string;
}

interface Location {
  id: string;
  locationName: string;
}

interface MatchResult {
  rowIndex: number;
  existingId: string;
  existingData: {
    lastServiced: string | null;
    nextServiceDates: string[];
  };
}

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export default function RecurringWorkOrdersImportModal({
  isOpen,
  onClose,
  onImportComplete,
}: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationMap, setLocationMap] = useState<Record<string, string>>({}); // restaurant name -> locationId
  const [unmappedRestaurants, setUnmappedRestaurants] = useState<string[]>([]);
  const [globalClientId, setGlobalClientId] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [importMode, setImportMode] = useState<'create' | 'update_or_create'>('update_or_create');
  const [matchResults, setMatchResults] = useState<MatchResult[] | null>(null);
  const [isCheckingMatches, setIsCheckingMatches] = useState(false);
  const [updatingOpen, setUpdatingOpen] = useState(true);
  const [creatingOpen, setCreatingOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch subcontractors, clients, and locations when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSubcontractors();
      fetchClients();
      fetchLocations();
    }
  }, [isOpen]);

  const fetchSubcontractors = async () => {
    try {
      const subsQuery = query(
        collection(db, 'subcontractors'),
        where('status', '==', 'approved')
      );
      const snapshot = await getDocs(subsQuery);
      const subsData = snapshot.docs.map(doc => ({
        id: doc.id,
        fullName: doc.data().fullName,
        email: doc.data().email,
      })) as Subcontractor[];
      setSubcontractors(subsData);
    } catch (error) {
      console.error('Error fetching subcontractors:', error);
    }
  };

  const fetchClients = async () => {
    try {
      const clientsQuery = query(collection(db, 'clients'));
      const snapshot = await getDocs(clientsQuery);
      const clientsData = snapshot.docs.map(doc => ({
        id: doc.id,
        fullName: doc.data().fullName,
        email: doc.data().email,
      })) as Client[];
      setClients(clientsData);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchLocations = async () => {
    try {
      const locationsQuery = query(collection(db, 'locations'));
      const snapshot = await getDocs(locationsQuery);
      const locationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        locationName: doc.data().locationName || '',
      })) as Location[];
      setLocations(locationsData);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  // --- Location auto-matching helpers (mirrors API's findLocationByName strategies) ---
  const normalizeLocationName = (name: string): string => {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  };

  const parseLocationNameParts = (name: string): { base: string; location: string } => {
    const normalized = normalizeLocationName(name);
    const parenMatch = normalized.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (parenMatch) {
      return { base: parenMatch[1].trim(), location: parenMatch[2].trim() };
    }
    const dashMatch = normalized.match(/^(.+?)\s*-\s*(.+)$/);
    if (dashMatch) {
      return { base: dashMatch[1].trim(), location: dashMatch[2].trim() };
    }
    return { base: normalized, location: '' };
  };

  const extractKeyWords = (name: string): string[] => {
    const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'club'];
    const withoutParens = name.replace(/\([^)]*\)/g, '').trim();
    return withoutParens
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 1 && !commonWords.includes(word));
  };

  const extractPrimaryName = (name: string): string => {
    let primary = name.replace(/\([^)]*\)/g, '').trim();
    primary = primary.replace(/^(the|a|an)\s+/i, '').trim();
    return normalizeLocationName(primary);
  };

  const calculateSimilarity = (searchName: string, dbName: string): number => {
    const searchNormalized = normalizeLocationName(searchName);
    const dbNormalized = normalizeLocationName(dbName);
    if (searchNormalized === dbNormalized) return 1.0;
    const searchWords = extractKeyWords(searchName);
    const dbWords = extractKeyWords(dbName);
    if (searchWords.length === 0 || dbWords.length === 0) return 0;
    const matchingWords = searchWords.filter(word =>
      dbWords.some(dbWord => dbWord === word || dbWord.includes(word) || word.includes(dbWord))
    ).length;
    const wordOverlapScore = matchingWords / Math.max(searchWords.length, dbWords.length);
    const searchKey = searchWords.join(' ');
    const dbKey = dbWords.join(' ');
    let containsScore = 0;
    if (dbKey.includes(searchKey) || searchKey.includes(dbKey)) {
      containsScore = 0.7;
    }
    return Math.max(wordOverlapScore, containsScore);
  };

  const autoMatchLocation = (restaurantName: string, dbLocations: Location[]): string | null => {
    const searchNormalized = normalizeLocationName(restaurantName);
    const searchParsed = parseLocationNameParts(restaurantName);

    // Strategy 1: Exact normalized match
    for (const loc of dbLocations) {
      if (normalizeLocationName(loc.locationName) === searchNormalized) {
        return loc.id;
      }
    }

    // Strategy 2-6: Score-based matching (mirrors API logic)
    const candidates: Array<{ id: string; score: number }> = [];

    for (const loc of dbLocations) {
      const docNormalized = normalizeLocationName(loc.locationName);
      const docParsed = parseLocationNameParts(loc.locationName);
      let score = 0;

      // Both have location suffixes
      if (searchParsed.location && docParsed.location) {
        if (docParsed.base === searchParsed.base && docParsed.location === searchParsed.location) {
          return loc.id;
        }
        if (docParsed.base === searchParsed.base && docParsed.location !== searchParsed.location) {
          continue;
        }
      }

      // Search has suffix, doc doesn't
      if (searchParsed.location && !docParsed.location) {
        const searchPrimary = extractPrimaryName(searchParsed.base);
        const docPrimary = extractPrimaryName(docParsed.base);
        if (docPrimary === searchPrimary || docPrimary.includes(searchPrimary) || searchPrimary.includes(docPrimary)) {
          score = 0.95;
        } else {
          const searchWords = extractKeyWords(searchParsed.base);
          const docWords = extractKeyWords(docParsed.base);
          const allWordsMatch = searchWords.length > 0 && searchWords.every(word =>
            docWords.some(dw => dw === word || dw.includes(word) || word.includes(dw))
          );
          if (allWordsMatch) {
            score = 0.85;
          } else {
            const sim = calculateSimilarity(searchParsed.base, docParsed.base);
            if (sim >= 0.5) score = sim * 0.7;
          }
        }
      }

      // Doc has suffix, search doesn't
      if (!searchParsed.location && docParsed.location) {
        const searchPrimary = extractPrimaryName(searchNormalized);
        const docPrimary = extractPrimaryName(docParsed.base);
        if (searchPrimary === docPrimary || searchPrimary.includes(docPrimary) || docPrimary.includes(searchPrimary)) {
          score = 0.85;
        } else {
          const searchWords = extractKeyWords(searchNormalized);
          const docWords = extractKeyWords(docParsed.base);
          const allWordsMatch = searchWords.length > 0 && searchWords.every(word =>
            docWords.some(dw => dw === word || dw.includes(word) || word.includes(dw))
          );
          if (allWordsMatch) score = 0.75;
          else {
            const sim = calculateSimilarity(searchNormalized, docParsed.base);
            if (sim >= 0.5) score = sim * 0.7;
          }
        }
      }

      // Neither has suffix
      if (!searchParsed.location && !docParsed.location) {
        const searchPrimary = extractPrimaryName(searchNormalized);
        const docPrimary = extractPrimaryName(docNormalized);
        if (searchPrimary === docPrimary) {
          return loc.id;
        } else if (searchPrimary.includes(docPrimary) || docPrimary.includes(searchPrimary)) {
          score = 0.9;
        } else {
          const searchWords = extractKeyWords(searchNormalized);
          const docWords = extractKeyWords(docNormalized);
          const allWordsMatch = searchWords.length > 0 && searchWords.every(word =>
            docWords.some(dw => dw === word || dw.includes(word) || word.includes(dw))
          );
          if (allWordsMatch) score = 0.8;
          else {
            const sim = calculateSimilarity(searchNormalized, docNormalized);
            if (sim >= 0.6) score = sim;
          }
        }
      }

      if (score > 0) {
        candidates.push({ id: loc.id, score });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      if (candidates[0].score >= 0.5) {
        return candidates[0].id;
      }
    }

    return null;
  };

  const runAutoMatch = (rows: ParsedRow[], dbLocations: Location[]) => {
    const uniqueRestaurants = [...new Set(rows.filter(r => r.errors.length === 0).map(r => r.restaurant))];
    const newLocationMap: Record<string, string> = {};
    const newUnmapped: string[] = [];

    for (const restaurant of uniqueRestaurants) {
      const matchedId = autoMatchLocation(restaurant, dbLocations);
      if (matchedId) {
        newLocationMap[restaurant] = matchedId;
      } else {
        newUnmapped.push(restaurant);
      }
    }

    setLocationMap(newLocationMap);
    setUnmappedRestaurants(newUnmapped);
  };

  const handleSubcontractorChange = (rowNumber: number, subcontractorId: string) => {
    setParsedData(prev => 
      prev.map(row => 
        row.rowNumber === rowNumber 
          ? { ...row, subcontractorId: subcontractorId || undefined }
          : row
      )
    );
  };

  const handleClientChange = (rowNumber: number, clientId: string) => {
    setParsedData(prev => 
      prev.map(row => 
        row.rowNumber === rowNumber 
          ? { ...row, clientId: clientId || undefined }
          : row
      )
    );
  };

  const RECURRENCE_PATTERN_OPTIONS = ['SEMIANNUALLY', 'QUARTERLY', 'MONTHLY', 'BI-MONTHLY', 'BI-WEEKLY'] as const;

  const handleRecurrencePatternChange = (rowNumber: number, value: string) => {
    const normalized = value.toUpperCase() as typeof RECURRENCE_PATTERN_OPTIONS[number];
    if (!RECURRENCE_PATTERN_OPTIONS.includes(normalized)) return;
    setParsedData(prev => 
      prev.map(row => 
        row.rowNumber === rowNumber 
          ? { ...row, frequencyLabel: normalized }
          : row
      )
    );
  };

  const handleGlobalClientChange = (clientId: string) => {
    setGlobalClientId(clientId);
    // Apply to all valid rows
    if (clientId) {
      setParsedData(prev => 
        prev.map(row => 
          row.errors.length === 0
            ? { ...row, clientId: clientId }
            : row
        )
      );
    }
    // If global client is cleared, individual row selections remain unchanged
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const fileExtension = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
    
    if (!validExtensions.includes(fileExtension)) {
      toast.error('Please select a CSV or Excel file (.csv, .xlsx, .xls)');
      return;
    }

    setFile(selectedFile);
    setIsProcessing(true);

    try {
      const rows = await parseFile(selectedFile);
      // Apply global client to new rows if one is selected
      const rowsWithGlobalClient = globalClientId
        ? rows.map(row => 
            row.errors.length === 0 && !row.clientId
              ? { ...row, clientId: globalClientId }
              : row
          )
        : rows;
      setParsedData(rowsWithGlobalClient);

      // Run auto-match for location mapping
      if (locations.length > 0) {
        runAutoMatch(rowsWithGlobalClient, locations);
      }

      const validRows = rowsWithGlobalClient.filter(r => r.errors.length === 0);
      const invalidRows = rowsWithGlobalClient.filter(r => r.errors.length > 0);
      
      if (validRows.length === 0) {
        toast.error('No valid rows found in the file');
      } else if (invalidRows.length > 0) {
        toast.warning(`Found ${validRows.length} valid rows and ${invalidRows.length} rows with errors`);
      } else {
        toast.success(`Successfully parsed ${validRows.length} rows`);
      }

      // Trigger match check if in update_or_create mode
      if (importMode === 'update_or_create' && validRows.length > 0) {
        checkMatches(rowsWithGlobalClient);
      } else {
        setMatchResults(null);
      }
    } catch (error: any) {
      console.error('Error parsing file:', error);
      toast.error(error.message || 'Failed to parse file');
      setFile(null);
      setParsedData([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const parseFile = async (file: File): Promise<ParsedRow[]> => {
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    const rows: ParsedRow[] = [];

    if (fileExtension === '.csv') {
      return new Promise((resolve, reject) => {
        // Parse with header row to get column mapping
        Papa.parse(file, {
          header: false,
          skipEmptyLines: true,
          complete: (results) => {
            try {
              const data = results.data as any[][];
              if (data.length < 2) {
                reject(new Error('CSV file must have at least a header row and one data row'));
                return;
              }

              // First row is headers
              const headers = data[0] as string[];
              
              // Find column indices
              const restaurantIdx = headers.findIndex(h => h.toUpperCase().includes('RESTAURANT'));
              const serviceTypeIdx = headers.findIndex(h => h.toUpperCase().includes('SERVICE TYPE'));
              const lastServicedIdx = headers.findIndex(h => h.toUpperCase().includes('LAST SERVICED'));
              let frequencyIdx = headers.findIndex(h => h.toUpperCase().includes('FREQUENCY LABEL'));
              if (frequencyIdx < 0) frequencyIdx = headers.findIndex(h => h.toUpperCase().includes('FREQUENCY'));
              const schedulingIdx = headers.findIndex(h => h.toUpperCase().includes('SCHEDULING'));
              const notesIdx = headers.findIndex(h => h.toUpperCase().includes('NOTES'));
              
              // Find all "NEXT SERVICE NEEDED BY" columns
              const nextServiceIndices: number[] = [];
              headers.forEach((h, idx) => {
                if (h.toUpperCase().includes('NEXT SERVICE NEEDED BY') || 
                    (h.toUpperCase().includes('NEXT SERVICE') && !h.toUpperCase().includes('FREQUENCY'))) {
                  nextServiceIndices.push(idx);
                }
              });

              // Convert to object format for compatibility
              const csvData = data.slice(1).map(row => {
                const obj: any = {};
                headers.forEach((header, index) => {
                  obj[header] = row[index] || '';
                });
                // Add indexed access
                obj._restaurantIdx = restaurantIdx;
                obj._serviceTypeIdx = serviceTypeIdx;
                obj._lastServicedIdx = lastServicedIdx;
                obj._frequencyIdx = frequencyIdx;
                obj._schedulingIdx = schedulingIdx;
                obj._notesIdx = notesIdx;
                obj._nextServiceIndices = nextServiceIndices;
                obj._rowArray = row;
                return obj;
              });

              const parsed = parseCSVRows(csvData);
              resolve(parsed);
            } catch (error: any) {
              reject(error);
            }
          },
          error: (error) => {
            reject(new Error(`CSV parsing error: ${error.message}`));
          },
        });
      });
    } else {
      // Excel file
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

      if (data.length < 2) {
        throw new Error('Excel file must have at least a header row and one data row');
      }

      // First row is headers
      const headers = data[0] as string[];
      
      // Filter out completely empty rows (rows where all cells are empty or null)
      const filteredData = data.slice(1).filter(row => {
        if (!row || row.length === 0) return false;
        // Check if row has any meaningful non-empty values
        // A row is considered empty if all cells are empty, null, undefined, or just whitespace
        const hasData = row.some((cell: any, idx: number) => {
          if (cell === null || cell === undefined) return false;
          const value = cell.toString().trim();
          // Skip if it's an empty string or just whitespace
          if (!value || value === '') return false;
          // Skip if it's a string representation of null/undefined
          if (value.toLowerCase() === 'null' || value.toLowerCase() === 'undefined') return false;
          return true;
        });
        return hasData;
      });
      
      console.log(`Excel file: ${data.length} total rows (including header), ${filteredData.length} rows with data after filtering`);
      
      // Find column indices
      const restaurantIdx = headers.findIndex(h => h.toUpperCase().includes('RESTAURANT'));
      const serviceTypeIdx = headers.findIndex(h => h.toUpperCase().includes('SERVICE TYPE'));
      const lastServicedIdx = headers.findIndex(h => h.toUpperCase().includes('LAST SERVICED'));
      let frequencyIdx = headers.findIndex(h => h.toUpperCase().includes('FREQUENCY LABEL'));
      if (frequencyIdx < 0) frequencyIdx = headers.findIndex(h => h.toUpperCase().includes('FREQUENCY'));
      const schedulingIdx = headers.findIndex(h => h.toUpperCase().includes('SCHEDULING'));
      const notesIdx = headers.findIndex(h => h.toUpperCase().includes('NOTES'));
      
      // Find all "NEXT SERVICE NEEDED BY" columns
      const nextServiceIndices: number[] = [];
      headers.forEach((h, idx) => {
        if (h.toUpperCase().includes('NEXT SERVICE NEEDED BY') || 
            (h.toUpperCase().includes('NEXT SERVICE') && !h.toUpperCase().includes('FREQUENCY'))) {
          nextServiceIndices.push(idx);
        }
      });

      // Convert to CSV-like format (using filtered data)
      const csvData = filteredData.map(row => {
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header] = (row[index] || '').toString().trim();
        });
        // Add indexed access
        obj._restaurantIdx = restaurantIdx;
        obj._serviceTypeIdx = serviceTypeIdx;
        obj._lastServicedIdx = lastServicedIdx;
        obj._frequencyIdx = frequencyIdx;
        obj._schedulingIdx = schedulingIdx;
        obj._notesIdx = notesIdx;
        obj._nextServiceIndices = nextServiceIndices;
        obj._rowArray = row;
        return obj;
      });

      return parseCSVRows(csvData);
    }
  };

  const parseCSVRows = (data: any[]): ParsedRow[] => {
    const rows: ParsedRow[] = [];
    let lastRestaurant = '';

    data.forEach((row, index) => {
      const rowNumber = index + 2; // +2 because index is 0-based and we skip header
      const errors: string[] = [];

      // Get RESTAURANT (can be empty, use previous row's value)
      let restaurant = '';
      if (row._restaurantIdx >= 0 && row._rowArray) {
        restaurant = (row._rowArray[row._restaurantIdx] || '').toString().trim();
      } else {
        restaurant = (row['RESTAURANT'] || row['Restaurant'] || '').toString().trim();
      }
      const currentRestaurant = restaurant || lastRestaurant;
      if (!currentRestaurant && index === 0) {
        errors.push('RESTAURANT is required for the first row');
      }
      if (restaurant) {
        lastRestaurant = restaurant;
      }

      // Get SERVICE TYPE
      let serviceType = '';
      if (row._serviceTypeIdx >= 0 && row._rowArray) {
        serviceType = (row._rowArray[row._serviceTypeIdx] || '').toString().trim();
      } else {
        serviceType = (row['SERVICE TYPE'] || row['Service Type'] || '').toString().trim();
      }
      
      // Check if this is a truly empty row (no restaurant and no service type)
      // Skip rows that are completely empty
      if (!currentRestaurant && !serviceType) {
        // This is an empty row, skip it
        return;
      }
      
      // If SERVICE TYPE is missing but we have a restaurant, check if this is a section header row.
      // A section header has a restaurant name but no service type, no dates, and no frequency.
      // Only default to "General Maintenance" if the row has at least one date or a frequency label.
      if (!serviceType && currentRestaurant) {
        // Check if this row has any date values
        const hasDateValues = (() => {
          if (row._nextServiceIndices && row._rowArray) {
            return row._nextServiceIndices.some((idx: number) => {
              const val = row._rowArray[idx];
              return val !== null && val !== undefined && String(val).trim() !== '';
            });
          }
          return false;
        })();

        // Check if this row has a frequency label
        let rowFrequency = '';
        if (row._frequencyIdx >= 0 && row._rowArray) {
          rowFrequency = (row._rowArray[row._frequencyIdx] || '').toString().trim();
        } else {
          rowFrequency = (row['FREQUENCY LABEL'] || row['Frequency Label'] || '').toString().trim();
        }

        // Check if this row has a last serviced date
        let rowLastServiced = '';
        if (row._lastServicedIdx >= 0 && row._rowArray) {
          const val = row._rowArray[row._lastServicedIdx];
          rowLastServiced = (val !== null && val !== undefined) ? String(val).trim() : '';
        }

        if (!hasDateValues && !rowFrequency && !rowLastServiced) {
          // This is a section header row (restaurant name only, no data) — skip it
          return;
        }

        serviceType = 'General Maintenance';
      }

      // Get LAST SERVICED (handle both strings and numbers from Excel)
      let lastServiced: string | number = '';
      if (row._lastServicedIdx >= 0 && row._rowArray) {
        const value = row._rowArray[row._lastServicedIdx];
        if (value !== null && value !== undefined) {
          // Preserve numbers (Excel serial dates or Unix timestamps), convert strings
          lastServiced = typeof value === 'number' ? value : String(value).trim();
        }
      } else {
        const value = row['LAST SERVICED'] || row['Last Serviced'];
        if (value !== null && value !== undefined) {
          lastServiced = typeof value === 'number' ? value : String(value).trim();
        }
      }

      // Get NEXT SERVICE NEEDED BY (5 columns)
      // Use indexed access if available (from improved parsing)
      const nextServiceDates: (string | number)[] = [];
      
      if (row._nextServiceIndices && row._rowArray) {
        // Use indexed access for accurate column mapping
        row._nextServiceIndices.forEach((idx: number) => {
          if (idx >= 0 && idx < row._rowArray.length) {
            const value = row._rowArray[idx];
            if (value !== null && value !== undefined) {
              // Preserve numbers (Excel serial dates or Unix timestamps), convert strings
              const processedValue = typeof value === 'number' ? value : String(value).trim();
              if (processedValue !== '' && processedValue !== null && processedValue !== undefined) {
                nextServiceDates.push(processedValue);
              }
            }
          }
        });
      } else {
        // Fallback: try to find columns by name
        const allKeys = Object.keys(row).filter(k => !k.startsWith('_'));
        const nextServiceColumns = allKeys.filter(key => 
          key.toUpperCase().includes('NEXT SERVICE NEEDED BY') || 
          (key.toUpperCase().includes('NEXT SERVICE') && !key.toUpperCase().includes('FREQUENCY'))
        );
        
        nextServiceColumns.forEach(colName => {
          const value = row[colName];
          if (value !== null && value !== undefined) {
            const processedValue = typeof value === 'number' ? value : String(value).trim();
            if (processedValue !== '' && processedValue !== null && processedValue !== undefined) {
              nextServiceDates.push(processedValue);
            }
          }
        });
      }

      // Get FREQUENCY LABEL
      let frequencyLabel = '';
      if (row._frequencyIdx >= 0 && row._rowArray) {
        frequencyLabel = (row._rowArray[row._frequencyIdx] || '').toString().trim().toUpperCase();
      } else {
        frequencyLabel = (row['FREQUENCY LABEL'] || row['Frequency Label'] || '').toString().trim().toUpperCase();
      }
      
      // If FREQUENCY LABEL is missing, try to infer it from nextServiceDates
      if (!frequencyLabel && nextServiceDates.length > 0) {
        // Calculate average days between dates to infer frequency
        const dates = nextServiceDates
          .map(dateValue => {
            // Handle numeric dates (Excel serial dates or Unix timestamps)
            if (typeof dateValue === 'number') {
              // Check if it's a Unix timestamp in milliseconds
              if (dateValue > 1000000000000) {
                return new Date(dateValue);
              } else if (dateValue > 0 && dateValue < 1000000) {
                // Excel serial date
                const excelEpoch = new Date(1900, 0, 1);
                excelEpoch.setDate(excelEpoch.getDate() + dateValue - 2);
                return excelEpoch;
              } else if (dateValue > 0) {
                // Unix timestamp in seconds
                return new Date(dateValue * 1000);
              }
              return null;
            }
            
            // Handle string dates
            const dateStr = String(dateValue).trim();
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              const month = parseInt(parts[0], 10);
              const day = parseInt(parts[1], 10);
              const year = parseInt(parts[2], 10);
              if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
                return new Date(year, month - 1, day);
              }
            }
            // Try parsing as-is
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
              return parsed;
            }
            return null;
          })
          .filter((date): date is Date => date !== null && !isNaN(date.getTime()));
        
        if (dates.length >= 2) {
          const daysBetween = (dates[1].getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24);
          if (daysBetween <= 14) {
            frequencyLabel = 'BI-WEEKLY';
          } else if (daysBetween <= 35) {
            frequencyLabel = 'MONTHLY';
          } else if (daysBetween <= 100) {
            frequencyLabel = 'QUARTERLY';
          } else {
            frequencyLabel = 'SEMIANNUALLY';
          }
        } else {
          // Default to QUARTERLY if we can't infer
          frequencyLabel = 'QUARTERLY';
        }
      } else if (!frequencyLabel) {
        // If no dates and no frequency label, default to QUARTERLY
        frequencyLabel = 'QUARTERLY';
      }
      
      // Validate frequency label value – only allow the five Recurrence Pattern options
      if (!['SEMIANNUALLY', 'QUARTERLY', 'MONTHLY', 'BI-MONTHLY', 'BI-WEEKLY'].includes(frequencyLabel)) {
        if (frequencyLabel === 'WEEKLY') frequencyLabel = 'BI-WEEKLY';
        else if (frequencyLabel === 'EVERY 2 MONTHS' || frequencyLabel === 'BIMONTHLY') frequencyLabel = 'BI-MONTHLY';
        else if (frequencyLabel === 'SEMI-ANNUALLY' || frequencyLabel === 'SEMI ANNUALLY') frequencyLabel = 'SEMIANNUALLY';
        else frequencyLabel = 'QUARTERLY';
      }

      // Get SCHEDULING
      let scheduling = '';
      if (row._schedulingIdx >= 0 && row._rowArray) {
        scheduling = (row._rowArray[row._schedulingIdx] || '').toString().trim();
      } else {
        scheduling = (row['SCHEDULING'] || row['Scheduling'] || '').toString().trim();
      }

      // Get NOTES
      let notes = '';
      if (row._notesIdx >= 0 && row._rowArray) {
        notes = (row._rowArray[row._notesIdx] || '').toString().trim();
      } else {
        notes = (row['NOTES'] || row['Notes'] || '').toString().trim();
      }

      // Add the row (we already checked for empty rows above)
      rows.push({
        restaurant: currentRestaurant,
        serviceType,
        lastServiced,
        nextServiceDates,
        frequencyLabel,
        scheduling,
        notes,
        rowNumber,
        errors,
      });
    });

    return rows;
  };

  const parseDate = (dateStr: string): Date | null => {
    if (!dateStr || !dateStr.trim()) return null;

    // Try MM/DD/YYYY format
    const parts = dateStr.trim().split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0], 10);
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
          return date;
        }
      }
    }

    // Try other formats
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    return null;
  };

  const toImportRow = (row: ParsedRow) => ({
    restaurant: row.restaurant,
    serviceType: row.serviceType,
    lastServiced: row.lastServiced,
    nextServiceDates: row.nextServiceDates,
    frequencyLabel: row.frequencyLabel,
    scheduling: row.scheduling,
    notes: row.notes,
    subcontractorId: row.subcontractorId || undefined,
    clientId: row.clientId || undefined,
    locationId: locationMap[row.restaurant] || undefined,
  });

  const checkMatches = async (rows: ParsedRow[]) => {
    const validRows = rows.filter(r => r.errors.length === 0);
    if (validRows.length === 0) {
      setMatchResults(null);
      return;
    }

    setIsCheckingMatches(true);
    try {
      let currentUser = auth.currentUser;
      if (!currentUser) {
        currentUser = await new Promise<typeof auth.currentUser>((resolve, reject) => {
          const timeout = setTimeout(() => { unsub(); reject(new Error('Auth timeout')); }, 3000);
          const unsub = onAuthStateChanged(auth, (user) => {
            clearTimeout(timeout);
            unsub();
            resolve(user ?? null);
          });
        });
      }
      if (!currentUser) {
        setMatchResults(null);
        return;
      }

      const idToken = await currentUser.getIdToken(true);
      const response = await fetch('/api/recurring-work-orders/import', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ rows: validRows.map(toImportRow) }),
      });

      if (response.ok) {
        const data = await response.json();
        // Map the API's rowIndex (index within validRows) back to parsedData index
        const mapped: MatchResult[] = (data.matches || []).map((m: any) => ({
          ...m,
          rowIndex: rows.indexOf(validRows[m.rowIndex]),
        }));
        setMatchResults(mapped);
      } else {
        console.error('Preview match check failed:', await response.text());
        setMatchResults(null);
      }
    } catch (error) {
      console.error('Error checking matches:', error);
      setMatchResults(null);
    } finally {
      setIsCheckingMatches(false);
    }
  };

  const handleImport = async () => {
    const validRows = parsedData.filter(r => r.errors.length === 0);
    
    if (validRows.length === 0) {
      toast.error('No valid rows to import. Please fix errors first.');
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: validRows.length });

    try {
      let currentUser = auth.currentUser;
      if (!currentUser) {
        currentUser = await new Promise<typeof auth.currentUser>((resolve, reject) => {
          const timeout = setTimeout(() => {
            unsub();
            reject(new Error('Authentication timeout'));
          }, 3000);
          const unsub = onAuthStateChanged(auth, (user) => {
            clearTimeout(timeout);
            unsub();
            resolve(user ?? null);
          });
        });
      }
      
      if (!currentUser) {
        toast.error('You must be logged in to import work orders');
        setIsImporting(false);
        setImportProgress({ current: 0, total: 0 });
        return;
      }

      const idToken = await currentUser.getIdToken(true);

      let totalCreated = 0;
      let totalUpdated = 0;
      const allErrors: Array<{ row: number; error: string }> = [];

      for (let i = 0; i < validRows.length; i++) {
        setImportProgress({ current: i, total: validRows.length });
        const row = validRows[i];
        const importRow = toImportRow(row);
        const requestBody = { rows: [importRow], mode: importMode };
        console.log(`[Import] Row ${row.rowNumber} "${row.restaurant}" → locationId=${importRow.locationId || 'NONE'}`);

        try {
          const response = await fetch('/api/recurring-work-orders/import', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify(requestBody),
          });
          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Import failed');
          }
          totalCreated += result.created ?? 0;
          totalUpdated += result.updated ?? 0;
          if (result.errors && Array.isArray(result.errors)) {
            for (const e of result.errors) {
              console.error(`[Import] Row ${row.rowNumber} "${row.restaurant}" API error:`, e.error || String(e));
              allErrors.push({ row: row.rowNumber, error: e.error || String(e) });
            }
          }
        } catch (err: any) {
          console.error(`[Import] Row ${row.rowNumber} "${row.restaurant}" FAILED:`, err.message);
          allErrors.push({ row: row.rowNumber, error: err.message || 'Unknown error' });
        }
      }

      setImportProgress({ current: validRows.length, total: validRows.length });

      const successParts: string[] = [];
      if (totalCreated > 0) successParts.push(`created ${totalCreated}`);
      if (totalUpdated > 0) successParts.push(`updated ${totalUpdated}`);

      if (successParts.length > 0) {
        const successMsg = `Successfully ${successParts.join(' and ')} recurring work order(s)`;
        toast.success(
          allErrors.length > 0
            ? `${successMsg}. ${allErrors.length} row(s) failed.`
            : successMsg
        );
      } else {
        toast.error('No recurring work orders were created or updated. Please check the errors.');
      }
      
      if (allErrors.length > 0) {
        const errorDetails = allErrors
          .slice(0, 5)
          .map((e) => `Row ${e.row}: ${e.error}`)
          .join('\n');
        const moreErrors = allErrors.length > 5 ? `\n... and ${allErrors.length - 5} more error(s)` : '';
        toast.warning(`${allErrors.length} row(s) failed to import:\n${errorDetails}${moreErrors}`, {
          duration: 10000,
        });
      }

      handleClose();
      onImportComplete();
    } catch (error: any) {
      console.error('Error importing:', error);
      toast.error(error.message || 'Failed to import recurring work orders');
    } finally {
      setIsImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedData([]);
    setIsProcessing(false);
    setIsImporting(false);
    setImportProgress({ current: 0, total: 0 });
    setSubcontractors([]);
    setClients([]);
    setLocations([]);
    setLocationMap({});
    setUnmappedRestaurants([]);
    setGlobalClientId('');
    setImportMode('update_or_create');
    setMatchResults(null);
    setIsCheckingMatches(false);
    setUpdatingOpen(true);
    setCreatingOpen(true);
    setCurrentPage(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  // Pagination calculations
  const totalPages = Math.ceil(parsedData.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentRows = parsedData.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Reset to page 1 when data changes
  useEffect(() => {
    if (parsedData.length > 0) {
      setCurrentPage(1);
    }
  }, [parsedData.length]);

  // Re-run auto-match when locations finish loading after file was already parsed
  useEffect(() => {
    if (locations.length > 0 && parsedData.length > 0) {
      runAutoMatch(parsedData, locations);
    }
  }, [locations.length]);

  // Trigger match check when mode changes to update_or_create with data already parsed
  useEffect(() => {
    if (importMode === 'update_or_create' && parsedData.length > 0) {
      checkMatches(parsedData);
    } else {
      setMatchResults(null);
    }
  }, [importMode]);

  const validRows = parsedData.filter(r => r.errors.length === 0);
  const invalidRows = parsedData.filter(r => r.errors.length > 0);

  // Compute matched (updating) vs unmatched (creating) row sets
  const matchedIndices = new Set(matchResults?.map(m => m.rowIndex) ?? []);
  const updatingRows = importMode === 'update_or_create' && matchResults
    ? parsedData.filter((_, idx) => matchedIndices.has(idx) && parsedData[idx].errors.length === 0)
    : [];
  const creatingRows = importMode === 'update_or_create' && matchResults
    ? parsedData.filter((_, idx) => !matchedIndices.has(idx))
    : parsedData;

  // Pagination applies to creating rows section
  const creatingValidRows = creatingRows.filter(r => r.errors.length === 0);
  const totalPagesCreating = Math.ceil(creatingRows.length / rowsPerPage);
  const startIndexCreating = (currentPage - 1) * rowsPerPage;
  const endIndexCreating = startIndexCreating + rowsPerPage;
  const currentCreatingRows = creatingRows.slice(startIndexCreating, endIndexCreating);

  // Helper to format date values for display
  const formatDateValue = (val: string | number): string => {
    if (!val && val !== 0) return '-';
    if (typeof val === 'number') {
      // Excel serial date
      if (val > 0 && val < 1000000) {
        const excelEpoch = new Date(1900, 0, 1);
        excelEpoch.setDate(excelEpoch.getDate() + val - 2);
        return excelEpoch.toLocaleDateString();
      }
      if (val > 1000000000000) return new Date(val).toLocaleDateString();
      if (val > 0) return new Date(val * 1000).toLocaleDateString();
      return String(val);
    }
    return String(val);
  };

  // Get match result for a given parsedData index
  const getMatchForIndex = (idx: number): MatchResult | undefined =>
    matchResults?.find(m => m.rowIndex === idx);

  // Location mapping status
  const uniqueRestaurants = [...new Set(validRows.map(r => r.restaurant))];
  const mappedCount = uniqueRestaurants.filter(r => locationMap[r]).length;
  const allLocationsMapped = uniqueRestaurants.length > 0 && mappedCount === uniqueRestaurants.length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex justify-between items-center">
            <CardTitle>Import Recurring Work Orders from CSV/Excel</CardTitle>
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={isImporting}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-6">
          {/* File Upload Section */}
          <div>
            <Label htmlFor="file-upload">Select CSV or Excel File</Label>
            <div className="mt-2 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                ref={fileInputRef}
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isProcessing || isImporting}
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm text-gray-600 mb-2">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-gray-500">
                  CSV, XLSX, or XLS files only
                </p>
              </label>
              {file && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-700">
                  <FileText className="h-4 w-4" />
                  <span>{file.name}</span>
                </div>
              )}
            </div>
            {isProcessing && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing file...</span>
              </div>
            )}
          </div>

          {/* Import Mode Selector */}
          {parsedData.length > 0 && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <Label className="text-sm font-medium text-gray-700 mb-3 block">
                Import Mode
              </Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setImportMode('create')}
                  disabled={isImporting}
                  className={`flex-1 flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                    importMode === 'create'
                      ? 'border-blue-500 bg-blue-50 text-blue-800'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <Plus className={`h-5 w-5 ${importMode === 'create' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div className="text-left">
                    <div className="font-medium text-sm">Create New</div>
                    <div className="text-xs opacity-75">Create all rows as new recurring work orders</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('update_or_create')}
                  disabled={isImporting}
                  className={`flex-1 flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                    importMode === 'update_or_create'
                      ? 'border-green-500 bg-green-50 text-green-800'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <RefreshCw className={`h-5 w-5 ${importMode === 'update_or_create' ? 'text-green-600' : 'text-gray-400'}`} />
                  <div className="text-left">
                    <div className="font-medium text-sm">Update or Create</div>
                    <div className="text-xs opacity-75">Update existing orders (match by Location + Service Type + Frequency), create new if not found</div>
                  </div>
                </button>
              </div>
              {importMode === 'update_or_create' && (
                <p className="text-xs text-green-700 mt-2 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Existing orders will be matched by Restaurant + Service Type + Frequency Label. Dates (Last Serviced, Next Service Needed By) will be updated.
                </p>
              )}
            </div>
          )}

          {/* Location Mapping Section */}
          {parsedData.length > 0 && uniqueRestaurants.length > 0 && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Location Mapping
                </Label>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  allLocationsMapped
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {mappedCount} of {uniqueRestaurants.length} restaurants mapped
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 text-left border-b text-xs font-medium text-gray-600">Restaurant (from file)</th>
                      <th className="p-2 text-left border-b text-xs font-medium text-gray-600">Mapped Location</th>
                      <th className="p-2 text-left border-b text-xs font-medium text-gray-600 w-16">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uniqueRestaurants.map((restaurant) => {
                      const isMapped = !!locationMap[restaurant];
                      const mappedLocation = isMapped
                        ? locations.find(l => l.id === locationMap[restaurant])
                        : null;
                      return (
                        <tr key={restaurant} className={isMapped ? 'bg-white' : 'bg-amber-50'}>
                          <td className="p-2 border-b text-xs font-medium">{restaurant}</td>
                          <td className="p-2 border-b">
                            {isMapped && !unmappedRestaurants.includes(restaurant) ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-700">{mappedLocation?.locationName || locationMap[restaurant]}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUnmappedRestaurants(prev => [...prev, restaurant]);
                                  }}
                                  className="text-xs text-blue-600 hover:underline"
                                  disabled={isImporting}
                                >
                                  Change
                                </button>
                              </div>
                            ) : (
                              <select
                                value={locationMap[restaurant] || ''}
                                onChange={(e) => {
                                  const newMap = { ...locationMap };
                                  if (e.target.value) {
                                    newMap[restaurant] = e.target.value;
                                    setUnmappedRestaurants(prev => prev.filter(r => r !== restaurant));
                                  } else {
                                    delete newMap[restaurant];
                                    if (!unmappedRestaurants.includes(restaurant)) {
                                      setUnmappedRestaurants(prev => [...prev, restaurant]);
                                    }
                                  }
                                  setLocationMap(newMap);
                                }}
                                className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                                disabled={isImporting}
                              >
                                <option value="">Select a location...</option>
                                {locations.map(loc => (
                                  <option key={loc.id} value={loc.id}>{loc.locationName}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="p-2 border-b text-center">
                            {isMapped ? (
                              <CheckCircle className="h-4 w-4 text-green-600 inline" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-amber-500 inline" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!allLocationsMapped && (
                <p className="text-xs text-amber-600 mt-2">
                  All restaurants must be mapped to a location before importing.
                </p>
              )}
            </div>
          )}

          {/* Preview Section */}
          {parsedData.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Preview</h3>
                <div className="flex items-center gap-4 text-sm">
                  {isCheckingMatches && (
                    <div className="flex items-center gap-2 text-blue-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Checking matches...</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-gray-700">{validRows.length} valid</span>
                  </div>
                  {invalidRows.length > 0 && (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <span className="text-gray-700">{invalidRows.length} with errors</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Summary Bar — shown in update_or_create mode with match results */}
              {importMode === 'update_or_create' && matchResults && !isCheckingMatches && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm font-medium text-blue-800">
                  <strong>{validRows.length + invalidRows.length}</strong> total rows — <strong>{updatingRows.length}</strong> will be updated | <strong>{creatingRows.filter(r => r.errors.length === 0).length}</strong> will be created
                  {invalidRows.length > 0 && <span className="text-red-600 ml-2">| {invalidRows.length} with errors</span>}
                </div>
              )}

              {/* Global Client Selector */}
              <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <Label htmlFor="global-client-select" className="text-sm font-medium text-gray-700 mb-2 block">
                  Apply Client to All Orders
                </Label>
                <select
                  id="global-client-select"
                  value={globalClientId}
                  onChange={(e) => handleGlobalClientChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white text-sm"
                  disabled={isImporting}
                >
                  <option value="">Select a client to apply to all orders...</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.fullName} ({client.email})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  This will apply the selected client to all orders. You can still override individual orders below.
                </p>
              </div>

              {/* ===== TWO-SECTION UI (update_or_create with match results) ===== */}
              {importMode === 'update_or_create' && matchResults && !isCheckingMatches ? (
                <>
                  {/* Section 1: Orders Being Updated */}
                  {updatingRows.length > 0 && (
                    <div className="mb-6 border border-green-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setUpdatingOpen(prev => !prev)}
                        className="w-full flex items-center justify-between p-3 bg-green-50 hover:bg-green-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 text-green-700" />
                          <span className="font-semibold text-green-800 text-sm">
                            Orders Being Updated ({updatingRows.length})
                          </span>
                        </div>
                        {updatingOpen ? <ChevronUp className="h-4 w-4 text-green-700" /> : <ChevronDown className="h-4 w-4 text-green-700" />}
                      </button>
                      {updatingOpen && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-green-50/50">
                              <tr>
                                <th className="p-2 text-left border-b text-xs">Restaurant</th>
                                <th className="p-2 text-left border-b text-xs">Service Type</th>
                                <th className="p-2 text-left border-b text-xs">Frequency</th>
                                <th className="p-2 text-left border-b text-xs">Last Serviced</th>
                                <th className="p-2 text-left border-b text-xs">Next Service 1</th>
                                <th className="p-2 text-left border-b text-xs">Next Service 2</th>
                                <th className="p-2 text-left border-b text-xs">Next Service 3</th>
                                <th className="p-2 text-left border-b text-xs">Next Service 4</th>
                                <th className="p-2 text-left border-b text-xs">Next Service 5</th>
                                <th className="p-2 text-left border-b text-xs">Client</th>
                                <th className="p-2 text-left border-b text-xs">Subcontractor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {updatingRows.map((row) => {
                                const dataIdx = parsedData.indexOf(row);
                                const match = getMatchForIndex(dataIdx);
                                const oldLastServiced = match?.existingData.lastServiced || '-';
                                const newLastServiced = row.lastServiced ? formatDateValue(row.lastServiced) : '-';
                                const oldNextDates = match?.existingData.nextServiceDates || [];
                                const newNextDates = row.nextServiceDates || [];

                                return (
                                  <tr key={row.rowNumber} className="hover:bg-green-50/30">
                                    <td className="p-2 border-b text-xs">{row.restaurant}</td>
                                    <td className="p-2 border-b text-xs">{row.serviceType}</td>
                                    <td className="p-2 border-b text-xs">{row.frequencyLabel}</td>
                                    <td className="p-2 border-b text-xs whitespace-nowrap">
                                      {oldLastServiced !== newLastServiced ? (
                                        <span>
                                          <span className="text-gray-400 line-through">{oldLastServiced}</span>
                                          <ArrowRight className="inline h-3 w-3 mx-1 text-green-600" />
                                          <span className="font-medium text-green-700">{newLastServiced}</span>
                                        </span>
                                      ) : (
                                        <span className="text-gray-500">{newLastServiced}</span>
                                      )}
                                    </td>
                                    {[0, 1, 2, 3, 4].map(dateIdx => {
                                      const oldVal = oldNextDates[dateIdx] || '-';
                                      const newVal = newNextDates[dateIdx] ? formatDateValue(newNextDates[dateIdx]) : '-';
                                      const changed = oldVal !== newVal;
                                      return (
                                        <td key={dateIdx} className="p-2 border-b text-xs whitespace-nowrap">
                                          {changed ? (
                                            <span>
                                              <span className="text-gray-400 line-through">{oldVal}</span>
                                              <ArrowRight className="inline h-3 w-3 mx-1 text-green-600" />
                                              <span className="font-medium text-green-700">{newVal}</span>
                                            </span>
                                          ) : (
                                            <span className="text-gray-500">{newVal}</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                    <td className="p-2 border-b">
                                      <select
                                        value={row.clientId || ''}
                                        onChange={(e) => handleClientChange(row.rowNumber, e.target.value)}
                                        className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                                        disabled={isImporting}
                                      >
                                        <option value="">Select client...</option>
                                        {clients.map(client => (
                                          <option key={client.id} value={client.id}>{client.fullName}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="p-2 border-b">
                                      <select
                                        value={row.subcontractorId || ''}
                                        onChange={(e) => handleSubcontractorChange(row.rowNumber, e.target.value)}
                                        className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                                        disabled={isImporting}
                                      >
                                        <option value="">Select subcontractor...</option>
                                        {subcontractors.map(sub => (
                                          <option key={sub.id} value={sub.id}>{sub.fullName}</option>
                                        ))}
                                      </select>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section 2: Orders Being Created */}
                  <div className="mb-4 border border-blue-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCreatingOpen(prev => !prev)}
                      className="w-full flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4 text-blue-700" />
                        <span className="font-semibold text-blue-800 text-sm">
                          Orders Being Created ({creatingRows.filter(r => r.errors.length === 0).length})
                          {creatingRows.filter(r => r.errors.length > 0).length > 0 && (
                            <span className="text-red-600 font-normal ml-1">
                              + {creatingRows.filter(r => r.errors.length > 0).length} with errors
                            </span>
                          )}
                        </span>
                      </div>
                      {creatingOpen ? <ChevronUp className="h-4 w-4 text-blue-700" /> : <ChevronDown className="h-4 w-4 text-blue-700" />}
                    </button>
                    {creatingOpen && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="p-2 text-left border-b">Row</th>
                              <th className="p-2 text-left border-b">Restaurant</th>
                              <th className="p-2 text-left border-b">Service Type</th>
                              <th className="p-2 text-left border-b">Recurrence Pattern</th>
                              <th className="p-2 text-left border-b">Client</th>
                              <th className="p-2 text-left border-b">Subcontractor</th>
                              <th className="p-2 text-left border-b">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {currentCreatingRows.map((row) => (
                              <tr key={row.rowNumber} className={row.errors.length > 0 ? 'bg-red-50' : 'hover:bg-gray-50'}>
                                <td className="p-2 border-b">{row.rowNumber}</td>
                                <td className="p-2 border-b">{row.restaurant || '-'}</td>
                                <td className="p-2 border-b">{row.serviceType || '-'}</td>
                                <td className="p-2 border-b">
                                  {row.errors.length === 0 ? (
                                    <select
                                      value={row.frequencyLabel || 'QUARTERLY'}
                                      onChange={(e) => handleRecurrencePatternChange(row.rowNumber, e.target.value)}
                                      className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                                      disabled={isImporting}
                                    >
                                      {RECURRENCE_PATTERN_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-gray-400 text-xs">-</span>
                                  )}
                                </td>
                                <td className="p-2 border-b">
                                  {row.errors.length === 0 ? (
                                    <select
                                      value={row.clientId || ''}
                                      onChange={(e) => handleClientChange(row.rowNumber, e.target.value)}
                                      className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                                      disabled={isImporting}
                                    >
                                      <option value="">Select client...</option>
                                      {clients.map(client => (
                                        <option key={client.id} value={client.id}>{client.fullName}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-gray-400 text-xs">Fix errors first</span>
                                  )}
                                </td>
                                <td className="p-2 border-b">
                                  {row.errors.length === 0 ? (
                                    <select
                                      value={row.subcontractorId || ''}
                                      onChange={(e) => handleSubcontractorChange(row.rowNumber, e.target.value)}
                                      className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                                      disabled={isImporting}
                                    >
                                      <option value="">Select subcontractor...</option>
                                      {subcontractors.map(sub => (
                                        <option key={sub.id} value={sub.id}>{sub.fullName}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-gray-400 text-xs">Fix errors first</span>
                                  )}
                                </td>
                                <td className="p-2 border-b">
                                  {row.errors.length > 0 ? (
                                    <div className="flex items-center gap-1 text-red-600">
                                      <AlertCircle className="h-3 w-3" />
                                      <span className="text-xs">{row.errors.length} error(s)</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 text-green-600">
                                      <CheckCircle className="h-3 w-3" />
                                      <span className="text-xs">Valid</span>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Pagination Controls for Creating section */}
                        {creatingRows.length > 0 && (
                          <div className="border-t bg-gray-50 p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                              <span>Rows per page:</span>
                              <select
                                value={rowsPerPage}
                                onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                                className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                                disabled={isImporting}
                              >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                              </select>
                              <span className="text-gray-600">
                                Showing {startIndexCreating + 1} to {Math.min(endIndexCreating, creatingRows.length)} of {creatingRows.length} rows
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" onClick={() => goToPage(1)} disabled={currentPage === 1 || isImporting} className="h-8 w-8 p-0">
                                <ChevronsLeft className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1 || isImporting} className="h-8 w-8 p-0">
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              <div className="flex items-center gap-1 px-2">
                                <span className="text-sm text-gray-700">
                                  Page <strong>{currentPage}</strong> of <strong>{totalPagesCreating || 1}</strong>
                                </span>
                              </div>
                              <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPagesCreating || isImporting} className="h-8 w-8 p-0">
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => goToPage(totalPagesCreating)} disabled={currentPage === totalPagesCreating || isImporting} className="h-8 w-8 p-0">
                                <ChevronsRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* ===== SINGLE TABLE (create mode or no match results yet) ===== */
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left border-b">Row</th>
                        <th className="p-2 text-left border-b">Restaurant</th>
                        <th className="p-2 text-left border-b">Service Type</th>
                        <th className="p-2 text-left border-b">Recurrence Pattern</th>
                        <th className="p-2 text-left border-b">Client</th>
                        <th className="p-2 text-left border-b">Subcontractor</th>
                        <th className="p-2 text-left border-b">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRows.map((row) => (
                        <tr
                          key={row.rowNumber}
                          className={row.errors.length > 0 ? 'bg-red-50' : 'hover:bg-gray-50'}
                        >
                          <td className="p-2 border-b">{row.rowNumber}</td>
                          <td className="p-2 border-b">{row.restaurant || '-'}</td>
                          <td className="p-2 border-b">{row.serviceType || '-'}</td>
                          <td className="p-2 border-b">
                            {row.errors.length === 0 ? (
                              <select
                                value={row.frequencyLabel || 'QUARTERLY'}
                                onChange={(e) => handleRecurrencePatternChange(row.rowNumber, e.target.value)}
                                className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                                disabled={isImporting}
                              >
                                {RECURRENCE_PATTERN_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="p-2 border-b">
                            {row.errors.length === 0 ? (
                              <select
                                value={row.clientId || ''}
                                onChange={(e) => handleClientChange(row.rowNumber, e.target.value)}
                                className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                                disabled={isImporting}
                              >
                                <option value="">Select client...</option>
                                {clients.map(client => (
                                  <option key={client.id} value={client.id}>{client.fullName}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-gray-400 text-xs">Fix errors first</span>
                            )}
                          </td>
                          <td className="p-2 border-b">
                            {row.errors.length === 0 ? (
                              <select
                                value={row.subcontractorId || ''}
                                onChange={(e) => handleSubcontractorChange(row.rowNumber, e.target.value)}
                                className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                                disabled={isImporting}
                              >
                                <option value="">Select subcontractor...</option>
                                {subcontractors.map(sub => (
                                  <option key={sub.id} value={sub.id}>{sub.fullName}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-gray-400 text-xs">Fix errors first</span>
                            )}
                          </td>
                          <td className="p-2 border-b">
                            {row.errors.length > 0 ? (
                              <div className="flex items-center gap-1 text-red-600">
                                <AlertCircle className="h-3 w-3" />
                                <span className="text-xs">{row.errors.length} error(s)</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="h-3 w-3" />
                                <span className="text-xs">Valid</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination Controls */}
                  {parsedData.length > 0 && (
                    <div className="border-t bg-gray-50 p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <span>Rows per page:</span>
                        <select
                          value={rowsPerPage}
                          onChange={(e) => {
                            setRowsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                          disabled={isImporting}
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                        <span className="text-gray-600">
                          Showing {startIndex + 1} to {Math.min(endIndex, parsedData.length)} of {parsedData.length} rows
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(1)}
                          disabled={currentPage === 1 || isImporting}
                          className="h-8 w-8 p-0"
                        >
                          <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(currentPage - 1)}
                          disabled={currentPage === 1 || isImporting}
                          className="h-8 w-8 p-0"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>

                        <div className="flex items-center gap-1 px-2">
                          <span className="text-sm text-gray-700">
                            Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                          </span>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(currentPage + 1)}
                          disabled={currentPage === totalPages || isImporting}
                          className="h-8 w-8 p-0"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(totalPages)}
                          disabled={currentPage === totalPages || isImporting}
                          className="h-8 w-8 p-0"
                        >
                          <ChevronsRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error Details */}
              {invalidRows.length > 0 && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h4 className="font-semibold text-red-800 mb-2">Errors Found:</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {invalidRows.slice(0, 10).map((row) => (
                      <div key={row.rowNumber} className="text-sm">
                        <span className="font-medium">Row {row.rowNumber}:</span>
                        <ul className="list-disc list-inside ml-2 text-red-700">
                          {row.errors.map((error, idx) => (
                            <li key={idx}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {invalidRows.length > 10 && (
                    <p className="text-xs text-red-600 mt-2">
                      ... and {invalidRows.length - 10} more row(s) with errors
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Import Progress */}
          {isImporting && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-800">Importing...</span>
                <span className="text-sm text-blue-600">
                  {importProgress.current} / {importProgress.total}
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${importProgress.total ? (importProgress.current / importProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
        <div className="p-4 border-t flex justify-end gap-2 flex-shrink-0">
          <Button variant="outline" onClick={handleClose} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || parsedData.length === 0 || validRows.length === 0 || isImporting || !allLocationsMapped}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {importMode === 'update_or_create' ? 'Updating/Creating...' : 'Importing...'}
              </>
            ) : (
              <>
                {importMode === 'update_or_create' && matchResults ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {updatingRows.length > 0 && creatingRows.filter(r => r.errors.length === 0).length > 0
                      ? `Update ${updatingRows.length} & Create ${creatingRows.filter(r => r.errors.length === 0).length} Work Orders`
                      : updatingRows.length > 0
                        ? `Update ${updatingRows.length} Work Order(s)`
                        : `Create ${creatingRows.filter(r => r.errors.length === 0).length} Work Order(s)`
                    }
                  </>
                ) : importMode === 'update_or_create' ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Update or Create {validRows.length} Work Order(s)
                  </>
                ) : (
                  <>
                    Import {validRows.length} Work Order(s)
                  </>
                )}
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
