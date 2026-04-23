(function() {
  function getLoginMethodTabs() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-login-method-target]'));
  }

  function setLoginMethod(method) {
    getLoginMethodTabs().forEach(function(tab) {
      var isActive = tab.getAttribute('data-login-method-target') === method;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    document.querySelectorAll('[data-login-method-panel]').forEach(function(form) {
      var isActive = form.getAttribute('data-login-method-panel') === method;
      form.classList.toggle('active', isActive);
      form.toggleAttribute('hidden', !isActive);
      form.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });
  }

  function moveFocusToLoginMethod(currentTab, direction) {
    var tabs = getLoginMethodTabs();
    var currentIndex = tabs.indexOf(currentTab);

    if (currentIndex === -1 || tabs.length === 0) return;

    var nextIndex = currentIndex + direction;
    if (nextIndex < 0) {
      nextIndex = tabs.length - 1;
    } else if (nextIndex >= tabs.length) {
      nextIndex = 0;
    }

    var nextTab = tabs[nextIndex];
    setLoginMethod(nextTab.getAttribute('data-login-method-target'));
    nextTab.focus();
  }

  document.addEventListener('click', function(event) {
    var tab = event.target.closest('[data-login-method-target]');
    if (!tab) return;
    setLoginMethod(tab.getAttribute('data-login-method-target'));
  });

  document.addEventListener('keydown', function(event) {
    var tab = event.target.closest('[data-login-method-target]');
    var tabs;

    if (!tab) return;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveFocusToLoginMethod(tab, 1);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveFocusToLoginMethod(tab, -1);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      tabs = getLoginMethodTabs();
      if (tabs.length === 0) return;

      event.preventDefault();
      tab = event.key === 'Home' ? tabs[0] : tabs[tabs.length - 1];
      setLoginMethod(tab.getAttribute('data-login-method-target'));
      tab.focus();
    }
  });

  document.addEventListener('DOMContentLoaded', function() {
    var activeTab = document.querySelector('[data-login-method-target].active');
    if (activeTab) {
      setLoginMethod(activeTab.getAttribute('data-login-method-target'));
    }
  });
})();
