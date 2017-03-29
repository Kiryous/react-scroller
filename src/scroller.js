(function() {
  
  // Array.from polyfill
  
  if (!Array.from) Array.from = require('array-from');
  

  // remove polyfill

  (function (arr) {
    arr.forEach(function (item) {
      if (item.hasOwnProperty('remove')) return

      Object.defineProperty(item, 'remove', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: function remove() {
          this.parentNode.removeChild(this);
        }
      })
    })
  })([Element.prototype, CharacterData.prototype, DocumentType.prototype])


  // matches polyfill

  if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.matchesSelector || function(selector) {
      var matches = document.querySelectorAll(selector), th = this
      return Array.prototype.some.call(matches, function(e){
        return e === th
      })
    }
  }


  // closest polyfill

  if (!Element.prototype.closest) {
    Element.prototype.closest = function(css) {
      var node = this

      while (node) {
        if (node.matches(css)) return node
        else node = node.parentElement
      }

      return null
    }
  }


  // helpers

  const getElement = (selector='', ctx=document) => {
    const node = ctx.querySelectorAll(selector)
    return node ? node[0] : null
  }

  const getElements = (selector='', ctx=document) => {
    const nodes = ctx.querySelectorAll(selector)
    return nodes || null
  }

  const getEventX = e => {
    return e.originalEvent 
        && e.originalEvent.touches 
        && e.originalEvent.touches.length 
        && e.originalEvent.touches[0].pageX 
      || e.touches
        && e.touches.length
        && e.touches[0].pageX
      || e.pageX 
      || 0
  }

  const getChildren = (el) => {
    let childNodes = el.childNodes,
        children = [],
        i = childNodes.length

    while (i--) {
      if (childNodes[i].nodeType == 1) children.unshift(childNodes[i])
    }

    return children
  }

  const isAndroid = () => {
    return navigator.userAgent.toLowerCase().indexOf("android") > -1
  }



  // scroller

  class Scroller {
    constructor(config) {
      const {
        align='center',
        noAnchors=false,
        noScrollbar=false,
        el,
        onClick
      } = config

      this.config = {
        align: align,
        noAnchors: noAnchors,
        noScrollbar: noScrollbar,
        onClick: onClick,

        prefix: 'ab_scroller',
        draggingClsnm: 'is-dragging',
        leftAlignClsnm: 'is-left-align',
        borderVsblClsnm: 'is-visible',
        noAnchorsClsnm: 'is-no-anchors',
        noScrollbarClsnm: 'is-no-scrollbar',

        easing: pos => pos === 1 ? 1 : -Math.pow(2, -10 * pos) + 1,
      }

      this.state = {
        scrolled: 0,
        scrollable: true,

        pointerDown: false,
        scrollbarPointerDown: false,
        mouseScroll: false,

        scrollbarWidth: 0,
        scrollbarFactor: 0,

        pageX: [],
        scrolledDiff: 0,
        downEventTS: 0,
        moveEventTS: 0,

        scrollbarDownPageX: 0,
        scrollClickDisabled: false,

        limitLeft: 0,
        limitRight: 0,
        stripWidth: 0,

        swipeDirection: null,
        touchX: 0,
        touchY: 0,

        let: el.hasChildNodes() && getChildren(el).length || 0,
        el: el || null,

        isAndroid: isAndroid()
      }

      window.raf = (() => {
        return window.requestAnimationFrame ||
          window.webkitRequestAnimationFrame ||
          window.mozRequestAnimationFrame ||
          function(callback) {setTimeout(callback, 1000 / 60)}
      })()

      this.init(el)
    }


    get(prop) {
      return typeof(this.state[prop]) !== 'undefined'
        ? this.state[prop]
        : null
    }

    set(prop, value) {
      this.state[prop] = value
    }

    push(prop, value) {
      this.state[prop] && this.state[prop].push(value)
    }

    clear(prop) {
      const field = this.state[prop]
      if (field && field.length) field.length = 0
    }

    getLastMeaningfull(prop) {
      const field = this.state[prop]
      const toIgnore = field && field.length && field.length > 3 ? 3 : 1
      return field[field.length - toIgnore] || 0
    }


    addClass(el, cl) {
      if (!new RegExp('(\\s|^)'+cl+'(\\s|$)').test(el.className)) el.className += ' ' + cl
    }

    removeClass(el, cl) {
      el.className = el.className
        .replace(new RegExp('(\\s+|^)'+cl+'(\\s+|$)', 'g'), ' ')
        .replace(/^\s+|\s+$/g, '')
    }

    alignScbToRight() {
      const prefix = this.config.prefix
      const rootNode = this.state.el
      const el = getElement(`.${prefix}-scrollbar`, rootNode)
      this.addClass(el, 'is-right')
    }

    releaseScb() {
      const prefix = this.config.prefix
      const rootNode = this.state.el
      const el = getElement(`.${prefix}-scrollbar`, rootNode)
      this.removeClass(el, 'is-right')
    }


    setPos(pos) {
      const prefix = this.config.prefix
      const rootNode = this.state.el
      const el = getElement(`.${prefix}-strip`, rootNode)
      this.setPosition(el, pos)
    }

    setScbPos(pos) {
      const prefix = this.config.prefix
      const rootNode = this.state.el
      const el = getElement(`.${prefix}-scrollbar`, rootNode)
      this.setPosition(el, pos)
    }

    setPosition(el, pos) {
      el.style.webkitTransform = 'translateX(' + pos + 'px)'
      el.style.MozTransform =
      el.style.msTransform =
      el.style.OTransform =
      el.style.transform = 'translateX(' + pos + 'px)'
    }

    setWidth(width) {
      const prefix = this.config.prefix
      const rootNode = this.state.el
      const el = getElement(`.${prefix}-scrollbar`, rootNode)
      el.style.width = width + 'px'
    }


    init(el) {
      this.createWrapper()
      this.wrapItems()
      this.createAnchors()
      this.setSize()
      this.checkScrollable()

      const prefix = this.config.prefix
      const rootNode = this.state.el
      const stripNode = getElement(`.${prefix}-strip`, rootNode)
      const linkNodes = getElements('a', stripNode)

      const scrollNode = getElement(`.${prefix}-scrollwrap`, rootNode)
      const scrollbarNode = getElement(`.${prefix}-scrollbar`, rootNode)

      const anchorsNodes = getElements(`.${prefix}-anchor`, rootNode)

      // config
      if (
        rootNode.getAttribute('data-leftalign') || 
        rootNode.getAttribute('data-leftIfWide') ||
        this.config.align !== 'center'
      ) {
        this.addClass(rootNode, this.config.leftAlignClsnm)
      }

      if (this.config.noAnchors || rootNode.getAttribute('data-noanchors')) {
        this.addClass(rootNode, this.config.noAnchorsClsnm)
      }

      if (this.config.noScrollbar || rootNode.getAttribute('data-noscrollbar')) {
        this.addClass(rootNode, this.config.noScrollbarClsnm)
      }

      stripNode.addEventListener('mousedown', this.onPointerDown.bind(this))
      stripNode.addEventListener('touchstart', this.onPointerDown.bind(this))
      document.addEventListener('mousemove', this.onPointerMove.bind(this))
      document.addEventListener('touchmove', this.onPointerMove.bind(this))
      document.addEventListener('mouseup', this.onPointerUp.bind(this))
      document.addEventListener('touchend', this.onPointerUp.bind(this))
      
      scrollbarNode.addEventListener('mousedown', this.onScrollbarPointerDown.bind(this))
      scrollbarNode.addEventListener('touchstart', this.onScrollbarPointerDown.bind(this))
      document.addEventListener('mousemove', this.onScrollbarPointerMove.bind(this))
      document.addEventListener('touchmove', this.onScrollbarPointerMove.bind(this))
      document.addEventListener('mouseup', this.onScrollbarPointerUp.bind(this))
      document.addEventListener('touchend', this.onScrollbarPointerUp.bind(this))

      scrollNode.addEventListener('click', this.onScrollClick.bind(this))

      const wheelEvent = (/Firefox/i.test(navigator.userAgent)) ? 'wheel' : 'mousewheel'
      stripNode.addEventListener(wheelEvent, this.onScroll.bind(this))

      Array.from(anchorsNodes).forEach(anchorNode => {
        anchorNode.addEventListener('click', this.onAnchorClick.bind(this))
      })

      // prevent clickng on links
      Array.from(linkNodes).forEach(node => {
        node.addEventListener('click', this.onClickLink.bind(this), false)
      })

      // rerender
      window.addEventListener('resize', e => {
        this.setSize()
        this.checkScrollable()
      })

      window.addEventListener('load', e => {
        this.setSize()
        this.checkScrollable()
      })

      // check for display none
      const isHidden = el => el.offsetParent === null

      if (isHidden(rootNode)) {
        let intervalId = setInterval(() => {
          if (!isHidden(rootNode)) {
            const scrolled = this.get('scrolled')
            clearInterval(intervalId)
            // no polyfills for triggering resize 
            // just recalc twice
            this._update()
            this._update()
            this.animate(scrolled, scrolled, 0)
          }
        }, 50)
      }

      this.checkBorderVisibility()
    }


    createWrapper() {}

    wrapItems() {
      const prefix = this.config.prefix
      const rootNode = this.state.el
      const wrapperNode = getElement(`.${prefix}-strip`, rootNode)

      Array.from(getChildren(wrapperNode)).forEach(itemNode => {
        this.addClass(itemNode, `${prefix}-item`)
      })
    }

    removeAnchors() {
      const prefix = this.config.prefix
      const rootNode = this.state.el
      const ancWrapperNode = getElement(`.${prefix}-anchors`, rootNode)
      ancWrapperNode.innerHTML = ''
    }

    createAnchors() {
      const prefix = this.config.prefix
      const rootNode = this.state.el
      const wrapperNode = getElement(`.${prefix}-strip`, rootNode)
      const ancWrapperNode = getElement(`.${prefix}-anchors`, rootNode)
      let anchorsHtml = '', counter = 0

      Array.from(getChildren(wrapperNode)).forEach(itemNode => {
        const targetNode = itemNode.hasAttribute('data-anchor') 
          ? itemNode
          : getElement('[data-anchor]', itemNode)

        const anchorText = targetNode 
          ? targetNode.getAttribute('data-anchor')
          : ''

        anchorsHtml += `<span data-anchorid="${counter}" class="${prefix}-anchor"><span>${anchorText}</span></span>`
        itemNode.setAttribute('data-anchororiginid', counter)
        counter++
      })

      ancWrapperNode.innerHTML = anchorsHtml
    }

    setSize() {
      const prefix = this.config.prefix
      const rootNode = this.state.el

      const stripNode = getElement(`.${prefix}-strip`, rootNode)
      const wrapperNode = getElement(`.${prefix}-wrapper`, rootNode)
      const scrollbarNode = getElement(`.${prefix}-scrollbar`, rootNode)
      const scrollwrapNode = getElement(`.${prefix}-scrollwrap`, rootNode)
      const itemNodes = getElements(`.${prefix}-item`, rootNode)
      let maxHeight = 0, sumWidth = 0

      rootNode.setAttribute('style', '')
      stripNode.setAttribute('style', '')
      wrapperNode.setAttribute('style', '')
      scrollbarNode.setAttribute('style', '')
      scrollwrapNode.setAttribute('style', '')

      Array.from(itemNodes).forEach(itemNode => {
        const currentHeight = itemNode.offsetHeight
        if (currentHeight > maxHeight) maxHeight = currentHeight
        sumWidth += itemNode.offsetWidth
      })

      const wrapperWidth = wrapperNode.offsetWidth
      const scrollwrapWidth = scrollwrapNode.offsetWidth
      const limitRight = sumWidth + 1 - rootNode.offsetWidth

      const scrollbarFactor = scrollwrapWidth / sumWidth
      const scrolled = Math.min(this.get('scrolled'), limitRight)
      const scbScrolled = scrolled * scrollbarFactor

      rootNode.style.height = maxHeight + 'px'
      stripNode.style.height = maxHeight + 'px'
      stripNode.style.width = (sumWidth + 1) + 'px'
      wrapperNode.style.height = maxHeight + 'px'
      scrollbarNode.style.width = (wrapperWidth * scrollbarFactor) + 'px'

      this.setPos(-1 * scrolled)
      this.setScbPos(scbScrolled)
      this.set('limitRight', limitRight)
      this.set('scrollbarFactor', scrollbarFactor)
      this.set('scrollbarWidth', wrapperWidth * scrollbarFactor)
    }

    checkScrollable() {
      const prefix = this.config.prefix
      const rootNode = this.state.el

      const stripNode = getElement(`.${prefix}-strip`, rootNode)
      const wrapperNode = getElement(`.${prefix}-wrapper`, rootNode)
      const itemNodes = getElements(`.${prefix}-item`, rootNode)
      const ancWrapperNode = getElement(`.${prefix}-anchors`, rootNode)
      let sumWidth = 0, wrapperWidth = wrapperNode.offsetWidth

      Array.from(itemNodes).forEach(itemNode => {
        sumWidth += itemNode.offsetWidth
      })

      if (wrapperWidth >= sumWidth) {
        this.set('scrollable', false)
        this.addClass(rootNode, 'is-not-scrollable')
        ancWrapperNode.setAttribute('style', `width: ${sumWidth}px`)
      }
      else {
        this.set('scrollable', true)
        this.removeClass(rootNode, 'is-not-scrollable')
        ancWrapperNode.setAttribute('style', `width:auto`)
      }
    }

    _update() {
      const prefix = this.config.prefix
      const rootNode = this.state.el

      if (this.config.align !== 'center') this.addClass(rootNode, this.config.leftAlignClsnm)
      else this.removeClass(rootNode, this.config.leftAlignClsnm)

      if (this.config.noAnchors) this.addClass(rootNode, this.config.noAnchorsClsnm)
      else this.removeClass(rootNode, this.config.noAnchorsClsnm)

      if (this.config.noScrollbar) this.addClass(rootNode, this.config.noScrollbarClsnm)
      else this.removeClass(rootNode, this.config.noScrollbarClsnm)

      this.removeAnchors()
      this.createAnchors()

      this.setSize()
      this.checkScrollable()
      this.checkBorderVisibility()

      if (!this.config.noScrollbar) {
        const scrolled = this.get('scrolled')
        this.animate(scrolled, scrolled, 0)
      }
    }

    checkElement(e) {
      return e.target.closest(`.${this.config.prefix}`) == this.state.el
    }


    onPointerDown(e) {
      const scrollable = this.get('scrollable')
      if (!e || !scrollable) return

      this.handleTouchStart(e)
      if (this.get('isAndroid') || !e.touches && (!e.originalEvent || !e.originalEvent.touches)) e.preventDefault()

      this.set('pointerDown', true)
      this.set('scrollbarPointerDown', false)
      this.set('mouseScroll', false)
      this.set('downEventTS', (new Date()).getTime())

      const diff = this.get('scrolled') + getEventX(e)
      this.set('scrolledDiff', diff)

      const prefix = this.config.prefix
      const rootNode = this.state.el
      const wrapperNode = getElement(`.${prefix}-strip`, rootNode)
      this.addClass(getElement('html'), this.config.draggingClsnm)

      return
    }

    onPointerMove(e) {
      const scrollable = this.get('scrollable')
      const pointerDown = this.get('pointerDown')

      if (!e || !pointerDown || !scrollable) return
      
      this.handleTouchMove(e)
      if (this.get('swipeDirection') == 'v') return
      
      e.preventDefault()

      const scrolledDiff = this.get('scrolledDiff')
      const scrolled = this.get('scrolled')

      // drag to left is positive number
      const currentPageX = getEventX(e)
      let result = scrolledDiff - currentPageX

      const limitLeft = this.get('limitLeft')
      const limitRight = this.get('limitRight')
      const scrollbarFactor = this.get('scrollbarFactor')
      let scrollbarResult = result * scrollbarFactor
      let scrollbarWidth = this.get('scrollbarWidth')

      if (result < limitLeft) {
        result = Math.round(0.2 * result)
        scrollbarWidth += Math.round(0.2 * scrollbarResult)
        scrollbarResult = 0
        this.setWidth(scrollbarWidth)
      }
      else if (result > limitRight) {
        result = Math.round(0.2 * result + 0.8 * limitRight)
        scrollbarWidth -= Math.round(0.8 * (result - limitRight) * scrollbarFactor)
        this.alignScbToRight()
        this.setWidth(scrollbarWidth)
      }
      else {
        this.releaseScb()
      }

      this.setPos(-1 * result)
      this.setScbPos(scrollbarResult)

      this.set('scrolled', result)
      this.set('moveEventTS', (new Date()).getTime())
      this.push('pageX', currentPageX)

      this.checkBorderVisibility()
      return false
    }

    onPointerUp(e) {
      const scrollable = this.get('scrollable')
      const pointerDown = this.get('pointerDown')

      if (!e || !pointerDown || !scrollable) return

      if (this.get('swipeDirection') == 'v') {
        this.set('pointerDown', false)
        this.set('scrollbarPointerDown', false)
        this.set('mouseScroll', false)
        this.set('swipeDirection', null)
        this.clear('pageX')
        return
      }

      e.preventDefault()
      this.set('pointerDown', false)

      const prefix = this.config.prefix
      const rootNode = this.state.el
      const wrapperNode = getElement(`.${prefix}-strip`, rootNode)
      this.removeClass(getElement('html'), this.config.draggingClsnm)

      const limitLeft = this.get('limitLeft')
      const limitRight = this.get('limitRight')
      const scrolled = this.get('scrolled')

      const lastPageX = this.getLastMeaningfull('pageX')
      const currentEventX = getEventX(e)
      const distanceDelta = currentEventX - lastPageX
      const timeDelta = ((new Date()).getTime() - this.get('moveEventTS')) / 1.5
      const endpoint = scrolled - (distanceDelta * 8)

      // clicked
      if (lastPageX === 0) {
        if (this.config.onClick) return this.config.onClick(e)

        const linkNode = e.target.closest('a')
        if (!linkNode) return

        const target = linkNode.getAttribute('target')
        const href = linkNode.getAttribute('href')
        const ctrlClick = e.ctrlKey || e.metaKey

        if (ctrlClick) return window.open(href)
        if (!target && href) return window.location.href = href
        if (target.indexOf('blank') > -1 && href) return window.open(href)
      }

      // dragged
      // sticky left
      if (scrolled < limitLeft) this.animate(scrolled, limitLeft, 10, true)
      // too much to left
      else if (endpoint < limitLeft) this.animate(scrolled, limitLeft, 10)
      // sticky right
      else if (scrolled > limitRight) this.animate(scrolled, limitRight, 10, true)
      // too much to right
      else if (endpoint > limitRight) this.animate(scrolled, limitRight, 10)
      // otherwise
      else if (timeDelta < 150 && Math.abs(distanceDelta) > 2) {
        const timeToEndpoint = Math.round(Math.abs(distanceDelta) / timeDelta)
        this.animate(scrolled, Math.round(endpoint), timeToEndpoint)
      }

      this.clear('pageX')
      return false
    }


    onClickLink(e) {
      const scrollable = this.get('scrollable')
      if (!scrollable) return e

      e.preventDefault()
      return false
    }


    onScroll(e) {
      const scrollable = this.get('scrollable')
      if (!e || !e.deltaX || Math.abs(e.deltaY) > Math.abs(e.deltaX) ||  !scrollable) return

      e.preventDefault()

      const {deltaX} = e
      const limitLeft = this.get('limitLeft')
      const limitRight = this.get('limitRight')
      const result = Math.min(Math.max(this.get('scrolled') + deltaX, limitLeft), limitRight)

      const scrollbarWidth = this.get('scrollbarWidth')
      const scrollbarFactor = this.get('scrollbarFactor')
      const scrollbarResult = result * scrollbarFactor

      this.setPos(-1 * result)

      if (result == limitRight) this.alignScbToRight()
      else this.releaseScb()
      
      this.setScbPos(scrollbarResult)
      this.setWidth(scrollbarWidth)
      this.set('scrolled', result)
      this.set('mouseScroll', true)

      this.checkBorderVisibility()
      return false
    }


    onScrollClick(e) {
      const scrollable = this.get('scrollable')
      const scrollClickDisabled = this.get('scrollClickDisabled')

      if (scrollClickDisabled) {
        this.set('scrollClickDisabled', false)
        return
      }
      
      if (!e || !e.preventDefault || !scrollable) return
      e.preventDefault()

      const scbWidth = this.get('scrollbarWidth')
      const scbFactor = this.get('scrollbarFactor')
      const limitLeft = this.get('limitLeft')
      const limitRight = this.get('limitRight')
      const rightScbLimit = limitRight * scbFactor
      const scrolled = this.get('scrolled')

      const pageX = getEventX(e)
      const center = pageX - scbWidth / 2
      const leftEdge = center - scbWidth / 2
      const rightEdge = center + scbWidth / 2
      
      let endpoint = center / scbFactor
      if (leftEdge < limitLeft) endpoint = limitLeft
      else if (rightEdge > rightScbLimit) endpoint = limitRight

      this.animate(scrolled, endpoint)
      return false
    }

    
    onAnchorClick(e) {
      const scrollable = this.get('scrollable')
      if (!e || !e.target || !scrollable) return 
      
      const anchorid = e.target.closest('[data-anchorid]').getAttribute('data-anchorid')
      if (!anchorid) return

      this.releaseScb()

      const prefix = this.config.prefix
      const rootNode = this.state.el
      const targetNode = getElement('[data-anchororiginid="' + anchorid + '"]', rootNode)
      
      const limitLeft = this.get('limitLeft')
      const limitRight = this.get('limitRight')
      const scrolled = this.get('scrolled')
      
      let endpoint = Math.min(Math.max(targetNode.offsetLeft, limitLeft), limitRight)
      if (Math.abs(endpoint) < 2) endpoint = 0

      this.set('mouseScroll', false)
      this.animate(scrolled, endpoint)
      return false
    }


    onScrollbarPointerDown(e) {
      if (!e) return
      e.preventDefault()
      e.stopPropagation()

      this.releaseScb()

      const currentPageX = getEventX(e)
      const scrolled = this.get('scrolled')
      const scrollbarFactor = this.get('scrollbarFactor')

      this.set('scrollbarPointerDown', true)
      this.set('scrollClickDisabled', true)
      this.set('pointerDown', false)
      this.set('mouseScroll', false)
      this.set('scrollbarDownPageX', currentPageX - scrolled * scrollbarFactor)

      return false
    }

    onScrollbarPointerMove(e) {
      const scbPointerDown = this.get('scrollbarPointerDown')
      if (!e || !scbPointerDown) return
      e.preventDefault()
      e.stopPropagation()

      const scrollbarFactor = this.get('scrollbarFactor')
      const scrollbarDownPageX = this.get('scrollbarDownPageX')
      const currentPageX = getEventX(e)
      
      const limitLeft = this.get('limitLeft')
      const limitRight = this.get('limitRight')
      const delta = (currentPageX - scrollbarDownPageX)
      const result = Math.min(Math.max(delta / scrollbarFactor, limitLeft), limitRight)
      const scrollbarResult = result * scrollbarFactor

      this.setPos(-1 * result)
      this.setScbPos(scrollbarResult)

      this.set('scrolled', result)
      this.checkBorderVisibility()
      return false
    }

    onScrollbarPointerUp(e) {
      const scbPointerDown = this.get('scrollbarPointerDown')
      
      if (!e || !scbPointerDown) return
      e.preventDefault()
      e.stopPropagation()

      this.set('scrollbarPointerDown', false)
      return false
    }


    handleTouchStart(e) {
      if (!e.touches && !e.originalEvent) return
      this.set('touchX', e.touches[0].clientX || e.originalEvent.touches[0].clientX)
      this.set('touchY', e.touches[0].clientY || e.originalEvent.touches[0].clientY)
    }

    handleTouchMove(e) {
      const touchX = this.get('touchX')
      const touchY = this.get('touchY')
      if (!touchX || !touchY || (!e.touches && !e.originalEvent)) return

      const xUp = e.touches[0].clientX || e.originalEvent.touches[0].clientX
      const yUp = e.touches[0].clientY || e.originalEvent.touches[0].clientY

      const xDiff = touchX - xUp
      const yDiff = touchY - yUp

      if (Math.abs(xDiff) > Math.abs(yDiff)) this.set('swipeDirection', 'h')
      else this.set('swipeDirection', 'v')

      this.set('touchX', 0)
      this.set('touchY', 0)
    }


    animate(start, stop=0, speed=10, animateWidth=false) {
      const delta = stop - start
      const time = Math.max(.05, Math.min(Math.abs(delta) / speed, 1))
      const scbFactor = this.get('scrollbarFactor')
      const rightScbLimit = this.get('limitRight') * scbFactor
      const limitRight = this.get('limitRight')

      let currentTime = speed == 0 ? 1 : 0,
          endpoint = this.get('scrolled'),
          scbEndpoint = endpoint * scbFactor

      const tick = () => {
        if (this.get('pointerDown') || this.get('mouseScroll')) return

        currentTime += (1 / 60)
        endpoint = currentTime < 1
          ? start + delta * this.config.easing(currentTime / time)
          : stop

        scbEndpoint = currentTime < 1
          ? start * scbFactor + delta * this.config.easing(currentTime / time) * scbFactor
          : stop * scbFactor
        
        scbEndpoint = Math.min(scbEndpoint, rightScbLimit)

        if (!animateWidth) {
          if (scbEndpoint >= rightScbLimit) this.alignScbToRight()
          else this.releaseScb()
          this.setScbPos(scbEndpoint)
        }
        else {
          let scbw = this.get('scrollbarWidth')
          if (start < stop) scbw -= delta * scbFactor * (1 - this.config.easing(currentTime / time))
          else scbw += delta * scbFactor * (1 - this.config.easing(currentTime / time))

          this.setWidth(scbw)
        }

        this.setPos(-1 * endpoint)
        this.set('scrolled', endpoint)

        if (currentTime < 1) raf(tick)
        else this.checkBorderVisibility()
      }

      return tick()
    }

    checkBorderVisibility() {
      const scrolled = this.get('scrolled')
      const limitLeft = this.get('limitLeft')
      const limitRight = this.get('limitRight')

      const prefix = this.config.prefix
      const rootNode = this.state.el

      if (scrolled > limitLeft) {
        const leftBorder = getElement(`.${prefix}-border--left`, rootNode)
        this.addClass(leftBorder, this.config.borderVsblClsnm)
      }
      else {
        const leftBorder = getElement(`.${prefix}-border--left`, rootNode)
        this.removeClass(leftBorder, this.config.borderVsblClsnm)
      }

      if (scrolled < limitRight) {
        const rightBorder = getElement(`.${prefix}-border--right`, rootNode)
        this.addClass(rightBorder, this.config.borderVsblClsnm)
      }
      else {
        const rightBorder = getElement(`.${prefix}-border--right`, rootNode)
        this.removeClass(rightBorder, this.config.borderVsblClsnm)
      }

    }


    // public API

    scrollTo(point, time=1000) {
      const limitRight = this.get('limitRight')
      const limitLeft = this.get('limitLeft')
      let endpoint = !isNaN(point) ? parseInt(point) : 0
      endpoint = Math.min(Math.max(endpoint, limitLeft), limitRight)

      if (point == 'end') endpoint = limitRight
      else if (point == 'start') endpoint = limitLeft
      else if (point == 'center') endpoint = limitRight / 2

      this.animate(this.get('scrolled'), endpoint, time)
    }

    update(config) {
      const {
        align=this.config.align,
        noAnchors=this.config.noAnchors,
        noScrollbar=this.config.noScrollbar,
        onClick=this.config.onClick
      } = config

      this.config.align = align
      this.config.noAnchors = noAnchors
      this.config.noScrollbar = noScrollbar
      this.config.onClick = onClick

      this._update()
    }
  }



  // init config

  const autoinit = () => {
    const els = getElements('.scroller')
    Array.from(els).forEach(el => {
      const scroller = new Scroller({ el })
    })
  }

  document.addEventListener('DOMContentLoaded', () => autoinit)

  document.onreadystatechange = () => {
    if (document.readyState == "interactive") autoinit()
  }

  window.Scroller = Scroller

}())
