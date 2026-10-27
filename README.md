# context-meter

A mod for Claude Code that shows how full the context window is, and gives you
escalating warnings as it fills. A small orange Claude mascot lives on the bar:
it strolls around while there is plenty of room, panics more and more as usage
climbs, and from 70% tries (and fails) to push the bar back.

## What you get

- **Status line and band** above the prompt with a progress bar and percentage,
  colored green, yellow (50%), orange (70%) and red (90%).
- **A toast at every additional 10%** with its own message, the token count, and
  longer display time as it gets more serious. At 80% and above you also get a
  native notification.
- **Smart re-arming:** if you `/compact` or `/clear`, the alerts reset for the
  climb back up. A jump over several steps announces only the highest one.
- **The mascot:** calm under 30%, wary to 50%, flailing to 70%, then shoving the
  bar back (and losing) at 70%, 80% and 90%, and `x_x` at 100%.
- `/context-meter` hides or shows the band.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install context-meter --marketplace Yuds16/context-meter
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install context-meter --marketplace Yuds16/context-meter
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box,
then Plugins, Add marketplace with `Yuds16/context-meter`, then Add plugin.

## Customizing

The alert wording lives in the `MESSAGES` table, and the mascot's moods in
`frameOf`, both in `hooks/register.tsx`.

## License

MIT
