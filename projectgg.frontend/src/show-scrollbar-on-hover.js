// Show scrollbar only when hovering the right edge
(function() {
  const hoverZone = document.getElementById('scrollbar-hover-zone');
  if (!hoverZone) return;
  const html = document.documentElement;
  const body = document.body;

  function showScrollbar() {
    html.classList.remove('hide-scrollbar');
    body.classList.remove('hide-scrollbar');
    html.classList.add('show-scrollbar');
    body.classList.add('show-scrollbar');
  }
  function hideScrollbar() {
    html.classList.remove('show-scrollbar');
    body.classList.remove('show-scrollbar');
    html.classList.add('hide-scrollbar');
    body.classList.add('hide-scrollbar');
  }

  hideScrollbar();
  hoverZone.addEventListener('mouseenter', showScrollbar);
  hoverZone.addEventListener('mouseleave', hideScrollbar);
})();
