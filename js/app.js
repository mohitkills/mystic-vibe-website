var rupee=function(n){return '₹'+Number(n||0).toLocaleString('en-IN')};var escapeHtml=function(v){return String(v==null?'':v).replace(/[&<>"\']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]})};var isProductPage=location.pathname.indexOf('/products/')>-1;var imagePath=function(){return isProductPage?MV_PRODUCT_IMAGE:MV_IMAGE};var pagePath=function(p){return isProductPage?'../'+p:p};var productPath=function(s){return isProductPage?s+'.html':'products/'+s+'.html'};var productBySlug=function(s){var live=MV_PRODUCTS.find(function(p){return p.slug===s});if(live)return live;if(window.MV_STOREFRONT_CMS_CONNECTED===true)return null;return (window.MV_STATIC_PRODUCTS||[]).find(function(p){return p.slug===s})||MV_PRODUCTS[0]||null};function productSizeMl(p){
  var value=Number(p&&p.size_ml);
  if(Number.isSafeInteger(value)&&value>0)return value;
  var match=String(p&&p.size||'').match(/(\d{1,3})\s*ML/i);
  return match?Number(match[1]):null;
}
function productVariants(p){
  if(!p)return [];
  var rows=Array.isArray(p.size_variants)?p.size_variants:[];
  var variants=rows.map(function(row){
    return {size_ml:Number(row.size_ml),price:Number(row.price),mrp:Number(row.mrp),stock:Number(row.stock),is_available:row.is_available!==false};
  }).filter(function(row){
    return Number.isSafeInteger(row.size_ml)&&row.size_ml>0&&Number.isFinite(row.price)&&row.price>=0
      &&Number.isFinite(row.mrp)&&row.mrp>=row.price&&Number.isSafeInteger(row.stock)&&row.stock>=0&&row.is_available;
  }).sort(function(left,right){return left.size_ml-right.size_ml});
  if(variants.length)return variants;
  var size=productSizeMl(p);
  if(!size)return [];
  return [{size_ml:size,price:Number(p.price||0),mrp:Number(p.mrp||p.price||0),stock:Number.isFinite(Number(p.stock))?Number(p.stock):0,is_available:true}];
}
function productVariant(p,sizeMl){
  var variants=productVariants(p);
  if(!variants.length)return null;
  var target=Number(sizeMl);
  if(Number.isSafeInteger(target)&&target>0){
    return variants.find(function(variant){return variant.size_ml===target})||null;
  }
  return variants.find(function(variant){return variant.size_ml===productSizeMl(p)})||variants[0];
}
function cart(){
  try{
    var rows=JSON.parse(localStorage.getItem('mv_cart')||'[]');
    if(!Array.isArray(rows))return [];
    return rows.filter(function(v){
      return v&&typeof v.slug==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.slug)
        &&Number.isSafeInteger(Number(v.qty))&&Number(v.qty)>=1&&Number(v.qty)<=20;
    }).map(function(v){
      var p=productBySlug(v.slug);
      var selected=Number(v.size_ml)>0?Number(v.size_ml):(productVariant(p)?.size_ml||null);
      return {slug:v.slug,qty:Number(v.qty),size_ml:selected};
    });
  }catch(error){console.warn('Ignoring invalid saved cart data.');return []}
}
function saveCart(i){localStorage.setItem('mv_cart',JSON.stringify(i));updateCounts()}
function wishlist(){return JSON.parse(localStorage.getItem('mv_wishlist')||'[]')}
function saveWishlist(i){localStorage.setItem('mv_wishlist',JSON.stringify(i));updateCounts()}
function addToCart(s,q,sizeMl){
  q=Number(q||1);
  if(!Number.isSafeInteger(q)||q<1||q>20){toast('Choose a valid quantity');return false}
  var p=productBySlug(s);
  if(!p){toast('This perfume is no longer available');return false}
  var variant=productVariant(p,sizeMl);
  if(!variant||!variant.is_available){toast('This size is no longer available');return false}
  var i=cart(),selectedSize=variant.size_ml;
  var x=i.find(function(v){return v.slug===s&&Number(v.size_ml)===selectedSize});
  var stock=Number(variant.stock),currentQty=x?x.qty:0;
  if(Number.isFinite(stock)&&stock<currentQty+q){
    toast(stock>0?'Only '+stock+' available in this size':'This size is out of stock');
    return false;
  }
  if(x)x.qty+=q;else i.push({slug:s,qty:q,size_ml:selectedSize});
  saveCart(i);toast('Added to cart');return true;
}function toggleWish(s){var i=wishlist();i=i.indexOf(s)>-1?i.filter(function(x){return x!==s}):i.concat([s]);saveWishlist(i);toast(i.indexOf(s)>-1?'Saved to wishlist':'Removed from wishlist')}function updateCounts(){document.querySelectorAll('[data-cart-count]').forEach(function(e){e.textContent=cart().reduce(function(s,i){return s+i.qty},0)});document.querySelectorAll('[data-wish-count]').forEach(function(e){e.textContent=wishlist().length})}function toast(m){var t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t)}t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2100)}function catalogFilterProducts(products,filter){
  if(!filter||filter==='all'||filter==='perfumes') return products;
  if(filter==='deals') return products.filter(function(p){
    return p.storefront_category==='deals'||(Number(p.mrp)>Number(p.price)&&Number(p.price)>0);
  });
  if(filter==='bestsellers') return products.filter(function(p){
    return p.storefront_category==='bestsellers'||p.best;
  });
  if(filter==='new-arrivals'){
    var selected=products.filter(function(p){return p.storefront_category==='new-arrivals';});
    var newest=products.filter(function(p){return p.created_at&&Number.isFinite(Date.parse(p.created_at));})
      .sort(function(a,b){return Date.parse(b.created_at)-Date.parse(a.created_at);}).slice(0,4);
    var unique=new Map();
    selected.concat(newest).forEach(function(p){unique.set(p.slug,p);});
    return Array.from(unique.values());
  }
  if(filter==='gift-sets') return products.filter(function(p){
    if(p.storefront_category) return p.storefront_category==='gift-sets';
    return /gift.?set/i.test((p.product_type||'')+' '+(p.collection||''));
  });
  if(['fresh-aquatic','woody-amber','fruity-floral'].indexOf(filter)>-1){
    var legacyPatterns={
      'fresh-aquatic':/(marine|aquatic|fresh|citrus|fougere|blue)/i,
      'woody-amber':/(woody|amber)/i,
      'fruity-floral':/(fruity|floral|gourmand)/i
    };
    return products.filter(function(p){
      if(p.storefront_category) return p.storefront_category===filter;
      return legacyPatterns[filter].test((p.family||'')+' '+(p.collection||''));
    });
  }
  return products.filter(function(p){return p.collection_id===filter;});
}
function catalogNavigation(){var items=[{label:'Crazy Deals',filter:'deals',show:MV_PRODUCTS.some(function(p){return p.storefront_category==='deals'||(Number(p.mrp)>Number(p.price)&&Number(p.price)>0)})},{label:'Shop All',filter:'all',show:true},{label:'Bestsellers',filter:'bestsellers',show:MV_PRODUCTS.some(function(p){return p.storefront_category==='bestsellers'||p.best})},{label:'Perfumes',filter:'perfumes',show:MV_PRODUCTS.length>0},{label:'Fresh & Aquatic',filter:'fresh-aquatic',show:catalogFilterProducts(MV_PRODUCTS,'fresh-aquatic').length>0},{label:'Woody & Amber',filter:'woody-amber',show:catalogFilterProducts(MV_PRODUCTS,'woody-amber').length>0},{label:'Fruity & Floral',filter:'fruity-floral',show:catalogFilterProducts(MV_PRODUCTS,'fruity-floral').length>0},{label:'New Arrivals',filter:'new-arrivals',show:catalogFilterProducts(MV_PRODUCTS,'new-arrivals').length>0},{label:'Gift Sets',filter:'gift-sets',show:catalogFilterProducts(MV_PRODUCTS,'gift-sets').length>0}].filter(function(item){return item.show});var active=new URLSearchParams(location.search).get('filter')||'';return '<nav class="catalog-nav" aria-label="Shop perfumes"><div class="catalog-nav-inner">'+items.map(function(item){var current=active===item.filter;return '<a class="'+(current?'active':'')+'"'+(current?' aria-current="page"':'')+' href="'+pagePath('collection.html')+'?filter='+item.filter+'" data-catalog-nav-filter="'+item.filter+'">'+item.label+'</a>'}).join(' ')+'</div></nav>'}
function normalizeSearchText(value){return String(value==null?'':value).toLowerCase().trim()}
function searchCatalogProducts(query){
  var term=normalizeSearchText(query);
  if(!term)return [];
  return MV_PRODUCTS.filter(function(product){
    if(!product||typeof product.slug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug))return false;
    var fields=[product.name,product.slug,product.family,product.notes,product.fragrance_family,product.fragrance_notes,product.description,product.tagline,product.storefront_category_label,product.storefront_category,product.collection,product.product_type];
    return normalizeSearchText(fields.filter(Boolean).join(' ')).indexOf(term)>-1;
  });
}
function renderSearchSuggestions(input){
  var form=input&&input.closest('[data-site-search]');
  if(!form)return;
  var panel=form.querySelector('[data-search-suggestions]');
  if(!panel)return;
  var query=input.value.trim();
  panel.replaceChildren();
  if(!query){panel.hidden=true;input.setAttribute('aria-expanded','false');return}
  var results=searchCatalogProducts(query).slice(0,6);
  if(!results.length){
    var empty=document.createElement('p');
    empty.className='search-suggestions-empty';
    empty.textContent='No fragrances found. Try a different search.';
    panel.append(empty);
  }else{
    results.forEach(function(product){
      var link=document.createElement('a');
      link.className='search-suggestion';
      link.href=productPath(product.slug);
      link.setAttribute('role','option');
      link.setAttribute('aria-label','View '+product.name);
      var image=document.createElement('img');
      image.loading='lazy';
      image.src=resolveProductImage(Array.isArray(product.images)?product.images[0]:'');
      image.alt='';
      var text=document.createElement('span');
      text.className='search-suggestion-copy';
      var title=document.createElement('strong');
      title.textContent=product.name||product.slug;
      var detail=document.createElement('small');
      detail.textContent=[product.family||product.storefront_category_label,product.size].filter(Boolean).join(' · ');
      var price=document.createElement('span');
      price.className='search-suggestion-price';
      price.textContent=rupee(product.price);
      text.append(title,detail);
      link.append(image,text,price);
      panel.append(link);
    });
  }
  panel.hidden=false;
  input.setAttribute('aria-expanded','true');
}

function header(){
  var headerRoot=document.querySelector('#site-header');
  headerRoot.innerHTML='<div class="nav">'+
    '<a class="brand" href="'+pagePath('index.html')+'"><img src="'+pagePath('assets/images/mystic-vibe-logo.png')+'" alt="" aria-hidden="true"><span><strong class="serif">Mystic Vibe</strong></span></a>'+
    '<button class="menu-toggle" type="button" aria-label="Menu" aria-expanded="false">☰</button>'+
    '<nav class="nav-links" aria-label="Main navigation"><a href="'+pagePath('index.html')+'">Home</a><a href="'+pagePath('collection.html')+'">Collection</a><a href="'+pagePath('about.html')+'">About</a><a href="'+pagePath('faq.html')+'">FAQ</a><a href="'+pagePath('contact.html')+'">Contact</a></nav>'+
    '<form class="site-search" data-site-search role="search" action="'+pagePath('collection.html')+'" method="get"><label class="visually-hidden" for="mv-site-search">Search Mystic Vibe fragrances</label><input id="mv-site-search" data-site-search-input name="search" type="search" role="combobox" aria-autocomplete="list" placeholder="Search fragrances…" autocomplete="off" aria-label="Search fragrances" aria-expanded="false" aria-controls="mv-search-suggestions"><button type="submit" class="site-search-submit" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.7"></circle><path d="m15.7 15.7 4.6 4.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path></svg></button><div id="mv-search-suggestions" class="site-search-suggestions" data-search-suggestions role="listbox" hidden></div></form>'+
    '<div class="nav-actions" aria-label="Quick actions"><a class="icon-btn mobile-nav-item" aria-label="Wishlist" title="Wishlist" href="'+pagePath('wishlist.html')+'"><svg class="mobile-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 8.7c0 4.1-8.4 10-8.4 10s-8.4-5.9-8.4-10a4.3 4.3 0 0 1 8.4-1.3 4.3 4.3 0 0 1 8.4 1.3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path></svg><span class="badge" data-wish-count>0</span><span class="mobile-nav-label">Wishlist</span></a><a class="icon-btn mobile-nav-item" aria-label="Shopping bag" title="Shopping bag" href="'+pagePath('cart.html')+'"><svg class="mobile-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l1 12H4L5 8Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path></svg><span class="badge" data-cart-count>0</span><span class="mobile-nav-label">Cart</span></a><div class="account-menu-wrap mobile-nav-item"><button class="icon-btn account-menu-trigger" type="button" data-account-toggle aria-label="Profile menu" title="Profile" aria-haspopup="true" aria-expanded="false"><svg class="mobile-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"></circle><path d="M4.8 21c.5-4 3-6.1 7.2-6.1s6.7 2.1 7.2 6.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg><span class="mobile-nav-label">Account</span></button><section class="account-menu-panel" data-account-panel hidden aria-label="Profile menu"><p class="account-menu-heading" data-account-menu-heading>Your Mystic Vibe account</p><div class="account-menu-items" data-account-menu-items></div></section></div></div>'+
    '</div>';
  var menuButton=headerRoot.querySelector('.menu-toggle');
  var navLinks=headerRoot.querySelector('.nav-links');
  var navActions=headerRoot.querySelector('.nav-actions');
  var navActionsSlot=document.createComment('Mystic Vibe mobile action dock placement');
  if(navActions&&navActions.parentNode)navActions.parentNode.insertBefore(navActionsSlot,navActions);
  function syncMobileActionDock(){
    var useFloatingDock=!!(window.matchMedia&&window.matchMedia('(max-width: 760px)').matches);
    if(!navActions||!navActionsSlot.parentNode)return;
    var contactAction=document.querySelector('.whatsapp-float');
    if(useFloatingDock){
      if(navActions.parentNode!==document.body)document.body.appendChild(navActions);
      navActions.classList.add('mobile-floating-actions');
      navActions.setAttribute('aria-label','Quick actions');
      if(contactAction&&contactAction.parentNode!==navActions)navActions.appendChild(contactAction);
      if(contactAction)contactAction.classList.add('mobile-dock-contact');
    }else{
      if(contactAction&&navActions.contains(contactAction))document.body.appendChild(contactAction);
      if(contactAction)contactAction.classList.remove('mobile-dock-contact');
      navActions.classList.remove('mobile-floating-actions');
      navActions.removeAttribute('aria-label');
      if(navActions.parentNode!==navActionsSlot.parentNode)
        navActionsSlot.parentNode.insertBefore(navActions,navActionsSlot.nextSibling);
    }
  }
  window.mysticVibeSyncMobileActionDock=syncMobileActionDock;
  syncMobileActionDock();
  window.addEventListener('resize',syncMobileActionDock,{passive:true});
  menuButton.onclick=function(){
    var open=navLinks.classList.toggle('open');
    menuButton.setAttribute('aria-expanded',String(open));
  };
  document.addEventListener('keydown',function(event){
    if(event.key==='Escape'&&navLinks.classList.contains('open')){
      navLinks.classList.remove('open');
      menuButton.setAttribute('aria-expanded','false');
      menuButton.focus();
    }
  });
  var searchForm=headerRoot.querySelector('[data-site-search]');
  var searchInput=headerRoot.querySelector('[data-site-search-input]');
  var searchQuery=new URLSearchParams(location.search).get('search')||'';
  if(searchQuery)searchInput.value=searchQuery;
  searchInput.addEventListener('input',function(){renderSearchSuggestions(searchInput)});
  searchInput.addEventListener('keydown',function(event){
    if(event.key==='Escape'){
      var panel=searchForm.querySelector('[data-search-suggestions]');
      panel.hidden=true;searchInput.setAttribute('aria-expanded','false');
    }
  });
  searchForm.addEventListener('submit',function(event){
    if(!searchInput.value.trim()){
      event.preventDefault();searchInput.focus();return;
    }
    searchForm.querySelector('[data-search-suggestions]').hidden=true;
    searchInput.setAttribute('aria-expanded','false');
  });
  document.addEventListener('click',function(event){
    if(!event.target.closest('[data-site-search]')){
      var panel=headerRoot.querySelector('[data-search-suggestions]');
      if(panel)panel.hidden=true;
      var input=headerRoot.querySelector('[data-site-search-input]');
      if(input)input.setAttribute('aria-expanded','false');
    }
  });
  window.addEventListener('mystic-vibe-storefront-data',function(){
    if(searchInput.value.trim())renderSearchSuggestions(searchInput);
  });
  if(!document.querySelector('script[data-site-account-menu]')){
    var accountMenuScript=document.createElement('script');
    accountMenuScript.type='module';
    accountMenuScript.dataset.siteAccountMenu='';
    accountMenuScript.src=new URL(pagePath('js/site-account-menu.js'),location.href).href;
    document.body.append(accountMenuScript);
  }
}function footer(){document.querySelector('#site-footer').innerHTML='<div class="footer-grid"><div><h3 class="serif">MYSTIC VIBE</h3><p data-site-content="footer.brand.description">Premium fragrances crafted for confidence, elegance and unforgettable moments. Made in India for modern luxury rituals.</p></div><div><h3 class="serif">Explore</h3><div class="links"><a href="'+pagePath('collection.html')+'">Collection</a><a href="'+pagePath('about.html')+'">About</a><a href="'+pagePath('tracking.html')+'">Track Order</a><a href="'+pagePath('contact.html')+'">Contact</a></div></div><div><h3 class="serif">Policies</h3><div class="links"><a href="'+pagePath('privacy-policy.html')+'">Privacy Policy</a><a href="'+pagePath('terms-and-conditions.html')+'">Terms & Conditions</a><a href="'+pagePath('shipping-policy.html')+'">Shipping Policy</a><a href="'+pagePath('return-refund-policy.html')+'">Return & Refund Policy</a></div></div><div><h3 class="serif">Newsletter</h3><p>Receive launch notes, private offers and fragrance stories.</p><form class="inline-form" data-newsletter><input type="email" placeholder="Email address" required><button class="btn">Join</button></form></div></div><div class="copyright">© 2026 Mystic Vibe. All rights reserved. Instagram · Facebook · YouTube</div>'}function resolveProductImage(reference){if(!reference)return imagePath();var value=String(reference).replace(/^(?:\.\.\/)+/,'');if(/^(?:https?:\/\/|blob:)/i.test(value))return value;if(value.charAt(0)==='/'&&value.charAt(1)!=='/')return value;return pagePath(value)}function productCard(p){
  var images=Array.isArray(p.images)?p.images.filter(Boolean):[];
  var primary=resolveProductImage(images[0]);
  var gallery=images.length>1;
  var galleryControls=gallery?'<div class="product-image-controls"><button type="button" class="gallery-arrow" data-gallery-prev aria-label="Previous '+escapeHtml(p.name)+' image">&#8249;</button><div class="gallery-dots" role="group" aria-label="Choose '+escapeHtml(p.name)+' image">'+images.map(function(src,i){return '<button type="button" class="gallery-dot '+(i?'':'active')+'" data-gallery-to="'+i+'" data-gallery-src="'+escapeHtml(resolveProductImage(src))+'" aria-label="Show image '+(i+1)+' of '+images.length+'" aria-pressed="'+(!i)+'"></button>'}).join('')+'</div><button type="button" class="gallery-arrow" data-gallery-next aria-label="Next '+escapeHtml(p.name)+' image">&#8250;</button></div>':'';
  var defaultVariant=productVariant(p);
  var cardStock=defaultVariant?Number(defaultVariant.stock):Number(p.stock);
  var stockKnown=Number.isFinite(cardStock);
  var outOfStock=stockKnown&&cardStock<=0;
  var priceValue=defaultVariant?Number(defaultVariant.price):Number(p.price);
  var mrpValue=defaultVariant?Number(defaultVariant.mrp):Number(p.mrp);
  var hasDiscount=Number.isFinite(priceValue)&&Number.isFinite(mrpValue)&&mrpValue>priceValue;
  var discountPercent=hasDiscount?Math.round((mrpValue-priceValue)/mrpValue*100):0;
  var bestseller=p.best===true||p.best===1||p.best==='true'||p.storefront_category==='bestsellers'||p.storefront_category_label==='Bestsellers';
  var imageBadges=bestseller?'<span class="product-card-badge product-card-bestseller">Bestseller</span>':'';
  var discountLabel=hasDiscount?'<span class="product-card-save">'+discountPercent+'% OFF</span>':'';
  var wishlistButton='<button class="icon-btn product-card-wishlist" data-wish="'+escapeHtml(p.slug)+'" aria-label="Add '+escapeHtml(p.name)+' to wishlist" title="Add to wishlist">&#9825;</button>';
  var ratingValue=Number(p.rating!==undefined?p.rating:(p.average_rating!==undefined?p.average_rating:p.averageRating));
  var reviewValue=Number(p.review_count!==undefined?p.review_count:(p.reviewCount!==undefined?p.reviewCount:p.reviews_count));
  var ratingMarkup=Number.isFinite(ratingValue)&&ratingValue>0&&ratingValue<=5
    ?'<div class="product-card-rating"><span class="product-card-star" aria-hidden="true">&#9733;</span><strong>'+ratingValue.toFixed(1)+'</strong>'+(Number.isFinite(reviewValue)&&reviewValue>0?'<span class="product-card-review-count">('+reviewValue.toLocaleString('en-IN')+' Reviews)</span>':'')+'</div>'
    :'<div class="product-card-specs"><span>'+escapeHtml(p.size||'')+'</span>'+(p.family?'<span class="product-card-spec-separator" aria-hidden="true">·</span><span>'+escapeHtml(p.family)+'</span>':'')+'</div>';
  var tagline=p.tagline||p.description||p.family||'Mystic Vibe Fragrance';
  var stock=stockKnown?'<p class="product-stock">'+(Number(p.stock)>0?'In stock':'Out of stock')+'</p>':'';
  var addButton='<button class="btn product-card-add" data-add="'+escapeHtml(p.slug)+'" data-size-ml="'+(defaultVariant?defaultVariant.size_ml:'')+'"'+(outOfStock?' disabled aria-disabled="true"':'')+'>'+(outOfStock?'Out of Stock':'Add To Cart')+'</button>';
  var originalPrice=hasDiscount?'<span class="product-card-price-original">'+rupee(mrpValue)+'</span>':'';
  var mrp=Number.isFinite(mrpValue)&&mrpValue>0?'<span class="product-mrp">MRP '+rupee(mrpValue)+'</span>':'';
  var detail='<details class="product-card-details"><summary>Details</summary><div class="product-card-detail-copy">'+(tagline?'<p>'+escapeHtml(tagline)+'</p>':'')+(p.family?'<p><strong>Family:</strong> '+escapeHtml(p.family)+'</p>':'')+(p.notes?'<p><strong>Notes:</strong> '+escapeHtml(p.notes)+'</p>':'')+'<p><strong>Size:</strong> '+escapeHtml(p.size||'')+'</p>'+(mrp?'<p>'+mrp+'</p>':'')+stock+'<a class="product-details-link" href="'+productPath(p.slug)+'">View Details</a></div></details>';
  return '<article class="card product-card product-card-reference reveal" data-product-slug="'+escapeHtml(p.slug)+'">'
    +'<div class="product-card-gallery product-card-image-stage" data-gallery data-gallery-count="'+images.length+'">'
    +'<a class="visual" href="'+productPath(p.slug)+'"><img data-gallery-image loading="lazy" src="'+escapeHtml(primary)+'" alt="'+escapeHtml(p.name)+' perfume bottle"></a>'
    +imageBadges+wishlistButton+galleryControls
    +'</div>'
    +'<div class="product-card-content">'
    +'<p class="product-card-kicker">'+escapeHtml(tagline)+'</p>'
    +'<h3 class="serif"><a href="'+productPath(p.slug)+'">'+escapeHtml(p.name)+'</a></h3>'
    +ratingMarkup
    +'<div class="product-card-price-row"><span class="product-card-price-current">'+rupee(p.price)+'</span>'+originalPrice+discountLabel+'</div>'
    +detail+stock
    +'<div class="product-actions product-card-actions">'+addButton+'</div>'
    +'</div></article>'
}function productCurrency(value){
  return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
}
function productDiscountPercent(mrp,price){
  var mrpValue=Number(mrp),priceValue=Number(price);
  return Number.isFinite(mrpValue)&&Number.isFinite(priceValue)&&mrpValue>priceValue
    ?Math.round((mrpValue-priceValue)/mrpValue*100):0;
}
function productDetailGallery(p){
  var images=Array.isArray(p.images)?p.images.filter(Boolean):[];
  var primary=images.length?resolveProductImage(images[0]):MV_PRODUCT_IMAGE;
  var arrows=images.length>1
    ?'<button type="button" class="pdp-gallery-arrow pdp-gallery-prev" data-gallery-prev aria-label="Previous '+escapeHtml(p.name)+' image">&#8249;</button>'
      +'<button type="button" class="pdp-gallery-arrow pdp-gallery-next" data-gallery-next aria-label="Next '+escapeHtml(p.name)+' image">&#8250;</button>'
    :'';
  var dots=images.map(function(src,i){
    return '<span class="pdp-gallery-dot '+(i?'':'active')+'" aria-hidden="true"></span>';
  }).join('');
  var thumbnails=images.map(function(src,i){
    var resolved=resolveProductImage(src);
    return '<button type="button" class="pdp-thumb '+(i?'':'active')+'" data-gallery-to="'+i+'" data-gallery-src="'+escapeHtml(resolved)+'" aria-label="Show '+escapeHtml(p.name)+' image '+(i+1)+' of '+images.length+'" aria-pressed="'+(!i)+'">'
      +'<img src="'+escapeHtml(resolved)+'" alt="" loading="lazy" width="72" height="90">'
      +'</button>';
  }).join('');
  return '<div class="pdp-gallery" data-gallery data-product-slug="'+escapeHtml(p.slug)+'" data-gallery-count="'+images.length+'">'
    +'<div class="pdp-gallery-stage">'
    +'<img class="pdp-main-image" data-gallery-image src="'+escapeHtml(primary)+'" alt="'+escapeHtml(p.name)+' perfume bottle" width="4" height="5" fetchpriority="high">'
    +arrows
    +(dots?'<div class="pdp-gallery-pagination" aria-hidden="true">'+dots+'</div>':'')
    +'</div>'
    +(thumbnails?'<div class="pdp-thumbnails" role="group" aria-label="'+escapeHtml(p.name)+' product images">'+thumbnails+'</div>':'')
    +'</div>';
}
function changeGalleryImage(gallery,direction,index){
  var thumbnails=[].slice.call(gallery.querySelectorAll('[data-gallery-to]'));
  if(!thumbnails.length)return;
  var current=Math.max(0,thumbnails.findIndex(function(item){return item.getAttribute('aria-pressed')==='true'}));
  var next=Number.isInteger(index)?index:(current+direction+thumbnails.length)%thumbnails.length;
  next=(next+thumbnails.length)%thumbnails.length;
  var selected=thumbnails[next],image=gallery.querySelector('[data-gallery-image]');
  if(!image||!selected)return;
  image.src=selected.dataset.gallerySrc;
  image.alt=(gallery.dataset.productSlug||'Mystic Vibe')+' product image '+(next+1);
  thumbnails.forEach(function(item,i){
    item.classList.toggle('active',i===next);
    item.setAttribute('aria-pressed',String(i===next));
  });
  gallery.querySelectorAll('.pdp-gallery-dot').forEach(function(dot,i){
    dot.classList.toggle('active',i===next);
  });
}
function productAvailability(p){return Number.isFinite(Number(p.stock))?Number(p.stock)>0?'In stock':'Out of stock':''}
function pageHero(t,c){return '<section class="page-hero"><div class="page-title"><span class="eyebrow">Mystic Vibe</span><h1 class="serif">'+t+'</h1><p>'+c+'</p></div></section>'}function section(t,c,b){return '<section class="section"><div class="container"><div class="section-head"><span class="eyebrow">Mystic Vibe</span><h2 class="serif">'+t+'</h2><p>'+c+'</p></div>'+b+'</div></section>'}function renderHome(){var slides=MV_PRODUCTS.filter(function(p){return ['royal-marine','imperial-crown','midnight-bleu'].indexOf(p.slug)>-1});main.innerHTML='<section class="hero">'+slides.map(function(p,i){return '<div class="hero-slide '+(i?'':'active')+'"><div class="hero-copy"><span class="eyebrow">Luxury Eau de Parfum</span><h1 class="serif">'+p.name+'</h1><p>'+p.tagline+'</p><a class="btn" href="'+productPath(p.slug)+'">Shop Fragrance</a></div><div class="hero-art"><div class="bottle-stage"><img src="'+imagePath()+'" alt="'+p.name+' bottle"></div></div></div>'}).join('')+'</section>'+section('Featured Collection','<span data-site-content="home.featured.description">Explore our curated collection of premium 50ML fragrances designed for everyday presence and memorable evenings.</span>','<div class="grid product-grid">'+MV_PRODUCTS.map(productCard).join('')+'</div>')+'<section class="section story-band"><div class="container"><div><span class="eyebrow">Brand Story</span><h2 class="serif">About Mystic Vibe</h2></div><div class="story-panel"><p data-site-content="home.brand.promise">Premium fragrances crafted for confidence, elegance and unforgettable moments.</p><a class="btn" href="about.html">Discover The Brand</a></div></div></section>'+features()+section('Best Sellers','The signatures customers reach for first.','<div class="grid product-grid">'+MV_PRODUCTS.filter(function(p){return p.best}).map(productCard).join('')+'</div>')+reviews()+gallery()+newsletter();cycleHero()}function features(){var f=['Premium Ingredients','Long Lasting Fragrance','Luxury Packaging','Made In India','Affordable Luxury'];return section('Why Choose Mystic Vibe','<span data-site-content="home.why.description">A refined fragrance experience from first spray to final impression.</span>','<div class="grid feature-grid">'+f.map(function(x){return '<div class="feature card reveal"><strong>'+x+'</strong></div>'}).join('')+'</div>')}function reviews(){return section('Customer Reviews','Only verified customer feedback will be shown.','<div class="grid review-grid"><p class="review-empty">No verified customer reviews are available yet.</p></div>')}function gallery(){return section('Instagram Gallery','Luxury perfume lifestyle moments crafted for the feed.','<div class="grid gallery-grid">'+[1,2,3].map(function(i){return '<div class="gallery-item reveal"><img loading="lazy" src="assets/images/lifestyle-'+i+'.svg" alt="Mystic Vibe lifestyle '+i+'"></div>'}).join('')+'</div>')}function newsletter(){return '<section class="section"><div class="container"><div class="newsletter reveal"><div><span class="eyebrow">Private List</span><h2 class="serif">Receive Mystic Notes</h2><p data-site-content="home.newsletter.description">Launches, offers and fragrance rituals delivered elegantly.</p></div><form data-newsletter><input type="email" placeholder="Email address" required><button class="btn">Subscribe</button></form></div></div></section>'}function renderCollection(){
  var categories=window.MV_COLLECTIONS||[];
  var params=new URLSearchParams(location.search);
  var searchQuery=(params.get('search')||'').trim();
  var queryFilter=params.get('filter');
  var selected=queryFilter||window.MV_SELECTED_COLLECTION||'all';
  if(selected!=='all'&&!queryFilter&&!categories.some(function(category){return category.id===selected})){
    selected='all';window.MV_SELECTED_COLLECTION='all';
  }
  var visible=searchQuery?searchCatalogProducts(searchQuery):catalogFilterProducts(MV_PRODUCTS,selected);
  var filters=searchQuery?'':'<div class="collection-filters" role="group" aria-label="Filter fragrances by collection"><button type="button" class="collection-filter '+(selected==='all'?'active':'')+'" data-collection-filter="all">All Fragrances</button>'+categories.map(function(c){return '<button type="button" class="collection-filter '+(selected===c.id?'active':'')+'" data-collection-filter="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</button>'}).join('')+'</div>';
  var emptyCopy=searchQuery?'No fragrances matched “'+escapeHtml(searchQuery)+'”. Try another name, note or category.':'No published fragrances are in this collection yet.';
  var cards=visible.map(productCard).join('')||'<p class="collection-empty">'+emptyCopy+'</p>';
  var heading=searchQuery?'Search results':'The Collection';
  var description=searchQuery?visible.length+' fragrance'+(visible.length===1?'':'s')+' matching “'+escapeHtml(searchQuery)+'”.':'Explore our curated collection of published Mystic Vibe fragrances.';
  main.innerHTML=pageHero(heading,description)+section(searchQuery?'Matching Fragrances':'All Fragrances',searchQuery?'Search by fragrance name, family, notes or category.':'Choose your signature scent.',filters+'<div class="grid product-grid">'+cards+'</div>');
  if(window.refreshMysticVibeReveals)window.refreshMysticVibeReveals(main);
}function renderProduct(){
  var p=productBySlug(document.body.dataset.product);
  if(!p){
    main.innerHTML=pageHero('Fragrance unavailable','This product is not currently published for purchase.')
      +'<section class="section"><div class="container"><div class="panel"><p>This fragrance is not currently available in the store. Please explore the published collection.</p><a class="btn" href="'+pagePath('collection.html')+'">Browse perfumes</a></div></div></section>';
    return;
  }
  var variants=productVariants(p);
  var defaultVariant=productVariant(p);
  var selectedVariant=defaultVariant;
  if(!selectedVariant){main.innerHTML=pageHero('Fragrance unavailable','No available size is configured for this product.');return;}
  document.title=p.name+' | Mystic Vibe Eau de Parfum';
  var rawDescription=String(p.description||p.tagline||'').trim();
  var descriptionMeta=[p.tagline,p.name+' Eau de Parfum',p.family,p.notes].filter(Boolean).join('. ').slice(0,320);
  var metaDescription=document.querySelector('meta[name="description"]');
  if(metaDescription)metaDescription.content=descriptionMeta;
  var ogTitle=document.querySelector('meta[property="og:title"]');
  if(ogTitle)ogTitle.content=document.title;
  var ogDescription=document.querySelector('meta[property="og:description"]');
  if(ogDescription)ogDescription.content=descriptionMeta;
  var canonicalUrl=location.origin+location.pathname;
  var canonical=document.querySelector('link[rel="canonical"]');
  if(!canonical){
    canonical=document.createElement('link');
    canonical.rel='canonical';
    document.head.append(canonical);
  }
  canonical.href=canonicalUrl;
  var productSchema={"@context":"https://schema.org","@type":"Product",name:p.name,description:descriptionMeta,brand:{"@type":"Brand",name:"Mystic Vibe"},offers:{"@type":"Offer",priceCurrency:"INR",price:Number(selectedVariant.price||0).toFixed(2),url:canonicalUrl}};
  if(p.sku)productSchema.sku=p.sku;
  productSchema.offers.availability=Number(selectedVariant.stock)>0?"https://schema.org/InStock":"https://schema.org/OutOfStock";
  var schemaTag=document.querySelector('#mv-product-schema');
  if(!schemaTag){
    schemaTag=document.createElement('script');
    schemaTag.id='mv-product-schema';
    schemaTag.type='application/ld+json';
    document.head.append(schemaTag);
  }
  schemaTag.textContent=JSON.stringify(productSchema);

  var noteMarkers=[];
  var notePattern=/\b(top|middle|base)\s+notes?\s+(?:are|:)\s*/ig;
  var noteMatch;
  while((noteMatch=notePattern.exec(rawDescription))!==null){
    noteMarkers.push({label:noteMatch[1].toLowerCase(),start:noteMatch.index,end:notePattern.lastIndex});
  }
  var cleanDescription=noteMarkers.length
    ?rawDescription.slice(0,noteMarkers[0].start).replace(/[\s.,;:]+$/,'').trim()
    :rawDescription;
  if(!cleanDescription)cleanDescription=String(p.tagline||'').trim();
  var noteRows=noteMarkers.map(function(marker,index){
    var finish=index+1<noteMarkers.length?noteMarkers[index+1].start:rawDescription.length;
    var value=rawDescription.slice(marker.end,finish).replace(/^[\s:,-]+|[\s.,;]+$/g,'').trim();
    return value?{label:marker.label,value:value}:null;
  }).filter(Boolean);
  var keyNotes=String(p.notes||'').trim();
  var notesContent='';
  if(keyNotes)notesContent+='<p class="pdp-note-accords">'+escapeHtml(keyNotes)+'</p>';
  if(noteRows.length){
    notesContent+='<div class="pdp-note-pyramid">'+noteRows.map(function(row){
      return '<div class="pdp-note-row"><span>'+escapeHtml(row.label)+'</span><p>'+escapeHtml(row.value)+'</p></div>';
    }).join('')+'</div>';
  }
  var notesMarkup=notesContent
    ?'<section class="pdp-notes"><h2>Notes</h2>'+notesContent+'</section>'
    :'';

  var priceValue=Number(selectedVariant.price);
  var mrpValue=Number(selectedVariant.mrp);
  var discountPercent=productDiscountPercent(mrpValue,priceValue);
  var priceMarkup='<span class="pdp-now" data-pdp-current>'+productCurrency(priceValue)+'</span>'
    +'<s class="pdp-mrp" data-pdp-mrp'+(discountPercent?'':' hidden')+'>'+productCurrency(mrpValue)+'</s>'
    +'<span class="pdp-save" data-pdp-save'+(discountPercent?'':' hidden')+'>'+(discountPercent?'(Save '+discountPercent+'%)':'')+'</span>';
  var ratingValue=Number(p.rating!==undefined?p.rating:(p.average_rating!==undefined?p.average_rating:p.averageRating));
  var reviewCount=Number(p.review_count!==undefined?p.review_count:(p.reviewCount!==undefined?p.reviewCount:p.reviews_count));
  var hasRating=Number.isFinite(ratingValue)&&ratingValue>0&&ratingValue<=5;
  var hasReviews=Number.isFinite(reviewCount)&&reviewCount>0;
  var hasRatingData=hasRating||hasReviews;
  var ratingMarkup=hasRatingData
    ?'<div class="pdp-rating">'+(hasRating?'<span class="pdp-badge">★ <b>'+ratingValue.toFixed(1)+'</b></span>':'')
      +(hasReviews?'<a href="#reviews">'+reviewCount.toLocaleString('en-IN')+' reviews</a>':'')
      +'</div>'
    :'';
  var availability=productAvailability(p)||'Availability information not available';
  var stockKnown=Number.isFinite(Number(selectedVariant.stock));
  var outOfStock=stockKnown&&Number(selectedVariant.stock)<=0;
  var buttonLabel=outOfStock?'Out of stock':'Add to cart';
  var selectedSizeLabel=selectedVariant.size_ml+'ML';
  var sizeSelectorMarkup='<div class="pdp-size-control"><span class="pdp-control-label">Available size</span><div class="pdp-size-options" role="group" aria-label="Choose fragrance size">'
    +variants.map(function(variant){
      var unavailable=Number(variant.stock)<=0;
      return '<button type="button" class="pdp-size-option '+(variant.size_ml===selectedVariant.size_ml?'active':'')+'" data-select-size="'+variant.size_ml+'" aria-pressed="'+(variant.size_ml===selectedVariant.size_ml)+'"'+(unavailable?' disabled aria-disabled="true"':'')+'>'
        +variant.size_ml+'ML'+(unavailable?'<small>Out of stock</small>':'')+'</button>';
    }).join('')+'</div></div>';
  var familyMarkup=p.family?escapeHtml(p.family):'—';
  var availabilityMarkup=escapeHtml(availability);
  var descriptionMarkup=cleanDescription?'<p class="pdp-description">'+escapeHtml(cleanDescription)+'</p>':'';
  var addButton='<button type="button" class="btn pdp-action pdp-add" data-product-add="'+escapeHtml(p.slug)+'" data-size-ml="'+selectedVariant.size_ml+'"'
    +(outOfStock?' disabled aria-disabled="true"':'')+' aria-live="polite">'+buttonLabel+'</button>';
  var buyButton='<button type="button" class="btn light pdp-action pdp-buy" data-buy="'+escapeHtml(p.slug)+'" data-size-ml="'+selectedVariant.size_ml+'"'
    +(outOfStock?' disabled aria-disabled="true"':'')+'>'+(outOfStock?'Out of stock':'Buy now')+'</button>';

  var page='<section class="section pdp-section"><div class="container product-detail pdp-layout" data-product-slug="'+escapeHtml(p.slug)+'">'
    +'<div class="pdp-gallery-column">'+productDetailGallery(p)+'</div>'
    +'<aside class="pdp-buybox"><div class="pdp-buybox-inner">'
    +'<span class="pdp-family-label">'+escapeHtml(p.family||'Mystic Vibe Fragrance')+'</span>'
    +'<h1 class="serif pdp-title">'+escapeHtml(p.name)+'</h1>'
    +ratingMarkup
    +'<div class="pdp-price"><div class="pdp-price-row">'+priceMarkup+'</div><p class="pdp-tax">Inclusive of all taxes</p></div>'
    +descriptionMarkup
    +notesMarkup
    +sizeSelectorMarkup
    +'<div class="pdp-info-grid">'
    +'<div class="pdp-info-chip"><span>Family</span><strong>'+familyMarkup+'</strong></div>'
    +'<div class="pdp-info-chip"><span>Availability</span><strong class="pdp-availability '+(outOfStock?'is-out':'is-in')+'">'+(outOfStock?'Out of stock':'In stock')+'</strong></div>'
    +'</div>'
    +'<div class="pdp-purchase-controls"><div class="pdp-quantity-wrap"><span class="pdp-control-label">Quantity</span>'
    +'<div class="pdp-qty-stepper"><button type="button" data-dec aria-label="Decrease quantity" '+(outOfStock?'disabled':'')+'>−</button>'
    +'<input id="qty" type="number" value="1" min="1" max="20" inputmode="numeric" aria-label="Quantity" readonly '+(outOfStock?'disabled':'')+'>'
    +'<button type="button" data-inc aria-label="Increase quantity" '+(outOfStock?'disabled':'')+'>+</button></div></div>'
    +'<div class="pdp-actions">'+addButton+buyButton+'</div></div>'
    +'</div></aside></div></section>'
    +reviews()
    +section('Related Products','Complete your fragrance wardrobe.','<div class="grid product-grid">'+MV_PRODUCTS.filter(function(item){return item.slug!==p.slug}).slice(0,4).map(productCard).join('')+'</div>');
  var mobileBar='<div class="pdp-mobile-bar" role="region" aria-label="Quick purchase">'
    +'<div class="pdp-mobile-price"><span>Price · '+selectedSizeLabel+'</span><strong data-pdp-mobile-price>'+productCurrency(priceValue)+'</strong></div>'
    +'<button type="button" class="btn pdp-action pdp-add pdp-mobile-add" data-product-add="'+escapeHtml(p.slug)+'" data-size-ml="'+selectedVariant.size_ml+'"'
    +(outOfStock?' disabled aria-disabled="true"':'')+' aria-live="polite">'+buttonLabel+'</button></div>';
  main.innerHTML=page+mobileBar;

  if(hasRatingData){
    var reviewSection=main.querySelector('.review-grid');
    if(reviewSection&&reviewSection.closest('.section'))reviewSection.closest('.section').id='reviews';
  }

  function applySelectedSize(sizeMl){
    var next=variants.find(function(variant){return variant.size_ml===Number(sizeMl)&&variant.is_available!==false;});
    if(!next)return;
    selectedVariant=next;
    var price=Number(next.price),mrp=Number(next.mrp),discount=productDiscountPercent(mrp,price);
    var priceNode=main.querySelector('[data-pdp-current]');
    var mrpNode=main.querySelector('[data-pdp-mrp]');
    var saveNode=main.querySelector('[data-pdp-save]');
    var mobilePrice=main.querySelector('[data-pdp-mobile-price]');
    if(priceNode)priceNode.textContent=productCurrency(price);
    if(mrpNode){mrpNode.textContent=productCurrency(mrp);mrpNode.hidden=!discount;}
    if(saveNode){saveNode.textContent=discount?'(Save '+discount+'%)':'';saveNode.hidden=!discount;}
    if(mobilePrice)mobilePrice.textContent=productCurrency(price);
    main.querySelectorAll('[data-select-size]').forEach(function(button){
      var active=Number(button.dataset.selectSize)===next.size_ml;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    var stock=Number(next.stock),out=!(stock>0);
    var availabilityNode=main.querySelector('.pdp-availability');
    if(availabilityNode){
      availabilityNode.textContent=out?'Out of stock':'In stock';
      availabilityNode.classList.toggle('is-out',out);
      availabilityNode.classList.toggle('is-in',!out);
    }
    main.querySelectorAll('[data-product-add],[data-buy]').forEach(function(button){
      button.dataset.sizeMl=String(next.size_ml);
      button.disabled=out;
      if(out)button.setAttribute('aria-disabled','true');else button.removeAttribute('aria-disabled');
      if(!button.dataset.busy)button.textContent=out?'Out of stock':(button.hasAttribute('data-buy')?'Buy now':'Add to cart');
    });
    if(quantityInput){quantityInput.value='1';quantityInput.disabled=out;}
    if(schemaTag){
      productSchema.offers.price=price.toFixed(2);
      productSchema.offers.availability=out?'https://schema.org/OutOfStock':'https://schema.org/InStock';
      schemaTag.textContent=JSON.stringify(productSchema);
    }
  }
  main.querySelectorAll('[data-select-size]').forEach(function(button){
    button.addEventListener('click',function(){applySelectedSize(Number(button.dataset.selectSize));});
  });
  var quantityInput=document.querySelector('#qty');
  var inc=document.querySelector('[data-inc]');
  var dec=document.querySelector('[data-dec]');
  if(inc&&quantityInput)inc.onclick=function(){
    quantityInput.value=String(Math.min(20,Math.max(1,Number(quantityInput.value||1)+1)));
  };
  if(dec&&quantityInput)dec.onclick=function(){
    quantityInput.value=String(Math.max(1,Number(quantityInput.value||1)-1));
  };
  if(window.refreshMysticVibeReveals)window.refreshMysticVibeReveals(main);
}
function renderCart(){
  var items=cart();
  var sub=items.reduce(function(sum,item){
    var product=productBySlug(item.slug),variant=productVariant(product,item.size_ml);
    return sum+(variant?variant.price*item.qty:0);
  },0);
  var rows=items.map(function(item){
    var p=productBySlug(item.slug),variant=productVariant(p,item.size_ml);
    if(!p||!variant)return '<div class="cart-row cart-unavailable"><div><strong>Product no longer available</strong><br><small>'+escapeHtml(item.slug.replace(/-/g,' '))+'</small><br><span class="product-stock">Remove this item to continue checkout.</span></div><button class="icon-btn remove" data-remove="'+item.slug+'" data-size-ml="'+(item.size_ml||'')+'" aria-label="Remove unavailable item">×</button></div>';
    var available=Number(variant.stock),outOfStock=Number.isFinite(available)&&available<item.qty;
    return '<div class="cart-row'+(outOfStock?' cart-unavailable':'')+'"><img src="'+imagePath()+'"><div><strong>'+escapeHtml(p.name)+'</strong><br>'+variant.size_ml+'ML'+(outOfStock?'<br><span class="product-stock">'+(available>0?'Only '+available+' available; reduce quantity to continue.':'Out of stock; remove this item to continue checkout.')+'</span>':'')+'</div><div class="row-price">'+(outOfStock?'Unavailable':rupee(variant.price*item.qty))+'</div><div class="qty"><button data-qdec="'+p.slug+'" data-size-ml="'+variant.size_ml+'" '+(item.qty<=1?'disabled':'')+'>-</button><input value="'+item.qty+'" readonly><button data-qinc="'+p.slug+'" data-size-ml="'+variant.size_ml+'" '+(Number.isFinite(available)&&available<=item.qty?'disabled':'')+'>+</button></div><button class="icon-btn remove" data-remove="'+p.slug+'" data-size-ml="'+variant.size_ml+'" aria-label="Remove '+escapeHtml(p.name)+' '+variant.size_ml+'ML from cart">×</button></div>';
  }).join('');
  main.innerHTML=pageHero('Shopping Cart','Review your selected Mystic Vibe fragrances.')
    +'<section class="section"><div class="container split"><div class="panel">'+(items.length?rows:'<p>Your cart is empty.</p><a class="btn" href="collection.html">Shop Collection</a>')+'</div><aside class="panel summary"><h2 class="serif">Cart Totals</h2><p>Subtotal <strong style="float:right">'+rupee(sub)+'</strong></p><p>Shipping <strong style="float:right">'+(sub?'Free':'₹0')+'</strong></p><hr><h3>Total <span style="float:right">'+rupee(sub)+'</span></h3><a class="btn" href="checkout.html">Checkout</a></aside></div></section>';
}
function renderCheckout(){var items=cart(),sub=items.reduce(function(s,i){var p=productBySlug(i.slug),v=productVariant(p,i.size_ml);return s+(v?v.price*i.qty:0)},0),pays=['Razorpay','PhonePe','UPI','Google Pay','Paytm','Credit Card','Debit Card','Cash On Delivery'];main.innerHTML=pageHero('Checkout','Secure checkout with integration-ready payment options.')+'<section class="section"><div class="container split"><form class="panel" id="checkout-form"><h2 class="serif">Customer Details</h2><div class="form-grid"><input required placeholder="Full name"><input required type="email" placeholder="Email"><input required placeholder="Phone"><input required placeholder="City"><textarea class="full" required placeholder="Shipping address"></textarea><input required placeholder="PIN code"><select required><option value="">State</option><option>Maharashtra</option><option>Delhi</option><option>Karnataka</option><option>Tamil Nadu</option><option>Gujarat</option></select></div><h2 class="serif">Payment</h2><div class="payment-options">'+pays.map(function(x,i){return '<label class="pay-option '+(i?'':'active')+'"><input type="radio" name="pay" value="'+x+'" '+(i?'':'checked')+'> '+x+'</label>'}).join('')+'</div><br><button class="btn" '+(sub?'':'disabled')+'>Place Order</button></form><aside class="panel summary"><h2 class="serif">Order Summary</h2>'+(items.map(function(i){var p=productBySlug(i.slug),v=productVariant(p,i.size_ml);return '<p>'+p.name+' · '+(v?v.size_ml+'ML':'Size unavailable')+' × '+i.qty+'<strong style="float:right">'+rupee(v?v.price*i.qty:0)+'</strong></p>'}).join('')||'<p>No items in cart.</p>')+'<hr><h3>Total <span style="float:right">'+rupee(sub)+'</span></h3></aside></div></section>'}function simplePage(t,c,b){main.innerHTML=pageHero(t,c)+'<section class="section"><div class="container"><div class="panel">'+b+'</div></div></section>'}function faqHtml(){return ['How long does the fragrance last?|Mystic Vibe fragrances are designed for long-lasting everyday wear.','Are all products 50ML?|Yes, every fragrance is 50ML at ₹499.','Do you support COD?|Yes, Cash On Delivery is included.','How do I track my order?|Use the Track Order page with your order ID.'].map(function(x){var v=x.split('|');return '<div class="faq-item"><button type="button">'+v[0]+'<span>+</span></button><div class="faq-answer">'+v[1]+'</div></div>'}).join('')}function renderStatic(page){var map={about:['About Mystic Vibe','Premium fragrances crafted for confidence, elegance and unforgettable moments.','<h2 class="serif">Our Story</h2><p>Mystic Vibe creates modern luxury fragrances with polished presentation, memorable scent profiles and accessible pricing.</p>'],contact:['Contact','We would love to hear from you.','<form class="form-grid"><input required placeholder="Name"><input required type="email" placeholder="Email"><input class="full" placeholder="Subject"><textarea class="full" placeholder="Message"></textarea><button class="btn">Send Message</button></form>'],faq:['FAQ','Answers for shopping, shipping and fragrance care.',faqHtml()],privacy:['Privacy Policy','How Mystic Vibe handles customer information.','<p>We collect details needed to process orders, deliver products, support customers and improve the shopping experience. We do not sell personal information.</p>'],terms:['Terms And Conditions','The terms for using this website and purchasing Mystic Vibe products.','<p>By using this website, you agree to provide accurate order information, use the site lawfully and review product details before purchase.</p>'],shipping:['Shipping Policy','Fast, careful shipping across serviceable Indian locations.','<p>Orders are typically dispatched within 1-3 business days. Tracking details are shared after dispatch.</p>'],returns:['Return & Refund Policy','Clear support for eligible concerns.','<p>Returns or replacements may be accepted for damaged, incorrect or defective items reported promptly after delivery.</p>'],login:['Login','Access your Mystic Vibe account.','<form class="form-grid"><input class="full" type="email" placeholder="Email"><input class="full" type="password" placeholder="Password"><button class="btn">Login</button><a class="btn light" href="register.html">Create Account</a></form>'],register:['Register','Create your Mystic Vibe account.','<form class="form-grid"><input placeholder="First name"><input placeholder="Last name"><input class="full" type="email" placeholder="Email"><input class="full" type="password" placeholder="Password"><button class="btn">Register</button></form>'],thanks:['Request status unavailable','The contact form is not connected.','<p>No request was submitted.</p><a class="btn" href="collection.html">Continue shopping</a>'],success:['Order status unavailable','This site has no order-processing service.','<p>No order is confirmed.</p><a class="btn" href="collection.html">Continue shopping</a>'],payok:['Payment status unavailable','A payment provider is not connected.','<p>No payment or order has been confirmed.</p><a class="btn" href="collection.html">Continue shopping</a>'],payfail:['Payment status unavailable','A payment provider is not connected.','<p>No payment was attempted.</p><a class="btn" href="collection.html">Continue shopping</a>']};simplePage.apply(null,map[page]);}function renderWishlist(){var items=wishlist().map(productBySlug);main.innerHTML=pageHero('Wishlist','Your saved Mystic Vibe fragrances.')+section('Saved Products',items.length?'Ready when you are.':'No products saved yet.','<div class="grid product-grid">'+(items.map(productCard).join('')||'<p>Browse the collection and save your favorites.</p>')+'</div>')}function renderTracking(){main.innerHTML=pageHero('Track Order','Live order tracking is not connected to a fulfillment service.')+'<section class="section"><div class="container"><div class="panel"><p>No shipment status is available because this site has no live order records.</p></div></div></section>'}function cycleHero(){if(window.mysticVibeHeroCycleTimer)clearInterval(window.mysticVibeHeroCycleTimer);var s=[].slice.call(document.querySelectorAll('.hero-slide')),i=0;if(s.length)window.mysticVibeHeroCycleTimer=setInterval(function(){s[i].classList.remove('active');i=(i+1)%s.length;s[i].classList.add('active')},4200)}function handleProductAdd(slug,quantity,sizeMl){
  var selectedSize=Number(sizeMl)||productVariant(productBySlug(slug))?.size_ml;
  var buttons=[].slice.call(document.querySelectorAll('[data-product-add]')).filter(function(button){
    return button.dataset.productAdd===slug&&Number(button.dataset.sizeMl)===Number(selectedSize);
  });
  if(!buttons.length||buttons.some(function(button){return button.disabled||button.dataset.busy==='true'}))return;
  var current=cart().find(function(item){return item.slug===slug&&Number(item.size_ml)===Number(selectedSize)});
  var before=current?current.qty:0;
  buttons.forEach(function(button){button.dataset.busy='true';button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Adding…';});
  var success=addToCart(slug,quantity,selectedSize);
  var updated=cart().find(function(item){return item.slug===slug&&Number(item.size_ml)===Number(selectedSize)});
  var added=success&&(updated?updated.qty:0)>before;
  buttons.forEach(function(button){
    button.removeAttribute('aria-busy');
    button.textContent=added?'Added':(Number(productVariant(productBySlug(slug),selectedSize)?.stock||0)>0?'Add to cart':'Out of stock');
    button.classList.toggle('is-added',added);
    if(!added){button.disabled=Number(productVariant(productBySlug(slug),selectedSize)?.stock||0)<=0;delete button.dataset.busy;}
  });
  if(added)window.setTimeout(function(){buttons.forEach(function(button){
    if(!button.isConnected)return;button.textContent='Add to cart';button.classList.remove('is-added');button.disabled=false;delete button.dataset.busy;
  });},1300);
}
function bind(){document.addEventListener('click',function(e){var galleryButton=e.target.closest('[data-gallery-to],[data-gallery-prev],[data-gallery-next]');if(galleryButton){var gallery=galleryButton.closest('[data-gallery]');if(gallery){if(galleryButton.hasAttribute('data-gallery-to'))changeGalleryImage(gallery,0,Number(galleryButton.dataset.galleryTo));else changeGalleryImage(gallery,galleryButton.hasAttribute('data-gallery-next')?1:-1)}return}var a=e.target.closest('[data-add]');if(a)addToCart(a.dataset.add,1,Number(a.dataset.sizeMl));var category=e.target.closest('[data-collection-filter]');if(category){window.MV_SELECTED_COLLECTION=category.dataset.collectionFilter;var filterUrl=new URL(location.href);filterUrl.searchParams.delete('filter');history.replaceState(null,'',filterUrl.pathname+filterUrl.search+filterUrl.hash);if(window.withTransition)window.withTransition(renderCollection);else renderCollection()}var w=e.target.closest('[data-wish]');if(w)toggleWish(w.dataset.wish);var pa=e.target.closest('[data-product-add]');if(pa&&!pa.disabled&&pa.dataset.busy!=='true')handleProductAdd(pa.dataset.productAdd,Number(document.querySelector('#qty')?.value||1),Number(pa.dataset.sizeMl));var b=e.target.closest('[data-buy]');if(b&&!b.disabled&&b.dataset.busy!=='true'){var bought=addToCart(b.dataset.buy,Number(document.querySelector('#qty')?.value||1),Number(b.dataset.sizeMl));if(bought){b.dataset.busy='true';b.disabled=true;b.setAttribute('aria-busy','true');b.textContent='Loading…';location.href='../checkout.html'}}var rm=e.target.closest('[data-remove]');if(rm){saveCart(cart().filter(function(i){return !(i.slug===rm.dataset.remove&&Number(i.size_ml)===Number(rm.dataset.sizeMl))}));renderCart()}var qi=e.target.closest('[data-qinc]');if(qi){var c=cart(),item=c.find(function(i){return i.slug===qi.dataset.qinc&&Number(i.size_ml)===Number(qi.dataset.sizeMl)}),product=productBySlug(qi.dataset.qinc),variant=productVariant(product,Number(qi.dataset.sizeMl));if(!item||!variant){toast('This perfume size is no longer available');return}if(Number(variant.stock)<item.qty+1){toast(Number(variant.stock)>0?'Only '+Number(variant.stock)+' available in this size':'This size is out of stock');return}item.qty++;saveCart(c);renderCart()}var qd=e.target.closest('[data-qdec]');if(qd){var c2=cart(),it=c2.find(function(i){return i.slug===qd.dataset.qdec&&Number(i.size_ml)===Number(qd.dataset.sizeMl)});if(!it)return;it.qty--;saveCart(c2.filter(function(i){return i.qty>0}));renderCart()}});var galleryPointer=null;document.addEventListener('pointerdown',function(e){var gallery=e.target.closest('[data-gallery]');if(gallery&&Number(gallery.dataset.galleryCount)>1&&e.pointerType==='touch')galleryPointer={gallery:gallery,x:e.clientX,y:e.clientY}},{passive:true});document.addEventListener('pointerup',function(e){if(!galleryPointer)return;var start=galleryPointer;galleryPointer=null;var dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.2){changeGalleryImage(start.gallery,dx<0?1:-1);start.gallery.dataset.justSwiped='true';setTimeout(function(){delete start.gallery.dataset.justSwiped},500)}},{passive:true});document.addEventListener('click',function(e){if(e.target.closest('[data-gallery]')?.dataset.justSwiped){e.preventDefault();e.stopPropagation()}},true);document.addEventListener('submit',function(e){if(e.target.matches('[data-newsletter]')){e.preventDefault();toast('Newsletter signup is not connected; no subscription was created')}if(e.target.id==='checkout-form'){e.preventDefault();toast('Checkout unavailable; no order was placed')}if(e.target.id==='track-form'){e.preventDefault()}});document.addEventListener('change',function(e){if(e.target.name==='pay'){document.querySelectorAll('.pay-option').forEach(function(x){x.classList.remove('active')});e.target.closest('.pay-option').classList.add('active')}});document.querySelectorAll('.faq-item button').forEach(function(b){b.onclick=function(){b.parentElement.classList.toggle('open')}});if(window.initReveal)window.initReveal(document)}var main=document.querySelector('main');header();document.querySelector('#site-header').insertAdjacentHTML('beforeend',catalogNavigation());window.addEventListener('mystic-vibe-storefront-data',function(){var nav=document.querySelector('.catalog-nav');if(nav)nav.outerHTML=catalogNavigation()});footer();document.body.insertAdjacentHTML('beforeend','<a class="whatsapp-float" href="'+pagePath('contact.html')+'" aria-label="Contact Mystic Vibe" title="Contact Mystic Vibe"><svg class="mobile-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path><path d="M7.5 8.5h9M7.5 12h6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg><span class="mobile-nav-label">Contact</span></a>');if(window.mysticVibeSyncMobileActionDock)window.mysticVibeSyncMobileActionDock();var page=document.body.dataset.page;if(page==='home')renderHome();if(page==='collection')renderCollection();if(page==='product')renderProduct();if(page==='cart')renderCart();if(page==='checkout')renderCheckout();if(page==='wishlist')renderWishlist();if(page==='tracking')renderTracking();if(['about','contact','faq','privacy','terms','shipping','returns','login','register','thanks','success','payok','payfail'].indexOf(page)>-1)renderStatic(page);window.renderMysticVibeHome=renderHome;window.renderMysticVibeCollection=renderCollection;window.renderMysticVibeProduct=renderProduct;window.renderMysticVibeCart=renderCart;updateCounts();bind();
import(new URL(pagePath('js/auth.js'),location.href)).catch(function(error){console.error('Mystic Vibe authentication could not initialize:',error)});
window.MV_STOREFRONT_LOADING=true;
import(new URL(pagePath('js/motion-ui.js'),location.href)).catch(function(error){console.warn('Mystic Vibe motion enhancements could not initialize:',error.message)}).then(function(){return import(new URL(pagePath('js/storefront-sync.js'),location.href))}).catch(function(error){window.MV_STOREFRONT_LOADING=false;window.dispatchEvent(new Event('mv:storefront-load-failed'));console.warn('Mystic Vibe is using its local storefront catalog:',error.message)});
(function(){
  var page=document.body.dataset.page;
  document.querySelectorAll('.review-grid').forEach(function(grid){
    grid.innerHTML='<p class="review-empty">Verified customer reviews will appear here when they are available.</p>';
  });
  function notice(text){
    var p=document.createElement('p');
    p.className='review-empty';
    p.setAttribute('role','status');
    p.textContent=text;
    return p;
  }
  // Keep genuinely unconnected contact and payment-status pages honest,
  // but never intercept the dedicated checkout, tracking, or newsletter modules.
  if(page==='contact'){
    var contactForm=document.querySelector('main form.form-grid');
    if(contactForm){
      contactForm.addEventListener('submit',function(event){
        event.preventDefault();
        event.stopImmediatePropagation();
        contactForm.replaceWith(notice('The contact form is not connected. Your message was not sent.'));
      },true);
    }
  }
  if(page==='thanks'||page==='success'||page==='payok'||page==='payfail'){
    var title=document.querySelector('main .page-title h1');
    var summary=document.querySelector('main .page-title p');
    var panel=document.querySelector('main .panel');
    var copy=page==='thanks'?'The contact form is not connected. No request was submitted.':
      page==='success'?'This site has no order-processing service. No order is confirmed.':
      page==='payfail'?'A payment provider is not connected. No payment was attempted.':
      'A payment provider is not connected. No payment or order has been confirmed.';
    if(title) title.textContent=page==='success'?'Order status unavailable':
      page==='payok'||page==='payfail'?'Payment status unavailable':'Request status unavailable';
    if(summary) summary.textContent=copy;
    if(panel){
      panel.innerHTML='';
      panel.appendChild(notice(copy));
      var link=document.createElement('a');
      link.className='btn';
      link.href='collection.html';
      link.textContent='Continue shopping';
      panel.appendChild(link);
    }
  }
  var whatsapp=document.querySelector('.whatsapp-float');
  if(whatsapp&&/X/.test(whatsapp.getAttribute('href')||'')) whatsapp.remove();
})();
