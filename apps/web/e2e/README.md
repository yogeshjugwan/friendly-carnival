# Web smoke test (Playwright)

Two browser contexts with fake camera/mic (`--use-fake-device-for-media-stream`)
go through **match → chat → next**. Not run in CI.

```bash
pnpm install
cd apps/web && npx playwright install chromium   # once
pnpm dev                                        # from the repo root: web :3000 + server :4100
cd apps/web && pnpm e2e                          # in another terminal
```

- `E2E_BASE_URL` points it at another web URL (default `http://localhost:3000`). Only use local servers:
  the test ticks the 18+ box and starts chats.
- `E2E_MODE=video` runs it in video mode instead of text (the on-device face check may hold a fake
  camera, which shows no face).
- The two contexts must be the only people searching, or they may match someone else.
