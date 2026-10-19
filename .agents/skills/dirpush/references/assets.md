# Screenshots and galleries

Screenshots must show the **real product**. Cropping/resizing is fine; fabricating or mocking up UI is not.

## Capture (needs `dirpush permission assets.capture_new`)

When `assets.capture_new` is `confirm`, request approval at the product level. Do not block a directory submission job for this permission:

```bash
LAUNCH_WORKER=codex bun src/cli.ts assets request-capture --product <id>
LAUNCH_WORKER=codex bun src/cli.ts assets capture-approval --product <id>
# After the dashboard shows status `approved`, capture the product's real UI.
LAUNCH_WORKER=codex bun src/cli.ts assets capture-complete <approval-id>
```

The request appears in **Needs you** under the selected product. Approval covers capturing assets for that product only; it does not approve any directory submission. Gallery approval is a separate product-level decision after the screenshots are captured.

```bash
dirpush ab open https://<product-url>/<view>
dirpush ab set viewport 1440 900
dirpush ab screenshot workspace/products/<product-id>/assets/screenshots/<id>.png
```

Paths in galleries are relative to `workspace/products/<product-id>/`. Pick views that show what `product.yaml` features claim. Add each to `screenshots:` in `product.yaml` only with the human's OK.

## Logo

Upload fields almost always want a raster image. `product.assets.icon` is the PNG to upload; `assets.logo` may be SVG. If `icon` is missing and the logo is SVG:

```bash
rsvg-convert -w 512 -h 512 workspace/products/<id>/assets/brand/logo.svg -o workspace/products/<id>/assets/brand/logo.png
```

then set `assets.icon: assets/brand/logo.png` in `product.yaml` (that's a file-format copy, not a new asset; no approval needed).

## Gallery approval

A gallery is an ordered list of screenshots that may be reused for every directory once approved.

```bash
dirpush gallery approved --product <id>     # current approved revision, or null
dirpush gallery propose --product <id> --job <job> --input '[{"id":"dashboard","path":"assets/screenshots/dashboard.png","description":"Main dashboard"}]'
# --job blocks the job (type gallery_approval) so its lease can't expire during review.
dirpush wait <job>      # in the background if the human is present; returns when they approve/reject
dirpush work claim <job> && dirpush gallery approved --product <id>
```

The human approves in the dashboard (Actions tab) or with `dirpush gallery approve <rev>`; either way every job parked on that product's gallery goes back to the queue. Once approved, reuse it without asking. Ask again only when a directory needs materially different media (e.g. a different aspect ratio or a video) or you want to add new imagery.
