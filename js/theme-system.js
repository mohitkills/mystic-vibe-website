(function(){
  try {
    localStorage.removeItem('mv_theme');
    localStorage.removeItem('mv_theme_v2');
  } catch (error) {}
  document.documentElement.style.colorScheme='light';
  if (document.body) document.body.dataset.theme='light';
  document.querySelectorAll('.theme-toggle').forEach(function(button){button.remove();});
})();
