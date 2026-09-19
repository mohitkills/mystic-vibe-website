(function(){
  function syncWishlistButtons(){
    var saved=JSON.parse(localStorage.getItem('mv_wishlist')||'[]');
    document.querySelectorAll('[data-wish]').forEach(function(button){
      button.classList.toggle('saved',saved.indexOf(button.dataset.wish)>-1);
      button.setAttribute('aria-pressed',button.classList.contains('saved')?'true':'false');
    });
  }
  syncWishlistButtons();
  document.addEventListener('click',function(event){
    if(event.target.closest('[data-wish]')) setTimeout(syncWishlistButtons,0);
  });
  window.addEventListener('pageshow',syncWishlistButtons);
})();
