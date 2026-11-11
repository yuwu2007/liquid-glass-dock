/** Keep an image-backed lens aligned without a React commit for every scroll frame.
 * This aligns a known image; it does not capture or copy the page's DOM.
 */
export function observeRefractionBackdrop(
  surface: HTMLElement,
  image: SVGImageElement,
  backdrop?: HTMLElement | null,
): () => void {
  let frame = 0
  let disposed = false
  const previous: Record<string, number> = {}

  const update = () => {
    frame = 0
    if (disposed || document.hidden) return
    // Complete layout reads before any SVG writes. Subpixel positions matter on iOS.
    const a = surface.getBoundingClientRect()
    const b = backdrop?.getBoundingClientRect()
    const box = b && b.width > 0 && b.height > 0
      ? { x: b.left - a.left, y: b.top - a.top, width: b.width, height: b.height }
      : { x: 0, y: 0, width: a.width, height: a.height }
    for (const [name, value] of Object.entries(box)) {
      if (previous[name] === value) continue
      image.setAttribute(name, String(value))
      previous[name] = value
    }
  }
  const schedule = () => {
    if (!disposed && !frame) frame = requestAnimationFrame(update)
  }
  const options = { passive: true, capture: true }
  const viewport = window.visualViewport
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
  observer?.observe(surface)
  if (backdrop) observer?.observe(backdrop)
  // Capture receives nested scrollers too. visualViewport covers Safari's address bar/keyboard.
  window.addEventListener('scroll', schedule, options)
  window.addEventListener('resize', schedule, { passive: true })
  viewport?.addEventListener('scroll', schedule, { passive: true })
  viewport?.addEventListener('resize', schedule, { passive: true })
  backdrop?.addEventListener('load', schedule)
  document.addEventListener('visibilitychange', schedule)
  update()

  return () => {
    disposed = true
    if (frame) cancelAnimationFrame(frame)
    observer?.disconnect()
    window.removeEventListener('scroll', schedule, true)
    window.removeEventListener('resize', schedule)
    viewport?.removeEventListener('scroll', schedule)
    viewport?.removeEventListener('resize', schedule)
    backdrop?.removeEventListener('load', schedule)
    document.removeEventListener('visibilitychange', schedule)
  }
}
