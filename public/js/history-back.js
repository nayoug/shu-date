(function() {
  function initHistoryBack() {
    document.addEventListener('click', function(event) {
      var trigger = event.target.closest('[data-history-back]');
      if (!trigger) return;

      event.preventDefault();
      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.assign('/');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHistoryBack, { once: true });
  } else {
    initHistoryBack();
  }
})();
