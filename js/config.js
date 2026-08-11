"use strict";

window.TaskTrackerConfig = Object.freeze({
  supabaseUrl: "https://jxbtvavfqrdnzpahilbz.supabase.co",

  supabasePublishableKey:
    "sb_publishable_pkXyWVHEh7ZvP6byaX047Q_JcEVWcCh",

  sessionStorageKey:
    "task_tracker_employee_session_token"
});

(() => {
  function addFeedbackLink() {
    const page = location.pathname.split('/').pop() || 'index.html';
    if (page === 'feedback.html' || document.querySelector('[data-tasktracker-feedback]')) return;

    const link = document.createElement('a');
    link.href = `feedback.html?from=${encodeURIComponent(page)}`;
    link.textContent = 'Feedback';
    link.dataset.tasktrackerFeedback = '1';
    link.style.textDecoration = 'none';

    const topActions = document.querySelector('.top-actions');
    if (topActions) {
      link.className = 'secondary';
      link.style.color = 'inherit';
      topActions.appendChild(link);
      return;
    }

    const topbar = document.querySelector('.topbar');
    if (topbar) {
      const existingRight = Array.from(topbar.children).filter(el => el.tagName === 'A' || el.tagName === 'BUTTON').pop();
      link.className = existingRight?.className || 'secondary';
      link.style.color = 'inherit';
      if (existingRight) existingRight.insertAdjacentElement('beforebegin', link);
      else topbar.appendChild(link);
      return;
    }

    const top = document.querySelector('.top');
    if (top) {
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '8px';
      actions.style.alignItems = 'center';
      actions.style.flexWrap = 'wrap';
      Array.from(top.children).slice(1).forEach(el => actions.appendChild(el));
      link.className = 'ghost';
      actions.insertBefore(link, actions.firstChild);
      top.appendChild(actions);
      return;
    }

    const shell = document.querySelector('.shell');
    if (shell) {
      link.className = 'secondary';
      link.style.position = 'fixed';
      link.style.top = '16px';
      link.style.right = '16px';
      link.style.zIndex = '1000';
      shell.appendChild(link);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addFeedbackLink);
  else addFeedbackLink();
})();
