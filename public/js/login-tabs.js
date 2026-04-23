(function() {
  function setLoginMethod(method) {
    document.querySelectorAll('[data-login-method-target]').forEach(function(tab) {
      var isActive = tab.getAttribute('data-login-method-target') === method;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    document.querySelectorAll('[data-login-method-panel]').forEach(function(form) {
      form.classList.toggle('active', form.getAttribute('data-login-method-panel') === method);
    });
  }

  document.addEventListener('click', function(event) {
    var tab = event.target.closest('[data-login-method-target]');
    if (!tab) return;
    setLoginMethod(tab.getAttribute('data-login-method-target'));
  });

  document.addEventListener('DOMContentLoaded', function() {
    var activeTab = document.querySelector('[data-login-method-target].active');
    if (activeTab) {
      setLoginMethod(activeTab.getAttribute('data-login-method-target'));
    }
  });
})();
