// Metadata-only references. AAMI/IEEE/ISO/IEC standards are copyrighted and
// paywalled - their text is never fetched, stored, or embedded here. This is
// just enough to point a design engineer at what to verify against.
const STANDARDS = [
  { standard: "IEC 60601-1", title: "Medical electrical equipment - General requirements for basic safety and essential performance", publisher: "IEC" },
  { standard: "IEC 60601-1-11", title: "Requirements for medical electrical equipment used in the home healthcare environment", publisher: "IEC" },
  { standard: "IEC 62304", title: "Medical device software - Software life cycle processes", publisher: "IEC" },
  { standard: "IEC 62366-1", title: "Application of usability engineering to medical devices", publisher: "IEC/AAMI" },
  { standard: "ISO 14971", title: "Medical devices - Application of risk management to medical devices", publisher: "ISO" },
  { standard: "ISO 13485", title: "Medical devices - Quality management systems - Requirements for regulatory purposes", publisher: "ISO" },
  { standard: "ISO 10993-1", title: "Biological evaluation of medical devices - Evaluation and testing within a risk management process", publisher: "ISO" },
  { standard: "IEEE 11073", title: "Health informatics - Point-of-care medical device communication (family of standards)", publisher: "IEEE" },
  { standard: "AAMI TIR57", title: "Principles for medical device security - Risk management", publisher: "AAMI" }
];

export function getRelevantStandards() {
  return STANDARDS;
}
