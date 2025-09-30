/// <reference types="react" />
/// <reference types="react-dom" />

declare module 'next/server' {
  export interface NextRequest {
    nextUrl: URL
    url: string
    method: string
    headers: Headers
    json(): Promise<any>
  }
  
  export class NextResponse {
    static json(data: any, init?: ResponseInit): NextResponse
    static redirect(url: string | URL): NextResponse
    static next(): NextResponse
  }
}

declare module 'firebase/firestore' {
  export interface DocumentData {
    [key: string]: any
  }
  
  export interface DocumentSnapshot {
    exists(): boolean
    data(): DocumentData | undefined
    id: string
  }
  
  export interface QuerySnapshot {
    docs: DocumentSnapshot[]
    empty: boolean
  }
  
  export function doc(db: any, collection: string, id: string): any
  export function getDoc(doc: any): Promise<DocumentSnapshot>
  export function updateDoc(doc: any, data: any): Promise<void>
  export function addDoc(collection: any, data: any): Promise<any>
  export function collection(db: any, collectionName: string): any
  export function getDocs(query: any): Promise<QuerySnapshot>
  export function query(collection: any, ...constraints: any[]): any
  export function where(field: string, op: string, value: any): any
  export function orderBy(field: string, direction?: string): any
  export function deleteDoc(doc: any): Promise<void>
  export function setDoc(doc: any, data: any, options?: any): Promise<void>
  export function onSnapshot(query: any, callback: (snapshot: QuerySnapshot) => void, errorCallback?: (error: any) => void): () => void
}

declare module 'lucide-react' {
  export const Search: any
  export const CheckCircle: any
  export const XCircle: any
  export const Eye: any
  export const Edit: any
  export const Trash2: any
  export const Plus: any
  export const Loader2: any
  export const TrendingUp: any
  export const Users: any
  export const Settings: any
  export const Building2: any
  export const Wrench: any
  export const FileText: any
  export const Receipt: any
  export const Calendar: any
  export const DollarSign: any
  export const MapPin: any
  export const Mail: any
  export const Phone: any
  export const User: any
  export const Building: any
  export const ArrowLeft: any
  export const Star: any
  export const Briefcase: any
  export const Lock: any
  export const Copy: any
  export const ExternalLink: any
  export const MoreHorizontal: any
  export const Download: any
  export const Send: any
  export const CalendarIcon: any
  export const Clock: any
  export const AlertCircle: any
  export const Check: any
  export const X: any
  export const ChevronDown: any
  export const ChevronUp: any
  export const Menu: any
  export const LogOut: any
  export const Home: any
  export const File: any
  export const CreditCard: any
  export const Bell: any
  export const BarChart3: any
  export const PieChart: any
  export const Activity: any
  export const Target: any
  export const TrendingDown: any
  export const Zap: any
  export const Shield: any
  export const Globe: any
  export const Database: any
  export const Server: any
  export const Cloud: any
  export const Code: any
  export const Terminal: any
  export const GitBranch: any
  export const GitCommit: any
  export const GitMerge: any
  export const GitPullRequest: any
  export const Github: any
  export const Gitlab: any
  export const Bitbucket: any
  export const Package: any
  export const Archive: any
  export const Folder: any
  export const FolderOpen: any
  export const FileText: any
  export const FileImage: any
  export const FileVideo: any
  export const FileAudio: any
  export const FileCode: any
  export const FileJson: any
  export const FileCsv: any
  export const FilePdf: any
  export const FileWord: any
  export const FileExcel: any
  export const FilePowerpoint: any
  export const FileArchive: any
  export const FileCheck: any
  export const FileMinus: any
  export const FilePlus: any
  export const FileX: any
  export const FileSearch: any
  export const FileEdit: any
  export const FileCopy: any
  export const FileMove: any
  export const FileShare: any
  export const FileLock: any
  export const FileUnlock: any
  export const FileHeart: any
  export const FileStar: any
  export const FileBookmark: any
  export const FileBookmarkCheck: any
  export const FileBookmarkMinus: any
  export const FileBookmarkPlus: any
  export const FileBookmarkX: any
  export const FileBookmarkSearch: any
  export const FileBookmarkEdit: any
  export const FileBookmarkCopy: any
  export const FileBookmarkMove: any
  export const FileBookmarkShare: any
  export const FileBookmarkLock: any
  export const FileBookmarkUnlock: any
  export const FileBookmarkHeart: any
  export const FileBookmarkStar: any
  export const MessageSquare: any
  export const MessageCircle: any
  export const ExternalLink: any
  export const Power: any
  export const CircleOff: any
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any
    }
  }
}
