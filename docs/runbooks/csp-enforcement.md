# Runbook: promoting the Content-Security-Policy from Report-Only

The full resource policy — the directives that decide where scripts, images,
connections and frames may come from — has been Report-Only since it was
introduced. That was the right way to introduce it: this app loads a lot at
runtime (the Maps SDK pulls further scripts and workers, Firebase Auth opens
provider popups, the radar layer fetches third-party tiles), and a wrong CSP
breaks a working page. But Report-Only enforces nothing, so until this is done
the app carries the maintenance cost of a CSP and none of the protection.

## The switch

`CSP_ENFORCE_RESOURCES=true` in the environment. Set in `next.config.js`; no code
change and no rebuild of the policy itself.

| Flag | `Content-Security-Policy` | `Content-Security-Policy-Report-Only` |
| --- | --- | --- |
| unset / `false` | baseline only (`object-src`, `base-uri`, `form-action`, `frame-ancestors`) | full resource policy |
| `true` | full resource policy | *not sent* |

The Report-Only header is dropped when enforcing, deliberately: sending both
makes the browser evaluate the same policy twice and report every violation
twice, which makes the report noise look like a regression.

## Rolling it out

1. **Collect reports first.** Set `CSP_REPORT_URI` to a collector. Without it,
   violations only appear in each visitor's own console, where nobody sees them.
   Leave it a few days of real traffic — the long tail here is Places photos and
   avatar hosts, which only appear when someone opens the right place.
2. **Preview.** Set `CSP_ENFORCE_RESOURCES=true` on a preview deployment. Then
   exercise, specifically:
   - the map loading, panning, and marker popups
   - **Google and Apple sign-in popups** (`frame-src`)
   - the radar/weather layer (`img-src`, `connect-src` → rainviewer)
   - place photos and user avatars (`img-src` → `ggpht`, `googleusercontent`)
   - the route planner drawing a snapped path (`connect-src` → our own API)
   - GPX import (`worker-src`, `blob:`)
   With DevTools open. A CSP failure is a console error and a missing element,
   not an exception — it is easy to miss if you are only clicking around.
3. **Production.** Set the same variable. Watch the report collector and the
   error rate for one release cycle.
4. **Make it the default.** Once a release has run enforced without violations,
   promote the resource policy to unconditional in `next.config.js` and delete
   the flag. A permanent flag is a permanent way to accidentally turn the policy
   off.

## Rolling back

Unset the variable. It takes effect on the next request — no deploy, no build.
That instant rollback is the entire reason this is an environment variable
rather than an edit to the policy array.

## If something breaks

The console names the directive and the blocked URL. Add the host to that
directive in `CSP_RESOURCE_POLICY` in `next.config.js` and redeploy.

Resist the reflex to widen a directive to `*` or to add `'unsafe-inline'` to
something that does not already have it. `script-src` already carries
`'unsafe-inline'` and `'unsafe-eval'` because Next's hydration bootstrap and the
Maps SDK genuinely require them; that is a known gap with its own remediation
(nonce-based CSP, §12 of the security guide), not a precedent.
