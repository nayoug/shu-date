(function() {
  function setComment(container, message) {
    var text = container.querySelector('[data-comment-text]');
    if (!text) return;
    text.textContent = message;
  }

  function initCoupleResultComment() {
    var container = document.querySelector('[data-comment-url]');
    if (!container) return;

    var url = container.dataset.commentUrl;
    if (!url) return;

    fetch(url, {
      headers: {
        Accept: 'application/json'
      }
    })
      .then(function(res) {
        if (!res.ok) {
          throw new Error('Failed to load match comment');
        }
        return res.json();
      })
      .then(function(data) {
        var comment = data && typeof data.comment === 'string' ? data.comment.trim() : '';
        if (data && data.success && comment) {
          setComment(container, comment);
          return;
        }
        setComment(container, '暂时无法生成评语');
      })
      .catch(function() {
        setComment(container, '加载失败');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCoupleResultComment, { once: true });
  } else {
    initCoupleResultComment();
  }
})();
