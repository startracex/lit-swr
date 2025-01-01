import { attr, styles } from "@godown/element";
import { LitElement, css, html } from "lit";
import { createSWR } from "lit-swr";
import { customElement } from "lit/decorators.js";

@customElement("swr-hero")
@styles(css`
  :host {
    display: block;
    margin-top: 2em;
  }
  main {
    height: 100%;
    display: grid;
    justify-items: center;
    align-content: center;
  }
  button {
    color: white;
    font-size: 1em;
    font-weight: bold;
    padding: 0.8em 1.2em;
    border-radius: 0.4em;
    border: none;
    cursor: pointer;
  }
  .counter {
    font-size: 1.2em;
    font-weight: bold;
    margin-bottom: 1em;
  }
  [validating] #content::after {
    content: "🔄";
    position: absolute;
  }
  #title {
    font-size: 2em;
    color: #1794e7;
  }
  #data {
    font-size: 1.75em;
  }
  #update {
    background: #13c85e;
  }
  #update:hover {
    background: #27ae60;
  }
  #links a {
    display: contents;
  }
  #links button {
    margin: 1.5em 1em;
  }
`)
export class SWRHero extends LitElement {
  hero = [
    "🚀 Lightweight",
    "🎡 Automatic revalidation",
    "🌊 Fully reactive",
    "📖 Easy to use",
    "💩 No duplicate requests",
    "💅 Decorator support",
  ];
  index = 0;
  count = 1;
  fetchCount = 0;
  useHero = createSWR(
    this,
    "/api/hero",
    async () => {
      this.fetchCount++;
      await new Promise((resolve) => setTimeout(resolve, 800));
      this.index = (this.index + 1) % this.hero.length;
      return this.hero[this.index];
    },
    {
      refreshInterval: 2000,
      maxAge: 800,
    },
  );

  render() {
    const { data, error, isValidating, isLoading } = this.useHero();

    if (error) {
      return html`<div>Failed to load: ${error.message}</div>`;
    }

    return html`
      <main ${attr({ loading: isLoading, validating: isValidating })}>
        <h1 id="title">
          <div style="padding-right: 4em;">🎡 Stale-While-Revalidate (SWR)</div>
          <div style="text-align: right;">data fetching for Lit</div>
        </h1>
        <h2 id="content">${isLoading ? "Loading" : data}</h2>
        <div class="counter">Update count: ${this.count}</div>
        <div class="counter">Fetch count: ${this.fetchCount}</div>
        <button id="update" @click=${() => this.requestUpdate()}>Request Update</button>
        <div id="links">
          <a href="https://github.com/startracex/lit-swr" target="_blank">
            <button style="background:#252323;">GitHub</button>
          </a>
          <a href="https://www.npmjs.com/package/lit-swr" target="_blank">
            <button style="background:#be0d0d;">NPM</button>
          </a>
        </div>
      </main>
    `;
  }

  protected updated(): void {
    this.count++;
  }
}
