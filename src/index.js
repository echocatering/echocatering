import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';

// The load splash lives in public/index.html so it paints before this bundle arrives.
// It has to be dismissed from here rather than from an inline script in that file: the
// server sends script-src 'self', which blocks inline execution outright.
const hideLoadSplash = (() => {
  let hidden = false;
  return () => {
    const splash = document.getElementById('app-splash');
    if (hidden || !splash) return;
    hidden = true;
    splash.classList.add('is-hidden');
    // Outlast the 300ms fade before taking it out of the document.
    window.setTimeout(() => splash.remove(), 350);
  };
})();

if (document.readyState === 'complete') {
  hideLoadSplash();
} else {
  window.addEventListener('load', hideLoadSplash);
}
// A stalled asset — a background video, a slow font — can hold the load event open for
// a long time. Never leave the viewer stuck behind the splash waiting for one.
window.setTimeout(hideLoadSplash, 8000);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
    <App />
    </BrowserRouter>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
