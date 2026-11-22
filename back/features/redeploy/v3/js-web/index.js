/**
 * redeploy feature — "retrigger this project's last deploy run" button (js-web, v3).
 *
 * Contract: back/spec/redeploy.md. Mounted by a host's FeatureSlot:
 *
 *   <redeploy-button src="https://stat-back/req/retrigger" project="stat" namespace="web"
 *                    thru="https://feat.twc1.net/thru"></redeploy-button>
 *
 * On click sends {"project": "<project>@<namespace>"} to src (a feat req recipe route —
 * the machinery behind it is invisible to the host) and mirrors the result in the title.
 * Optional token-key attr: localStorage key whose value is sent as X-Totp-Auth (for
 * hosts that gate src behind a session header their fetch stack doesn't add for us).
 *
 * v2 — optional `thru` attr (base URL of a thru route): when set, the call is routed
 * through it (GET <thru>?target=<src>&method=post&body=…&timeout_s=…). The thru
 * TRANSPORT knowledge lives HERE (shared feat code) so hosts never hardcode it — the
 * host passes only URLs as attrs (config data). Use case: src sits on a sleeping
 * free-tier backend whose unanswered CORS preflight kills direct browser POSTs; thru
 * (always-on) fetches server-side — that fetch both wakes the backend and carries the
 * call. timeout-s attr (default 120) covers the cold start. Optional token-key in thru
 * mode sends X-Totp-Auth on the thru request itself.
 *
 * v3 — ALL attrs are read at CLICK time, not captured at connect. Hosts (React et al.)
 * update attributes on the SAME element instance when the slot's data changes (e.g.
 * another run's card opens); v2 closed over the first render's values and clicked with
 * the STALE project (stat bug: viewing tik@back, click sent stat@back). The title/labels
 * and the redeploy:done detail likewise use the click-time values.
 *
 * Required attrs missing at connect → renders nothing. No runtime envs.
 */
class RedeployButton extends HTMLElement {
  connectedCallback() {
    this.style.display = 'inline-flex';
    this.style.alignItems = 'center';
    if (!this.attr('src') || !this.attr('project') || !this.attr('namespace')) return; // renders nothing — host stays clean

    const label = document.createElement('span');
    label.textContent = '⟳';
    const text = document.createElement('span');
    text.textContent = 'Redeploy';

    const style = document.createElement('style');
    style.textContent = `
      :host { display: inline-flex; }
      button {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 4px 10px; font-size: 12px; line-height: 1.3;
        background: transparent; color: inherit;
        border: 1px solid currentColor; opacity: 0.7;
        border-radius: 4px; cursor: pointer;
      }
      button:hover:not(:disabled) { opacity: 1; }
      button:disabled { cursor: default; opacity: 0.45; }
    `;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.append(label, text);
    this.refreshTitle = () => {
      btn.title = `Retrigger ${this.attr('project')}@${this.attr('namespace')} last deploy run`;
    };
    this.refreshTitle();

    let timer = null;
    const feedback = (msg, ms) => {
      btn.title = msg;
      clearTimeout(timer);
      timer = setTimeout(() => this.refreshTitle(), ms);
    };
    const done = (ok, response) => {
      this.dispatchEvent(new CustomEvent('redeploy:done', {
        bubbles: true, detail: { ok, project: `${this.attr('project')}@${this.attr('namespace')}`, response },
      }));
    };

    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        // CLICK-TIME reads: the host may have updated attrs since connect (v3)
        const src = this.attr('src');
        const project = `${this.attr('project')}@${this.attr('namespace')}`;
        const headers = { 'Content-Type': 'application/json' };
        const tokenKey = this.attr('token-key');
        if (tokenKey) {
          try {
            const token = localStorage.getItem(tokenKey);
            if (token) headers['X-Totp-Auth'] = token;
          } catch { /* storage unavailable — send without token */ }
        }
        // thru transport (v2): route the same POST through an always-on thru route —
        // GET <thru>?target=<src>&method=post&body=<json>&timeout_s=<n>
        const thru = this.attr('thru');
        let url = src;
        let init = { method: 'POST', headers, body: JSON.stringify({ project }) };
        if (thru) {
          const timeoutS = parseInt(this.attr('timeout-s'), 10) || 120;
          const query = new URLSearchParams({
            target: src,
            method: 'post',
            body: JSON.stringify({ project }),
            timeout_s: String(timeoutS),
          });
          url = `${thru}?${query}`;
          init = { method: 'GET', headers };
        }
        const res = await fetch(url, init);
        const raw = await res.text();
        let parsed = raw;
        try { parsed = JSON.parse(raw); } catch { /* non-JSON upstream body */ }
        if (res.ok) {
          feedback(`deploy retriggered${parsed?.run?.name ? `: ${parsed.run.name}` : ''}`, 6000);
          done(true, parsed);
        } else {
          feedback((parsed?.error || `failed (${res.status})`).slice(0, 140), 9000);
          done(false, parsed);
        }
      } catch (e) {
        feedback(`failed: ${e.message}`.slice(0, 140), 9000);
        done(false, undefined);
      } finally {
        btn.disabled = false;
      }
    });

    this.append(style, btn);
    this.dispatchEvent(new CustomEvent('feat:ready', {
      bubbles: true, detail: { project: this.attr('project'), namespace: this.attr('namespace') },
    }));
  }

  /** Click-time attr read: hosts update attributes on the live element (React), so
   *  values must never be captured at connect. Trimmed, '' when absent. */
  attr(name) {
    return (this.getAttribute(name) || '').trim();
  }
}

if (!customElements.get('redeploy-button')) {
  customElements.define('redeploy-button', RedeployButton);
}
