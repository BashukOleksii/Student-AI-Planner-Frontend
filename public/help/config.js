/* Local Docsify 5.1.0 + its bundled search plugin. No API or CDN requests. */
;(function () {
  let saved
  try {
    saved = localStorage.getItem('planner-help-theme')
  } catch {
    /* Reading remains available with blocked storage. */
  }
  document.documentElement.dataset.theme =
    saved === 'dark' || (saved !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
      ? 'dark'
      : 'light'

  window.$docsify = {
    name: 'Student AI Planner',
    nameLink: '#/',
    routerMode: 'hash',
    loadSidebar: true,
    alias: { '/.*/_sidebar.md': '/_sidebar.md' },
    coverpage: false,
    auto2top: true,
    subMaxLevel: 2,
    maxLevel: 3,
    executeScript: false,
    skipLink: 'До основного вмісту',
    notFoundPage: '_404.md',
    search: {
      paths: 'auto',
      placeholder: 'Пошук у посібнику',
      noData: 'Нічого не знайдено. Спробуйте інше слово.',
      depth: 3,
      namespace: 'student-planner-help-v3',
      maxAge: 86400000,
    },
    plugins: [
      function (hook) {
        hook.afterEach(function (html) {
          return (
            '<nav class="help-crumb" aria-label="Шлях у довіднику"><a href="#/">Довідник</a> / Посібник студента</nav>' +
            html
          )
        })
        hook.doneEach(function () {
          document.querySelector('.sidebar-nav')?.setAttribute('aria-label', 'Розділи посібника')
          document.title =
            (document.querySelector('#main h1')?.textContent || 'Допомога') +
            ' · Student AI Planner'
        })
      },
    ],
  }
})()
