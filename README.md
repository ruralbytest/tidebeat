# Tidebeat Race

A Three.js catamaran rhythm-rowing time trial. Single-file game (`index.html`); row to the beat, catch the wind, and steer your crew to the finish.

This is a fan-made, non-commercial personal project. It is not affiliated with, endorsed by, or sponsored by any film, studio, or rights holder.

## Controls

- `SPACE` / tap — row to the beat
- `←` / `→` or `A` / `D` — steer
- `↑` / `↓` or `W` / `S` — trim sail

## Testing

`verify.js` drives the game headlessly via `window.__test` using Playwright:

```
npm test
```
