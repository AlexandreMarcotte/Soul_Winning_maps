import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

const container = document.getElementById('root');
if (!container) throw new Error('No #root in index.html');
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
