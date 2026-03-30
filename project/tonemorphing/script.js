// -------- 年份 / 更新日期（若元素不存在就略過） --------
(function () {
  const y = document.getElementById('year');
  const u = document.getElementById('updated');
  if (y) y.textContent = new Date().getFullYear();
  if (u) u.textContent = new Date().toISOString().slice(0,10);
})();

// -------- 自動包表格（小螢幕橫向捲動） --------
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('.content > table').forEach(function(tbl){
    const wrap = document.createElement('div');
    wrap.className = 'table-wrapper';
    tbl.parentNode.insertBefore(wrap, tbl);
    wrap.appendChild(tbl);
  });
});

// -------- 滑鼠移動時跟著「取景」（pan）+ 放大（只做 JS 方案） --------
(function () {
  const m = window.matchMedia ? window.matchMedia.bind(window) : null;
  const canHover = !m || m('(hover:hover)').matches || m('(any-pointer:fine)').matches;
  if (!canHover) return;

  const DEFAULT_SCALE = 1.3;

  document.querySelectorAll('.method-figure').forEach(fig => {
    const img = fig.querySelector('img');
    if (!img) return;

    img.style.transition = 'transform .18s ease, box-shadow .18s ease';
    img.style.willChange  = 'transform';

    const scale = parseFloat(fig.dataset.scale || '') || DEFAULT_SCALE;

    function elevate() {
      fig.style.position = 'relative';
      fig.style.zIndex   = 9999;
      fig.style.overflow = 'visible';
      img.style.boxShadow = '0 6px 18px rgba(0,0,0,.15)';
    }
    function reset() {
      fig.style.position = '';
      fig.style.zIndex   = '';
      fig.style.overflow = '';
      img.style.boxShadow = '';
      img.style.transform = '';
      img.style.transformOrigin = 'center center';
    }

    fig.addEventListener('mouseenter', elevate);
    fig.addEventListener('mouseleave', reset);

    fig.addEventListener('mousemove', (e) => {
      const r = fig.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width)  * 100;
      const y = ((e.clientY - r.top)  / r.height) * 100;
      img.style.transformOrigin = `${x}% ${y}%`;
      img.style.transform = `scale(${scale})`;
    });
  });
})();

// -------- Play all: toggle play/stop + lock all controls --------
document.addEventListener('DOMContentLoaded', function(){
  var allBtns = document.querySelectorAll('.play-seq');
  var allAudios = document.querySelectorAll('audio');
  var activeBtn = null;
  var activeIdx = 0;
  var activeList = [];

  function lockAll(exceptBtn) {
    allBtns.forEach(function(b){
      if (b !== exceptBtn) { b.disabled = true; b.style.opacity = '0.45'; b.style.cursor = 'not-allowed'; }
    });
    allAudios.forEach(function(a){
      a.style.pointerEvents = 'none'; a.style.opacity = '0.45';
    });
  }

  function unlockAll() {
    allBtns.forEach(function(b){
      b.disabled = false; b.style.opacity = ''; b.style.cursor = '';
    });
    allAudios.forEach(function(a){
      a.style.pointerEvents = ''; a.style.opacity = '';
    });
  }

  function stopPlayback() {
    if (activeBtn) {
      activeList.forEach(function(a){ a.pause(); a.currentTime = 0; a.onended = null; });
      activeBtn.textContent = '\u25B6 Play all';
      activeBtn = null; activeIdx = 0; activeList = [];
      unlockAll();
    }
  }

  function playNext() {
    if (activeIdx >= activeList.length) { stopPlayback(); return; }
    activeBtn.textContent = '\u25A0 Stop (' + (activeIdx+1) + '/' + activeList.length + ')';
    activeList[activeIdx].currentTime = 0;
    activeList[activeIdx].play();
    activeList[activeIdx].onended = function(){ activeIdx++; playNext(); };
  }

  allBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      if (activeBtn === btn) { stopPlayback(); return; }
      if (activeBtn) { stopPlayback(); }

      var target = document.querySelector(btn.dataset.target);
      if (!target) return;
      var audios = target.querySelectorAll('.morph-steps audio');
      if (!audios.length) return;

      activeBtn = btn;
      activeIdx = 0;
      activeList = Array.prototype.slice.call(audios);

      activeList.forEach(function(a){ a.pause(); a.currentTime = 0; });

      lockAll(btn);
      playNext();
    });
  });
});
