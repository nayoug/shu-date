(function() {
  function setComment(commentEl, message) {
    var text = commentEl.querySelector('[data-match-comment-text]');
    if (!text) return;
    text.textContent = message;
  }

  function initMatchComment() {
    var commentEl = document.querySelector('[data-match-comment-url]');
    if (!commentEl) return;

    var url = commentEl.dataset.matchCommentUrl;
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
        setComment(commentEl, data && data.success && comment ? comment : '暂无可用评语');
      })
      .catch(function() {
        setComment(commentEl, '加载失败');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMatchComment, { once: true });
  } else {
    initMatchComment();
  }
})();
