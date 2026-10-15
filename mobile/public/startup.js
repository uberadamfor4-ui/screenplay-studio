(function () {
  function failed() {
    var root = document.getElementById('root');
    if (!root || root.querySelector('.mobile-app')) return;
    root.textContent = '';
    root.style.cssText = 'padding:32px 24px;font:16px/1.8 sans-serif;color:#203a2e;max-width:640px;margin:auto';
    var title = document.createElement('h1'); title.textContent = '剧本工坊暂时无法启动'; title.style.fontSize = '22px';
    var detail = document.createElement('p'); detail.textContent = '请先关闭应用再重新打开。旧系统可在设备的正规应用商店更新 Android System WebView 后重试。不要卸载或清除应用数据，以免丢失本机稿件。';
    root.appendChild(title); root.appendChild(detail);
  }
  window.addEventListener('error', failed);
  window.setTimeout(failed, 20000);
}());
