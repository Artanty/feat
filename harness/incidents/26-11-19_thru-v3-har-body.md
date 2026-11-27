# 26-11-19 — thru dropped the body without a content-type

**Symptom:** browser POSTs through thru arrived empty (live HAR from
chat.twc1.net). **Root cause:** v2 only forwarded the body when the caller
sent an explicit content-type; browsers omit it on some fetch shapes.
**Fix:** thru v3 — body is ALWAYS sent when the caller supplies one.
