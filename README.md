# Claude 4 latest messages pinned

A Claude Code plugin that pins Claude's last 4 messages in a band right above the prompt, so you never have to scroll up to find what Claude last told you while it works through a task.

- Every pinned message is drawn dimmed, so the band stays quieter than the chat. Once you send a new prompt, Claude's latest reply counts as an older one until Claude replies again.
- Long messages are capped (the newest at 6 lines, older ones at 3) and end with `…`. Click any line of a message to show it in full; click again to cap it.
- `▾` / `▸` at the right of the first row collapses the whole band to one line, or expands it.
- `−` / `+` beside it hides the dimmed messages, so only the current one shows, or brings them back.
- A message already fully visible in the chat above is left out of the band; when it scrolls out of view it comes back. (Claude Code reports what is on screen only in its fullscreen layout, the default outside tmux; elsewhere the band keeps every message.)
- `/pinned` hides or shows the band altogether.
- The setup is remembered: `▾` / `▸`, `−` / `+` and `/pinned` are stored as you change them, and every new chat starts that way (an open chat takes it on `/reload-plugins`).
- Only Claude's text replies in the main conversation are pinned: tool output and subagents' replies are left out. Resuming a session fills the band from its history; `/clear` empties it.

Without a mouse: `ctrl+x tab` focuses the band, Tab moves between its buttons, Enter presses one.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install pinned-replies --marketplace hreinssondev/Claude-4-latest-messages-pinned
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```
claude plugin install pinned-replies --marketplace hreinssondev/Claude-4-latest-messages-pinned
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `hreinssondev/Claude-4-latest-messages-pinned`, then Add plugin.

Needs a recent Claude Code: it is built on the plugin function-hooks API (early access), against Claude Code 2.1.311.

## Develop

`hooks/register.tsx` is the whole plugin. `claude plugin validate .` checks it, `claude plugin test .` runs `tests/`, and `claude --plugin-dir .` starts a session with it loaded from this folder.

## License

MIT
