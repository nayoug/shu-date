(function() {
  const trigger = document.getElementById('devToolsTrigger');
  const panel = document.getElementById('devToolsPanel');
  const closeButton = panel ? panel.querySelector('.dev-tools-close') : null;
  const app = document.getElementById('app');

  if (!trigger || !panel) return;

  function setOpen(isOpen) {
    panel.classList.toggle('show', isOpen);
    panel.setAttribute('aria-hidden', String(!isOpen));
    trigger.setAttribute('aria-expanded', String(isOpen));
    trigger.setAttribute('aria-label', isOpen ? '关闭开发者工具' : '打开开发者工具');

    if (isOpen) {
      const input = panel.querySelector('.dev-input');
      if (input && window.matchMedia && window.matchMedia('(min-width: 640px)').matches) {
        input.focus();
      }
    }
  }

  function isOpen() {
    return panel.classList.contains('show');
  }

  trigger.addEventListener('click', function() {
    setOpen(!isOpen());
  });

  if (closeButton) {
    closeButton.addEventListener('click', function() {
      setOpen(false);
      trigger.focus();
    });
  }

  document.addEventListener('click', function(e) {
    if (!isOpen()) return;
    if (panel.contains(e.target) || trigger.contains(e.target)) return;
    setOpen(false);
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isOpen()) {
      setOpen(false);
      trigger.focus();
    }
  });

  if (app && window.MutationObserver) {
    const observer = new MutationObserver(function() {
      if (app.classList.contains('drawer-open')) {
        setOpen(false);
      }
    });
    observer.observe(app, { attributes: true, attributeFilter: ['class'] });
  }
})();
