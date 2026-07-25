import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, CloseIcon } from './icons';
import type { IntegrityReport } from '../utils/integrity';
import { getLastScanReport } from '../utils/integrity';
import { audioService } from '../services/audioService';

interface IntegrityReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The report from the most recent scan, or null to load from localStorage */
  report?: IntegrityReport | null;
}

const STATUS_OK = 'text-success';
const STATUS_WARN = 'text-warning';
const STATUS_ERR = 'text-error';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const IntegrityReportModal: React.FC<IntegrityReportModalProps> = ({
  isOpen,
  onClose,
  report: externalReport,
}) => {
  const [report, setReport] = useState<IntegrityReport | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReport(externalReport ?? getLastScanReport());
    }
  }, [isOpen, externalReport]);

  if (!isOpen) return null;

  const handleClose = () => {
    audioService.playClick();
    onClose();
  };

  const rows = report
    ? [
        { label: 'Files Scanned', value: report.scanned, status: STATUS_OK },
        { label: 'Files Created', value: report.created, status: report.created > 0 ? STATUS_WARN : STATUS_OK },
        { label: 'Files Repaired', value: report.repaired, status: report.repaired > 0 ? STATUS_WARN : STATUS_OK },
        { label: 'Files Skipped', value: report.skipped, status: report.skipped > 0 ? STATUS_ERR : STATUS_OK },
        { label: 'Errors', value: report.errors, status: report.errors > 0 ? STATUS_ERR : STATUS_OK },
        { label: 'Gallery Items', value: report.galleryItems, status: STATUS_OK },
        { label: 'Duration', value: formatDuration(report.duration), status: STATUS_OK },
      ]
    : [];

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-base-200 border border-white/10 p-6 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <CheckIcon className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-black uppercase tracking-widest">
              Integrity Report
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="opacity-40 hover:opacity-100 transition-opacity"
            aria-label="Close"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {!report && (
          <p className="text-xs text-base-content/50 font-mono">
            No scan results available. Run a vault sync from Settings &gt; App.
          </p>
        )}

        {report && (
          <>
            {/* Timestamp */}
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-base-content/30 mb-4">
              Last scan: {formatTime(report.timestamp)}
            </p>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="border border-white/5 bg-base-300/30 p-3"
                >
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-base-content/40 mb-1">
                    {row.label}
                  </p>
                  <p className={`text-lg font-black font-mono ${row.status}`}>
                    {row.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Status summary */}
            <div className="flex items-center gap-2 text-xs font-mono text-base-content/60 border-t border-white/5 pt-4">
              {report.errors === 0 && report.skipped === 0 ? (
                <>
                  <CheckIcon className="w-3.5 h-3.5 text-success" />
                  <span className="text-success font-bold uppercase tracking-wider">
                    Vault integrity verified
                  </span>
                </>
              ) : (
                <span className="text-warning font-bold uppercase tracking-wider">
                  {report.errors} issue{report.errors !== 1 ? 's' : ''} found
                </span>
              )}
            </div>
          </>
        )}

        {/* Close button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleClose}
            className="form-btn text-xs px-5 py-1.5 font-mono font-bold uppercase tracking-wider"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
