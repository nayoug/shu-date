(function () {
            var checkboxes = document.querySelectorAll('input[name="accepted_campus"]');
            var groupRequiredField = document.getElementById('acceptedCampusGroupRequired');
            if (!groupRequiredField || !checkboxes.length) return;

            function updateAcceptedCampusValidity() {
              var anyChecked = false;
              for (var i = 0; i < checkboxes.length; i++) {
                if (checkboxes[i].checked) {
                  anyChecked = true;
                  break;
                }
              }
              if (anyChecked) {
                groupRequiredField.value = '1';
                groupRequiredField.setCustomValidity('');
              } else {
                groupRequiredField.value = '';
                groupRequiredField.setCustomValidity('请至少选择一个可接受校区');
              }
            }

            for (var i = 0; i < checkboxes.length; i++) {
              checkboxes[i].addEventListener('change', updateAcceptedCampusValidity);
            }

            updateAcceptedCampusValidity();
          })();

function toggleNote(trigger) {
  const content = trigger.nextElementSibling;
  if (!content) return;
  const arrow = trigger.querySelector('.arrow');
  const shouldExpand = content.hidden;
  content.hidden = !shouldExpand;
  trigger.setAttribute('aria-expanded', String(shouldExpand));
  if (arrow) {
    arrow.style.transform = shouldExpand ? 'rotate(180deg)' : 'rotate(0deg)';
  }
}

function updateMyAgeDisplay() {
  const s = document.getElementById('myAge');
  document.getElementById('myAgeValue').textContent = s.value + ' 岁';
}

function updateAgeRangeDisplay(changedSlider) {
  const minS = document.getElementById('ageMin');
  const maxS = document.getElementById('ageMax');
  let minVal = +minS.value, maxVal = +maxS.value;
  const activeSlider = changedSlider || document.activeElement;
  if (minVal > maxVal) {
    if (activeSlider === maxS) {
      minS.value = maxVal;
      minVal = maxVal;
    } else {
      maxS.value = minVal;
      maxVal = minVal;
    }
  }
  document.getElementById('ageMinValue').textContent = '最小 ' + minVal + ' 岁';
  document.getElementById('ageMaxValue').textContent = '最大 ' + maxVal + ' 岁';
}

function updateMyHeightDisplay() {
  const s = document.getElementById('myHeight');
  document.getElementById('myHeightValue').textContent = s.value + ' cm';
}

function updatePreferredHeightDisplay(changedSlider) {
  const minSlider = document.getElementById('preferredHeightMin');
  const maxSlider = document.getElementById('preferredHeightMax');
  let minVal = parseInt(minSlider.value);
  let maxVal = parseInt(maxSlider.value);
  const activeSlider = changedSlider || document.activeElement;

  if (minVal > maxVal) {
    if (activeSlider === maxSlider) {
      minSlider.value = maxVal;
      minVal = maxVal;
    } else {
      maxSlider.value = minVal;
      maxVal = minVal;
    }
  }

  document.getElementById('preferredHeightMinValue').textContent = '最低 ' + minVal + ' cm';
  document.getElementById('preferredHeightMaxValue').textContent = '最高 ' + maxVal + ' cm';
}

function updateTagCounter(name, counterId, max = 5) {
  const checkboxes = document.querySelectorAll(`input[name="${name}"]`);
  const checked = document.querySelectorAll(`input[name="${name}"]:checked`);
  const count = checked.length;

  document.getElementById(counterId).textContent = `最多选 ${max} 项，已选 ${count} 项`;

  checkboxes.forEach(cb => {
    const tag = cb.closest('.interest-tag');
    if (!tag) return;
    tag.classList.toggle('selected', cb.checked);
    tag.classList.toggle('checked', cb.checked);
  });

  if (count >= max) {
    document.querySelectorAll(`input[name="${name}"]:not(:checked)`).forEach(cb => cb.disabled = true);
  } else {
    checkboxes.forEach(cb => cb.disabled = false);
  }
}

function updateMyTraitsCounter()      { updateTagCounter('my_traits',      'myTraitsCounter'); }
function updatePartnerTraitsCounter() { updateTagCounter('partner_traits',  'partnerTraitsCounter'); }
function updateInterestCounter()      { updateTagCounter('interests',       'interestCounter'); }
function updateCoreTraitsCounter() {
  updateTagCounter('core_traits', 'coreTraitsCounter', 3);
  const groupRequiredField = document.getElementById('coreTraitsGroupRequired');
  if (!groupRequiredField) return;

  const checkedCount = document.querySelectorAll('input[name="core_traits"]:checked').length;
  if (checkedCount > 0) {
    groupRequiredField.value = '1';
    groupRequiredField.setCustomValidity('');
  } else {
    groupRequiredField.value = '';
    groupRequiredField.setCustomValidity('请至少选择一个核心特质');
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
  const surveyForm = document.querySelector('form[action="/survey/submit"]');
  if (!surveyForm) return;

  updateMyAgeDisplay();
  updateAgeRangeDisplay();
  updateMyHeightDisplay();
  updatePreferredHeightDisplay();
  updateInterestCounter();
  updateMyTraitsCounter();
  updatePartnerTraitsCounter();
  //updateQuotaDisplay();
  updateCoreTraitsCounter();

  document.querySelectorAll('.collapsible-trigger[data-profile-action="toggle-note"]').forEach(trigger => {
    const content = trigger.nextElementSibling;
    if (content) {
      trigger.setAttribute('aria-expanded', String(!content.hidden));
    }
    trigger.addEventListener('click', function() {
      toggleNote(trigger);
    });
    trigger.addEventListener('keydown', function(event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggleNote(trigger);
    });
  });

  const bindRangeInput = function(id, handler) {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', function() {
      handler(input);
    });
  };
  bindRangeInput('myAge', updateMyAgeDisplay);
  bindRangeInput('ageMin', updateAgeRangeDisplay);
  bindRangeInput('ageMax', updateAgeRangeDisplay);
  bindRangeInput('myHeight', updateMyHeightDisplay);
  bindRangeInput('preferredHeightMin', updatePreferredHeightDisplay);
  bindRangeInput('preferredHeightMax', updatePreferredHeightDisplay);

  const checkboxCounterHandlers = {
    core_traits: updateCoreTraitsCounter,
    my_traits: updateMyTraitsCounter,
    partner_traits: updatePartnerTraitsCounter,
    interests: updateInterestCounter,
  };
  Object.entries(checkboxCounterHandlers).forEach(([name, handler]) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        handler();
        updatePagination();
      });
    });
  });

  // 为所有 required 的 select 绑定 change 事件，清除红框
  document.querySelectorAll('select[required]').forEach(select => {
    select.addEventListener('change', function() {
      const fg = this.closest('.form-group');
      if (fg) fg.classList.remove('form-group--error');
    });
  });

  // 选项框点击效果
  document.querySelectorAll('.option-group label').forEach(label => {
    const radio = label.querySelector('input[type="radio"]');
    if (radio.checked) {
      label.classList.add('selected');
    }
    label.addEventListener('click', function(e) {
      e.preventDefault();
      const radio = this.querySelector('input[type="radio"]');
      radio.checked = true;

      const group = this.closest('.option-group');
      group.querySelectorAll('label').forEach(l => l.classList.remove('selected'));
      this.classList.add('selected');

      // 移除该题红框
      const fg = this.closest('.form-group');
      if (fg) fg.classList.remove('form-group--error');

      // 触发验证更新
      updatePagination();
    });
  });

    // 5档程度选择 (-2到+2) 点击效果
    document.querySelectorAll('.scale-options-row').forEach(scaleRow => {
      scaleRow.querySelectorAll('.scale-option').forEach(option => {
        const radio = option.querySelector('input[type="radio"]');
        if (radio && radio.checked) {
          option.classList.add('selected');
        }
        option.addEventListener('click', function(e) {
          e.preventDefault();
          const radio = this.querySelector('input[type="radio"]');
          if (!radio) return;

          radio.checked = true;

          const row = this.closest('.scale-options-row');
          row.querySelectorAll('.scale-option').forEach(opt => opt.classList.remove('selected'));
          this.classList.add('selected');

          // 移除该题红框
          const fg = this.closest('.form-group');
          if (fg) fg.classList.remove('form-group--error');

          // 触发验证更新
          updatePagination();
        });
      });
    });

  // 多选框点击效果
  document.querySelectorAll('.checkbox-group-grid label, .checkbox-group label, .interest-tags label, .interest-tag').forEach(label => {
    // 跳过 scale-option（里面是radio不是checkbox）
    if (label.classList.contains('scale-option')) return;

    const checkbox = label.querySelector('input[type="checkbox"]');
    if (!checkbox) return;  // 没有checkbox的label直接跳过

    if (checkbox.checked) {
      label.classList.add('checked');
      label.classList.add('selected');
    }
    label.addEventListener('click', function() {
      const checkbox = this.querySelector('input[type="checkbox"]');
      if (!checkbox) return;
      if (checkbox.checked) {
        this.classList.add('checked');
        this.classList.add('selected');
        // 移除该题红框
        const fg = this.closest('.form-group');
        if (fg) fg.classList.remove('form-group--error');
      } else {
        this.classList.remove('checked');
        this.classList.remove('selected');
      }
      // 触发验证更新
      updatePagination();
    });
  });

  // 分页逻辑
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const submitBtn = document.getElementById('submitBtn');
  const steps = document.querySelectorAll('.pagination-step');
  const sections = document.querySelectorAll('.form-section-pagination');
  const totalSteps = Math.min(steps.length, sections.length);
  let currentStep = 1;
  const hasPaginationControls = Boolean(prevBtn && nextBtn && submitBtn && totalSteps > 0);

  document.addEventListener('click', function(e) {
    if (!e.target.closest('[data-theme-option]')) return;
    requestAnimationFrame(function() {
      refreshSliderTheme();
      updateMyAgeDisplay();
      updateAgeRangeDisplay();
      updateMyHeightDisplay();
      updatePreferredHeightDisplay();
    });
  });

  const themeMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function getStoredThemeSafe() {
    if (window.__themeSwitch && typeof window.__themeSwitch.getStoredTheme === 'function') {
      return window.__themeSwitch.getStoredTheme();
    }
    try {
      return localStorage.getItem('shu-theme');
    } catch (e) {
      return null;
    }
  }
  if (themeMedia && typeof themeMedia.addEventListener === 'function') {
    themeMedia.addEventListener('change', function() {
      if (!getStoredThemeSafe()) {
        refreshSliderTheme();
        updateMyAgeDisplay();
        updateAgeRangeDisplay();
        updateMyHeightDisplay();
        updatePreferredHeightDisplay();
      }
    });
  } else if (themeMedia && typeof themeMedia.addListener === 'function') {
    themeMedia.addListener(function() {
      if (!getStoredThemeSafe()) {
        refreshSliderTheme();
        updateMyAgeDisplay();
        updateAgeRangeDisplay();
        updateMyHeightDisplay();
        updatePreferredHeightDisplay();
      }
    });
  }

  function updatePagination() {
    if (!hasPaginationControls) return;

    // 更新步骤指示器
    steps.forEach((step, index) => {
      const stepNum = index + 1;
      step.classList.remove('active', 'completed');
      if (stepNum === currentStep) {
        step.classList.add('active');
      } else if (stepNum < currentStep) {
        step.classList.add('completed');
      }
    });

    // 显示/隐藏对应的表单部分
    sections.forEach(section => {
      const sectionStep = parseInt(section.getAttribute('data-step'));
      section.classList.toggle('active', sectionStep === currentStep);
    });

    // 仅在步骤发生变更时才跳转到每一页的顶端，避免在每次调用时打断用户填写
    if (typeof updatePagination.lastStep === 'undefined') {
      updatePagination.lastStep = currentStep;
    }
    if (updatePagination.lastStep !== currentStep) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      updatePagination.lastStep = currentStep;
    }

    // 更新按钮状态 - 始终显示按钮，通过disabled控制
    prevBtn.disabled = currentStep === 1;

    nextBtn.style.display = currentStep < totalSteps ? 'inline-block' : 'none';
    submitBtn.style.display = 'inline-block';

    // 下一步按钮始终可点击，点击时通过 validateCurrentStep() 提示用户
    nextBtn.disabled = false;
  }

  // 验证指定步骤的必填项（带提示）
  function validateStep(stepNumber, focusInvalid) {
    const currentSection = document.querySelector(`.form-section-pagination[data-step="${stepNumber}"]`);
    if (!currentSection) return { isValid: true, firstInvalid: null };

    let isValid = true;
    let firstInvalid = null;

    // 收集所有需检测的 input（radio[required] + 指定 checkbox 组的第一个 input）
    const checkboxGroupNames = ['accepted_campus', 'core_traits', 'my_traits', 'partner_traits', 'interests'];
    const seenNames = new Set();
    const orderedGroups = [];

    // 选择所有带 required 的 radio 和 select，以及指定名称的 checkbox 组
    const checkboxSelector = checkboxGroupNames.map(n => `input[name="${n}"]`).join(', ');
    const selector = 'input[type="radio"][required], select[required]' + (checkboxSelector ? ', ' + checkboxSelector : '');
    currentSection.querySelectorAll(selector).forEach(input => {
      const name = input.name;
      if (seenNames.has(name)) return;
      seenNames.add(name);
      const isSelect = input.tagName === 'SELECT';
      const group = isSelect
        ? [input]
        : currentSection.querySelectorAll(`input[name="${name}"]`);
      orderedGroups.push({ group, isSelect });
    });

    // 第4步特殊处理 lovetype：所有 lovetype_ 开头的 radio 组都是必填
    if (stepNumber === 4) {
      const lovetypeNames = [];
      currentSection.querySelectorAll('input[name^="lovetype_"]').forEach(input => {
        const name = input.name;
        if (!lovetypeNames.includes(name)) {
          lovetypeNames.push(name);
        }
      });
      lovetypeNames.forEach(name => {
        if (seenNames.has(name)) return;
        const group = currentSection.querySelectorAll(`input[name="${name}"]`);
        orderedGroups.push({ group, isSelect: false });
      });
    }
    // 检查每一组是否有选中的选项
    for (const { group, isSelect } of orderedGroups) {
      const checked = isSelect
        ? Array.from(group).every(i => i.value)
        : Array.from(group).some(i => i.checked);
      if (!checked) {
        isValid = false;
        if (!firstInvalid) firstInvalid = group[0];
      }
    }

    // 非 radio/checkbox 的 required 字段
    for (const field of currentSection.querySelectorAll('[required]')) {
      if (field.type === 'radio') continue;
      if (field.type === 'checkbox') continue;
      if (field.type === 'hidden') continue;
      if (!field.value) {
        isValid = false;
        if (!firstInvalid) firstInvalid = field;
      }
    }

    // 清除当前页所有旧红框
    currentSection.querySelectorAll('.form-group--error').forEach(el => {
      el.classList.remove('form-group--error');
    });

    if (!isValid && firstInvalid && focusInvalid) {
      const formGroup = firstInvalid.closest('.form-group');
      if (formGroup) {
        formGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });
        formGroup.classList.add('form-group--error');
      } else {
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    return { isValid, firstInvalid };
  }

  function validateCurrentStep() {
    return validateStep(currentStep, true).isValid;
  }

  function validateAllSteps() {
    let firstInvalidStep = null;

    for (let stepNumber = 1; stepNumber <= totalSteps; stepNumber++) {
      const result = validateStep(stepNumber, false);
      if (!result.isValid && firstInvalidStep === null) {
        firstInvalidStep = stepNumber;
      }
    }

    if (firstInvalidStep !== null) {
      currentStep = firstInvalidStep;
      updatePagination();
      requestAnimationFrame(function() {
        validateStep(firstInvalidStep, true);
      });
      return false;
    }

    return true;
  }

  if (!hasPaginationControls) return;

  // 下一步按钮
  nextBtn.addEventListener('click', function() {
    if (validateCurrentStep()) {
      if (currentStep < totalSteps) {
        currentStep++;
        updatePagination();
      }
    }
  });

  // 上一步按钮
  prevBtn.addEventListener('click', function() {
    if (currentStep > 1) {
      currentStep--;
      updatePagination();
    }
  });

  surveyForm.addEventListener('submit', function(event) {
    if (!validateAllSteps()) {
      event.preventDefault();
      return;
    }
  });

  // 初始化分页状态
  updatePagination();
});

const devFillBtn = document.getElementById('devFillBtn');
if (devFillBtn) {
  devFillBtn.addEventListener('click', function() {

  // 随机选择单选框
  const radioGroups = {};
  document.querySelectorAll('input[type="radio"]').forEach(radio => {
    if (!radioGroups[radio.name]) {
      radioGroups[radio.name] = [];
    }
    radioGroups[radio.name].push(radio);
  });

  Object.values(radioGroups).forEach(group => {
    if (group.length > 0 && !group[0].disabled) {
      const randomIndex = Math.floor(Math.random() * group.length);
      group[randomIndex].checked = true;
      group[randomIndex].dispatchEvent(new Event('change', { bubbles: true }));

      // 更新选中样式
      const label = group[randomIndex].closest('label');
      if (label) {
        const row = label.closest('.scale-options-row');
        if (row) {
          row.querySelectorAll('.scale-option').forEach(opt => opt.classList.remove('selected'));
        }
        label.classList.add('selected');
      }
    }
  });

  // 随机选择下拉框
  document.querySelectorAll('select').forEach(select => {
    if (!select.disabled && select.options.length > 1) {
      const randomIndex = 1 + Math.floor(Math.random() * (select.options.length - 1));
      select.selectedIndex = randomIndex;
      select.dispatchEvent(new Event('change'));
    }
  });
    // 所有 interest-tag / checkbox 类多选题统一处理
    function devFillCheckboxGroup(name, maxCount, random = false) {
      const all = Array.from(document.querySelectorAll(`input[name="${name}"]`));
      if (!all.length) return;

      let targets;
      if (random) {
        const shuffled = all.sort(() => Math.random() - 0.5);
        targets = shuffled.slice(0, maxCount);
      } else {
        targets = all.slice(0, maxCount);
      }

      targets.forEach(cb => {
        cb.checked = true;
        const label = cb.closest('label');
        if (label) {
          label.classList.add('selected');
          label.classList.add('checked');
        }
      });

      // 触发对应计数器更新
      const counterMap = {
        'my_traits':      () => updateMyTraitsCounter(),
        'partner_traits': () => updatePartnerTraitsCounter(),
        'interests':      () => updateInterestCounter(),
        'core_traits':    () => updateCoreTraitsCounter(),
      };
      if (counterMap[name]) counterMap[name]();
    }

    // 多选处理，统一调用
    devFillCheckboxGroup('accepted_campus', 2);
    devFillCheckboxGroup('core_traits', 3);
    devFillCheckboxGroup('my_traits', 3, true);
    devFillCheckboxGroup('partner_traits', 3, true);
    devFillCheckboxGroup('interests', 4, true);
  alert('已自动填写测试数据');
  });
}
