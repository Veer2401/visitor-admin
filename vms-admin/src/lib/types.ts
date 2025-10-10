import { Timestamp, FieldValue } from 'firebase/firestore';

export interface Visit {
  id?: string;
  checkInTime?: Timestamp | FieldValue | Date | null;
  checkOutTime?: Timestamp | FieldValue | Date | null;
  createdAt?: Timestamp | FieldValue | Date | null;
  createdBy?: string;
  date?: Timestamp | FieldValue | Date | null;
  patientName?: string;
  status?: 'checked_in' | 'checked_out';
  updatedAt?: Timestamp | FieldValue | Date | null;
  visitorMobile?: string;
  visitorName?: string;
  signInMethod?: 'google' | 'manual';
  userId?: string; // Firebase Auth user ID
  userEmail?: string; // Firebase Auth user email
}

export interface Visitor {
  id?: string;
  visitorName: string;
  visitorMobile: string;
  patientName?: string;
  status: 'checked_in' | 'checked_out';
  branchId: string;
  visitorId?: string; // Firebase Auth user ID for the visitor
  checkInTime?: Timestamp | FieldValue | Date | null;
  checkOutTime?: Timestamp | FieldValue | Date | null;
  createdAt?: Timestamp | FieldValue | Date | null;
  updatedAt?: Timestamp | FieldValue | Date | null;
  createdBy?: string; // Staff member who created the record
}

export interface VisitFormData {
  patientName: string;
  visitorName: string;
  visitorMobile: string;
  createdBy: string;
  status: 'checked_in' | 'checked_out';
}

export interface FirestoreTimestamp {
  toDate(): Date;
}

export type TimestampField = Timestamp | FirestoreTimestamp | FieldValue | Date | null | undefined;
