(function(){
  if(!document.body || document.body.dataset.page!=='home') return;
  var root=typeof main!=='undefined'?main:document.querySelector('main');
  if(!root || typeof MV_PRODUCTS==='undefined') return;
  var catalog=MV_PRODUCTS;
  var cardList=function(items){return items.map(function(p){return productCard(p)}).join('')};
  root.innerHTML=''
  +'<section class="premium-hero" aria-label="Mystic Vibe signature fragrance">'
  +'<div class="premium-hero-media"><img class="premium-hero-image is-active" src="assets/images/hero-royal-marine.png" alt="Royal Marine fragrance by Mystic Vibe against a midnight ocean"></div>'
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

  var media=hero.querySelector('.premium-hero-media');
  var initialImage=media && media.querySelector('img');
  var action=hero.querySelector('.premium-hero-actions a');
  if(!media || !initialImage || !action) return;

  var fallback={
    cta_text:action.textContent.trim() || 'Explore',
    cta_link:action.getAttribute('href') || 'collection.html',
    display_image_url:initialImage.getAttribute('src') || 'assets/images/hero-royal-marine.png',
    heading:initialImage.getAttribute('alt') || 'Mystic Vibe signature fragrance'
  };
  var fallbackImage=fallback.display_image_url;
  var activeImage=initialImage;
  var inactiveImage=document.createElement('img');
  inactiveImage.className='premium-hero-image';
  inactiveImage.alt='';
  inactiveImage.setAttribute('aria-hidden','true');
  inactiveImage.decoding='async';
  inactiveImage.draggable=false;
  media.append(inactiveImage);

  var slides=[];
  var active=0;
  var timer=null;
  var imageRequest=0;
  var transitionTimer=null;
  var reducedMotion=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var transitionNames=['fade','slide-left','slide-up','zoom'];

  function safeImage(value){
    if(typeof value!=='string' || !value.trim()) return fallbackImage;
    var source=value.trim();
    if(/^(?:\.\.\/|\/)?assets\/[\w./-]+\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(source)){
      return source.replace(/^(?:\.\.\/|\/)+/,'');
    }
    if(source.indexOf('blob:')===0) return source;
    try{
      var url=new URL(source,location.href);
      if((url.protocol==='https:' || url.protocol==='http:') && url.origin===location.origin) return url.href;
      if(url.protocol==='https:' && !url.username && !url.password &&
        !/\.supabase\.(?:co|in)$/i.test(url.hostname) &&
        !/\/storage\/v1\/object\//i.test(url.pathname) &&
        !/[?&](?:token|signature|expires)=/i.test(url.search)) return url.href;
    }catch(error){}
    return fallbackImage;
  }

  function safeCtaLink(value){
    try{
      var target=new URL(String(value || fallback.cta_link),location.href);
      return target.origin===location.origin ? target.href : new URL(fallback.cta_link,location.href).href;
    }catch(error){ return new URL(fallback.cta_link,location.href).href; }
  }

  function syncCta(text, link){
    action.textContent=String(text || fallback.cta_text || 'Explore').trim().slice(0,40);
    action.href=safeCtaLink(link);
    action.setAttribute('aria-label',action.textContent);
  }

  function finishTransition(request, oldImage, incomingImage, description){
    if(request!==imageRequest) return;
    if(transitionTimer) clearTimeout(transitionTimer);
    transitionTimer=null;
    oldImage.classList.remove('is-active','is-incoming');
    oldImage.classList.remove('hero-transition-fade','hero-transition-slide-left','hero-transition-slide-up','hero-transition-zoom');
    oldImage.alt='';
    oldImage.setAttribute('aria-hidden','true');
    incomingImage.classList.remove('is-incoming','hero-transition-fade','hero-transition-slide-left','hero-transition-slide-up','hero-transition-zoom');
    incomingImage.classList.add('is-active');
    incomingImage.alt=description || fallback.heading;
    incomingImage.removeAttribute('aria-hidden');
    activeImage=incomingImage;
    inactiveImage=oldImage;
  }

  function setHeroImage(source, alt, requestedTransition, onReady){
    var candidate=safeImage(source);
    var request=++imageRequest;
    var currentSource=activeImage.getAttribute('src') || '';
    if(candidate===currentSource || candidate===activeImage.src){
      activeImage.alt=alt || fallback.heading;
      if(onReady) onReady();
      return;
    }

    var probe=new Image();
    var loadHandled=false;
    probe.onload=function(){
      if(request!==imageRequest || loadHandled) return;
      loadHandled=true;
      hero.classList.remove('premium-hero-image-fallback');
      var oldImage=activeImage;
      var incomingImage=inactiveImage;
      var style=transitionNames.includes(requestedTransition) ? requestedTransition : 'fade';
      incomingImage.classList.remove('is-active','is-incoming','hero-transition-fade','hero-transition-slide-left','hero-transition-slide-up','hero-transition-zoom');
      incomingImage.src=candidate;
      incomingImage.alt='';
      incomingImage.setAttribute('aria-hidden','true');
      void incomingImage.offsetWidth;
      incomingImage.classList.add('is-incoming','hero-transition-'+style);
      if(onReady) onReady();

      var finalized=false;
      var finish=function(){
        if(finalized) return;
        finalized=true;
        finishTransition(request,oldImage,incomingImage,alt);
      };
      incomingImage.addEventListener('animationend',finish,{once:true});
      if(transitionTimer) clearTimeout(transitionTimer);
      transitionTimer=setTimeout(finish,reducedMotion?80:1300);
    };
    probe.onerror=function(){
      if(request!==imageRequest) return;
      hero.classList.add('premium-hero-image-fallback');
      if(candidate!==safeImage(fallbackImage)) setHeroImage(fallbackImage,fallback.heading,'fade',onReady);
      // Keep the previous loaded image in place if even the fallback cannot be loaded.
    };
    probe.decoding='async';
    probe.src=candidate;
    if(probe.complete && probe.naturalWidth>0) probe.onload();
  }

  function show(index){
    if(!slides.length) return;
    active=(index+slides.length)%slides.length;
    var slide=slides[active];
    setHeroImage(
      slide.display_image_url || slide.image_url || fallbackImage,
      slide.heading ? String(slide.heading).trim() : fallback.heading,
      slide.transition_style || 'fade',
      function(){syncCta(slide.cta_text,slide.cta_link);}
    );
  }

  function stop(){
    if(timer) clearInterval(timer);
    timer=null;
  }
  function start(){
    stop();
    if(slides.length>1 && !reducedMotion && !document.hidden){
      timer=setInterval(function(){show(active+1);},7000);
    }
  }
  function showFallback(){
    slides=[];
    stop();
    hero.classList.add('premium-hero-image-fallback');
    setHeroImage(fallbackImage,fallback.heading,'fade',function(){syncCta(fallback.cta_text,fallback.cta_link);});
  }

  hero.addEventListener('mouseenter',stop);
  hero.addEventListener('mouseleave',start);
  hero.addEventListener('focusin',stop);
  hero.addEventListener('focusout',start);
  document.addEventListener('visibilitychange',function(){if(document.hidden) stop(); else start();});

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
      return slide && slide.is_published===true && String(slide.image_url || '').trim();
    }):[];
    if(!incoming.length){
      showFallback();
      return;
    }
    slides=incoming;
    show(0);
    start();
  });

  // Keep the initial artwork visible until a CMS-managed image is preloaded.
  initialImage.classList.add('premium-hero-image','is-active');
  syncCta(fallback.cta_text,fallback.cta_link);
  if(Array.isArray(window.MV_HOMEPAGE_SLIDES)){
    window.dispatchEvent(new CustomEvent('mystic-vibe-storefront-data',{detail:{
      products:window.MV_PRODUCTS || [],
      collections:window.MV_COLLECTIONS || [],
      slides:window.MV_HOMEPAGE_SLIDES,
      content:window.MV_SITE_CONTENT || {}
    }}));
  }
})();
