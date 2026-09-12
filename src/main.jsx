import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import App from './App.jsx';
import { capturePendingReferralFromUrl } from './lib/referrals';

// Before HashRouter takes over the URL -- ?ref=... lives in the real query
// string, ahead of the # it routes on.
capturePendingReferralFromUrl();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
