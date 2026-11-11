import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toDataURL
    Object.assign(window, { lensMapBuilds: 0 })
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      ;(window as unknown as { lensMapBuilds: number }).lensMapBuilds++
      return original.apply(this, args)
    }
  })
  await page.goto('/tests/fixtures/refraction.html')
  await expect(page.locator('[data-refraction-image] image[filter]')).toBeVisible()
})

test('nested scrolling updates the visible lens without React commits or rebuilding optics', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const state = window as unknown as { lensCommits: number; lensMapBuilds: number }
    state.lensCommits = 0
    const initialBuilds = state.lensMapBuilds
    const image = document.querySelector<SVGImageElement>('image[filter]')!
    const map = document.querySelector('feImage')!.getAttribute('href')
    const surface = document.querySelector<HTMLElement>('[data-refraction-image]')!
    const backdrop = document.querySelector<HTMLElement>('#backdrop')!
    const inner = document.querySelector('#inner')!
    const outer = document.querySelector('#outer')!
    const frames: { error: number; visible: boolean; y: number }[] = []
    for (let i = 0; i < 24; i++) {
      if (i === 0) window.dispatchEvent(new Event('resize'))
      inner.scrollTop = (i + 1) * 12
      outer.scrollTop = (i + 1) * 2
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      const y = Number(image.getAttribute('y'))
      frames.push({ error: Math.abs(y - (backdrop.getBoundingClientRect().top - surface.getBoundingClientRect().top)), visible: image.isConnected && getComputedStyle(surface).display !== 'none', y })
    }
    return { commits: state.lensCommits, builds: state.lensMapBuilds - initialBuilds, sameMap: map === document.querySelector('feImage')!.getAttribute('href'), frames }
  })
  expect(result.commits).toBe(0)
  expect(result.builds).toBe(0)
  expect(result.sameMap).toBe(true)
  expect(result.frames.every(f => f.visible && f.error < 0.5)).toBe(true)
  expect(result.frames.at(-1)!.y).toBeLessThan(result.frames[0].y - 250)
})

test('late image resize and visual viewport events realign the source', async ({ page }) => {
  await page.locator('#backdrop').evaluate(el => { el.style.width = '300px' })
  await expect(page.locator('image[filter]')).toHaveAttribute('width', '300')
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-refraction-image]')!.style.left = '30.5px'
    window.visualViewport!.dispatchEvent(new Event('scroll'))
  })
  await expect(page.locator('image[filter]')).toHaveAttribute('x', '-20.5')
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-refraction-image]')!.style.top = '500px'
    window.visualViewport!.dispatchEvent(new Event('resize'))
  })
  await expect(page.locator('image[filter]')).toHaveAttribute('y', '-440')
})

test('unmount cancels a queued scroll write and remounts a fresh working lens', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('#inner').evaluate(el => { el.scrollTop = 120 })
  await page.getByRole('button', { name: 'Toggle lens' }).click()
  await expect(page.locator('[data-refraction-image]')).toHaveCount(0)
  await page.locator('#inner').evaluate(el => { el.scrollTop = 240 })
  await page.getByRole('button', { name: 'Toggle lens' }).click()
  await expect(page.locator('image[filter]')).toHaveAttribute('y', '-710')
  expect(errors).toEqual([])
})

test('demo pill retains the image refraction while its background moves', async ({ page }) => {
  await page.goto('/?engine=image&shape=pill')
  await expect(page.locator('image[filter]')).toBeVisible()
  const before = await page.locator('image[filter]').getAttribute('y')
  await page.locator('img').evaluate(async el => {
    await (el as HTMLImageElement).decode()
    el.parentElement!.scrollTop = 300
  })
  await expect.poll(() => page.locator('image[filter]').getAttribute('y')).not.toBe(before)
  await expect(page.locator('feDisplacementMap')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '首页', exact: true })).toBeVisible()
})

test('displacement changes rendered pixels, not just SVG attributes', async ({ page }) => {
  const surface = page.locator('[data-refraction-image]')
  const refracted = await surface.screenshot({ animations: 'disabled' })
  await page.locator('feDisplacementMap').evaluate(el => el.setAttribute('scale', '0'))
  const flat = await surface.screenshot({ animations: 'disabled' })
  expect(refracted.equals(flat)).toBe(false)
})
