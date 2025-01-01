import { styles } from "@godown/element";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

hljs.registerLanguage("typescript", typescript);

const commonUsages = `if (error) {
      return html\`<div>Failed to load: \${error.message}</div>\`;
    }
    if (isLoading) {
      return html\`<div>Loading</div>\`;
    }
    return html\`
      <h2>\${data.name} \${isValidating ? "🔄" : ""}</h2>
      <p>👤 \${data.id}</p>
      <p>📧 \${data.email}</p>
      <p>💼 \${data.role}</p>
    \`;`;

const usages = [
  {
    name: "Decorator experimental",
    code: `import { html, LitElement } from "lit";
import { SWR, type SWRController } from "lit-swr";

class UserProfile extends LitElement {
  @SWR("/api/user", fetch, { refreshInterval: 5000 })
  useUser: () => SWRController<
    string,
    {
      id: string;
      name: string;
      email: string;
      role: string;
    }
  >;

  render() {
    const { data, error, isValidating, isLoading } = this.useUser();
    ${commonUsages}
  }
}`,
  },
  {
    name: "Decorator",
    code: `import { html, LitElement } from "lit";
import { SWR, type SWRController } from "lit-swr";

class UserProfile extends LitElement {
  @SWR("/api/user", fetch, { refreshInterval: 5000 })
  accessor useUser: () => SWRController<
    string,
    {
      id: string;
      name: string;
      email: string;
      role: string;
    }
  >;

  render() {
    const { data, error, isValidating, isLoading } = this.useUser();
    ${commonUsages}
  }
}`,
  },
  {
    name: "Property",
    code: `import { html, LitElement } from "lit";
import { createSWR } from "lit-swr";

class UserProfile extends LitElement {
  useUser = createSWR(this, "/api/user", fetch, { refreshInterval: 5000 });

  render() {
    const { data, error, isValidating, isLoading } = this.useUser();
    ${commonUsages}
  }
}`,
  },
  {
    name: "Function",
    code: `import { html, LitElement } from "lit";
import { createSWR } from "lit-swr";

class UserProfile extends LitElement {
  render() {
    const { data, error, isValidating, isLoading } = useSWR(this, "/api/user", fetch, { refreshInterval: 5000 });
    ${commonUsages}
  }
}`,
  },
].map((u) => ({
  ...u,
  code: hljs.highlight(u.code, { language: "typescript" }).value,
}));

@customElement("swr-usages")
@styles(
  css`
    :host {
      display: grid;
      justify-items: center;
    }
    pre {
      min-width: 40em;
    }
    code {
      display: block;
      overflow-x: auto;
    }
  `,
  css`
    .hljs-doctag,
    .hljs-keyword,
    .hljs-meta .hljs-keyword,
    .hljs-template-tag,
    .hljs-template-variable,
    .hljs-type,
    .hljs-variable.language_ {
      color: #d73a49;
    }
    .hljs-title,
    .hljs-title.class_,
    .hljs-title.class_.inherited__,
    .hljs-title.function_ {
      color: #6f42c1;
    }
    .hljs-attr,
    .hljs-attribute,
    .hljs-literal,
    .hljs-meta,
    .hljs-number,
    .hljs-operator,
    .hljs-selector-attr,
    .hljs-selector-class,
    .hljs-selector-id,
    .hljs-variable {
      color: #005cc5;
    }
    .hljs-meta .hljs-string,
    .hljs-regexp,
    .hljs-string {
      color: #032f62;
    }
    .hljs-built_in,
    .hljs-symbol {
      color: #e36209;
    }
    .hljs-code,
    .hljs-comment,
    .hljs-formula {
      color: #6a737d;
    }
    .hljs-name,
    .hljs-quote,
    .hljs-selector-pseudo,
    .hljs-selector-tag {
      color: #22863a;
    }
    .hljs-subst {
      color: #24292e;
    }
    .hljs-section {
      color: #005cc5;
      font-weight: 700;
    }
    .hljs-bullet {
      color: #735c0f;
    }
    .hljs-emphasis {
      color: #24292e;
      font-style: italic;
    }
    .hljs-strong {
      color: #24292e;
      font-weight: 700;
    }
    .hljs-addition {
      color: #22863a;
      background-color: #f0fff4;
    }
    .hljs-deletion {
      color: #b31d28;
      background-color: #ffeef0;
    }
  `,
)
export class SWRUsages extends LitElement {
  @state()
  current = 0;

  render() {
    const { code } = usages[this.current];
    return html`
      <h3>Examples</h3>
      <div>
        ${usages.map(({ name }, index) => {
          return html`<label for=${name}>
            <input
              name="1"
              id=${name}
              type="radio"
              ?checked=${this.current === index}
              @change=${() => {
                this.current = index;
              }}
            />
            ${name}
          </label>`;
        })}
      </div>
      <pre><code>${unsafeHTML(code)}</code></pre>
    `;
  }
}
