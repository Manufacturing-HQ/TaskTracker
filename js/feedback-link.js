"use strict";
(() => {
  if (document.querySelector('a[data-tasktracker-feedback]')) return;
  const from = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
  const link = document.createElement('a');
  link.href = `feedback.html?from=${from}`;
  link.textContent = 'Feedback';
  link.dataset.tasktrackerFeedback = '1';
  link.style.textDecoration = 'none';

  const candidates = [
    document.querySelector('.top-actions'),
    document.querySelector('.top'),
    document.querySelector('.topbar'),
    document.querySelector('.section-title'),
    document.querySelector('header')
  ].filter(Boolean);

  const host = candidates[0];
  if (!host) return;

  link.className = host.classList.contains('top-actions') ? 'secondary' : 'ghost';
  if (host.classList.contains('top-actions')) {
    link.style.color = 'inherit';
  } else {
    link.style.display = 'inline-block';
    link.style.marginLeft = '8px';
  }
  host.appendChild(link);
})();