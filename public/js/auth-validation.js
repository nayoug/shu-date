(function() {
  var SHU_EMAIL_RE = /^[a-z0-9._%+-]+@shu\.edu\.cn$/;
  var EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  var nextErrorId = 0;

  function getFieldLabel(field) {
    var label;

    if (field.labels && field.labels.length > 0) {
      label = field.labels[0];
    }

    return field.getAttribute('aria-label') ||
      (label ? label.textContent.trim() : '') ||
      field.getAttribute('placeholder') ||
      field.name ||
      '该字段';
  }

  function ensureErrorElement(field) {
    var group = field.closest('.form-group') || field.parentElement;
    var id = field.id || field.getAttribute('data-auth-error-id');
    var errorId = id + '-error';
    var error = document.getElementById(errorId);
    var describedBy;

    if (!id) {
      nextErrorId += 1;
      id = 'auth-field-' + nextErrorId;
      field.setAttribute('data-auth-error-id', id);
      errorId = id + '-error';
      error = null;
    }

    if (!error) {
      error = document.createElement('p');
      error.id = errorId;
      error.className = 'auth-field-error';
      error.setAttribute('role', 'alert');
      error.hidden = true;
      if (group) {
        group.appendChild(error);
      } else {
        field.insertAdjacentElement('afterend', error);
      }
    }

    describedBy = field.getAttribute('aria-describedby') || '';
    if (!describedBy.split(/\s+/).includes(errorId)) {
      field.setAttribute('aria-describedby', (describedBy + ' ' + errorId).trim());
    }

    return error;
  }

  function getMatchedField(form, field) {
    var targetName = field.getAttribute('data-auth-match');
    if (!targetName) return null;
    return form.querySelector('[name="' + targetName + '"]');
  }

  function validateField(form, field) {
    var type = field.getAttribute('data-auth-field');
    var value = type === 'password' || type === 'login-password' || type === 'confirm-password'
      ? field.value
      : field.value.trim();
    var label = getFieldLabel(field);
    var matchedField;

    if (!type) return '';

    if (!value) {
      return '请填写' + label;
    }

    if (type === 'email' && !EMAIL_RE.test(value)) {
      return '请输入有效的邮箱地址';
    }

    if (type === 'shu-email' && !SHU_EMAIL_RE.test(value.toLowerCase())) {
      return '请输入 @shu.edu.cn 结尾的学校邮箱';
    }

    if (type === 'password' && value.length < 6) {
      return '密码长度至少6位';
    }

    if (type === 'confirm-password') {
      matchedField = getMatchedField(form, field);
      if (matchedField && value !== matchedField.value) {
        return '两次输入的密码不一致';
      }
    }

    return '';
  }

  function setFieldError(field, message) {
    var group = field.closest('.form-group');
    var error = ensureErrorElement(field);

    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    field.setCustomValidity(message);
    if (group) {
      group.classList.toggle('form-group--invalid', Boolean(message));
    }

    error.textContent = message;
    error.hidden = !message;
  }

  function validateForm(form) {
    var firstInvalid = null;
    var fields = Array.prototype.slice.call(form.querySelectorAll('[data-auth-field]'));

    fields.forEach(function(field) {
      var message = validateField(form, field);
      setFieldError(field, message);
      if (message && !firstInvalid) {
        firstInvalid = field;
      }
    });

    return firstInvalid;
  }

  function bindForm(form) {
    var submitted = false;
    var fields = Array.prototype.slice.call(form.querySelectorAll('[data-auth-field]'));

    form.noValidate = true;

    fields.forEach(function(field) {
      var validate = function() {
        var message = validateField(form, field);
        setFieldError(field, message);

        if (field.getAttribute('data-auth-field') === 'password') {
          form.querySelectorAll('[data-auth-field="confirm-password"]').forEach(function(confirmField) {
            if (confirmField.value || submitted) {
              setFieldError(confirmField, validateField(form, confirmField));
            }
          });
        }
      };

      ensureErrorElement(field);
      field.addEventListener('blur', function() {
        validate();
      });
      field.addEventListener('input', function() {
        if (submitted || field.getAttribute('aria-invalid') === 'true') {
          validate();
        }
      });
    });

    form.addEventListener('submit', function(event) {
      var firstInvalid;
      submitted = true;
      firstInvalid = validateForm(form);
      if (!firstInvalid) return;

      event.preventDefault();
      firstInvalid.focus();
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('form[data-auth-validation]').forEach(bindForm);
  });
})();
