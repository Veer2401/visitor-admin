import { Timestamp, FieldValue } from 'firebase/firestore';

export interface Visit {
  id?: string;
  checkInTime?: Timestamp | FieldValue | Date | null;
  checkOutTime?: Timestamp | FieldValue | Date | null;
  createdAt?: Timestamp | FieldValue | Date | null;
  createdBy?: string; // User UID for security rules
  createdByEmail?: string; // Email for display purposes
  date?: Timestamp | FieldValue | Date | null;
  patientName?: string;
  status?: 'checked_in' | 'checked_out';
  updatedAt?: Timestamp | FieldValue | Date | null;
  visitorMobile?: string;
  visitorName?: string;
  signInMethod?: 'google' | 'manual';
  userId?: string; // Firebase Auth user ID
  userEmail?: string; // Firebase Auth user email
  visitDetails?: string; // Purpose of visit or details
  attendedBy?: string; // Name of staff member attending the visit
  attendedAt?: Timestamp | FieldValue | Date | null; // When staff was assigned
  assignedDoctor?: string; // Name of doctor assigned for the visit
  assignedDoctorAt?: Timestamp | FieldValue | Date | null; // When doctor was assigned
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

export interface Enquiry {
  id?: string;
  enquirerName?: string;
  enquirerMobile?: string;
  patientName?: string;
  enquiryDetails?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  createdAt?: Timestamp | FieldValue | Date | null;
  updatedAt?: Timestamp | FieldValue | Date | null;
  createdBy?: string; // User UID for security rules
  createdByEmail?: string; // Email for display purposes
  _manualEntry?: boolean;
  userId?: string;
  userEmail?: string;
  reminderScheduledAt?: Timestamp | FieldValue | Date | null;
  reminderDuration?: number; // in hours (24, 72, 120)
  originalStatus?: 'in_progress' | 'completed' | 'cancelled'; // status before reminder
  pendingSince?: Timestamp | FieldValue | Date | null; // when the enquiry became pending
  lastNotificationShown?: Timestamp | FieldValue | Date | null; // when the last 72h notification was shown
  assignedStaff?: string; // Name of assigned staff member
}

export interface EnquiryFormData {
  enquirerName: string;
  enquirerMobile: string;
  patientName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  createdBy: string;
}

export interface Doctor {
  id?: string;
  doctorName: string;
  createdAt?: Timestamp | FieldValue | Date | null;
  updatedAt?: Timestamp | FieldValue | Date | null;
  createdBy?: string; // User UID for security rules
  userId?: string; // Firebase Auth user ID
  userEmail?: string; // Firebase Auth user email
}

export interface Staff {
  id?: string;
  staffName: string;
  createdAt?: Timestamp | FieldValue | Date | null;
  updatedAt?: Timestamp | FieldValue | Date | null;
  createdBy?: string; // User UID for security rules
  userId?: string; // Firebase Auth user ID
  userEmail?: string; // Firebase Auth user email
}
