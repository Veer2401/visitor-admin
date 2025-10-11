"use client";

import React from 'react';
import Link from 'next/link';
import type { Enquiry } from '../lib/types';

interface PendingEnquiryAlertProps {
  enquiries: Enquiry[];
  onClose: () => void;
}

export default function PendingEnquiryAlert({ enquiries, onClose }: PendingEnquiryAlertProps) {
  if (enquiries.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-orange-500 to-red-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="w-6 h-6 text-white mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <h3 className="text-lg font-bold text-white">Pending Enquiry Alert</h3>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <p className="text-gray-700 mb-4">
            {enquiries.length === 1 
              ? 'Note: You will be notified about this enquiry after 72 hours again since its pending'
              : `Note: You will be notified about these ${enquiries.length} enquiries after 72 hours again since they are pending`
            }
          </p>

          <div className="space-y-3 max-h-60 overflow-y-auto">
            {enquiries.map((enquiry) => (
              <div key={enquiry.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">
                      Patient: {enquiry.patientName || 'N/A'}
                    </h4>
                    <p className="text-sm text-gray-600 mb-1">
                      Visitor: {enquiry.enquirerName || 'N/A'}
                    </p>
                    <p className="text-xs text-gray-500">
                      Pending since: {
                        enquiry.pendingSince && typeof enquiry.pendingSince === 'object' && 'toDate' in enquiry.pendingSince
                          ? enquiry.pendingSince.toDate().toLocaleString()
                          : enquiry.pendingSince instanceof Date
                          ? enquiry.pendingSince.toLocaleString()
                          : enquiry.createdAt && typeof enquiry.createdAt === 'object' && 'toDate' in enquiry.createdAt
                          ? enquiry.createdAt.toDate().toLocaleString()
                          : enquiry.createdAt instanceof Date
                          ? enquiry.createdAt.toLocaleString()
                          : 'Unknown'
                      }
                    </p>
                  </div>
                  <Link
                    href={`/admin/enquiries/details?id=${enquiry.id}`}
                    onClick={onClose}
                    className="ml-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors duration-200"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="bg-gray-600 hover:bg-gray-700 text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200"
            >
              Dismiss
            </button>
            <Link
              href="/admin/enquiries"
              onClick={onClose}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200"
            >
              View All Enquiries
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}