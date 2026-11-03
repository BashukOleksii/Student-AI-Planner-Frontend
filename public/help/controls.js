;(function () {
  const button = document.getElementById('help-theme')
  function update() {
    button.setAttribute('aria-pressed', String(document.documentElement.dataset.theme === 'dark'))
  }
  update()
  button.addEventListener('click', function () {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('planner-help-theme', theme)
    } catch {
      /* Theme still works without persistence. */
    }
    update()
  })

  // Adapt the pinned Docsify controls without modifying distributed vendor files.
  function attribute(element, name, value) {
    if (element && element.getAttribute(name) !== value) element.setAttribute(name, value)
  }
  function localize() {
    attribute(document.querySelector('.search input'), 'aria-label', 'Пошук у посібнику')
    const clear = document.querySelector('.search .clear-button')
    attribute(clear, 'title', 'Очистити пошук')
    attribute(clear, 'aria-label', 'Очистити пошук')
    const clearText = clear?.querySelector('span')
    if (clearText && clearText.textContent !== 'Очистити пошук')
      clearText.textContent = 'Очистити пошук'
    document
      .querySelectorAll('.search kbd')
      .forEach((kbd) => attribute(kbd, 'title', 'Перейти до пошуку'))
    const status = document.querySelector('.search .results-status')
    const count = status?.textContent.match(/^Found (\d+) results$/)
    if (count) status.textContent = 'Знайдено результатів: ' + count[1]
    document
      .querySelectorAll('.matching-post')
      .forEach((post, index) => attribute(post, 'aria-label', 'Результат пошуку ' + (index + 1)))
    const toggle = document.querySelector('.sidebar-toggle')
    attribute(toggle, 'title', 'Показати або сховати зміст')
    attribute(toggle, 'aria-label', 'Показати або сховати зміст')
    attribute(toggle, 'aria-controls', '__sidebar')
    attribute(toggle, 'tabindex', '0')
    // v5.1.0 nests a role=button div inside a native button. Keep one native control.
    const decoration = toggle?.querySelector('.sidebar-toggle-button')
    for (const name of [
      'role',
      'tabindex',
      'aria-label',
      'aria-controls',
      'aria-keyshortcuts',
      'aria-expanded',
    ]) {
      if (decoration?.hasAttribute(name)) decoration.removeAttribute(name)
    }
  }
  new MutationObserver(localize).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label'],
  })
  localize()
})()
