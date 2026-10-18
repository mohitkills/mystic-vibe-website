(function(){
  if(!document.body || document.body.dataset.page!=='home') return;
  var root=typeof main!=='undefined'?main:document.querySelector('main');
  if(!root || typeof MV_PRODUCTS==='undefined') return;
  var catalog=MV_PRODUCTS;
  var cardList=function(items){return items.map(function(p){return productCard(p)}).join('')};
  root.innerHTML=''
  +'<section class="premium-hero" aria-label="Featured Mystic Vibe fragrances" aria-roledescription="carousel">'
  +'<div class="premium-hero-media"><img class="premium-hero-image is-active" src="assets/images/hero-royal-marine.png" alt="Mystic Vibe signature fragrance" fetchpriority="high"></div>'
  +'<div class="premium-hero-content" aria-hidden="true"><div class="premium-hero-actions"><a class="btn" href="collection.html" tabindex="-1"></a></div></div>'
  +'</section>'
  +'<section class="signature-strip"><div class="container"><div class="signature-stat"><b>09</b>Signature fragrances</div><div class="signature-stat"><b>50ML</b>Every bottle</div><div class="signature-stat"><b>India</b>Crafted with intent</div><div class="signature-stat"><b>₹499</b>Accessible luxury</div></div></section>'
  +'<section class="section" id="signatures"><div class="container"><div class="section-head"><div><span class="eyebrow">The Edit</span><h2 class="serif">Wear what<br>you want remembered.</h2></div><p>Fragrance is personal. Explore our most-loved compositions, created for the rituals, rooms and moments that matter.</p></div><div class="grid product-grid">'+cardList(catalog)+'</div><div class="home-shop-all"><a class="btn light" href="collection.html">View All Perfumes</a></div></div></section>'
  +'<section class="section ivory-data-section" id="home-deals" data-home-section="deals" hidden><div class="container"><div class="section-head"><div><span class="eyebrow">Considered finds</span><h2 class="serif">Crazy Deals</h2></div><p>Discover selected fragrances available at special prices.</p></div><div class="grid product-grid" data-home-product-grid="deals">'+cardList(typeof catalogFilterProducts==='function'?catalogFilterProducts(catalog,'deals').slice(0,4):[])+'</div><div class="home-shop-all"><a class="btn light" href="collection.html?filter=deals">Explore Crazy Deals</a></div></div></section>'
  +'<section class="section ivory-family-section" id="families"><div class="container"><div class="section-head"><div><span class="eyebrow">Scent, by feeling</span><h2 class="serif">Find your fragrance family</h2></div><p>Every scent has a character. Choose a direction and discover the notes that speak to you.</p></div><div class="ivory-family-grid"><a class="ivory-family-card" href="collection.html?filter=fresh-aquatic"><span class="ivory-family-mark">01</span><div><h3 class="serif">Fresh &amp; Aquatic</h3><p>Clean, cool and open-air fresh.</p></div><span class="ivory-category-arrow" aria-hidden="true">↗</span></a><a class="ivory-family-card" href="collection.html?filter=woody-amber"><span class="ivory-family-mark">02</span><div><h3 class="serif">Woody &amp; Amber</h3><p>Warm, deep and grounded.</p></div><span class="ivory-category-arrow" aria-hidden="true">↗</span></a><a class="ivory-family-card" href="collection.html?filter=fruity-floral"><span class="ivory-family-mark">03</span><div><h3 class="serif">Fruity &amp; Floral</h3><p>Bright, soft and expressive.</p></div><span class="ivory-category-arrow" aria-hidden="true">↗</span></a></div></div></section>'
  +'<section class="section ivory-category-section" id="categories"><div class="container"><div class="section-head"><div><span class="eyebrow">Explore the collection</span><h2 class="serif">Shop by category</h2></div><p>Start with the mood you want to wear today. Find a fragrance that feels like you.</p></div><div class="ivory-category-grid">'
  +'<a class="ivory-category-card" href="collection.html?filter=all"><span class="ivory-category-index">01 / THE EDIT</span><h3 class="serif">Shop All</h3><p>Explore every signature fragrance.</p><span class="ivory-category-arrow" aria-hidden="true">↗</span></a>'
  +'<a class="ivory-category-card" href="collection.html?filter=bestsellers"><span class="ivory-category-index">02 / MOST LOVED</span><h3 class="serif">Bestsellers</h3><p>Discover scents that stand out.</p><span class="ivory-category-arrow" aria-hidden="true">↗</span></a>'
  +'<a class="ivory-category-card" href="collection.html?filter=fresh-aquatic"><span class="ivory-category-index">03 / THE FEELING</span><h3 class="serif">Fresh &amp; Aquatic</h3><p>Clean, cool and effortlessly airy.</p><span class="ivory-category-arrow" aria-hidden="true">↗</span></a>'
  +'<a class="ivory-category-card" href="collection.html?filter=woody-amber"><span class="ivory-category-index">04 / THE FEELING</span><h3 class="serif">Woody &amp; Amber</h3><p>Warm, deep and quietly confident.</p><span class="ivory-category-arrow" aria-hidden="true">↗</span></a>'
  +'<a class="ivory-category-card" href="collection.html?filter=fruity-floral"><span class="ivory-category-index">05 / THE FEELING</span><h3 class="serif">Fruity &amp; Floral</h3><p>Bright, soft and full of character.</p><span class="ivory-category-arrow" aria-hidden="true">↗</span></a>'
  +'<a class="ivory-category-card" href="collection.html?filter=new-arrivals"><span class="ivory-category-index">06 / JUST LANDED</span><h3 class="serif">New Arrivals</h3><p>Meet the latest additions to the edit.</p><span class="ivory-category-arrow" aria-hidden="true">↗</span></a>'
  +'</div></div></section>'
  +'<section class="section ivory-data-section" id="new" data-home-section="new-arrivals" hidden><div class="container"><div class="section-head"><div><span class="eyebrow">Fresh on the shelf</span><h2 class="serif">New arrivals</h2></div><p>Meet the latest additions to your fragrance wardrobe.</p></div><div class="grid product-grid" data-home-product-grid="new-arrivals">'+cardList(typeof catalogFilterProducts==='function'?catalogFilterProducts(catalog,'new-arrivals').slice(0,4):[])+'</div></div></section>'
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

  var headingNode=hero.querySelector('.premium-hero-heading');
  var descriptionNode=hero.querySelector('.premium-hero-description');
  var fallback={
    cta_text:action.textContent.trim() || 'Explore',
    cta_link:action.getAttribute('href') || 'collection.html',
    display_image_url:initialImage.getAttribute('src') || 'assets/images/hero-royal-marine.png',
    heading:(headingNode && headingNode.textContent.trim()) || 'Find your signature scent.',
    description:(descriptionNode && descriptionNode.textContent.trim()) || 'Accessible luxury fragrances with character, crafted for the moments that become your story.'
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
  var controls=null;
  var previousButton=null;
  var nextButton=null;
  var dotsContainer=null;
  var statusNode=null;
  var pointerInside=false;
  var focusInside=false;

  function createControls(){
    controls=document.createElement('div');
    controls.className='premium-slide-controls';
    controls.setAttribute('data-hero-controls','');
    controls.setAttribute('role','group');
    controls.setAttribute('aria-label','Homepage slider controls');
    controls.hidden=true;

    previousButton=document.createElement('button');
    previousButton.type='button';
    previousButton.className='premium-slide-arrow';
    previousButton.setAttribute('data-hero-prev','');
    previousButton.setAttribute('aria-label','Previous slide');
    previousButton.setAttribute('title','Previous slide');
    previousButton.textContent='‹';

    dotsContainer=document.createElement('div');
    dotsContainer.className='premium-slide-dots';
    dotsContainer.setAttribute('data-hero-dots','');
    dotsContainer.setAttribute('role','group');
    dotsContainer.setAttribute('aria-label','Choose a homepage slide');

    statusNode=document.createElement('span');
    statusNode.className='premium-slide-status';
    statusNode.setAttribute('data-hero-status','');
    statusNode.setAttribute('aria-live','polite');
    statusNode.setAttribute('aria-atomic','true');

    nextButton=document.createElement('button');
    nextButton.type='button';
    nextButton.className='premium-slide-arrow';
    nextButton.setAttribute('data-hero-next','');
    nextButton.setAttribute('aria-label','Next slide');
    nextButton.setAttribute('title','Next slide');
    nextButton.textContent='›';

    controls.append(previousButton,dotsContainer,statusNode,nextButton);
    hero.append(controls);

    previousButton.addEventListener('click',function(){
      if(slides.length<2) return;
      stop();
      show(active-1);
      start();
    });
    nextButton.addEventListener('click',function(){
      if(slides.length<2) return;
      stop();
      show(active+1);
      start();
    });
  }

  function renderDots(){
    var dots=[];
    slides.forEach(function(slide,index){
      var dot=document.createElement('button');
      dot.type='button';
      dot.className='premium-slide-dot';
      dot.setAttribute('data-hero-dot',String(index));
      dot.setAttribute('aria-label','Show slide '+String(index+1));
      dot.setAttribute('title','Show slide '+String(index+1));
      dot.addEventListener('click',function(){
        if(slides.length<2) return;
        stop();
        show(index);
        start();
      });
      dots.push(dot);
    });
    dotsContainer.replaceChildren.apply(dotsContainer,dots);
  }

  function syncControls(){
    if(!controls) return;
    controls.hidden=slides.length<2;
    if(dotsContainer.children.length!==slides.length) renderDots();
    previousButton.disabled=slides.length<2;
    nextButton.disabled=slides.length<2;
    Array.prototype.forEach.call(dotsContainer.children,function(dot,index){
      dot.classList.toggle('is-active',index===active);
      dot.setAttribute('aria-current',index===active?'true':'false');
    });
    statusNode.textContent=String(slides.length?active+1:0).padStart(2,'0')+' / '+String(slides.length).padStart(2,'0');
  }

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
      if(transitionTimer) clearTimeout(transitionTimer);
      transitionTimer=null;
      inactiveImage.classList.remove('is-active','is-incoming','hero-transition-fade','hero-transition-slide-left','hero-transition-slide-up','hero-transition-zoom');
      inactiveImage.alt='';
      inactiveImage.setAttribute('aria-hidden','true');
      activeImage.classList.add('is-active');
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
    syncControls();
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
    if(slides.length>1 && !reducedMotion && !document.hidden && !pointerInside && !focusInside){
      timer=setInterval(function(){show(active+1);},7000);
    }
  }
  var fallbackSlides=[
    {heading:'Mystic Vibe signature fragrance',image_url:'assets/images/hero-royal-marine.png',display_image_url:'assets/images/hero-royal-marine.png',transition_style:'fade',cta_text:'Explore',cta_link:'collection.html',is_published:true},
    {heading:'Mystic Vibe fragrance collection',image_url:'assets/images/p1.jpg',display_image_url:'assets/images/p1.jpg',transition_style:'slide-left',cta_text:'Explore',cta_link:'collection.html',is_published:true},
    {heading:'Mystic Vibe signature scents',image_url:'assets/images/p2.jpg',display_image_url:'assets/images/p2.jpg',transition_style:'zoom',cta_text:'Explore',cta_link:'collection.html',is_published:true}
  ];
  function completeSlides(published){
    var result=Array.isArray(published)?published.slice():[];
    if(result.length>=2)return result;
    fallbackSlides.forEach(function(candidate){
      if(result.length>=3)return;
      var candidateSource=candidate.display_image_url||candidate.image_url;
      var alreadyPresent=result.some(function(item){
        return (item.display_image_url||item.image_url)===candidateSource;
      });
      if(!alreadyPresent)result.push(candidate);
    });
    return result;
  }
  function showFallback(){
    slides=fallbackSlides.slice();
    active=0;
    stop();
    syncControls();
    hero.classList.add('premium-hero-image-fallback');
    show(0);
    start();
  }

  createControls();
  // Initialize a working fallback carousel immediately; published CMS slides replace it once loaded.
  showFallback();
  hero.addEventListener('mouseenter',function(){pointerInside=true;stop();});
  hero.addEventListener('mouseleave',function(){pointerInside=false;start();});
  hero.addEventListener('focusin',function(){focusInside=true;stop();});
  hero.addEventListener('focusout',function(){focusInside=false;start();});
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
    if(Array.isArray(data.products) && typeof catalogFilterProducts==='function'){
      ['deals','new-arrivals'].forEach(function(filter){
        var section=root.querySelector('[data-home-section="'+filter+'"]');
        var target=section && section.querySelector('[data-home-product-grid="'+filter+'"]');
        if(!section || !target) return;
        var filtered=catalogFilterProducts(data.products,filter).slice(0,4);
        target.innerHTML=filtered.map(function(product){return productCard(product);}).join('');
        section.hidden=!filtered.length;
        if(window.refreshMysticVibeReveals) window.refreshMysticVibeReveals(target);
      });
    }
    var incoming=Array.isArray(data.slides)?data.slides.filter(function(slide){
      return slide && slide.is_published===true && String(slide.image_url || '').trim();
    }):[];
    if(!incoming.length){
      showFallback();
      return;
    }
    slides=completeSlides(incoming);
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
