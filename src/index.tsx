import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import './index.css';
import App from './App';
import { BleProvider } from './context/BleProvider';
import { TreatmentProvider } from './context/TreatmentProvider';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <React.StrictMode>
    <MantineProvider defaultColorScheme="light">
      <BleProvider>
        <TreatmentProvider>
          <App />
        </TreatmentProvider>
      </BleProvider>
    </MantineProvider>
  </React.StrictMode>
);
