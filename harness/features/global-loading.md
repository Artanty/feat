# global-loading

Docs: `back/docs/global-loading.md`; code:
`back/features/global-loading/v1/js-web/` + `v1/sdui/envelope.json`
(src in `back/src/global-loading/`).

Full-screen blocking loader driven by bus signals; pairs with http-gate
recovery episodes. The sdui namespace is a DivKit gif-spinner envelope
(animated-SVG data URL — animates under <img>, no network request) consumed by
the ext side-panel while a tab's envelope loads (stat via thru can take ~30s).
