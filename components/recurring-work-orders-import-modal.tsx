'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface ParsedRow {
  restaurant: string;
  serviceType: string;
  lastServiced: string;
  nextServiceDates: string[];
  frequencyLabel: string;
  scheduling: string;
  notes: string;
  rowNumber: number;
  errors: string[];
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setParsedData(rows);
      
      const validRows = rows.filter(r => r.errors.length === 0);
      const invalidRows = rows.filter(r => r.errors.length > 0);
      
      if (validRows.length === 0) {
        toast.error('No valid rows found in the file');
      } else if (invalidRows.length > 0) {
        toast.warning(`Found ${validRows.length} valid rows and ${invalidRows.length} rows with errors`);
      } else {
        toast.success(`Successfully parsed ${validRows.length} rows`);
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
              const frequencyIdx = headers.findIndex(h => h.toUpperCase().includes('FREQUENCY'));
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
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (data.length < 2) {
        throw new Error('Excel file must have at least a header row and one data row');
      }

      // First row is headers
      const headers = data[0] as string[];
      
      // Find column indices
      const restaurantIdx = headers.findIndex(h => h.toUpperCase().includes('RESTAURANT'));
      const serviceTypeIdx = headers.findIndex(h => h.toUpperCase().includes('SERVICE TYPE'));
      const lastServicedIdx = headers.findIndex(h => h.toUpperCase().includes('LAST SERVICED'));
      const frequencyIdx = headers.findIndex(h => h.toUpperCase().includes('FREQUENCY'));
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

      // Convert to CSV-like format
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
      if (!serviceType) {
        errors.push('SERVICE TYPE is required');
      }

      // Get LAST SERVICED
      let lastServiced = '';
      if (row._lastServicedIdx >= 0 && row._rowArray) {
        lastServiced = (row._rowArray[row._lastServicedIdx] || '').toString().trim();
      } else {
        lastServiced = (row['LAST SERVICED'] || row['Last Serviced'] || '').toString().trim();
      }

      // Get NEXT SERVICE NEEDED BY (5 columns)
      // Use indexed access if available (from improved parsing)
      const nextServiceDates: string[] = [];
      
      if (row._nextServiceIndices && row._rowArray) {
        // Use indexed access for accurate column mapping
        row._nextServiceIndices.forEach((idx: number) => {
          if (idx >= 0 && idx < row._rowArray.length) {
            const value = (row._rowArray[idx] || '').toString().trim();
            if (value) {
              nextServiceDates.push(value);
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
          const value = (row[colName] || '').toString().trim();
          if (value) {
            nextServiceDates.push(value);
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
      if (!frequencyLabel) {
        errors.push('FREQUENCY LABEL is required');
      } else if (!['SEMIANNUALLY', 'QUARTERLY', 'MONTHLY', 'BI-WEEKLY', 'WEEKLY'].includes(frequencyLabel)) {
        errors.push(`Invalid FREQUENCY LABEL: ${frequencyLabel}. Must be one of: SEMIANNUALLY, QUARTERLY, MONTHLY, BI-WEEKLY, WEEKLY`);
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

  const handleImport = async () => {
    const validRows = parsedData.filter(r => r.errors.length === 0);
    
    if (validRows.length === 0) {
      toast.error('No valid rows to import. Please fix errors first.');
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: validRows.length });

    try {
      const { auth } = await import('@/lib/firebase');
      
      if (!auth.currentUser) {
        toast.error('You must be logged in');
        setIsImporting(false);
        return;
      }

      const idToken = await auth.currentUser.getIdToken();

      const response = await fetch('/api/recurring-work-orders/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          rows: validRows.map(row => ({
            restaurant: row.restaurant,
            serviceType: row.serviceType,
            lastServiced: row.lastServiced,
            nextServiceDates: row.nextServiceDates,
            frequencyLabel: row.frequencyLabel,
            scheduling: row.scheduling,
            notes: row.notes,
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Import failed');
      }

      toast.success(`Successfully imported ${result.created} recurring work order(s)`);
      if (result.errors && result.errors.length > 0) {
        console.warn('Import errors:', result.errors);
        toast.warning(`${result.errors.length} row(s) failed to import`);
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const validRows = parsedData.filter(r => r.errors.length === 0);
  const invalidRows = parsedData.filter(r => r.errors.length > 0);

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

          {/* Preview Section */}
          {parsedData.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Preview</h3>
                <div className="flex items-center gap-4 text-sm">
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

              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 text-left border-b">Row</th>
                      <th className="p-2 text-left border-b">Restaurant</th>
                      <th className="p-2 text-left border-b">Service Type</th>
                      <th className="p-2 text-left border-b">Frequency</th>
                      <th className="p-2 text-left border-b">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 20).map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={row.errors.length > 0 ? 'bg-red-50' : 'hover:bg-gray-50'}
                      >
                        <td className="p-2 border-b">{row.rowNumber}</td>
                        <td className="p-2 border-b">{row.restaurant || '-'}</td>
                        <td className="p-2 border-b">{row.serviceType || '-'}</td>
                        <td className="p-2 border-b">{row.frequencyLabel || '-'}</td>
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
                {parsedData.length > 20 && (
                  <div className="p-2 text-center text-sm text-gray-500">
                    Showing first 20 rows. Total: {parsedData.length} rows
                  </div>
                )}
              </div>

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
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{
                    width: `${(importProgress.current / importProgress.total) * 100}%`,
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
            disabled={!file || parsedData.length === 0 || validRows.length === 0 || isImporting}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                Import {validRows.length} Work Order(s)
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
