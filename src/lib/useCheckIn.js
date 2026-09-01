import { useContext } from 'react';
import { CheckInContext } from './CheckInContext';

// Reads the shared check-in state from CheckInProvider. Call sites are unchanged.
export function useCheckIn() {
  const ctx = useContext(CheckInContext);
  if (!ctx) throw new Error('useCheckIn must be used inside CheckInProvider');
  return ctx;
}
