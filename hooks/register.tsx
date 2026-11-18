import { atom, read, update } from 'claude-code'
import type { Register, RenderChildren } from 'claude-code'

import type { Recent } from '../types'

const KEEP = 4
// Rows the band may take.
const MAX_ROWS = 16
// Rows one message may take: the newest, then each older one.
const NEWEST_ROWS = 6
const OLDER_ROWS = 3
const BULLET = '● '

// Change the tag when a message's fields change: it declines what an earlier
// version stored, which outlives a reload.
const recent = atom({ plugin: 'pinned-replies', key: 'recent' } as const, [], {
  shape: 'recent-1',
})
const isHidden = atom({ plugin: 'pinned-replies', key: 'isHidden' } as const, false)
const isCollapsed = atom({ plugin: 'pinned-replies', key: 'isCollapsed' } as const, false)
const isOlderHidden = atom({ plugin: 'pinned-replies', key: 'isOlderHidden' } as const, false)
// True once the person has sent a prompt Claude has not replied to yet: every reply is then old.
const isStale = atom({ plugin: 'pinned-replies', key: 'isStale' } as const, false)
// The message shown in full, by its text; it lets go once the message leaves the band.
const expanded = atom({ plugin: 'pinned-replies', key: 'expanded' } as const, null)

const keepLast = (list: Recent, text: string): Recent => [...list, text].slice(-KEEP)

// Drops the markdown marks that read as noise in plain text.
const clean = (text: string) =>
  text
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\*\*|`/g, '')

// Word-wraps each line of text into rows of at most `width` cells (`firstWidth`
// for the first row), blank lines dropped.
function wrap(text: string, width: number, firstWidth = width): string[] {
  const rows: string[] = []
  const limit = () => (rows.length ? width : firstWidth)
  for (const line of text.split('\n')) {
    let row = ''
    for (let word of line.trim().split(/\s+/)) {
      if (!word) continue
      if (row && row.length + 1 + word.length > limit()) {
        rows.push(row)
        row = ''
      }
      while (!row && word.length > limit()) {
        const cut = limit()
        rows.push(word.slice(0, cut))
        word = word.slice(cut)
      }
      row = row ? `${row} ${word}` : word
    }
    if (row) rows.push(row)
  }

  return rows.length ? rows : ['']
}

const ellipsize = (row: string, width: number) =>
  `${row.length >= width ? row.slice(0, width - 1) : row}…`

type Placed = { text: string; rows: string[] }

// Fits the messages into `budget` rows: the `full` one whole (the band scrolls
// past its height), one row each for the rest (oldest dropped when there are too
// few), then what is left to the newest, then to the older ones. The band's
// first row is `firstWidth` wide, as it holds the toggles.
function layout(
  list: Recent,
  budget: number,
  width: number,
  firstWidth: number,
  full: string | null,
): Placed[] {
  const newestFirst = list
    .slice(-budget)
    .map((text, i) => ({ text, rows: wrap(clean(text), width, i === 0 ? firstWidth : width) }))
    .reverse()
  const counts = newestFirst.map(m => (m.text === full ? m.rows.length : 1))
  let left = budget - counts.reduce((sum, n) => sum + n, 0)
  newestFirst.forEach((m, i) => {
    if (m.text === full) return
    const cap = Math.min(i === 0 ? NEWEST_ROWS : OLDER_ROWS, m.rows.length)
    const extra = Math.max(0, Math.min(left, cap - 1))
    counts[i] = (counts[i] ?? 1) + extra
    left -= extra
  })

  return newestFirst
    .map((m, i) => {
      const count = counts[i] ?? 1
      const rows = m.rows.slice(0, count)
      const isFirstRow = i === newestFirst.length - 1 && count === 1
      if (m.rows.length > count) {
        rows[count - 1] = ellipsize(rows[count - 1] ?? '', isFirstRow ? firstWidth : width)
      }

      return { text: m.text, rows }
    })
    .reverse()
}

export const register: Register = on => {
  // The transcript's reply blocks drawn whole on screen now, their text by site.
  // A pinned message among them is left out of the band, as it is in view anyway.
  // Only the fullscreen terminal says what is on screen; elsewhere this stays empty.
  const inView = new Map<string, string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pinned',
      description: "Show or hide Claude's last messages pinned above the prompt",
    })
    // A resumed session starts with its last replies; a reload keeps what it had.
    const seeded = (await $.session.messages())
      .filter(m => m.role === 'assistant' && m.text.trim())
      .map(m => m.text.trim())
      .slice(-KEEP)
    await update($, recent, list => (list.length ? list : seeded))

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, recent, () => [])
      await update($, isStale, () => false)
    }

    return next(e)
  })

  on('command.run', { command: 'pinned' }, async $ => {
    let hidden = false
    await update($, isHidden, was => (hidden = !was))

    return { text: hidden ? 'Pinned replies hidden.' : 'Pinned replies shown.' }
  })

  on('prompt.submit', async ($, e, next) => {
    const isTyped = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (isTyped && !e.command && !e.isMeta) await update($, isStale, () => true)

    return next(e)
  })

  on('session.append', { door: 'response' }, async ($, e, next) => {
    const stored = await next(e)
    if (e.agentId === undefined && 'message' in stored && stored.message?.type === 'assistant') {
      const text = stored.message.content
        .flatMap(block => (block.type === 'text' ? [block.text] : []))
        .join('\n')
        .trim()
      if (text) {
        await update($, recent, list => keepLast(list, text))
        await update($, isStale, () => false)
      }
    }

    return stored
  })

  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    const at = e.props.onScreen
    // Row 0 is the blank row the engine draws above a message.
    const isWhole = !!at && at.first <= 1 && at.last >= at.of - 1
    const site = `${e.requestId}\n${e.props.text}`
    if (isWhole !== inView.has(site)) {
      if (isWhole) inView.set(site, e.props.text.trim())
      else inView.delete(site)
      $.ui.invalidate('ui.render')
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, recent)
    const budget = Math.min(e.props.maxRows, MAX_ROWS)
    const width = e.props.bodyColumns - BULLET.length
    if (e.props.hasSurvey || list.length === 0 || budget < 1 || width < 10 || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const collapsed = await read($, isCollapsed)
    const olderHidden = await read($, isOlderHidden)
    const stale = await read($, isStale)
    const older = stale ? list.length : list.length - 1
    const hasOlder = older > 0
    // The toggles stand in for the first row's bullet, so they cost no row of their own.
    const toggle = (
      <Button
        key="toggle"
        label={collapsed ? '▸' : '▾'}
        plain
        dimColor
        onPress={() => update($, isCollapsed, was => !was)}
      />
    )
    const olderToggle = (
      <Button
        key="older"
        label={olderHidden ? '+' : '−'}
        plain
        dimColor
        onPress={() => update($, isOlderHidden, was => !was)}
      />
    )
    const band = (children: RenderChildren) => (
      <Box flexDirection="column">
        {children}
      </Box>
    )
    // A row with the toggles at its right end, beside the engine's own [-].
    const withToggles = (content: RenderChildren) => (
      <Box flexDirection="row" columnGap={1}>
        <Box flexGrow={1}>{content}</Box>
        {toggle}
        {hasOlder && !collapsed ? olderToggle : null}
      </Box>
    )
    const note = (text: string) => (
      <Text dimColor wrap="truncate-end">
        {text}
      </Text>
    )

    if (collapsed) {
      return band(withToggles(note(`${list.length} ${list.length === 1 ? 'reply' : 'replies'} collapsed`)))
    }

    const current = olderHidden ? list.slice(older) : list
    if (current.length === 0) {
      return band(withToggles(note(`${older} older ${older === 1 ? 'reply' : 'replies'} hidden`)))
    }
    const visible = new Set(inView.values())
    const shown = current.filter(text => !visible.has(text))
    if (shown.length === 0) return next(e)

    // Each toggle is one glyph and a gap.
    const firstWidth = width - (hasOlder ? 4 : 2)
    const messages = layout(shown, budget, width, firstWidth, await read($, expanded))

    return band(
      messages.flatMap(({ text, rows }, i) => {
        const isNewest = text === list[list.length - 1]
        const dim = !isNewest || stale
        // Every row of a message is one press away from showing it whole, or capped again.
        const row = (line: string, j: number) => (
          <Button
            key={`m${i}-${j}`}
            label={(j === 0 ? BULLET : ' '.repeat(BULLET.length)) + line}
            plain
            dimColor={dim}
            onPress={() => update($, expanded, was => (was === text ? null : text))}
          />
        )

        return rows.map((line, j) => (i === 0 && j === 0 ? withToggles(row(line, j)) : row(line, j)))
      }),
    )
  })
}
