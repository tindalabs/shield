import { ContentProtector } from 'content-security-toolkit';

// Initialize with default options
const protector = new ContentProtector();

// Apply all protections
protector.protect();

// Later, if needed, remove protections
// protector.unprotect();