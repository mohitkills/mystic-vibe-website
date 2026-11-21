(() => {
  'use strict';

  if (window.__MV_MOTION_UI_INITIALIZED__) return;
  window.__MV_MOTION_UI_INITIALIZED__ = true;

  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = () => reduceQuery.matches;
  const finePointer = () => pointerQuery.matches && !reduced();
  const revealSelector = '.section-head, .page-title, .product-card-reference, .ivory-category-card, .ivory-family-card, .feature-grid > .feature, .pdp-gallery-column, .pdp-buybox, .home-shop-all, .reveal';
  const glassSelector = '.story-panel, .newsletter, .panel, .product-gallery, .summary';
  const magneticSelector = '.premium-hero-actions .btn, .home-shop-all .btn, .pdp-buybox .btn, .newsletter .btn, .page-title .btn';

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL(
    typeof window.pagePath === 'function' ? window.pagePath('css/motion-ui.css') : 'css/motion-ui.css',
    window.location.href
  ).href;
  document.head.appendChild(stylesheet);

  let revealObserver = null;
  let mutationObserver = null;
  let pointerFrame = 0;
  let latestPointerEvent = null;
  let scrollFrame = 0;
  let drawer = null;
  let scrim = null;
  let drawerTrigger = null;
  let drawerOpen = false;
  let previousBodyOverflow = '';

  function ensureRevealObserver() {
    if (revealObserver || reduced() || !('IntersectionObserver' in window)) return;
    revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in', 'visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -24px 0px' });
  }

  function queryIncludingRoot(root, selector) {
    const found = [];
    if (root && root.nodeType === 1 && root.matches(selector)) found.push(root);
    if (root && root.querySelectorAll) found.push(...root.querySelectorAll(selector));
    return found;
  }

  function addRevealAttributes(root) {
    const elements = queryIncludingRoot(root, revealSelector);
    elements.forEach((element) => {
      if (!element.hasAttribute('data-reveal')) {
        element.setAttribute('data-reveal', '');
        const siblings = element.parentElement
          ? Array.from(element.parentElement.children).filter((item) => item.matches(revealSelector))
          : [element];
        const index = Math.max(0, siblings.indexOf(element));
        element.style.setProperty('--mv-reveal-delay', String((index % 4) * 65) + 'ms');
      }

      if (reduced() || !('IntersectionObserver' in window)) {
        element.classList.add('in', 'visible');
        return;
      }

      ensureRevealObserver();
      if (revealObserver && !element.classList.contains('in')) revealObserver.observe(element);
    });
  }

  function addSkeletonOverlay(card) {
    if (!window.MV_STOREFRONT_LOADING || !card || card.querySelector('.mv-skeleton-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'mv-skeleton-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<span class="skel skel-media"></span>' +
      '<span class="skel skel-kicker"></span>' +
      '<span class="skel skel-title"></span>' +
      '<span class="skel skel-meta"></span>' +
      '<span class="skel skel-button"></span>';
    card.classList.add('mv-skeleton-loading');
    card.appendChild(overlay);
    const grid = card.closest('.product-grid');
    if (grid) grid.setAttribute('aria-busy', 'true');
  }

  function clearSkeletons() {
    window.MV_STOREFRONT_LOADING = false;
    document.querySelectorAll('.mv-skeleton-overlay').forEach((overlay) => overlay.remove());
    document.querySelectorAll('.mv-skeleton-loading').forEach((card) => card.classList.remove('mv-skeleton-loading'));
    document.querySelectorAll('.product-grid[aria-busy="true"]').forEach((grid) => grid.removeAttribute('aria-busy'));
    initReveal(document.querySelector('main') || document.body);
  }

  function addGlassSpotlights(root) {
    if (!finePointer()) return;
    queryIncludingRoot(root, glassSelector).forEach((element) => {
      element.classList.add('glass-spot');
      if (!element.querySelector(':scope > .mv-glass-spotlight')) {
        const spotlight = document.createElement('span');
        spotlight.className = 'mv-glass-spotlight';
        spotlight.setAttribute('aria-hidden', 'true');
        element.appendChild(spotlight);
      }
    });
  }

  function addPointerTargets(root) {
    if (!finePointer()) return;
    queryIncludingRoot(root, '.product-card-reference').forEach((card) => {
      card.setAttribute('data-tilt', '');
      if (!card.querySelector(':scope > .mv-tilt-glare')) {
        const glare = document.createElement('span');
        glare.className = 'mv-tilt-glare';
        glare.setAttribute('aria-hidden', 'true');
        card.appendChild(glare);
      }
    });
    queryIncludingRoot(root, magneticSelector).forEach((button) => button.setAttribute('data-magnetic', ''));
  }

  function initReveal(root) {
    const scope = root || document;
    addRevealAttributes(scope);
    addGlassSpotlights(scope);
    addPointerTargets(scope);

    if (window.MV_STOREFRONT_LOADING) {
      queryIncludingRoot(scope, '.product-card-reference').forEach(addSkeletonOverlay);
    }
  }

  window.initReveal = initReveal;
  window.refreshMysticVibeReveals = initReveal;

  function resetPointerElement(element) {
    if (!element) return;
    if (element.hasAttribute('data-tilt')) {
      element.style.setProperty('--mv-rotate-x', '0deg');
      element.style.setProperty('--mv-rotate-y', '0deg');
      element.classList.remove('mv-tilt-hover');
    }
    if (element.classList.contains('glass-spot')) element.classList.remove('mv-glass-hover');
    if (element.hasAttribute('data-magnetic')) {
      element.style.removeProperty('--mv-magnet-x');
      element.style.removeProperty('--mv-magnet-y');
    }
  }

  function updatePointerEffects(event) {
    if (!finePointer()) return;
    const tilt = event.target.closest && event.target.closest('[data-tilt]');
    const glass = event.target.closest && event.target.closest('.glass-spot');
    const magnetic = event.target.closest && event.target.closest('[data-magnetic]');
    const targets = [tilt, glass, magnetic].filter(Boolean);
    if (!targets.length) return;

    targets.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      const xPercent = (x * 100).toFixed(2) + '%';
      const yPercent = (y * 100).toFixed(2) + '%';

      if (element.hasAttribute('data-tilt')) {
        element.style.setProperty('--mv-glare-x', xPercent);
        element.style.setProperty('--mv-glare-y', yPercent);
        element.style.setProperty('--mv-rotate-y', ((x - 0.5) * 9).toFixed(2) + 'deg');
        element.style.setProperty('--mv-rotate-x', ((0.5 - y) * 7).toFixed(2) + 'deg');
        element.classList.add('mv-tilt-hover');
      }
      if (element.classList.contains('glass-spot')) {
        element.style.setProperty('--mv-spot-x', xPercent);
        element.style.setProperty('--mv-spot-y', yPercent);
        element.classList.add('mv-glass-hover');
      }
      if (element.hasAttribute('data-magnetic')) {
        const pullX = Math.max(-5, Math.min(5, (event.clientX - rect.left - rect.width / 2) * 0.12));
        const pullY = Math.max(-4, Math.min(4, (event.clientY - rect.top - rect.height / 2) * 0.14));
        element.style.setProperty('--mv-magnet-x', pullX.toFixed(2) + 'px');
        element.style.setProperty('--mv-magnet-y', pullY.toFixed(2) + 'px');
      }
    });
  }

  document.addEventListener('pointermove', (event) => {
    if (!finePointer()) return;
    latestPointerEvent = event;
    if (pointerFrame) return;
    pointerFrame = window.requestAnimationFrame(() => {
      pointerFrame = 0;
      if (latestPointerEvent) updatePointerEffects(latestPointerEvent);
    });
  }, { passive: true });

  document.addEventListener('pointerout', (event) => {
    if (!finePointer()) return;
    const roots = [
      event.target.closest && event.target.closest('[data-tilt]'),
      event.target.closest && event.target.closest('.glass-spot'),
      event.target.closest && event.target.closest('[data-magnetic]')
    ];
    roots.filter(Boolean).forEach((element) => {
      if (!event.relatedTarget || !element.contains(event.relatedTarget)) resetPointerElement(element);
    });
  }, { passive: true });

  function handleScroll() {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      const scrolled = window.scrollY > 16;
      const header = document.querySelector('.site-header');
      if (header) {
        header.classList.toggle('scrolled', scrolled);
        header.classList.toggle('mv-header-condensed', scrolled);
      }

      if (!reduced()) {
        document.querySelectorAll('[data-parallax]').forEach((image) => {
          const offset = -Math.min(window.scrollY, 600) * 0.075;
          image.style.setProperty('--mv-parallax-offset', offset.toFixed(2) + 'px');
        });
      }
    });
  }

  function initParallax(root) {
    const scope = root || document;
    queryIncludingRoot(scope, '.premium-hero-media img.premium-hero-image, .hero .bottle-stage img').forEach((image) => {
      image.setAttribute('data-parallax', '');
    });
    if (!reduced()) handleScroll();
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleScroll, { passive: true });

  function formatPrice(value) {
    return typeof window.rupee === 'function'
      ? window.rupee(value)
      : '₹' + Number(value || 0).toLocaleString('en-IN');
  }

  function pagePath(path) {
    return typeof window.pagePath === 'function' ? window.pagePath(path) : path;
  }

  function getCartRows() {
    try {
      if (typeof window.cart === 'function') return window.cart();
      const rows = JSON.parse(localStorage.getItem('mv_cart') || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      return [];
    }
  }

  function drawerLineImage(product) {
    const reference = product && Array.isArray(product.images) ? product.images[0] : '';
    if (typeof window.resolveProductImage === 'function') return window.resolveProductImage(reference);
    return reference || (typeof window.imagePath === 'function' ? window.imagePath() : '');
  }

  function createDrawer() {
    if (drawer) return;
    scrim = document.createElement('button');
    scrim.type = 'button';
    scrim.className = 'mv-cart-scrim';
    scrim.setAttribute('aria-label', 'Close shopping bag');
    scrim.setAttribute('tabindex', '-1');

    drawer = document.createElement('aside');
    drawer.className = 'mv-cart-drawer';
    drawer.id = 'mv-cart-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'mv-cart-drawer-title');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('tabindex', '-1');
    drawer.setAttribute('inert', '');
    drawer.innerHTML =
      '<div class="mv-cart-drawer-head">' +
        '<div><span class="mv-cart-eyebrow">MYSTIC VIBE</span><h2 id="mv-cart-drawer-title">Your Bag</h2></div>' +
        '<button type="button" class="mv-cart-close" data-mv-cart-close aria-label="Close shopping bag">×</button>' +
      '</div>' +
      '<div class="mv-cart-drawer-items" data-mv-cart-items></div>' +
      '<div class="mv-cart-drawer-footer" data-mv-cart-footer>' +
        '<div class="mv-cart-subtotal"><span>Subtotal</span><strong data-mv-cart-subtotal>₹0</strong></div>' +
        '<p class="mv-cart-note">Shipping and any applicable charges are calculated at checkout.</p>' +
        '<a class="mv-cart-checkout" data-mv-cart-checkout href="' + pagePath('checkout.html') + '">Proceed to checkout</a>' +
        '<a class="mv-cart-view" href="' + pagePath('cart.html') + '">View shopping bag</a>' +
      '</div>';
    document.body.append(scrim, drawer);
    scrim.addEventListener('click', closeDrawer);
  }

  function renderDrawer() {
    if (!drawer) return;
    const itemsRoot = drawer.querySelector('[data-mv-cart-items]');
    const subtotalNode = drawer.querySelector('[data-mv-cart-subtotal]');
    const footer = drawer.querySelector('[data-mv-cart-footer]');
    const rows = getCartRows();
    itemsRoot.replaceChildren();

    if (!rows.length) {
      footer.hidden = true;
      const empty = document.createElement('div');
      empty.className = 'mv-cart-empty';
      const heading = document.createElement('h3');
      heading.textContent = 'Your bag is waiting';
      const copy = document.createElement('p');
      copy.textContent = 'Explore the collection and find your next signature scent.';
      const link = document.createElement('a');
      link.href = pagePath('collection.html');
      link.className = 'mv-cart-empty-link';
      link.textContent = 'Explore fragrances';
      itemsRoot.append(empty);
      empty.append(heading, copy, link);
      return;
    }

    footer.hidden = false;
    let subtotal = 0;
    rows.forEach((row) => {
      const product = typeof window.productBySlug === 'function' ? window.productBySlug(row.slug) : null;
      const variant = typeof window.productVariant === 'function' ? window.productVariant(product, Number(row.size_ml)) : null;
      const price = Number(variant ? variant.price : (product && product.price) || 0);
      const size = Number(row.size_ml || (product && product.size_ml) || 0);
      subtotal += price * Number(row.qty || 0);

      const item = document.createElement('article');
      item.className = 'mv-cart-line';
      const image = document.createElement('img');
      image.alt = product ? product.name + ' perfume' : 'Perfume';
      image.loading = 'lazy';
      image.src = drawerLineImage(product);
      const details = document.createElement('div');
      details.className = 'mv-cart-line-details';
      const name = document.createElement('strong');
      name.textContent = product ? product.name : 'Unavailable fragrance';
      const meta = document.createElement('span');
      meta.textContent = (size ? size + 'ML' : 'Size unavailable') + ' · Qty ' + Number(row.qty || 0);
      const priceLine = document.createElement('b');
      priceLine.textContent = formatPrice(price * Number(row.qty || 0));
      details.append(name, meta, priceLine);
      item.append(image, details);
      itemsRoot.appendChild(item);
    });
    subtotalNode.textContent = formatPrice(subtotal);
  }

  function drawerFocusableElements() {
    if (!drawer) return [];
    return Array.from(drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((element) => !element.hidden && element.getClientRects().length > 0);
  }

  function openDrawer(trigger) {
    createDrawer();
    renderDrawer();
    drawerTrigger = trigger || null;
    drawer.removeAttribute('inert');
    drawer.setAttribute('aria-hidden', 'false');
    if (drawerTrigger) drawerTrigger.setAttribute('aria-expanded', 'true');
    drawerOpen = true;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    scrim.classList.add('is-open');
    drawer.classList.add('is-open');
    window.requestAnimationFrame(() => {
      const closeButton = drawer.querySelector('[data-mv-cart-close]');
      if (closeButton) closeButton.focus();
      else drawer.focus();
    });
  }

  function closeDrawer() {
    if (!drawer || !drawerOpen) return;
    drawerOpen = false;
    drawer.classList.remove('is-open');
    scrim.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('inert', '');
    if (drawerTrigger) {
      drawerTrigger.setAttribute('aria-expanded', 'false');
      if (drawerTrigger.isConnected) drawerTrigger.focus();
    }
    drawerTrigger = null;
    document.body.style.overflow = previousBodyOverflow;
  }

  function bumpCartCount(target) {
    const badge = (target && target.querySelector('[data-cart-count]')) || document.querySelector('[data-cart-count]');
    if (!badge || reduced()) return;
    badge.classList.remove('mv-cart-bump');
    void badge.offsetWidth;
    badge.classList.add('mv-cart-bump');
    badge.addEventListener('animationend', () => badge.classList.remove('mv-cart-bump'), { once: true });
  }

  function flyToCart(image, cartButton) {
    const target = cartButton || document.querySelector('#site-header a[href*="cart.html"]');
    if (reduced() || !image || !target) {
      bumpCartCount(target);
      return;
    }

    const sourceRect = image.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (!sourceRect.width || !sourceRect.height || !targetRect.width || !targetRect.height) {
      bumpCartCount(target);
      return;
    }

    const clone = image.cloneNode(true);
    clone.removeAttribute('id');
    clone.className = 'mv-fly-to-cart';
    clone.setAttribute('aria-hidden', 'true');
    Object.assign(clone.style, {
      position: 'fixed',
      left: sourceRect.left + 'px',
      top: sourceRect.top + 'px',
      width: sourceRect.width + 'px',
      height: sourceRect.height + 'px',
      objectFit: 'contain',
      pointerEvents: 'none',
      zIndex: '9999',
      borderRadius: '14px',
      transformOrigin: 'center center',
      transition: 'transform 660ms cubic-bezier(.5,0,.2,1), opacity 660ms cubic-bezier(.5,0,.2,1)'
    });
    document.body.appendChild(clone);

    const dx = (targetRect.left + targetRect.width / 2) - (sourceRect.left + sourceRect.width / 2);
    const dy = (targetRect.top + targetRect.height / 2) - (sourceRect.top + sourceRect.height / 2);
    const scale = Math.max(0.06, Math.min(0.18, 26 / Math.max(sourceRect.width, sourceRect.height)));
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clone.remove();
      bumpCartCount(target);
    };

    window.requestAnimationFrame(() => {
      clone.style.transform = 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0) scale(' + scale.toFixed(3) + ') rotate(14deg)';
      clone.style.opacity = '0.28';
    });
    clone.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'transform') finish();
    });
    window.setTimeout(finish, 820);
  }

  window.flyToCart = flyToCart;

  function savedCartQuantity() {
    try {
      const rows = JSON.parse(localStorage.getItem('mv_cart') || '[]');
      return Array.isArray(rows) ? rows.reduce((sum, row) => sum + Math.max(0, Number(row && row.qty) || 0), 0) : 0;
    } catch (error) {
      return 0;
    }
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest && event.target.closest('#site-header .nav-actions a[href*="cart.html"]');
    if (trigger && document.body.dataset.page !== 'cart') {
      event.preventDefault();
      openDrawer(trigger);
      return;
    }

    const addButton = event.target.closest && event.target.closest('[data-add], [data-product-add]');
    if (addButton) {
      const before = savedCartQuantity();
      const card = addButton.closest('.product-card-reference');
      const image = (card && card.querySelector('[data-gallery-image]')) || document.querySelector('.pdp-gallery-stage [data-gallery-image]');
      const cartButton = document.querySelector('#site-header .nav-actions a[href*="cart.html"]');
      window.setTimeout(() => {
        if (savedCartQuantity() > before) {
          flyToCart(image, cartButton);
          if (drawerOpen) renderDrawer();
        }
      }, 0);
    }

    const wishButton = event.target.closest && event.target.closest('[data-wish]');
    if (wishButton) {
      window.setTimeout(() => {
        window.setTimeout(() => {
          if (wishButton.getAttribute('aria-pressed') === 'true') {
            wishButton.classList.remove('mv-wish-pop');
            void wishButton.offsetWidth;
            wishButton.classList.add('mv-wish-pop');
          }
        }, 0);
      }, 0);
    }

    if (event.target.closest && event.target.closest('[data-mv-cart-close]')) closeDrawer();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!drawerOpen || !drawer) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = drawerFocusableElements();
    if (!focusable.length) {
      event.preventDefault();
      drawer.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!drawer.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === 'mv_cart' && drawerOpen) renderDrawer();
  });

  window.addEventListener('mystic-vibe-storefront-data', clearSkeletons);
  window.addEventListener('mv:storefront-load-failed', clearSkeletons);

  window.withTransition = (update) => {
    if (typeof update !== 'function') return null;
    if (reduced() || typeof document.startViewTransition !== 'function') {
      update();
      return null;
    }
    try {
      return document.startViewTransition(update);
    } catch (error) {
      update();
      return null;
    }
  };

  function refreshMotionPreferences() {
    if (reduced()) {
      if (revealObserver) revealObserver.disconnect();
      document.querySelectorAll('[data-reveal]').forEach((element) => element.classList.add('in', 'visible'));
      document.querySelectorAll('[data-tilt]').forEach((element) => element.removeAttribute('data-tilt'));
      document.querySelectorAll('[data-magnetic]').forEach((element) => element.removeAttribute('data-magnetic'));
      document.querySelectorAll('.glass-spot').forEach((element) => element.classList.remove('mv-glass-hover'));
    } else {
      ensureRevealObserver();
      initReveal(document.body);
      handleScroll();
    }
  }

  if (typeof reduceQuery.addEventListener === 'function') reduceQuery.addEventListener('change', refreshMotionPreferences);
  if (typeof pointerQuery.addEventListener === 'function') {
    pointerQuery.addEventListener('change', () => {
      if (!finePointer()) {
        document.querySelectorAll('[data-tilt], [data-magnetic]').forEach((element) => {
          element.removeAttribute('data-tilt');
          element.removeAttribute('data-magnetic');
          element.classList.remove('mv-tilt-hover');
          element.style.removeProperty('--mv-rotate-x');
          element.style.removeProperty('--mv-rotate-y');
          element.style.removeProperty('--mv-magnet-x');
          element.style.removeProperty('--mv-magnet-y');
        });
        document.querySelectorAll('.glass-spot').forEach((element) => {
          element.classList.remove('glass-spot', 'mv-glass-hover');
          const overlay = element.querySelector(':scope > .mv-glass-spotlight');
          if (overlay) overlay.remove();
        });
      } else {
        initReveal(document.body);
      }
    });
  }

  initParallax(document.body);
  initReveal(document.body);

  if ('MutationObserver' in window && document.body) {
    mutationObserver = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (window.MV_STOREFRONT_LOADING) {
            queryIncludingRoot(node, '.product-card-reference').forEach(addSkeletonOverlay);
          }
          initReveal(node);
          initParallax(node);
        });
      });
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  // A cart drawer can be opened on every storefront route except the cart page itself.
  const headerCartLink = document.querySelector('#site-header .nav-actions a[href*="cart.html"]');
  if (headerCartLink) {
    headerCartLink.setAttribute('aria-controls', 'mv-cart-drawer');
    headerCartLink.setAttribute('aria-haspopup', 'dialog');
    headerCartLink.setAttribute('aria-expanded', 'false');
  }
})();