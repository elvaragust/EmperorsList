import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from '@/app/App';
import { startUpdates } from '@/app/updates';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import '@/theme/app.css';
import { applyAppearance } from '@/theme/appearance';

applyAppearance();

startUpdates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary root>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
