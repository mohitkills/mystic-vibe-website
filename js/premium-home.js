(function(){
  if(!document.body || document.body.dataset.page!=='home') return;
  var root=typeof main!=='undefined'?main:document.querySelector('main');
  if(!root || typeof MV_PRODUCTS==='undefined') return;
  var catalog=MV_PRODUCTS;
  var cardList=function(items){return items.map(function(p){return productCard(p)}).join('')};
  root.innerHTML=''
  +'<section class="premium-hero" aria-label="Mystic Vibe signature fragrance">'
  +'<div class="premium-hero-media"><img src="assets/images/hero-royal-marine.png" alt="Royal Marine fragrance by Mystic Vibe against a midnight ocean"></div>'
  +'<div class="premium-hero-content"><div class="premium-hero-actions"><a class="btn" href="collection.html">Explore</a></div></div>'
  +'</section>'
  +'<section class="signature-strip"><div class="container"><div class="signature-stat"><b>09</b>Signature fragrances</div><div class="signature-stat"><b>50ML</b>Every bottle</div><div class="signature-stat"><b>India</b>Crafted with intent</div><div class="signature-stat"><b>₹499</b>Accessible luxury</div></div></section>'
  +'<section class="section" id="signatures"><div class="container"><div class="section-head"><div><span class="eyebrow">The Edit</span><h2 class="serif">Wear what<br>you want remembered.</h2></div><p>Fragrance is personal. Explore our most-loved compositions, created for the rituals, rooms and moments that matter.</p></div><div class="grid product-grid">'+cardList(catalog)+'</div><div class="home-shop-all"><a class="btn light" href="collection.html">View All Perfumes</a></div></div></section>'
  +'<section class="discovery-band"><div class="discovery-inner"><div class="discovery-number"><img src="assets/images/mystic-vibe-logo.png" alt="" aria-hidden="true"></div><div><span class="eyebrow">A modern ritual</span><h2 class="serif">Made to move<br>with your mood.</h2><p data-site-content="home.story.description">From the clean clarity of Royal Marine to the velvet depth of Midnight Bleu, each Mystic Vibe fragrance is designed to become part of your story.</p><a class="btn light" href="about.html">Our Story</a></div></div></section>'
  +'<section class="section story-band"><div class="container"><div><span class="eyebrow">The Mystic Standard</span><h2 class="serif">A presence<br>that lingers.</h2></div><div class="story-panel"><p data-site-content="home.brand.promise">Thoughtfully composed, confidently worn. Premium fragrance should be expressive, not out of reach.</p><a class="btn" href="collection.html">Find Your Signature</a></div></div></section>'
  +'<section class="section"><div class="container"><div class="section-head"><div><span class="eyebrow">The Essentials</span><h2 class="serif">Why Mystic Vibe</h2></div><p data-site-content="home.why.description">We make a refined fragrance ritual feel effortless—from the first detail to the final impression.</p></div><div class="grid feature-grid"><div class="feature card"><strong>Lasting<br>character</strong></div><div class="feature card"><strong>Premium<br>presentation</strong></div><div class="feature card"><strong>Made in<br>India</strong></div><div class="feature card"><strong>Considered<br>compositions</strong></div><div class="feature card"><strong>Luxury made<br>accessible</strong></div></div></div></section>'
  +'<section class="section"><div class="container"><div class="newsletter"><div><span class="eyebrow">Private Access</span><h2 class="serif">Notes from Mystic Vibe.</h2><p data-site-content="home.newsletter.description">First access to new scents, private offers and curated fragrance stories.</p></div><form data-newsletter><input type="email" placeholder="Your email address" required aria-label="Email address"><button class="btn">Join The List</button></form></div></div></section>';
  var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}})},{threshold:.1});
  root.querySelectorAll('.card,.newsletter,.story-panel').forEach(function(el){el.classList.add('reveal');observer.observe(el)});
})();

(function(){
  if(!document.body || document.body.dataset.page!=='home') return;
  var hero=document.querySelector('.premium-hero');
  if(!hero || hero.dataset.sliderInitialized==='true') return;
  hero.dataset.sliderInitialized='true';
  var action=hero.querySelector('.premium-hero-actions a');
  var image=hero.querySelector('.premium-hero-media img');
  if(!action || !image) return;

  var fallback={
    cta_text:action.textContent.trim() || 'Explore',
    cta_link:action.getAttribute('href') || 'collection.html',
    display_image_url:image.getAttribute('src') || 'assets/images/hero-royal-marine.png',
    heading:image.getAttribute('alt') || 'Mystic Vibe signature fragrance'
  };
  var fallbackImage=fallback.display_image_url;
  var slides=[];
  var active=0;
  var timer=null;
  var imageRequest=0;
  var controls=document.createElement('div');
  controls.className='premium-slide-controls';
  controls.setAttribute('role','group');
  controls.setAttribute('aria-label','Homepage slide controls');
  var previous=document.createElement('button');
  previous.type='button';
  previous.className='premium-slide-arrow';
  previous.setAttribute('aria-label','Previous homepage slide');
  previous.textContent='‹';
  var status=document.createElement('span');
  status.className='premium-slide-status';
  status.setAttribute('aria-live','polite');
  var next=document.createElement('button');
  next.type='button';
  next.className='premium-slide-arrow';
  next.setAttribute('aria-label','Next homepage slide');
  next.textContent='›';
  controls.append(previous,status,next);
  hero.append(controls);

  function safeImage(value){
    if(typeof value!=='string' || !value.trim()) return fallbackImage;
    var source=value.trim();
    if(/^(?:\.\.\/|\/)?assets\/[\w./-]+\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(source)){
      return source.replace(/^(?:\.\.\/|\/)+/,'');
    }
    if(source.indexOf('blob:')===0) return source;
    try{
      var url=new URL(source,location.href);
      if(url.origin===location.origin && (url.protocol==='https:' || url.protocol==='http:')) return url.href;
      if(url.protocol==='https:' && !url.username && !url.password &&
        !/\.supabase\.(?:co|in)$/i.test(url.hostname) &&
        !/\/storage\/v1\/object\//i.test(url.pathname) &&
        !/[?&](?:token|signature|expires)=/i.test(url.search)) return url.href;
    }catch(error){}
    return fallbackImage;
  }

  function setHeroImage(source, alt){
    var request=++imageRequest;
    var candidate=safeImage(source);
    var probe=new Image();
    probe.onload=function(){
      if(request!==imageRequest) return;
      image.src=candidate;
      image.alt=alt || fallback.heading;
      hero.classList.remove('premium-hero-image-fallback');
      image.dataset.loaded='true';
    };
    probe.onerror=function(){
      if(request!==imageRequest) return;
      hero.classList.add('premium-hero-image-fallback');
      image.dataset.loaded='false';
      image.alt=fallback.heading;
      if(candidate!==fallbackImage) image.src=fallbackImage;
      else image.removeAttribute('src');
    };
    probe.src=candidate;
  }

  image.addEventListener('error',function(){
    if(image.dataset.loaded==='false') return;
    hero.classList.add('premium-hero-image-fallback');
    image.dataset.loaded='false';
    if(image.getAttribute('src')!==fallbackImage) image.src=fallbackImage;
    else image.removeAttribute('src');
  });

  function safeCtaLink(value){
    try{
      var target=new URL(String(value || fallback.cta_link),location.href);
      return target.origin===location.origin ? target.href : new URL(fallback.cta_link,location.href).href;
    }catch(error){ return new URL(fallback.cta_link,location.href).href; }
  }

  function show(index){
    if(!slides.length) return;
    active=(index+slides.length)%slides.length;
    var slide=slides[active];
    action.textContent=String(slide.cta_text || fallback.cta_text || 'Explore').trim().slice(0,40);
    action.href=safeCtaLink(slide.cta_link);
    action.setAttribute('aria-label',action.textContent);
    setHeroImage(slide.display_image_url || slide.image_url || fallbackImage,
      slide.heading ? String(slide.heading).trim() : fallback.heading);
    status.textContent=(active+1)+' / '+slides.length;
    controls.hidden=slides.length<2;
  }
  function start(){
    if(timer) clearInterval(timer);
    timer=null;
    if(slides.length>1) timer=setInterval(function(){show(active+1);},7000);
  }
  function showFallback(){
    slides=[];
    if(timer) clearInterval(timer);
    timer=null;
    action.textContent=fallback.cta_text;
    action.href=safeCtaLink(fallback.cta_link);
    action.setAttribute('aria-label',action.textContent);
    setHeroImage(fallbackImage,fallback.heading);
    controls.hidden=true;
    status.textContent='';
  }
  previous.addEventListener('click',function(){show(active-1);start();});
  next.addEventListener('click',function(){show(active+1);start();});
  hero.addEventListener('mouseenter',function(){if(timer) clearInterval(timer);});
  hero.addEventListener('mouseleave',start);

  window.addEventListener('mystic-vibe-storefront-data',function(event){
    var data=event.detail||{};
    var grid=document.querySelector('#signatures .product-grid');
    if(grid && Array.isArray(data.products)){
      grid.innerHTML=data.products.map(function(product){return productCard(product);}).join('');
      var countNode=document.querySelector('.signature-stat:first-child b');
      if(countNode) countNode.textContent=String(data.products.length).padStart(2,'0');
      if(window.refreshMysticVibeReveals) window.refreshMysticVibeReveals(grid);
      else grid.querySelectorAll('.reveal').forEach(function(card){card.classList.add('visible');});
    }
    var incoming=Array.isArray(data.slides)?data.slides.filter(function(slide){
      return slide && slide.is_published===true && String(slide.display_image_url || slide.image_url || '').trim();
    }):[];
    if(!incoming.length){
      showFallback();
      return;
    }
    slides=incoming;
    show(0);
    start();
  });

  // Preserve the default image while CMS image delivery completes, and replay already-loaded data.
  setHeroImage(fallbackImage,fallback.heading);
  controls.hidden=true;
  if(Array.isArray(window.MV_HOMEPAGE_SLIDES)){
    window.dispatchEvent(new CustomEvent('mystic-vibe-storefront-data',{detail:{
      products:window.MV_PRODUCTS || [],
      collections:window.MV_COLLECTIONS || [],
      slides:window.MV_HOMEPAGE_SLIDES,
      content:window.MV_SITE_CONTENT || {}
    }}));
  }
})();
