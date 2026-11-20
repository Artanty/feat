/**
 * redeploy feature — "retrigger this project's last deploy run" button (js-web).
 *
 * Contract: back/spec/redeploy.md. Mounted by a host's FeatureSlot:
 *
 *   <redeploy-button src="https://safe-back/api/req/redeploy"
 *                    project="safe" namespace="web"></redeploy-button>
 *
 * On click POSTs {"project": "<project>@<namespace>"} to src (a feat req recipe route —
 * the machinery behind it is invisible to the host) and mirrors the result in the title.
 * Optional token-key attr: localStorage key whose value is sent as X-Totp-Auth (for
 * hosts that gate src behind a session header their fetch stack doesn't add for us).
 * Required attrs missing → renders nothing. No runtime envs.
 */
class RedeployButton extends HTMLElement {
  connectedCallback() {
    this.style.display = 'inline-flex';
    this.style.alignItems = 'center';
    const src = (this.getAttribute('src') || '').trim();
    const project = (this.getAttribute('project') || '').trim();
    const namespace = (this.getAttribute('namespace') || '').trim();
    if (!src || !project || !namespace) return; // renders nothing — host stays clean

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
    btn.title = `Retrigger ${project}@${namespace} last deploy run`;
    btn.append(label, text);

    let timer = null;
    const feedback = (msg, ms) => {
      btn.title = msg;
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.title = `Retrigger ${project}@${namespace} last deploy run`;
      }, ms);
    };
    const done = (ok, response) => {
      this.dispatchEvent(new CustomEvent('redeploy:done', {
        bubbles: true, detail: { ok, project: `${project}@${namespace}`, response },
      }));
    };

    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const headers = { 'Content-Type': 'application/json' };
        const tokenKey = (this.getAttribute('token-key') || '').trim();
        if (tokenKey) {
          try {
            const token = localStorage.getItem(tokenKey);
            if (token) headers['X-Totp-Auth'] = token;
          } catch { /* storage unavailable — send without token */ }
        }
        const res = await fetch(src, {
          method: 'POST',
          headers,
          body: JSON.stringify({ project: `${project}@${namespace}` }),
        });
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
    this.dispatchEvent(new CustomEvent('feat:ready', { bubbles: true, detail: { project, namespace } }));
  }
}

if (!customElements.get('redeploy-button')) {
  customElements.define('redeploy-button', RedeployButton);
}
