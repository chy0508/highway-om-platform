/* 启动入口 */
(function () {
  'use strict';
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', UI.boot);
  else UI.boot();
})();