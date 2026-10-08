// Fills in browser APIs that jsdom lacks, for renderer tests (main-process tests run in Node and skip this).
// Electron's Chromium has all of them; these stand-ins only model what the components rely on.

if (typeof window !== 'undefined') {
  const proto = Object.getPrototypeOf(document.createElement('dialog')) as HTMLDialogElement
  if (typeof proto.showModal !== 'function') {
    // showModal/close toggle `open` and fire `close`, like the real ones; Escape is simulated by firing `cancel`
    Object.assign(proto, {
      showModal(this: HTMLDialogElement) {
        this.setAttribute('open', '')
      },
      show(this: HTMLDialogElement) {
        this.setAttribute('open', '')
      },
      close(this: HTMLDialogElement) {
        if (!this.hasAttribute('open')) return
        this.removeAttribute('open')
        this.dispatchEvent(new Event('close'))
      }
    })
    Object.defineProperty(proto, 'open', {
      get(this: HTMLDialogElement) {
        return this.hasAttribute('open')
      },
      configurable: true
    })
  }

  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false
      }) as MediaQueryList
  }
}
